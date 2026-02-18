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

    async def test_generate_react_out_rbtrc_specified(self):
        react_out_dir = 'react_out'
        # Run the test twice, with the same settings, but specifying the Google
        # protoc flags differently: with or without an `=` between flag name and
        # value. This tests that our parsers (which normally only accepts
        # `--flag=value`) is OK with both cases for arguments that follow a ` --
        # `.
        protoc_args = [
            ('--error_format', 'gcc'),
            ('--error_format=msvs', None),
        ]

        for flag, arg in protoc_args:
            with tempfile.TemporaryDirectory(  # i.e. project root directory.
            ) as root, open(f'{root}/.rbtrc', 'w') as file:
                await aiofiles.os.makedirs(
                    f'{root}/{react_out_dir}', exist_ok=True
                )

                file_content = (
                    f'generate {DEFAULT_API_DIR}\n'
                    f'generate --react={react_out_dir}\n'
                )

                if arg is not None:
                    file_content += f'generate -- {flag}={arg}\n'
                else:
                    file_content += f'generate -- {flag}\n'

                # 'rbt generate' expects '.rbtrc' file in the current directory to
                # extract the command line arguments from.
                # Since the file is located in the temporary directory, it will be
                # deleted at the end of the test, so no need to clean up the
                # file explicitly.
                file.write(file_content)
                file.flush()

                proto = await proto_file(
                    f'{root}/{DEFAULT_API_DIR}/{TEST_PACKAGE}',
                    TEST_PACKAGE,
                )

                await self.run_generate(working_directory=root)

                await self.expect_files(
                    directory=f'{root}/{react_out_dir}/{TEST_PACKAGE}',
                    expected_files=[
                        os.path.basename(proto.name).replace(
                            '.proto',
                            '_rbt_react.ts',
                        ),
                    ],
                )


if __name__ == '__main__':
    unittest.main(verbosity=2)
