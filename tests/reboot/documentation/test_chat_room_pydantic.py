import unittest
from pathlib import Path
from reboot.pydantic_schema_to_proto import generate_proto_file_from_api
from tempfile import TemporaryDirectory

# The Pydantic API definition whose contents are used as a snippet in
# `documentation/docs/learn_more/call/from_react.mdx`.
PYDANTIC_API_FILE = 'tests/reboot/documentation/chat_room_pydantic.py'


class TestChatRoomPydantic(unittest.IsolatedAsyncioTestCase):

    async def test_generates_chat_room_service(self):
        with TemporaryDirectory() as output_directory:
            proto_file_path = await generate_proto_file_from_api(
                PYDANTIC_API_FILE,
                output_directory,
            )
            assert proto_file_path is not None
            proto = Path(output_directory, proto_file_path).read_text()

        self.assertIn('message ChatRoom', proto)
        self.assertIn('rpc Messages', proto)
        self.assertIn('rpc Send', proto)


if __name__ == '__main__':
    unittest.main()
