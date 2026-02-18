import aiofiles.os
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

    async def test_generate_out_directory_rbtrc_specified(self):
        with tempfile.TemporaryDirectory(  # i.e. project root directory.
        ) as root, open(f'{root}/.rbtrc', 'w') as file:
            output_directory = 'output_directory'
            await aiofiles.os.makedirs(
                f'{root}/{output_directory}', exist_ok=True
            )

            # 'rbt generate' expects '.rbtrc' file in the current directory to
            # extract the command line arguments from.
            # Since the file is located in the temporary directory, it will be
            # deleted at the end of the test, so no need to clean up the
            # file explicitly.
            file.write(
                (
                    f'generate {DEFAULT_API_DIR}\n'
                    f'generate --react={output_directory}\n'
                )
            )
            file.flush()

            proto = await proto_file(
                f'{root}/{DEFAULT_API_DIR}/{TEST_PACKAGE}',
                TEST_PACKAGE,
            )

            another_package = 'another_package'
            another_proto = await proto_file(
                f'{root}/{DEFAULT_API_DIR}/{another_package}',
                another_package,
            )

            await self.run_generate(working_directory=root)

            await self.expect_files(
                directory=f'{root}/{output_directory}/{TEST_PACKAGE}',
                expected_files=[
                    os.path.basename(proto.name).replace(
                        '.proto',
                        '_rbt_react.ts',
                    ),
                ],
            )

            await self.expect_files(
                directory=f'{root}/{output_directory}/{another_package}',
                expected_files=[
                    os.path.basename(another_proto.name).replace(
                        '.proto',
                        '_rbt_react.ts',
                    ),
                ],
            )


if __name__ == '__main__':
    unittest.main(verbosity=2)
