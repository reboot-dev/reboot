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

    async def test_generate_ts_code(self):
        with tempfile.TemporaryDirectory(  # i.e. project root directory.
        ) as root:
            es_out = 'es_out'

            proto = await proto_file(
                f'{root}/{DEFAULT_API_DIR}/{TEST_PACKAGE}',
                f'{TEST_PACKAGE}',
            )

            await self.run_generate(
                f'--nodejs={es_out}',
                f'--react={es_out}',
                f'{DEFAULT_API_DIR}',
                working_directory=root,
            )

            await self.expect_files(
                directory=f'{root}/{es_out}/{TEST_PACKAGE}',
                expected_files=[
                    os.path.basename(proto.name).replace(
                        '.proto',
                        '_rbt.ts',
                    ),
                    os.path.basename(proto.name).replace(
                        '.proto',
                        '_rbt_react.ts',
                    ),
                ],
            )


if __name__ == '__main__':
    unittest.main(verbosity=2)
