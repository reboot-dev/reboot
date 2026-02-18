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

    async def test_generate_out_directory_specified(self):
        with tempfile.TemporaryDirectory(  # i.e. project root directory.
        ) as root:
            output_directory = 'output_directory'
            await aiofiles.os.makedirs(
                f'{root}/{output_directory}', exist_ok=True
            )
            some_other_package = 'some_other_package'
            proto = await proto_file(
                f'{root}/{DEFAULT_API_DIR}/{TEST_PACKAGE}/{some_other_package}',
                f'{TEST_PACKAGE}.{some_other_package}',
            )

            await self.run_generate(
                f'--react={output_directory}',
                f'{DEFAULT_API_DIR + os.sep}',
                working_directory=root,
            )

            await self.expect_files(
                directory=
                f'{root}/{output_directory}/{TEST_PACKAGE}/{some_other_package}',
                expected_files=[
                    os.path.basename(proto.name).replace(
                        '.proto',
                        '_rbt_react.ts',
                    ),
                ],
            )


if __name__ == '__main__':
    unittest.main(verbosity=2)
