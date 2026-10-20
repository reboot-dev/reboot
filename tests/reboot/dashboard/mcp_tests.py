"""The dashboard as MCP Apps: the MCP endpoint offers the whole
dashboard page, a card of one feature and a card of one state type,
each built to call back on the address the request arrived at, the
tunnel's, and a listing of what the cards can show. And its sign-in:
whoever reaches the endpoint signs in with no sign-in page, and the
application issues recording URLs only with the access token; `application()`
in `reboot/dashboard/backend/main.py` sets both up.
"""
import aiohttp
import asyncio
import grpc
import httpx
import json
import os
import tempfile
import time
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
from reboot.dashboard.backend import main as dashboard_main
from reboot.dashboard.backend.constants import MCP_APP_DIRECTORY
from reboot.dashboard.backend.main import application
from reboot.settings import ENVVAR_RBT_MCP_APP_DIST_PATH
from unittest.mock import patch
from urllib.parse import parse_qs, urlencode, urlsplit, urlunsplit

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

        # The page built as an MCP App, named the way `rbt dashboard`
        # names it in the application's environment.
        os.environ[ENVVAR_RBT_MCP_APP_DIST_PATH] = str(MCP_APP_DIRECTORY)
        self.addCleanup(os.environ.pop, ENVVAR_RBT_MCP_APP_DIST_PATH, None)

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
            tools = {
                tool.name: tool for tool in (await session.list_tools()).tools
            }
            self.assertEqual(
                set(tools), {
                    'dashboard_list',
                    'dashboard_show',
                    'dashboard_show_feature',
                    'dashboard_show_state_type',
                }
            )
            shown = await session.call_tool(
                'dashboard_show', {'dashboard_id': 'dashboard'}
            )
            self.assertFalse(shown.isError)
            # The App takes its access token from the tool's result.
            self.assertIn(token, str(shown))
            # The whole dashboard asks the host for fullscreen.
            self.assertEqual(
                json.loads(shown.content[0].text)['display_modes'],
                ['fullscreen', 'inline'],
            )
            uri = tools['dashboard_show'].meta['ui']['resourceUri']
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

    async def test_the_mount_path_itself(self) -> None:
        """`/mcp`, which an MCP client is told to connect to, is the
        MCP server, not the page served at `/` and not a redirect."""
        async with self.client.post(
            self.url + '/mcp',
            json={
                'jsonrpc': '2.0',
                'id': 1,
                'method': 'initialize'
            },
            headers={'Accept': 'application/json, text/event-stream'},
            allow_redirects=False,
        ) as response:
            self.assertEqual(response.status, 401)
            self.assertIn('WWW-Authenticate', response.headers)
        token = await self.rbt.make_valid_oauth_access_token()
        async with httpx.AsyncClient(
            headers={'Authorization': f'Bearer {token}'}
        ) as client, streamable_http_client(
            self.url + '/mcp', http_client=client
        ) as (read, write, _), ClientSession(read, write) as session:
            await session.initialize()
            self.assertIn(
                'dashboard_show',
                [tool.name for tool in (await session.list_tools()).tools],
            )

    async def test_cards(self) -> None:
        token = await self.rbt.make_valid_oauth_access_token()
        async with httpx.AsyncClient(
            headers={'Authorization': f'Bearer {token}'}
        ) as client, streamable_http_client(
            self.url + '/mcp/', http_client=client
        ) as (read, write, _), ClientSession(read, write) as session:
            await session.initialize()
            tools = {
                tool.name: tool for tool in (await session.list_tools()).tools
            }

            # What the cards can show: nothing yet, since this test's
            # working directory holds no feature file and no API.
            listed = await session.call_tool(
                'dashboard_list', {'dashboard_id': 'dashboard'}
            )
            self.assertFalse(listed.isError)
            (text,) = listed.content
            assert text.type == 'text'
            index = json.loads(text.text)
            self.assertEqual(index.get('features', []), [])
            self.assertEqual(index.get('stateTypes', []), [])

            # A card's tool takes what to show and hands it to the page
            # with the token; the page is the dashboard's, told which
            # card it is by its title.
            for tool, argument, title in (
                ('dashboard_show_feature', 'feature', 'show_feature'),
                ('dashboard_show_state_type', 'state_type', 'show_state_type'),
            ):
                shown = await session.call_tool(
                    tool, {
                        'dashboard_id': 'dashboard',
                        argument: 'x'
                    }
                )
                self.assertFalse(shown.isError, tool)
                self.assertIn(token, str(shown))
                self.assertIn('"x"', str(shown))
                # A card stays inline.
                self.assertEqual(
                    json.loads(shown.content[0].text)['display_modes'],
                    ['inline'],
                )
                uri = tools[tool].meta['ui']['resourceUri']
                (content,) = (await session.read_resource(uri)).contents
                self.assertIn(
                    f'window.REBOOT_MCP_UI_TITLE={json.dumps(title)};',
                    content.text,
                )

    async def test_namespaced_ui_builds_are_served(self) -> None:
        # These are the actual nested build paths declared by the proto UIs.
        for path in (
            'dashboard/ui', 'dashboard/feature', 'dashboard/state_type'
        ):
            async with self.client.get(
                self.url + f'/__/frontend/mcp/{path}/index.html'
            ) as response:
                self.assertEqual(response.status, 200, path)
                self.assertIn('<html', await response.text())

    async def test_signed_recordings(self) -> None:
        signing = self.url + '/recordings/sign'
        async with self.client.get(
            signing, params={'path': self.recording}
        ) as response:
            self.assertEqual(response.status, 401)
        token = await self.rbt.make_valid_oauth_access_token()
        headers = {'Authorization': f'Bearer {token}'}

        async def sign(path: str) -> str:
            async with self.client.get(
                signing, params={'path': path}, headers=headers
            ) as response:
                self.assertEqual(response.status, 200)
                signed = await response.json()
                self.assertGreater(signed['expires'], time.time())
                return self.url + signed['url']

        before = int(time.time())
        url = await sign(self.recording)
        signed_expiry = int(parse_qs(urlsplit(url).query)['expires'][0])
        self.assertGreaterEqual(signed_expiry, before + 24 * 60 * 60)
        async with self.client.get(url) as response:
            self.assertEqual(response.status, 200)
            self.assertEqual(await response.read(), b'png')
            # Cacheable by this browser for as long as the URL is valid.
            self.assertRegex(
                response.headers['Cache-Control'], r'^private, max-age=\d+$'
            )
        async with self.client.get(
            url, headers={'Range': 'bytes=1-2'}
        ) as response:
            self.assertEqual(response.status, 206)
            self.assertEqual(response.headers['Content-Range'], 'bytes 1-2/3')
            self.assertEqual(await response.read(), b'ng')

        parts = urlsplit(url)
        query = parse_qs(parts.query)
        invalid = [
            self.url + '/recordings/' + self.recording,
            url + '0',
        ]
        for expiry in ['bad', '0', str(int(time.time()) + 7200)]:
            invalid.append(
                urlunsplit(
                    parts._replace(
                        query=urlencode(
                            {
                                'expires': expiry,
                                'sig': query['sig'][0],
                            }
                        )
                    )
                )
            )
        invalid.append(
            urlunsplit(
                parts._replace(
                    query=urlencode({
                        'expires': query['expires'][0],
                    })
                )
            )
        )
        other = self.recording.replace('shot.png', 'other.png')
        Path(other).write_bytes(b'other')
        invalid.append(url.replace('shot.png', 'other.png'))
        for candidate in invalid:
            async with self.client.get(candidate) as response:
                self.assertEqual(response.status, 401, candidate)

        # A correctly signed URL expires too, not only a tampered expiry.
        with patch.object(
            dashboard_main, '_RECORDING_URL_EXPIRES_AFTER_SECONDS', -1
        ):
            async with self.client.get(
                signing, params={'path': self.recording}, headers=headers
            ) as response:
                expired = await response.json()
        async with self.client.get(self.url + expired['url']) as response:
            self.assertEqual(response.status, 401)

        # The same recording becomes playable again after obtaining a
        # fresh signature, as the UI does after a media error.
        async with self.client.get(await sign(self.recording)) as response:
            self.assertEqual(response.status, 200)
            self.assertEqual(await response.read(), b'png')

        encoded = self.recording.replace('shot.png', 'a space 雪 #?.png')
        Path(encoded).write_bytes(b'encoded')
        async with self.client.get(await sign(encoded)) as response:
            self.assertEqual(response.status, 200)
            self.assertEqual(await response.read(), b'encoded')

        video = self.recording.replace('shot.png', 'video.webm')
        Path(video).write_bytes(b'webm')
        async with self.client.get(
            await sign(video), headers={'Range': 'bytes=1-3'}
        ) as response:
            self.assertEqual(response.status, 206)
            self.assertEqual(response.headers['Content-Type'], 'video/webm')
            self.assertEqual(await response.read(), b'ebm')

        for path in ['../outside.png', '/etc/passwd', 'ordinary.png']:
            async with self.client.get(
                signing, params={'path': path}, headers=headers
            ) as response:
                self.assertEqual(response.status, 404)


if __name__ == '__main__':
    unittest.main()
