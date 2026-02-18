import os
import tempfile
import unittest
from tests.reboot.cli.generate.tests_helper import (
    DEFAULT_API_DIR,
    TEST_PACKAGE,
    RbtGenerateBaseTestCase,
    proto_file,
)


class RbtGenerateTestCase(RbtGenerateBaseTestCase):

    async def test_generate_interface_named_legacy_grpc(self):
        with tempfile.TemporaryDirectory(  # i.e. project root directory.
        ) as root:
            output_directory = 'output_directory'

            proto = await proto_file(
                f'{root}/{DEFAULT_API_DIR}/{TEST_PACKAGE}',
                TEST_PACKAGE,
                # Create a legacy gRPC service with [...]Methods name in the
                # proto file.
                service_name="GreeterMethods",
                state_name=None,
                has_method_annotations=False,
            )

            await self.run_generate(
                f'--python={output_directory}',
                f'{DEFAULT_API_DIR}',
                working_directory=root,
            )

            await self.expect_files(
                directory=f'{root}/{output_directory}/{TEST_PACKAGE}',
                expected_files=[
                    os.path.basename(proto.name).replace(
                        '.proto',
                        '_pb2.py',
                    ),
                ],
            )

            # Even without Reboot services in the proto, we should generate a
            # "*_rbt.py" file - it's still required for any _legacy_ services in
            # the file to be used by Reboot.
            await self.expect_files(
                directory=f'{root}/{output_directory}/{TEST_PACKAGE}',
                expected_files=[
                    os.path.basename(proto.name).replace(
                        '.proto',
                        '_rbt.py',
                    ),
                ],
            )


if __name__ == '__main__':
    unittest.main(verbosity=2)
