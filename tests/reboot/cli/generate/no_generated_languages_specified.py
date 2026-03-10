import tempfile
import unittest
from tests.reboot.cli.generate.tests_helper import (
    DEFAULT_API_DIR,
    TEST_PACKAGE,
    RbtGenerateBaseTestCase,
    proto_file,
)


class RbtGenerateTestCase(RbtGenerateBaseTestCase):

    async def test_generate_fails_no_generated_languages_specified(self):
        with tempfile.TemporaryDirectory(  # i.e. project root directory.
        ) as root:
            some_package = 'some_package'
            await proto_file(
                f'{root}/{DEFAULT_API_DIR}/{TEST_PACKAGE}/{some_package}',
                f'{TEST_PACKAGE}.{some_package}',
            )

            await self.run_generate(
                f'{DEFAULT_API_DIR}',
                working_directory=root,
                error_message=str(
                    "At least one of 'python, react, nodejs, web' must be specified.\n"
                ),
            )


if __name__ == '__main__':
    unittest.main(verbosity=2)
