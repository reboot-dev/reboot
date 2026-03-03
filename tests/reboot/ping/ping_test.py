import httpx
import json
import unittest
from mcp.client.session import ClientSession
from mcp.client.streamable_http import streamable_http_client
from reboot.aio.applications import Application
from reboot.aio.tests import Reboot
from reboot.ping.ping import ChatServicer, PingServicer, PongServicer
from reboot.ping.ping_api_rbt import Chat, Ping, Pong


class PingTest(unittest.IsolatedAsyncioTestCase):

    async def asyncSetUp(self):
        self.rbt = Reboot()
        await self.rbt.start()

    async def asyncTearDown(self):
        await self.rbt.stop()

    async def test_ping_periodically(self):
        await self.rbt.up(
            Application(
                servicers=[PingServicer, PongServicer, ChatServicer],
            ),
        )

        context = self.rbt.create_external_context(name=f"test-{self.id()}")

        ping = Ping.ref("my-ping")

        num_pings = 3

        response = await ping.do_ping_periodically(
            context,
            num_pings=num_pings,
            # Use a short period to make the test run fast.
            period_seconds=0.1,
        )
        self.assertEqual(response.num_pings, num_pings)

        # Verify that the pong was also called the same number
        # of times.
        pong = Pong.ref("my-ping")
        pong_response = await pong.num_pongs(context)
        self.assertEqual(pong_response.num_pongs, num_pings)

    async def test_chat_counter(self):
        await self.rbt.up(
            Application(
                servicers=[PingServicer, PongServicer, ChatServicer],
            ),
        )

        context = self.rbt.create_external_context(name=f"test-{self.id()}")

        chat, _ = await Chat.create(context)

        response = await chat.counter_increment(context)
        self.assertEqual(response.counter_value, 1)

        response = await chat.counter_increment(context)
        self.assertEqual(response.counter_value, 2)

        value_response = await chat.counter_value(context)
        self.assertEqual(value_response.counter_value, 2)

    async def test_chat_counter_over_mcp(self):
        await self.rbt.up(
            Application(
                servicers=[
                    PingServicer,
                    PongServicer,
                    ChatServicer,
                ],
            ),
        )

        mcp_url = self.rbt.http_localhost_url("/mcp")

        async with streamable_http_client(mcp_url) as (
            read_stream,
            write_stream,
            _,
        ):
            async with ClientSession(
                read_stream,
                write_stream,
            ) as session:
                await session.initialize()

                # Verify tools are listed.
                tools = await session.list_tools()
                tool_names = [t.name for t in tools.tools]
                self.assertIn("chat_counter_increment", tool_names)
                self.assertIn("chat_counter_value", tool_names)

                # Increment twice. Note that to call a method from
                # `Chat`, no ID needs to be passed.
                await session.call_tool("chat_counter_increment", {})
                await session.call_tool("chat_counter_increment", {})

                # Read value via tool and verify count.
                result = await session.call_tool("chat_counter_value", {})
                data = json.loads(result.content[0].text)
                self.assertEqual(data["counter_value"], 2)

    async def test_ui_tool_ids_mapping(self):
        await self.rbt.up(
            Application(
                servicers=[
                    PingServicer,
                    PongServicer,
                    ChatServicer,
                ],
            ),
        )

        mcp_url = self.rbt.http_localhost_url("/mcp")

        async with streamable_http_client(mcp_url) as (
            read_stream,
            write_stream,
            _,
        ):
            async with ClientSession(
                read_stream,
                write_stream,
            ) as session:
                await session.initialize()

                tools = await session.list_tools()
                tool_names = [t.name for t in tools.tools]
                self.assertIn("show_pinger", tool_names)
                self.assertIn("show_clicker", tool_names)

                # The `show_pinger` UI tool should return an `ids`
                # mapping that includes both the Ping ID (passed
                # explicitly) and the Chat session ID
                # (auto-constructed).
                result = await session.call_tool(
                    "show_pinger", {"id": "my-ping"}
                )
                data = json.loads(result.content[0].text)
                ids = data["ids"]
                self.assertEqual(ids["reboot.ping.Ping"], "my-ping")
                chat_session_id = ids["reboot.ping.Chat"]
                self.assertIsInstance(chat_session_id, str)
                self.assertGreater(len(chat_session_id), 0)

                # The `show_clicker` UI tool should return an `ids`
                # mapping with just the Chat session ID.
                result = await session.call_tool("show_clicker", {})
                data = json.loads(result.content[0].text)
                ids = data["ids"]
                # The Chat session ID should be the same across UI tools
                # within the same MCP session.
                self.assertEqual(ids["reboot.ping.Chat"], chat_session_id)

    async def test_ui_resource_metadata(self):
        """Verify UI resources include CSP metadata.

        The `_patch_read_resource` in `factories.py` injects
        dynamic CSP metadata (set by `ui_html()`) into the MCP
        `resources/read` response. This tells ext-apps hosts
        which origins to allow in the sandbox iframe's CSP.
        """
        await self.rbt.up(
            Application(
                servicers=[
                    PingServicer,
                    PongServicer,
                    ChatServicer,
                ],
            ),
        )

        mcp_url = self.rbt.http_localhost_url("/mcp")

        async with streamable_http_client(mcp_url) as (
            read_stream,
            write_stream,
            _,
        ):
            async with ClientSession(
                read_stream,
                write_stream,
            ) as session:
                await session.initialize()

                # UI resources use URI templates (e.g.,
                # `ui://chat/{ui}`), so they appear in
                # `list_resource_templates`, not
                # `list_resources`.
                templates = (await session.list_resource_templates())
                template_uris = [
                    str(t.uriTemplate) for t in templates.resourceTemplates
                ]
                self.assertTrue(
                    any("ui://" in uri for uri in template_uris),
                    f"Expected ui:// resource templates, "
                    f"got: {template_uris}",
                )

                # Read the clicker UI resource.
                result = await session.read_resource("ui://chat/show_clicker")
                self.assertEqual(len(result.contents), 1)

                content = result.contents[0]

                # Should be HTML.
                self.assertIn(
                    "text/html",
                    content.mimeType or "",
                )

                # Verify CSP metadata was injected.
                self.assertIsNotNone(
                    content.meta,
                    "Expected `_meta` with CSP metadata on resource content",
                )
                ui_meta = content.meta.get("ui", {})
                csp = ui_meta.get("csp", {})
                self.assertIn("connectDomains", csp)
                self.assertIn("frameDomains", csp)
                # Domains should contain the Reboot server URL and
                # Reboot websocket URL.
                self.assertEqual(len(csp["connectDomains"]), 2)

    async def test_mcp_no_tools_returns_501(self):
        # An application with only PongServicer (which has
        # no MCP tools) should return 501 when an MCP
        # client connects.
        await self.rbt.up(
            Application(
                servicers=[PongServicer],
            ),
        )

        mcp_url = self.rbt.http_localhost_url("/mcp")

        async with httpx.AsyncClient(
            follow_redirects=True,
        ) as client:
            response = await client.post(
                mcp_url,
                json={
                    "jsonrpc": "2.0",
                    "method": "initialize",
                    "id": 1,
                },
                headers={
                    "Content-Type": "application/json",
                },
            )

        self.assertEqual(response.status_code, 501)
        body = response.json()
        self.assertEqual(body["error"], "no_mcp_tools")


if __name__ == '__main__':
    unittest.main()
