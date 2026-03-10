import aiofiles
import tempfile
import unittest
from tests.reboot.cli.generate.tests_helper import (
    DEFAULT_API_DIR,
    TEST_PACKAGE,
    RbtGenerateBaseTestCase,
    proto_file,
)


class RbtGenerateTestCase(RbtGenerateBaseTestCase):

    async def test_generate_fails_hyphen_directory(self):
        with tempfile.TemporaryDirectory(  # i.e. project root directory.
        ) as root:
            wrong_package = 'wrong_package'
            output_directory = 'output_directory'

            wrong_folders = [
                'some-folder',
                's@me_folder',
                'some.folder',
            ]

            for wrong_folder in wrong_folders:
                file = await proto_file(
                    f'{root}/{DEFAULT_API_DIR}/{wrong_folder}/{TEST_PACKAGE}',
                    wrong_package,
                )

                await self.run_generate(
                    f'--react={output_directory}',
                    f'{DEFAULT_API_DIR}',
                    working_directory=root,
                    error_message=(
                        f"Proto file '{wrong_folder}/testpackage/test.proto' is "
                        f"located in a directory '{wrong_folder}/testpackage' "
                        "that is not a legal 'proto3' package name component. "
                        "Legal characters are letters, numbers, and "
                        "underscore. Reboot requires that the directory "
                        "structure matches the proto file's package "
                        "name. Please rename your directory."
                    ),
                )

                await aiofiles.os.remove(file.name)


if __name__ == '__main__':
    unittest.main(verbosity=2)
