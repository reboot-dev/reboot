"""The dashboard application is an MCP App: an MCP host opens the
dashboard's page by calling a tool and reading the resource the tool
names.

These tests run the dashboard under the `Reboot()` harness and connect
to it the way a host does, with an MCP client.
"""
import httpx
import json
import unittest
from mcp.client.session import ClientSession
from mcp.client.streamable_http import streamable_http_client
from reboot.aio.tests import Reboot
from reboot.dashboard.backend.constants import DASHBOARD_ID
from reboot.dashboard.backend.main import application

# The tool a host calls to open the page: the `show` UI of the
# `Dashboard` state type.
_SHOW = 'dashboard_show'


class McpTest(unittest.IsolatedAsyncioTestCase):

    async def asyncSetUp(self) -> None:
        self.rbt = Reboot()
        await self.rbt.start()
        await self.rbt.up(application(), local_envoy=True)

    async def asyncTearDown(self) -> None:
        await self.rbt.stop()

    async def test_a_host_opens_the_page(self) -> None:
        url = self.rbt.http_localhost_url('/mcp')

        # `rbt dashboard` has nobody sign in. The harness has every
        # application under test verify a token, so the host here
        # brings one.
        token = await self.rbt.make_valid_oauth_access_token()

        async with httpx.AsyncClient(
            headers={'Authorization': f'Bearer {token}'},
            follow_redirects=True,
        ) as http_client, streamable_http_client(
            url,
            http_client=http_client,
        ) as (read, write, _):
            async with ClientSession(read, write) as session:
                await session.initialize()

                # The page's tool is the only one: no method of the
                # dashboard is a tool.
                tools = (await session.list_tools()).tools
                self.assertEqual([tool.name for tool in tools], [_SHOW])

                # The tool names the page's resource, which is what a
                # host reads and shows.
                (show,) = tools
                assert show.meta is not None
                uri = show.meta['ui']['resourceUri']
                self.assertRegex(uri, r'^ui://dashboard/show/[0-9a-f]{12}$')

                # Calling the tool returns the state the page is of.
                result = await session.call_tool(
                    _SHOW,
                    {'dashboard_id': DASHBOARD_ID},
                )
                self.assertFalse(result.isError, result.content)
                self.assertEqual(
                    json.loads(result.content[0].text)['ids'],
                    {'rbt.dashboard.v1.Dashboard': DASHBOARD_ID},
                )

                (content,) = (await session.read_resource(uri)).contents
                self.assertEqual(content.mimeType, 'text/html;profile=mcp-app')
                page = content.text

                # Checked with `in` rather than `assertIn`, which
                # would write the whole page, megabytes of it, into
                # the log of a failure.

                # The page is the built one, not the placeholder shown
                # when no build is found.
                self.assertFalse('needs to be built first' in page)
                self.assertTrue('<title>Reboot dashboard</title>' in page)

                # The page is one file: its bundle and its stylesheets
                # are in it, since a host has nowhere to fetch them
                # from.
                self.assertTrue('<script type="module">' in page)
                self.assertFalse('src="./src/main.tsx"' in page)
                self.assertFalse('<link' in page)

                # The page is told it is in a host, and where the
                # application is, which is the address the host
                # connected to.
                address = url.removesuffix('/mcp')
                self.assertTrue(
                    f'window.REBOOT_URL={json.dumps(address)};' in page
                )
                self.assertTrue('window.REBOOT_MCP_UI_TITLE="show";' in page)

                # The host is told to let the page reach the
                # application.
                assert content.meta is not None
                self.assertIn(
                    address,
                    content.meta['ui']['csp']['connectDomains'],
                )


if __name__ == '__main__':
    unittest.main()
