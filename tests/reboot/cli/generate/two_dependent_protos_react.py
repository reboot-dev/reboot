import os
import tempfile
import unittest
from tests.reboot.cli.generate.tests_helper import (
    DEFAULT_API_DIR,
    TEST_PACKAGE,
    RbtGenerateBaseTestCase,
    proto_file_includes_another_proto_in_the_same_directory,
)


class RbtGenerateTestCase(RbtGenerateBaseTestCase):

    async def test_generate_two_dependent_protos_react(self):
        with tempfile.TemporaryDirectory(  # i.e. project root directory.
        ) as root:
            output_directory = 'output_directory'

            proto, another_proto = await proto_file_includes_another_proto_in_the_same_directory(
                f'{root}/{DEFAULT_API_DIR}/{TEST_PACKAGE}',
                f'{TEST_PACKAGE}',
            )

            await self.run_generate(
                f'--react={output_directory}',
                f'{DEFAULT_API_DIR}',
                working_directory=root,
            )

            await self.expect_files(
                directory=f'{root}/{output_directory}/{TEST_PACKAGE}',
                expected_files=[
                    os.path.basename(proto.name).replace(
                        '.proto',
                        '_rbt_react.ts',
                    ),
                ],
            )

            # We don't describe a Reboot service in `another_proto`, so we
            # shouldn't generate a file for it.
            await self.expect_no_files(
                directory=f'{root}/{output_directory}/{TEST_PACKAGE}',
                not_expected_files=[
                    os.path.basename(another_proto.name).replace(
                        '.proto',
                        '_rbt_react.ts',
                    ),
                ]
            )

            # We should also generate the pb.ts file for each
            # proto, as result of 'es' generation.
            await self.expect_files(
                directory=f'{root}/{output_directory}/{TEST_PACKAGE}',
                expected_files=[
                    os.path.basename(another_proto.name).replace(
                        '.proto',
                        '_pb.ts',
                    ),
                ],
            )


if __name__ == '__main__':
    unittest.main(verbosity=2)
