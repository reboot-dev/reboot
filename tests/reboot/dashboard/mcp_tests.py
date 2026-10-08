"""The dashboard as an MCP App: the dashboard application's MCP
endpoint offers one tool, which opens the whole dashboard page, built
to call back on the address the endpoint was reached at.

And its sign-in: whoever is at this machine signs in with no questions
asked, nothing arriving under the tunnel's name can, and nothing
answers without the token sign-in mints; see
`reboot/dashboard/backend/auth.py`. The application runs under the
`Reboot()` harness with its own OAuth server, as `rbt dashboard` runs
it, told that an MCP App calls back on a tunnel's address.
"""
import aiohttp
import asyncio
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
from reboot.cli.commands.dev import _open_on_restart, _viewers
from reboot.dashboard.backend.auth import DEVELOPER
from reboot.dashboard.backend.main import application
from reboot.dashboard.tunnel import TUNNEL_HOST
from reboot.settings import ENVVAR_RBT_MCP_UI_URL
from unittest.mock import patch

# Where the application is told an MCP App calls back, as a tunnel
# would have told it.
TUNNEL_URL = 'https://dashboard.example.com'

# The `Unauthenticated` gRPC status code.
UNAUTHENTICATED = 16


class McpTest(unittest.IsolatedAsyncioTestCase):

    async def asyncSetUp(self) -> None:
        environment = patch.dict(
            os.environ, {ENVVAR_RBT_MCP_UI_URL: TUNNEL_URL}
        )
        environment.start()
        self.addCleanup(environment.stop)

        # A working directory with one recording in it, where the
        # dashboard looks for them.
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

    async def test_sign_in_is_for_this_machine(self) -> None:
        # The browser's sign-in, as `rbt dev run` does it, needs no
        # one's say-so, and what it mints is what the dashboard
        # answers to.
        self.assertEqual(await _viewers(self.url), [])
        self.assertTrue(await _open_on_restart(self.url))

        # Under the tunnel's name, no endpoint of the OAuth server
        # answers, so nothing arriving through the tunnel signs in.
        for path in [
            '/__/oauth/start?return_to=/',
            '/__/oauth/whoami',
            '/.well-known/oauth-authorization-server',
        ]:
            async with self.client.get(
                self.url + path, headers={'Host': TUNNEL_HOST}
            ) as response:
                self.assertEqual(response.status, 403, path)

        # Without a token nothing answers: not a reactive read, not a
        # unary call, not the MCP endpoint.
        path = '/__/reboot/rpc/rbt.dashboard.v1.Preferences:preferences'
        async with self.client.ws_connect(
            self.url + path + '/rbt.v1alpha1.React/Query'
        ) as reader:
            await reader.send_bytes(
                QueryRequest(method='Get').SerializeToString()
            )
            message = await asyncio.wait_for(reader.receive(), 10)
            result = QueryResponse.FromString(message.data)
            self.assertEqual(
                json.loads(result.status)['code'], UNAUTHENTICATED
            )
        async with self.client.post(
            self.url + path + '/rbt.dashboard.v1.PreferencesMethods/Get',
            json={},
        ) as response:
            self.assertEqual(response.status, 401)
        async with self.client.post(self.url + '/mcp/', json={}) as response:
            self.assertEqual(response.status, 401)

    async def test_mcp_host_is_given_the_whole_page(self) -> None:
        token = await self.rbt.make_valid_oauth_access_token(user_id=DEVELOPER)
        async with httpx.AsyncClient(
            headers={'Authorization': f'Bearer {token}'}
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
            # The credential arrives the way every Reboot MCP App's
            # does, in the tool's result.
            self.assertIn(token, str(shown))
            uri = tools[0].meta['ui']['resourceUri']
            (content,) = (await session.read_resource(uri)).contents
            # The page is the whole dashboard, told to call the
            # tunnel, and allowed to.
            self.assertNotIn('<iframe', content.text)
            self.assertIn(
                f'window.REBOOT_URL={json.dumps(TUNNEL_URL)};', content.text
            )
            self.assertEqual(
                content.meta['ui']['csp']['connectDomains'],
                [TUNNEL_URL, 'wss://' + TUNNEL_URL.removeprefix('https://')],
            )

    async def test_recordings_need_the_token_from_any_origin(self) -> None:
        url = self.url + '/recordings/' + self.recording
        # What an App in a host's sandbox sends: its own origin, and
        # the token it was given.
        foreign = {'Origin': 'https://sandbox.example'}
        async with self.client.get(url, headers=foreign) as response:
            self.assertEqual(response.status, 401)
            self.assertEqual(
                response.headers['Access-Control-Allow-Origin'], '*'
            )
        token = await self.rbt.make_valid_oauth_access_token(user_id=DEVELOPER)
        async with self.client.get(
            url, headers={
                **foreign, 'Authorization': f'Bearer {token}'
            }
        ) as response:
            self.assertEqual(response.status, 200)
            self.assertEqual(await response.read(), b'png')
            self.assertEqual(
                response.headers['Access-Control-Allow-Origin'], '*'
            )


if __name__ == '__main__':
    unittest.main()
