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
    """MCP tools and resources of a proto-defined API. A Pydantic API's
    tool takes its request model whole; a proto API's takes the
    request message's fields, since FastMCP cannot derive a schema
    from a protobuf class."""

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
        self.assertEqual(set(tools), {"note_append", "note_get"})

        # The schema the model fills in names each field of the request
        # with its JSON type, not an opaque protobuf class, and only the
        # state's id is required.
        schema = tools["note_append"].inputSchema
        self.assertEqual(schema["required"], ["note_id"])
        self.assertEqual(
            set(schema["properties"]),
            {
                "note_id",
                "text",
                "times",
                "tags",
                "labels",
                "author",
                "priority",
                "when",
                "extra",
            },
        )

        def json_type(name: str) -> set[str]:
            # An optional parameter's schema is a choice between its
            # type and null.
            return {
                option["type"]
                for option in schema["properties"][name]["anyOf"]
            } - {"null"}

        self.assertEqual(json_type("text"), {"string"})
        self.assertEqual(json_type("times"), {"integer"})
        self.assertEqual(json_type("tags"), {"array"})
        self.assertEqual(json_type("labels"), {"object"})
        self.assertEqual(json_type("author"), {"object"})
        self.assertEqual(json_type("priority"), {"string"})
        self.assertEqual(
            schema["properties"]["priority"]["anyOf"][0]["enum"],
            ["PRIORITY_UNSPECIFIED", "LOW", "HIGH"],
        )
        self.assertEqual(json_type("when"), {"string"})
        # A `google.protobuf.Value` is any JSON value.
        self.assertIn({}, schema["properties"]["extra"]["anyOf"])

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
                "author": {
                    "name": "Ada"
                },
                "priority": "HIGH",
                "when": "2026-11-09T12:00:00Z",
                "extra": [1, "two"],
            },
        )
        self.assertFalse(result.isError, str(result))
        self.assertEqual(json.loads(result.content[0].text), {"count": 2})

        # A field left out takes the proto default.
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
                "author": "Ada",
                "priority": "HIGH",
                "when": "2026-11-09T12:00:00Z",
                "extra": [1, "two"],
            },
        )

    async def test_resource_takes_the_request_fields_from_its_uri(
        self
    ) -> None:
        await self.session.call_tool(
            "note_append", {
                "note_id": "n",
                "text": "first"
            }
        )
        listed = await self.session.list_resource_templates()
        templates = {
            template.name: template.uriTemplate
            for template in listed.resourceTemplates
        }
        self.assertEqual(
            templates,
            {
                "note_get": "note://{note_id}",
                "note_line": "note://{note_id}/line/{index}",
            },
        )
        line = await self.session.read_resource("note://n/line/0")
        self.assertEqual(json.loads(line.contents[0].text), {"line": "first"})
        note = await self.session.read_resource("note://n")
        self.assertEqual(json.loads(note.contents[0].text)["lines"], ["first"])


if __name__ == "__main__":
    unittest.main()
