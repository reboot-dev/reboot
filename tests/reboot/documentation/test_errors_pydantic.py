import unittest
from pathlib import Path
from reboot.pydantic_schema_to_proto import generate_proto_file_from_api
from tempfile import TemporaryDirectory

# The Pydantic API definition whose contents are used as a snippet in
# `documentation/docs/learn_more/errors.mdx`.
PYDANTIC_API_FILE = 'tests/reboot/documentation/errors_pydantic_api.py'


class TestErrorsPydantic(unittest.IsolatedAsyncioTestCase):

    async def test_generates_withdraw_rpc_with_declared_error(self):
        with TemporaryDirectory() as output_directory:
            proto_file_path = await generate_proto_file_from_api(
                PYDANTIC_API_FILE,
                output_directory,
            )
            assert proto_file_path is not None
            proto = Path(output_directory, proto_file_path).read_text()

        self.assertIn('rpc Withdraw', proto)
        self.assertIn('message OverdraftError', proto)
        # The declared error is wired into the method's errors `oneof`.
        self.assertIn('OverdraftError overdraft_error', proto)
        self.assertIn('errors: ["AccountWithdrawErrors"]', proto)


if __name__ == '__main__':
    unittest.main()
