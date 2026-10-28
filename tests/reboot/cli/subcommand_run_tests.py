import asyncio
import os
import tempfile
import unittest
from reboot.aio.tests import temporary_environ
from typing import Optional


class RbtDevRunTestCase(unittest.IsolatedAsyncioTestCase):

    async def asyncSetUp(self) -> None:
        # Add `reboot` directories to the path so that we can import
        # the `rbt` binary. Applicable only for bazel tests.
        temporary_environ(
            self,
            {
                'PATH':
                    os.path.abspath(os.path.join(os.getcwd(), 'reboot')) +
                    os.pathsep + os.path.abspath(
                        os.path.join(os.getcwd(), 'reboot', 'cli')
                    ) + os.pathsep + os.environ['PATH']
            },
        )

    async def run_rbt(
        self,
        *args,
        working_directory: str = os.getcwd(),
        error_message: Optional[str] = None,
        command: str = 'dev',
        subcommand: str = 'run',
        returncode: int = 1,
    ):
        process = await asyncio.create_subprocess_exec(
            'rbt',
            f'{command}',
            f'{subcommand}',
            *args,
            cwd=working_directory,
            stderr=asyncio.subprocess.PIPE,
        )

        _, error = await process.communicate()

        if error_message is None:
            self.assertEqual(
                process.returncode, 0, f"Output:\n{error.decode()}"
            )
        else:
            self.assertEqual(process.returncode, returncode)
            # The error message that we receive from the 'dev run' command
            # may contain some extra information, like which protoc generator
            # failed or the exit code, so we just check if the error message is
            # in the error.
            self.assertIn(error_message, error.decode())

    async def test_generate_watch_with_empty_rbtrc(self) -> None:
        with tempfile.TemporaryDirectory() as root, open(
            f'{root}/.rbtrc', 'w'
        ) as file:
            file.write("")
            file.flush()
            await self.run_rbt(
                '--terminate-after-health-check',
                '--python',
                '--application=some_application.py',
                working_directory=root,
                error_message=
                "rbt generate: error: the following arguments are required: "
                "proto_directories\n"
                "Failed to run 'rbt generate' as part of 'rbt dev run' with "
                "'--generate-watch' flag set.\n"
                "Edit the '.rbtrc' file to set the necessary arguments to run "
                "'rbt generate', or pass '--no-generate-watch'.",
            )

    async def test_dev_empty_name(self) -> None:
        await self.run_rbt(
            '--application-name=',
            '--python',
            '--application=some_application.py',
            error_message=(
                "The argument '--application-name' must be a non-empty string"
            ),
            returncode=2,
        )

    async def test_expunge_empty_name(self) -> None:
        await self.run_rbt(
            '--application-name=',
            error_message=(
                "The argument '--application-name' must be a non-empty string"
            ),
            subcommand='expunge',
            returncode=2,
        )

    async def test_cloud_without_reboot_cloud(self) -> None:
        # `rbt cloud` is provided by the `reboot-cloud` package, which
        # is not installed here.
        await self.run_rbt(
            '--api-key=AAAAAAAAAA-AAAAAAAAAAAAAAAAAAAA',
            '--application-name=test',
            error_message=(
                "`rbt cloud` is provided by the 'reboot-cloud' package"
            ),
            command='cloud',
            subcommand='up',
            returncode=1,
        )


if __name__ == '__main__':
    unittest.main(verbosity=2)
