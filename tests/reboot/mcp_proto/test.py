import httpx
import json
import unittest
from contextlib import AsyncExitStack
from mcp.client.session import ClientSession
from mcp.client.streamable_http import streamable_http_client
from reboot.aio.applications import Application
from reboot.aio.tests import Reboot
from tests.reboot.mcp_proto.test_servicer import NoteServicer


class McpProtoTest(unittest.IsolatedAsyncioTestCase):
    """MCP tools and resources of an API defined in proto."""

    async def asyncSetUp(self) -> None:
        self.rbt = Reboot()
        await self.rbt.start()
        self.addAsyncCleanup(self.rbt.stop)
        await self.rbt.up(Application(servicers=[NoteServicer]))

        token = await self.rbt.make_valid_oauth_access_token()
        self.stack = AsyncExitStack()
        self.addAsyncCleanup(self.stack.aclose)
        client = await self.stack.enter_async_context(
            httpx.AsyncClient(
                headers={"Authorization": f"Bearer {token}"},
                follow_redirects=True,
            )
        )
        read, write, _ = await self.stack.enter_async_context(
            streamable_http_client(
                self.rbt.http_localhost_url("/mcp"),
                http_client=client,
            )
        )
        self.session = await self.stack.enter_async_context(
            ClientSession(read, write)
        )
        await self.session.initialize()

    async def test_tool_takes_the_request_fields(self) -> None:
        tools = {
            tool.name: tool for tool in (await self.session.list_tools()).tools
        }

        # The schema names each field of the request with its JSON
        # type, and only the state's id is required.
        schema = tools["note_append"].inputSchema
        self.assertEqual(schema["required"], ["note_id"])

        def json_type(name: str) -> set[str]:
            # An optional parameter's schema is a choice between its
            # type and null.
            return {
                option["type"]
                for option in schema["properties"][name]["anyOf"]
            } - {"null"}

        self.assertEqual(
            {
                name: json_type(name)
                for name in schema["properties"]
                if name != "note_id"
            },
            {
                "text": {"string"},
                "times": {"integer"},
                "tags": {"array"},
                "labels": {"object"},
                "priority": {"integer"},
            },
        )

        result = await self.session.call_tool(
            "note_append",
            {
                "note_id": "n",
                "text": "hello",
                "times": 2,
                "tags": ["a", "b"],
                "labels": {
                    "k": "v"
                },
                "priority": 2,
            },
        )
        self.assertFalse(result.isError, str(result))
        self.assertEqual(json.loads(result.content[0].text), {"count": 2})

        # A field left out keeps its default.
        result = await self.session.call_tool(
            "note_append", {
                "note_id": "n",
                "text": "again"
            }
        )
        self.assertFalse(result.isError, str(result))
        self.assertEqual(json.loads(result.content[0].text), {"count": 3})

        result = await self.session.call_tool("note_get", {"note_id": "n"})
        self.assertFalse(result.isError, str(result))
        self.assertEqual(
            json.loads(result.content[0].text),
            {
                "lines": ["hello a b", "hello a b", "again"],
                "labels": {
                    "k": "v"
                },
                "priority": "HIGH",
            },
        )


if __name__ == "__main__":
    unittest.main()
