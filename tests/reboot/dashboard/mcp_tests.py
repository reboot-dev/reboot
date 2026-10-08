"""The dashboard as an MCP App: the dashboard application's MCP
endpoint offers one tool, which opens the whole dashboard page, built
to call back on the address the endpoint was reached at.

The application runs under the `Reboot()` harness, whose OAuth server
mints the access token the MCP endpoint asks for.
"""
import httpx
import json
import unittest
from mcp.client.session import ClientSession
from mcp.client.streamable_http import streamable_http_client
from reboot.aio.tests import Reboot
from reboot.dashboard.backend.main import application


class McpTest(unittest.IsolatedAsyncioTestCase):

    async def asyncSetUp(self) -> None:
        self.rbt = Reboot()
        await self.rbt.start()
        self.addAsyncCleanup(self.rbt.stop)
        await self.rbt.up(application(), local_envoy=True)
        self.url = self.rbt.http_localhost_url('')

    async def test_mcp_host_is_given_the_whole_page(self) -> None:
        token = await self.rbt.make_valid_oauth_access_token()
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
            uri = tools[0].meta['ui']['resourceUri']
            (content,) = (await session.read_resource(uri)).contents
            self.assertNotIn('<iframe', content.text)
            self.assertIn(
                f'window.REBOOT_URL={json.dumps(self.url)};', content.text
            )
            self.assertEqual(
                content.meta['ui']['csp']['connectDomains'],
                [self.url, 'ws://' + self.url.removeprefix('http://')],
            )


if __name__ == '__main__':
    unittest.main()
