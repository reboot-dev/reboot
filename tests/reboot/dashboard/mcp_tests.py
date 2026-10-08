"""The dashboard as an MCP App: the dashboard application's MCP
endpoint offers one tool, which opens the whole dashboard page, built
to call back on the address the endpoint was reached at.

The application runs under the `Reboot()` harness without the OAuth
server the harness would otherwise give it, since `rbt dashboard`
serves it without one.
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
        await self.rbt.up(application(), local_envoy=True, inject_oauth=False)
        self.url = self.rbt.http_localhost_url('')

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

    async def test_mcp_host_is_given_the_whole_page(self) -> None:
        _, page, connect_domains = await self._resource(self.url + '/mcp/')
        self.assertNotIn('<iframe', page)
        self.assertIn(f'window.REBOOT_URL={json.dumps(self.url)};', page)
        self.assertEqual(
            connect_domains,
            [self.url, 'ws://' + self.url.removeprefix('http://')],
        )


if __name__ == '__main__':
    unittest.main()
