"""The dashboard as an MCP App: the gateway on this machine hands out
the dashboard's credential, to the browser's page and to an MCP host,
and the tunnel never does; see `reboot/dashboard/gateway.py`.

The dashboard application runs under the `Reboot()` harness with the
credential set, and without the OAuth server the harness would
otherwise give it, behind a gateway of the test's own, whose public
listener stands in for the tunnel.
"""
import aiohttp
import asyncio
import httpx
import json
import os
import secrets
import socket
import unittest
import uuid
from contextlib import AsyncExitStack
from mcp.client.session import ClientSession
from mcp.client.streamable_http import streamable_http_client
from rbt.dashboard.v1.dashboard_pb2 import (
    PreferencesGetResponse,
    PreferencesSetNavWidthRequest,
)
from rbt.v1alpha1.react_pb2 import (
    MutateRequest,
    MutateResponse,
    QueryRequest,
    QueryResponse,
)
from reboot.aio.tests import Reboot
from reboot.cli.commands.dev import _open_on_restart, _viewers
from reboot.dashboard.backend.constants import ENVVAR_RBT_DASHBOARD_TOKEN
from reboot.dashboard.backend.main import application
from reboot.dashboard.gateway import DashboardGateway, _listen
from unittest.mock import patch

# What the gateway tells an MCP host's App to call back on, as a
# tunnel would have told the gateway.
PUBLIC_URL = 'https://dashboard.example.com'

# The `Unauthenticated` gRPC status code.
UNAUTHENTICATED = 16


