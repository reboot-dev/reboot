import tempfile
import unittest
from tests.reboot.cli.generate.tests_helper import (
    DEFAULT_API_DIR,
    RbtGenerateBaseTestCase,
)


class RbtGenerateTestCase(RbtGenerateBaseTestCase):

    async def test_generate_fails_no_generated_languages_specified(self):
        with tempfile.TemporaryDirectory(  # i.e. project root directory.
        ) as root:
            await self.run_generate(
                f'{DEFAULT_API_DIR}',
                '--',
                f'--reboot_python_out={DEFAULT_API_DIR}',
                working_directory=root,
                error_message=(
                    "--reboot_python_out was specified after '--'. "
                    "Instead, use '--python' to specify the output directory.\n"
                ),
            )

            await self.run_generate(
                f'{DEFAULT_API_DIR}',
                '--',
                f'--reboot_react_out={DEFAULT_API_DIR}',
                working_directory=root,
                error_message=(
                    "--reboot_react_out was specified after '--'. "
                    "Instead, use '--react' to specify the output directory.\n"
                ),
            )

            await self.run_generate(
                f'{DEFAULT_API_DIR}',
                '--',
                f'--es_out={DEFAULT_API_DIR}',
                working_directory=root,
                error_message=(
                    "--es_out was specified after '--'. "
                    "Instead, use '--react' or '--nodejs' or '--web' "
                    "to specify the output directory.\n"
                ),
            )


if __name__ == '__main__':
    unittest.main(verbosity=2)
