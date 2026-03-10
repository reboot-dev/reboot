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

    async def test_generate_react_out_specified(self):

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
            ) as root:

                await aiofiles.os.makedirs(
                    f'{root}/{react_out_dir}', exist_ok=True
                )
                proto = await proto_file(
                    f'{root}/{DEFAULT_API_DIR}/{TEST_PACKAGE}',
                    TEST_PACKAGE,
                )

                args = [
                    f'--react={react_out_dir}',
                    f'{DEFAULT_API_DIR}',
                    '--',
                    flag,
                ]

                if arg is not None:
                    args.append(arg)

                await self.run_generate(
                    *args,
                    working_directory=root,
                )

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
