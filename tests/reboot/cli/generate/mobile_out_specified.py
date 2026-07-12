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

    async def test_mobile_without_react_generates_into_directory(self):
        # With no `--react` output requested, `--mobile` generates the
        # React (Native) client straight into the given directory.
        with tempfile.TemporaryDirectory() as root:
            proto = await proto_file(
                f'{root}/{DEFAULT_API_DIR}/{TEST_PACKAGE}',
                TEST_PACKAGE,
            )

            await self.run_generate(
                '--mobile=mobile_out',
                f'{DEFAULT_API_DIR}',
                working_directory=root,
            )

            await self.expect_files(
                directory=f'{root}/mobile_out/{TEST_PACKAGE}',
                expected_files=[
                    os.path.basename(proto.name).replace(
                        '.proto',
                        '_rbt_react.ts',
                    ),
                ],
            )

    async def test_mobile_with_react_copies_react_output(self):
        # When `--react` is also specified, `--mobile` mirrors the React
        # output into the mobile directory rather than re-generating.
        with tempfile.TemporaryDirectory() as root:
            proto = await proto_file(
                f'{root}/{DEFAULT_API_DIR}/{TEST_PACKAGE}',
                TEST_PACKAGE,
            )

            await self.run_generate(
                '--react=react_out',
                '--mobile=mobile_out',
                f'{DEFAULT_API_DIR}',
                working_directory=root,
            )

            react_file = os.path.basename(proto.name).replace(
                '.proto',
                '_rbt_react.ts',
            )

            # The React output and the mobile copy both contain the
            # generated client.
            await self.expect_files(
                directory=f'{root}/react_out/{TEST_PACKAGE}',
                expected_files=[react_file],
            )
            await self.expect_files(
                directory=f'{root}/mobile_out/{TEST_PACKAGE}',
                expected_files=[react_file],
            )

    async def test_mobile_and_react_same_directory_generates_once(self):
        # Pointing `--mobile` and `--react` at the same directory is
        # allowed: the React client is generated into it, and the
        # (now redundant) mobile copy is skipped rather than copying the
        # directory onto itself. The result is a single generated client.
        with tempfile.TemporaryDirectory() as root:
            proto = await proto_file(
                f'{root}/{DEFAULT_API_DIR}/{TEST_PACKAGE}',
                TEST_PACKAGE,
            )

            await self.run_generate(
                '--react=shared_out',
                '--mobile=shared_out',
                f'{DEFAULT_API_DIR}',
                working_directory=root,
            )

            await self.expect_files(
                directory=f'{root}/shared_out/{TEST_PACKAGE}',
                expected_files=[
                    os.path.basename(proto.name).replace(
                        '.proto',
                        '_rbt_react.ts',
                    ),
                ],
            )


if __name__ == '__main__':
    unittest.main(verbosity=2)