class McpTest(unittest.IsolatedAsyncioTestCase):

    async def asyncSetUp(self) -> None:
        self.token = secrets.token_urlsafe(32)
        environment = patch.dict(
            os.environ, {ENVVAR_RBT_DASHBOARD_TOKEN: self.token}
        )
        environment.start()
        self.addCleanup(environment.stop)

        self.rbt = Reboot()
        await self.rbt.start()
        self.addAsyncCleanup(self.rbt.stop)
        # Served as `rbt dashboard` serves it: with the credential
        # required of every RPC, and the MCP endpoint open, since the
        # gateway is what brings the credential to it.
        await self.rbt.up(application(), local_envoy=True, inject_oauth=False)
        self.backend = self.rbt.http_localhost_url('')

        self.stack = AsyncExitStack()
        self.addAsyncCleanup(self.stack.aclose)
        self.client = await self.stack.enter_async_context(
            aiohttp.ClientSession()
        )
        with socket.socket() as reservation:
            reservation.bind(('127.0.0.1', 0))
            port = reservation.getsockname()[1]
        self.gateway = DashboardGateway(
            client=self.client,
            port=port,
            backend_port=self.rbt.envoy_port(),
            token=self.token,
        )
        await self.stack.enter_async_context(_listen(self.gateway.local, port))
        public_port = await self.stack.enter_async_context(
            _listen(self.gateway.public, 0)
        )
        self.gateway.public_url = PUBLIC_URL
        self.local = f'http://127.0.0.1:{port}'
        self.public = f'http://127.0.0.1:{public_port}'

    async def _resource(self, mcp_url: str) -> tuple[str, str, list[str]]:
        """Opens the dashboard the way an MCP host at `mcp_url` does,
        returning the tool's result as text, the App's page, and the
        addresses the page is allowed to connect to."""
        async with httpx.AsyncClient(follow_redirects=True) as client, \
                streamable_http_client(
                    mcp_url, http_client=client
                ) as (read, write, _), ClientSession(read, write) as session:
            await session.initialize()
            tools = (await session.list_tools()).tools
            self.assertEqual([tool.name for tool in tools], ['dashboard_show'])
            shown = await session.call_tool(
                'dashboard_show', {'dashboard_id': 'dashboard'}
            )
            self.assertFalse(shown.isError)
            uri = tools[0].meta['ui']['resourceUri']
            (content,) = (await session.read_resource(uri)).contents
            return (
                str(shown),
                content.text,
                content.meta['ui']['csp']['connectDomains'],
            )

    async def test_credential_reaches_only_this_machine(self) -> None:
        # The tunnel forwards nothing but RPCs.
        for path in [
            '/',
            '/mcp/',
            '/mcp/ui-assets/show/hash/index.html',
            '/dashboard/',
            '/recordings/a.png',
            '/__/inspect',
        ]:
            async with self.client.get(self.public + path) as response:
                self.assertEqual(response.status, 404, path)

        # Another website's page gets nothing from the gateway, whether
        # it fetches this machine or a name it pointed at this machine.
        for headers in [
            {
                'Host': 'attacker.example'
            },
            {
                'Origin': 'https://attacker.example'
            },
        ]:
            async with self.client.get(
                self.local + '/dashboard/', headers=headers
            ) as response:
                self.assertEqual(response.status, 403, headers)

        # The dashboard's own page is given the credential, uncached.
        async with self.client.get(self.local + '/dashboard/') as response:
            self.assertEqual(response.status, 200)
            self.assertEqual(response.headers['Cache-Control'], 'no-store')
            self.assertIn(self.token, await response.text())

        # The application's own MCP endpoint, reached without the
        # gateway, hands out no credential: it only ever passes on the
        # one a caller brought, and the gateway is what brings it.
        shown, page, _ = await self._resource(self.backend + '/mcp/')
        self.assertNotIn(self.token, shown)
        self.assertNotIn(self.token, page)

        # What `rbt dev run` asks the dashboard, through the gateway.
        self.assertEqual(await _viewers(self.local), [])
        self.assertTrue(await _open_on_restart(self.local))

    async def test_mcp_host_is_given_the_app_and_its_credential(self) -> None:
        shown, page, connect_domains = await self._resource(
            self.local + '/mcp/'
        )
        # The credential arrives the way every Reboot MCP App's does,
        # in the tool's result, never in the page.
        self.assertIn(self.token, shown)
        self.assertNotIn(self.token, page)
        # The page is the whole dashboard, told to call the gateway's
        # public address, and allowed to.
        self.assertNotIn('<iframe', page)
        self.assertIn(f'window.REBOOT_URL={json.dumps(PUBLIC_URL)};', page)
        self.assertEqual(
            connect_domains,
            [PUBLIC_URL, 'wss://' + PUBLIC_URL.removeprefix('https://')],
        )

    async def test_page_at_another_address_has_another_uri(self) -> None:
        """An MCP host may cache the page by its resource URI, so a
        page that calls a different address has to have a different
        one."""

        async def resource_uri() -> str:
            async with httpx.AsyncClient() as client, \
                    streamable_http_client(
                        self.local + '/mcp/', http_client=client
                    ) as (read, write, _), ClientSession(read, write) as session:
                await session.initialize()
                (tool,) = (await session.list_tools()).tools
                return tool.meta['ui']['resourceUri']

        before = await resource_uri()
        self.assertEqual(await resource_uri(), before)
        self.gateway.public_url = 'https://other.example.com'
        self.assertNotEqual(await resource_uri(), before)

    async def test_reads_and_writes_require_the_credential(self) -> None:
        """Through the tunnel, Reboot's reactive reads and writes, which
        carry their credential in their messages, answer only to it."""
        path = '/__/reboot/rpc/rbt.dashboard.v1.Preferences:preferences'
        reader_path = self.public + path + '/rbt.v1alpha1.React/Query'

        async with self.client.ws_connect(reader_path) as reader:
            await reader.send_bytes(
                QueryRequest(method='Get',
                             bearer_token='wrong').SerializeToString()
            )
            message = await asyncio.wait_for(reader.receive(), 10)
            result = QueryResponse.FromString(message.data)
            self.assertEqual(
                json.loads(result.status)['code'], UNAUTHENTICATED
            )
        async with self.client.ws_connect(self.public + path) as writer:
            await writer.send_bytes(
                MutateRequest(
                    method='SetNavWidth',
                    bearer_token='wrong',
                    idempotency_key=str(uuid.uuid4()),
                    request=PreferencesSetNavWidthRequest(nav_width=999
                                                         ).SerializeToString(),
                ).SerializeToString()
            )
            message = await asyncio.wait_for(writer.receive(), 10)
            result = MutateResponse.FromString(message.data)
            self.assertEqual(
                json.loads(result.status)['code'], UNAUTHENTICATED
            )

        # Neither no credential nor a claim to be the application
        # itself gets a unary call through, either.
        for headers in [{}, {'x-reboot-internal-call': 'true'}]:
            async with self.client.post(
                self.public + path +
                '/rbt.dashboard.v1.PreferencesMethods/Get',
                json={},
                headers=headers,
            ) as response:
                self.assertEqual(response.status, 401)

        # With the credential, a write is seen by a reactive read.
        async with self.client.ws_connect(reader_path) as reader:
            await reader.send_bytes(
                QueryRequest(method='Get',
                             bearer_token=self.token).SerializeToString()
            )
            await asyncio.wait_for(reader.receive(), 10)
            async with self.client.ws_connect(self.public + path) as writer:
                await writer.send_bytes(
                    MutateRequest(
                        method='SetNavWidth',
                        bearer_token=self.token,
                        idempotency_key=str(uuid.uuid4()),
                        request=PreferencesSetNavWidthRequest(
                            nav_width=123
                        ).SerializeToString(),
                    ).SerializeToString()
                )
                message = await asyncio.wait_for(writer.receive(), 10)
                self.assertTrue(
                    MutateResponse.FromString(message.data
                                             ).HasField('response')
                )
                message = await asyncio.wait_for(reader.receive(), 10)
                result = QueryResponse.FromString(message.data)
                self.assertEqual(
                    PreferencesGetResponse.FromString(result.response
                                                     ).nav_width,
                    123,
                )


if __name__ == '__main__':
    unittest.main()
