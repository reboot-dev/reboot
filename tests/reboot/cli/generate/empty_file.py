import aiofiles.os
import os
import tempfile
import unittest
from tests.reboot.cli.generate.tests_helper import (
    DEFAULT_API_DIR,
    TEST_PACKAGE,
    RbtGenerateBaseTestCase,
)


class RbtGenerateTestCase(RbtGenerateBaseTestCase):

    async def test_generate_empty_file(self):
        with tempfile.TemporaryDirectory(  # i.e. project root directory.
        ) as root:
            directory = f'{root}/{DEFAULT_API_DIR}/{TEST_PACKAGE}'

            # Create an empty file.
            await aiofiles.os.makedirs(directory, exist_ok=True)
            proto = open(f'{directory}/test.proto', 'w')
            proto.close()

            self.assertEqual(os.stat(proto.name).st_size, 0)

            await self.run_generate(
                f'--python={DEFAULT_API_DIR}',
                f'{DEFAULT_API_DIR}',
                working_directory=root,
                error_message=(
                    "api/testpackage/test.proto' is empty. See "
                    "https://docs.reboot.dev/develop/schema for more "
                    "information on filling out your proto file.\n"
                ),
            )


if __name__ == '__main__':
    unittest.main(verbosity=2)
