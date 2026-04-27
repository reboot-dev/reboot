import aiofiles.os
import reboot.cli.cli as cli
import tempfile
import unittest
from reboot.aio.directories import chdir
from reboot.cli.init.init import init_run, validate_name
from reboot.cli.rc import ArgumentParser
from unittest.mock import patch


# Mock fail, because the original fail will exit the program.
def mock_raise_instead_fail(message):
    raise ValueError(message)


@patch('reboot.cli.terminal.fail', mock_raise_instead_fail)
class RbtDevTestCase(unittest.IsolatedAsyncioTestCase):

    async def test_rbt_init_run(self) -> None:
        parser: ArgumentParser = cli.create_parser(
            argv=[
                'rbt',
                'init',
                '--application-name=reboot_hello',
            ]
        )

        args, _ = parser.parse_args()

        api_file = 'api/reboot_hello/v1/hello_world.proto'

        backend_files = [
            'backend/src/cli.py',
            'backend/src/hello_world_servicer.py',
            'backend/src/main.py',
        ]

        web_files = [
            'web/public/index.html',
            'web/src/index.tsx',
            'web/src/App.tsx',
            'web/src/App.module.css',
            'web/.env',
            'web/package.json',
            'web/tsconfig.json',
            'web/src/assets/reboot-logo.svg',
        ]

        with tempfile.TemporaryDirectory() as directory, chdir(directory):
            await init_run(args)

            self.assertTrue(
                await aiofiles.os.path.exists(f'{directory}/.rbtrc')
            )

            self.assertTrue(
                await aiofiles.os.path.exists(f'{directory}/{api_file}')
            )

            for file in backend_files:
                self.assertTrue(
                    await aiofiles.os.path.exists(f'{directory}/{file}')
                )

            for file in web_files:
                self.assertTrue(
                    await aiofiles.os.path.exists(f'{directory}/{file}')
                )

        with tempfile.TemporaryDirectory() as directory, chdir(directory):
            # Making to init backend only.
            args.frontend = "none"

            await init_run(args)

            self.assertTrue(
                await aiofiles.os.path.exists(f'{directory}/.rbtrc')
            )

            self.assertTrue(
                await aiofiles.os.path.exists(f'{directory}/{api_file}')
            )

            for file in backend_files:
                self.assertTrue(
                    await aiofiles.os.path.exists(f'{directory}/{file}')
                )

            self.assertFalse(
                await aiofiles.os.path.exists(f'{directory}/web/')
            )

    async def test_validate_name(self) -> None:
        with self.assertRaises(ValueError) as e:
            validate_name('reboot-hello')

        self.assertEqual(
            str(e.exception),
            "Invalid name: 'reboot-hello'. The name of the application "
            "should start with a letter and contain only lowercase letters, "
            "numbers and underscores.",
        )

        with self.assertRaises(ValueError) as e:
            validate_name('reboot.hello')

        self.assertEqual(
            str(e.exception),
            "Invalid name: 'reboot.hello'. The name of the application "
            "should start with a letter and contain only lowercase letters, "
            "numbers and underscores.",
        )

        validate_name('reboot_hello')

    async def test_clashing_name(self) -> None:
        parser: ArgumentParser = cli.create_parser(
            argv=[
                'rbt',
                'init',
                '--application-name=asyncio',
            ]
        )
        args, _ = parser.parse_args()

        with tempfile.TemporaryDirectory() as directory, chdir(directory):
            with self.assertRaises(ValueError) as e:
                await init_run(args)

            self.assertEqual(
                str(e.exception),
                "Can't initialize your Python backend: the name 'asyncio' "
                "would clash with the Python standard library 'asyncio' "
                "module. Try a different name.",
            )

    async def test_unsupported_frontend_platform(self) -> None:
        parser: ArgumentParser = cli.create_parser(
            argv=[
                'rbt',
                'init',
                '--application-name=unsupported_name',
                '--frontend=unsupported',
            ]
        )
        args, _ = parser.parse_args()

        with tempfile.TemporaryDirectory() as directory, chdir(directory):
            with self.assertRaises(ValueError) as e:
                await init_run(args)

            self.assertEqual(
                str(e.exception),
                "Unsupported frontend: unsupported",
            )

    async def test_unsupported_backend(self) -> None:
        parser: ArgumentParser = cli.create_parser(
            argv=[
                'rbt',
                'init',
                '--application-name=unsupported_name',
                '--backend=unsupported',
            ]
        )
        args, _ = parser.parse_args()

        with tempfile.TemporaryDirectory() as directory, chdir(directory):
            with self.assertRaises(ValueError) as e:
                await init_run(args)

            self.assertEqual(
                str(e.exception),
                "Unsupported backend: unsupported",
            )


if __name__ == '__main__':
    unittest.main(verbosity=2)
