import tempfile
import unittest
from tests.reboot.cli.generate.tests_helper import (
    DEFAULT_API_DIR,
    RbtGenerateBaseTestCase,
)


class RbtGenerateTestCase(RbtGenerateBaseTestCase):

    async def test_generate_space_in_quotes(self):
        with tempfile.TemporaryDirectory(  # i.e. project root directory.
        ) as root:
            output_directory = 'output_directory'

            await self.run_generate(
                f'--python={output_directory}',
                '--new_flag="two words"',
                f'{DEFAULT_API_DIR}',
                working_directory=root,
                error_message=(
                    "unrecognized arguments: '--new_flag=\"two words\"'"
                ),
                error_exit_code=2,
            )

    async def test_generate_space_in_quotes_order(self):
        with tempfile.TemporaryDirectory(  # i.e. project root directory.
        ) as root:
            output_directory = 'output_directory'

            await self.run_generate(
                f'--python={output_directory}',
                f'{DEFAULT_API_DIR}',
                '--new_flag="two words"',
                working_directory=root,
                error_message=(
                    "unrecognized arguments: '--new_flag=\"two words\"'"
                ),
                error_exit_code=2,
            )


if __name__ == '__main__':
    unittest.main(verbosity=2)
