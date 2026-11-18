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

    async def test_tool_takes_message_fields_as_json(self) -> None:
        tools = {
            tool.name: tool for tool in (await self.session.list_tools()).tools
        }
        properties = tools["note_echo"].inputSchema["properties"]

        # A message is any JSON value, since a well-known type has a
        # JSON form of its own; a repeated field or a map of messages
        # is an array or an object of them.
        for name in ["author", "when", "took", "extra", "metadata", "rating"]:
            self.assertEqual(properties[name]["anyOf"][0], {})
        self.assertEqual(properties["reviewers"]["anyOf"][0]["type"], "array")
        self.assertEqual(properties["editors"]["anyOf"][0]["type"], "object")
        # The schema says that `bytes` are base64 in a string.
        self.assertEqual(
            properties["data"]["anyOf"][0],
            {
                "type": "string",
                "contentEncoding": "base64"
            },
        )

        await self.session.call_tool(
            "note_append", {
                "note_id": "n",
                "text": "first"
            }
        )

        # Each field is in the protobuf JSON mapping, which is also
        # how the tool returns the response.
        request = {
            "author": {
                "name": "Ada"
            },
            "reviewers": [{
                "name": "Bob"
            }, {
                "name": "Cy"
            }],
            "editors": {
                "chief": {
                    "name": "Di"
                }
            },
            "when": "2026-11-09T12:00:00Z",
            "took": "1.500s",
            "extra": ["one", True, None],
            "metadata": {
                "nested": {
                    "key": "value"
                }
            },
            "rating": 5,
            "data": "aGVsbG8=",
        }
        result = await self.session.call_tool(
            "note_echo", {
                "note_id": "n",
                **request
            }
        )
        self.assertFalse(result.isError, str(result))
        self.assertEqual(json.loads(result.content[0].text), request)

        # A value that is not the JSON form of the field's type is an
        # error for the caller to correct.
        result = await self.session.call_tool(
            "note_echo", {
                "note_id": "n",
                "when": "yesterday"
            }
        )
        self.assertTrue(result.isError, str(result))
        self.assertIn("Failed to parse when field", result.content[0].text)

    async def test_resource_returns_the_response_as_json(self) -> None:
        await self.session.call_tool(
            "note_append", {
                "note_id": "n",
                "text": "first"
            }
        )
        listed = await self.session.list_resource_templates()
        self.assertEqual(
            {
                template.name: template.uriTemplate
                for template in listed.resourceTemplates
            },
            {
                "note_get": "note://{note_id}",
                "note_line": "note://{note_id}/line/{index}",
            },
        )
        line = await self.session.read_resource("note://n/line/0")
        self.assertEqual(json.loads(line.contents[0].text), {"line": "first"})
        note = await self.session.read_resource("note://n")
        self.assertEqual(
            json.loads(note.contents[0].text), {"lines": ["first"]}
        )


if __name__ == "__main__":
    unittest.main()
