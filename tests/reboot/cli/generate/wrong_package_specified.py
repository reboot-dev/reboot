import tempfile
import unittest
from tests.reboot.cli.generate.tests_helper import (
    DEFAULT_API_DIR,
    TEST_PACKAGE,
    RbtGenerateBaseTestCase,
    proto_file,
)


class RbtGenerateTestCase(RbtGenerateBaseTestCase):

    async def test_generate_fails_wrong_package_specified(self):
        with tempfile.TemporaryDirectory(  # i.e. project root directory.
        ) as root:
            wrong_package = 'wrong_package'
            output_directory = 'output_directory'
            some_other_folder = 'some_other_folder'

            await proto_file(
                f'{root}/{DEFAULT_API_DIR}/{some_other_folder}/{TEST_PACKAGE}',
                wrong_package,
            )

            await self.run_generate(
                f'--react={output_directory}',
                f'{DEFAULT_API_DIR}',
                working_directory=root,
                error_message=(
                    "Proto file 'some_other_folder/testpackage/test.proto' "
                    "has package 'wrong_package', but based on the file's "
                    "path the expected package was 'some_other_folder."
                    "testpackage'. 'rbt generate' expects the package to match "
                    "the directory structure. Check that the API base "
                    "directory is correct, and if so, adjust either the "
                    "proto file's location or its package."
                ),
            )


if __name__ == '__main__':
    unittest.main(verbosity=2)
