"""The dashboard as an MCP App: the MCP endpoint offers one tool,
which shows the whole dashboard page, built to call back on the
address the request arrived at, the tunnel's. And its sign-in:
whoever reaches the endpoint signs in with no sign-in page, and the
application serves nothing without the access token; `application()`
in `reboot/dashboard/backend/main.py` sets both up.
"""
import aiohttp
import asyncio
import grpc
import httpx
import json
import os
import tempfile
import unittest
from contextlib import AsyncExitStack
from mcp.client.session import ClientSession
from mcp.client.streamable_http import streamable_http_client
from pathlib import Path
from rbt.v1alpha1.react_pb2 import QueryRequest, QueryResponse
from reboot.aio.tests import Reboot
from reboot.cli.commands.dashboard import (
    _dashboard_context,
    _should_open_automatically,
    _viewers,
)
from reboot.dashboard.backend.main import application

TUNNEL_URL = 'https://dashboard.example.com'


class McpTest(unittest.IsolatedAsyncioTestCase):

    async def asyncSetUp(self) -> None:
        # The dashboard serves recordings from the working directory.
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        self.recording = 'x.recordings/scenario/step/shot.png'
        (Path(directory.name) / self.recording).parent.mkdir(parents=True)
        (Path(directory.name) / self.recording).write_bytes(b'png')
        cwd = os.getcwd()
        os.chdir(directory.name)
        self.addCleanup(os.chdir, cwd)

        self.rbt = Reboot()
        await self.rbt.start()
        self.addAsyncCleanup(self.rbt.stop)
        await self.rbt.up(application(), local_envoy=True)
        self.url = self.rbt.http_localhost_url('')

        self.stack = AsyncExitStack()
        self.addAsyncCleanup(self.stack.aclose)
        self.client = await self.stack.enter_async_context(
            aiohttp.ClientSession()
        )

    async def test_every_call_needs_the_token(self) -> None:
        # Signs in the way `rbt dashboard` does, by following the
        # provider's redirects, and every RPC accepts the token it gets.
        context = await _dashboard_context(self.url)
        self.assertEqual(await _viewers(context), [])
        self.assertTrue(await _should_open_automatically(context))

        path = '/__/reboot/rpc/rbt.dashboard.v1.Preferences:preferences'
        async with self.client.ws_connect(
            self.url + path + '/rbt.v1alpha1.React/Query'
        ) as reader:
            await reader.send_bytes(
                QueryRequest(method='Get').SerializeToString()
            )
            message = await asyncio.wait_for(reader.receive(), 10)
            result = QueryResponse.FromString(message.data)
            # `PermissionDenied`, not `Unauthenticated`: `allow_if(any=...)`
            # returns `PermissionDenied` if any predicate returned it, and
            # `is_app_internal` returns it for a caller outside the
            # application.
            self.assertEqual(
                json.loads(result.status)['code'],
                grpc.StatusCode.PERMISSION_DENIED.value[0],
            )
        async with self.client.post(self.url + '/mcp/', json={}) as response:
            self.assertEqual(response.status, 401)

        token = await self.rbt.make_valid_oauth_access_token()
        async with self.client.post(
            self.url + path + '/rbt.dashboard.v1.PreferencesMethods/Get',
            json={},
            headers={'Authorization': f'Bearer {token}'},
        ) as response:
            self.assertEqual(response.status, 200)

    async def test_mcp_host_is_given_the_whole_page(self) -> None:
        token = await self.rbt.make_valid_oauth_access_token()
        # These headers stand in for the tunnel, which forwards its own
        # address in them.
        async with httpx.AsyncClient(
            headers={
                'Authorization': f'Bearer {token}',
                'X-Forwarded-Host': TUNNEL_URL.removeprefix('https://'),
                'X-Forwarded-Proto': 'https',
            }
        ) as client, streamable_http_client(
            self.url + '/mcp/', http_client=client
        ) as (read, write, _), ClientSession(read, write) as session:
            await session.initialize()
            tools = (await session.list_tools()).tools
            self.assertEqual([tool.name for tool in tools], ['dashboard_show'])
            shown = await session.call_tool(
                'dashboard_show', {'dashboard_id': 'dashboard'}
            )
            self.assertFalse(shown.isError)
            # The App takes its access token from the tool's result.
            self.assertIn(token, str(shown))
            uri = tools[0].meta['ui']['resourceUri']
            (content,) = (await session.read_resource(uri)).contents
            # The page itself, not an iframe of it; it calls back on the
            # tunnel's address, which its CSP allows.
            self.assertNotIn('<iframe', content.text)
            self.assertIn(
                f'window.REBOOT_URL={json.dumps(TUNNEL_URL)};', content.text
            )
            self.assertEqual(
                content.meta['ui']['csp']['connectDomains'],
                [TUNNEL_URL, 'wss://' + TUNNEL_URL.removeprefix('https://')],
            )

    async def test_recordings_need_the_token(self) -> None:
        # `require_oauth_token_test` covers this route's CORS, which an
        # App in a host's sandbox needs.
        url = self.url + '/recordings/' + self.recording
        async with self.client.get(url) as response:
            self.assertEqual(response.status, 401)
        token = await self.rbt.make_valid_oauth_access_token()
        async with self.client.get(
            url, headers={'Authorization': f'Bearer {token}'}
        ) as response:
            self.assertEqual(response.status, 200)
            self.assertEqual(await response.read(), b'png')


if __name__ == '__main__':
    unittest.main()
