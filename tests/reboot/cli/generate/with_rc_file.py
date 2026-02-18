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

    async def test_generate_with_rc_file(self):
        with tempfile.TemporaryDirectory(  # i.e. project root directory.
        ) as root, open(f'{root}/.rbtrc', 'w') as file:
            # 'rbt generate' expects '.rbtrc' file in the current directory to
            # extract the command line arguments from.
            # Since the file is located in the temporary directory, it will be
            # deleted at the end of the test, so no need to clean up the
            # file explicitly.

            file.write(
                (
                    f'generate --react={DEFAULT_API_DIR}\n'
                    f'generate --python={DEFAULT_API_DIR}\n'
                    f'generate {DEFAULT_API_DIR}\n'
                )
            )
            file.flush()

            some_other_package = 'some_other_package'
            proto = await proto_file(
                f'{root}/{DEFAULT_API_DIR}/{TEST_PACKAGE}/{some_other_package}',
                f'{TEST_PACKAGE}.{some_other_package}',
            )

            await self.run_generate(working_directory=root)

            await self.expect_files(
                directory=
                f'{root}/{DEFAULT_API_DIR}/{TEST_PACKAGE}/{some_other_package}',
                expected_files=[
                    os.path.basename(proto.name).replace(
                        '.proto',
                        '_rbt.py',
                    ),
                    os.path.basename(proto.name).replace(
                        '.proto',
                        '_rbt_react.ts',
                    ),
                ],
            )


if __name__ == '__main__':
    unittest.main(verbosity=2)
