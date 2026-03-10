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

    async def test_generate_command_line(self):
        with tempfile.TemporaryDirectory(  # i.e. project root directory.
        ) as root:
            proto = await proto_file(
                f'{root}/{DEFAULT_API_DIR}/{TEST_PACKAGE}',
                TEST_PACKAGE,
            )
            await self.run_generate(
                f'--python={DEFAULT_API_DIR}',
                f'{DEFAULT_API_DIR}',
                working_directory=root,
            )

            await self.expect_files(
                directory=f'{root}/{DEFAULT_API_DIR}/{TEST_PACKAGE}',
                expected_files=[
                    os.path.basename(proto.name).replace(
                        '.proto',
                        '_rbt.py',
                    ),
                ],
            )


if __name__ == '__main__':
    unittest.main(verbosity=2)
