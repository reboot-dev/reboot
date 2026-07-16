import unittest
from pathlib import Path
from reboot.pydantic_schema_to_proto import generate_proto_file_from_api
from tempfile import TemporaryDirectory


async def generate(pydantic_api_file: str) -> str:
    """Runs the Pydantic-to-proto generation over the given API
    definition file and returns the generated proto contents."""
    with TemporaryDirectory() as output_directory:
        proto_file_path = await generate_proto_file_from_api(
            pydantic_api_file,
            output_directory,
        )
        assert proto_file_path is not None
        return Path(output_directory, proto_file_path).read_text()


# Validates the API definition snippets used in
# `documentation/docs/learn_more/define/pydantic.mdx`.
class TestDefinePydantic(unittest.IsolatedAsyncioTestCase):

    async def test_mcp_tools(self) -> None:
        proto = await generate(
            'tests/reboot/documentation/mcp_tools_pydantic.py'
        )

        self.assertIn('rpc CreateCounter', proto)
        self.assertIn('rpc Cleanup', proto)
        self.assertIn('rpc Get', proto)
        self.assertIn('rpc Create', proto)

    async def test_tool_options(self) -> None:
        proto = await generate(
            'tests/reboot/documentation/tool_options_pydantic.py'
        )

        self.assertIn('rpc CheckStock', proto)
        self.assertIn('inventory_check', proto)
        self.assertIn('Check Inventory', proto)


if __name__ == '__main__':
    unittest.main()
