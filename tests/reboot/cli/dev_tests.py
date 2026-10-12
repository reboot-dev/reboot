import aiofiles
import asyncio
import os
import reboot.cli.commands.dev as dev
import reboot.cli.common.cli as cli
import tempfile
import unittest
from reboot.cli.common.directories import dot_rbt_dev_directory
from reboot.cli.common.rc import ArgumentParser
from tests.reboot.cli.mock_exit import (
    MockExitException,
    mock_raise_instead_of_exit,
)
from unittest.mock import AsyncMock, Mock, call, patch


@patch('argparse.ArgumentParser.exit', mock_raise_instead_of_exit)
class RbtDevTestCase(unittest.IsolatedAsyncioTestCase):

    async def test_dev_requires_application(self) -> None:
        parser: ArgumentParser = cli.create_parser(
            argv=[
                'rbt',
                'dev',
                'run',
                '--working-directory=.',
                '--python',
            ]
        )
        with self.assertRaises(MockExitException) as e:
            parser.parse_args()

        self.assertEqual(e.exception.status, 2)
        self.assertEqual(
            e.exception.message,
            "rbt dev run: error: the following arguments are required: "
            "--application\n"
        )

    async def test_generate_watch_fail_with_no_rbtrc(self) -> None:
        parser: ArgumentParser = cli.create_parser(
            argv=[
                'rbt',
                'dev',
                'run',
                '--working-directory=.',
                '--generate-watch',
                '--application=some.py',
            ]
        )

        args, argv_after_dash_dash = parser.parse_args()

        # Mock fail, because the original fail will exit the program.
        mock_fail = Mock()
        mock_fail.side_effect = lambda message: self.assertEqual(
            message,
            "The '--generate-watch' flag was specified (or set by default), but "
            "no '.rbtrc' file was found. Add an '.rbtrc' file containing "
            "the necessary arguments to run 'rbt generate' to use 'rbt dev "
            "run --generate-watch', or pass '--no-generate-watch'.",
        )

        with patch('reboot.cli.common.terminal.fail', mock_fail):
            dev.generate_parser_if_generate_watch(
                args, parser, lambda argv: cli.create_parser(argv=argv)
            )

            mock_fail.assert_called_once()

    async def test_generate_watch_with_rbtrc(self) -> None:
        with tempfile.NamedTemporaryFile() as file:
            file.write(
                (
                    'dev run --working-directory=.\n'
                    'dev run --generate-watch\n'
                    'dev run --python\n'
                    'dev run --application=some.py'
                ).encode()
            )
            file.flush()
            parser: ArgumentParser = cli.create_parser(
                argv=[
                    'rbt',
                    'dev',
                    'run',
                ],
                rc_file=file.name,
            )

            args, argv_after_dash_dash = parser.parse_args()

            # With the `.rbtrc` present and containing the `--generate-watch` flag, we
            # expect `dev` to be told to also use `rbt generate --watch`.
            self.assertIsNotNone(
                dev.generate_parser_if_generate_watch(
                    args, parser, lambda argv: cli.create_parser(argv=argv)
                )
            )

    async def test_environment_variable(self) -> None:
        parser: ArgumentParser = cli.create_parser(
            argv=[
                'rbt',
                'dev',
                'run',
                '--working-directory=.',
                '--env=E1=V1',
                '--env=E2=V2',
                '--env=E3=V3',
                '--python',
                '--application=some.py',
            ]
        )

        args, _ = parser.parse_args()
        self.assertListEqual(
            args.env,
            [['E1', 'V1'], ['E2', 'V2'], ['E3', 'V3']],
        )

    async def test_portless_name(self) -> None:
        parser: ArgumentParser = cli.create_parser(
            argv=[
                'rbt',
                'dev',
                'run',
                '--working-directory=.',
                '--portless=ping',
                '--python',
                '--application=some.py',
            ]
        )

        args, _ = parser.parse_args()

        self.assertEqual(args.portless, 'ping')

    async def test_portless_origin_is_an_https_origin(self) -> None:
        """CORS receives an origin, never a URL containing a path."""
        self.assertEqual(
            dev._portless_https_origin('https://ping.localhost/'),
            'https://ping.localhost',
        )
        with self.assertRaises(ValueError):
            dev._portless_https_origin('https://ping.localhost/not-an-origin')

    async def test_configure_portless_registers_the_local_envoy_port(self) -> None:
        """The Portless route and propagated CORS value use its real origin."""
        subprocesses = Mock()
        with patch(
            'reboot.cli.commands.dev._run_portless',
            new_callable=AsyncMock,
            side_effect=['proxy started', 'alias registered', 'https://ping.test:8443'],
        ) as run_portless:
            origin = await dev._configure_portless(
                name='ping',
                app_port=9991,
                subprocesses=subprocesses,
            )

        self.assertEqual(origin, 'https://ping.test:8443')
        self.assertEqual(
            run_portless.await_args_list,
            [
                call(subprocesses, 'proxy', 'start', '--https'),
                call(subprocesses, 'alias', 'ping', '9991', '--force'),
                call(subprocesses, 'get', 'ping', '--no-worktree'),
            ],
        )

    async def test_open_dashboard_requires_a_reachable_dashboard(self) -> None:
        # `rbt dev run --open-dashboard` refuses to start when nothing
        # is serving on the dashboard's port, telling the developer to
        # run `rbt dashboard`.
        server = await asyncio.start_server(
            lambda reader, writer: writer.close(), '127.0.0.1', 0
        )
        port = server.sockets[0].getsockname()[1]

        self.assertTrue(await dev._dashboard_reachable(port))

        server.close()
        await server.wait_closed()

        self.assertFalse(await dev._dashboard_reachable(port))

    async def test_dev_expunge_requires_name(self) -> None:
        parser: ArgumentParser = cli.create_parser(
            argv=[
                'rbt',
                'dev',
                'expunge',
            ]
        )
        with self.assertRaises(MockExitException) as e:
            parser.parse_args()

        self.assertEqual(e.exception.status, 2)
        self.assertEqual(
            e.exception.message,
            "rbt dev expunge: error: the following arguments are required: "
            "--application-name\n"
        )

    async def test_read_line_does_not_block_event_loop(self) -> None:
        # Create a pipe to emulate stdin.
        reader_fd, writer_fd = os.pipe()
        with os.fdopen(reader_fd, 'r') as reader:
            async with aiofiles.open(writer_fd, 'w') as writer:
                read_line_task = asyncio.create_task(dev._read_line(reader))

                # The event loop keeps running while there is no line to
                # read, which is what lets a signal cancel the read.
                await asyncio.sleep(0.1)
                assert not read_line_task.done()

                await writer.write("yes\n")
                await writer.flush()

                self.assertEqual(await read_line_task, "yes\n")

            # The input is closed.
            self.assertEqual(await dev._read_line(reader), "")

    async def test_dev_run_await_maybe_expunge(self) -> None:
        parser: ArgumentParser = cli.create_parser(
            argv=[
                'rbt',
                '--state-directory=something',
                'dev',
                'run',
                '--application-name=app',
                '--working-directory=.',
                '--application=some.py',
                '--on-backwards-incompatibility=ask',
            ]
        )

        args, _ = parser.parse_args()

        # Create a directory for expunge to clear.
        os.makedirs(
            dot_rbt_dev_directory(args, parser) / args.application_name
        )

        # Create a pipe to emulate stdin.
        reader_fd, writer_fd = os.pipe()
        with os.fdopen(reader_fd, 'r') as reader:
            async with aiofiles.open(writer_fd, 'w') as writer:
                expunge_task = asyncio.create_task(
                    dev.await_maybe_expunge(args, parser, stdin=reader)
                )

                # Confirm that the task does not exit (immediately, at least)
                # without confirmation.
                done, pending = await asyncio.wait([expunge_task], timeout=0.1)
                assert pending

                # Then, give the task confirmation, and confirm that it exits.
                await writer.write("x")
                await writer.flush()

                done, pending = await asyncio.wait([expunge_task], timeout=10)
                assert done


if __name__ == '__main__':
    unittest.main(verbosity=2)
