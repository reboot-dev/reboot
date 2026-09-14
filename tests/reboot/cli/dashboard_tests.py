import asyncio
import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from reboot.cli.commands import dashboard
from reboot.cli.common import cli
from reboot.cli.common.directories import dot_rbt_directory
from reboot.cli.common.rc import ArgumentParser
from reboot.dashboard.backend.constants import DEFAULT_DASHBOARD_PORT
from tests.reboot.cli.mock_exit import mock_raise_instead_of_exit
from unittest.mock import AsyncMock, patch


@patch('argparse.ArgumentParser.exit', mock_raise_instead_of_exit)
class RbtDashboardTestCase(unittest.IsolatedAsyncioTestCase):

    def _parse(self, state_directory: str, *, rbtrc: str = 'generate api/'):
        rc_file = os.path.join(state_directory, '.rbtrc')
        with open(rc_file, 'w') as file:
            file.write(rbtrc + '\n')

        parser: ArgumentParser = cli.create_parser(
            rc_file=rc_file,
            argv=[
                'rbt',
                f'--state-directory={state_directory}',
                'dashboard',
            ],
        )
        args, _ = parser.parse_args()
        return args, parser

    async def test_a_second_dashboard_reuses_the_first(self) -> None:
        """A dashboard already running for the project is pointed at
        and opened, never started over: a second one would fail to
        open the first's RocksDB, delete its state in response, and
        share its port."""
        with tempfile.TemporaryDirectory() as state_directory:
            args, parser = self._parse(state_directory)

            first = dashboard.DashboardLock(
                dot_rbt_directory(args, parser) / 'dashboard'
            )
            self.assertIsNone(first.acquire(port=9873))
            try:
                with (
                    patch.object(
                        dashboard, 'dev_extra_installed', return_value=True
                    ),
                    patch.object(
                        dashboard, '_open_when_serving', new=AsyncMock()
                    ) as open_when_serving,
                    patch.object(
                        dashboard, '_run_dashboard', new=AsyncMock()
                    ) as run_dashboard,
                ):
                    self.assertEqual(
                        await dashboard.dashboard(args, parser), 0
                    )

                # Opened on the port the running one recorded, not the
                # default this invocation asked for.
                open_when_serving.assert_awaited_once_with(port=9873)
                run_dashboard.assert_not_awaited()
            finally:
                first.release()

    async def test_an_orphaned_dashboard_is_not_started_over(self) -> None:
        """The `rbt dashboard` is gone but the application it started
        still holds the lock: refused, since a start that failed on
        the state it holds would delete that state."""
        with tempfile.TemporaryDirectory() as state_directory:
            args, parser = self._parse(state_directory)
            lock_path = (
                dot_rbt_directory(args, parser) / 'dashboard' /
                dashboard.LOCK_FILE_NAME
            )
            lock_path.parent.mkdir(parents=True)
            lock_path.touch()

            # A process that is over, so its id names nobody.
            gone = subprocess.Popen([sys.executable, '-c', 'pass'])
            gone.wait()

            holder = subprocess.Popen(
                [
                    sys.executable,
                    '-c',
                    'import fcntl, json, sys, time\n'
                    'fd = open(sys.argv[1], "r+")\n'
                    'fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)\n'
                    'fd.write(json.dumps({"pid": int(sys.argv[2]), '
                    '"port": 9873}))\n'
                    'fd.flush()\n'
                    'print("held", flush=True)\n'
                    'time.sleep(60)\n',
                    str(lock_path),
                    str(gone.pid),
                ],
                stdout=subprocess.PIPE,
                text=True,
            )
            try:
                assert holder.stdout is not None
                self.assertEqual(holder.stdout.readline().strip(), 'held')

                with (
                    patch.object(
                        dashboard, 'dev_extra_installed', return_value=True
                    ),
                    patch.object(
                        dashboard, '_run_dashboard', new=AsyncMock()
                    ) as run_dashboard,
                ):
                    with self.assertRaises(SystemExit):
                        await dashboard.dashboard(args, parser)

                run_dashboard.assert_not_awaited()
            finally:
                holder.kill()
                holder.wait()

    async def test_the_api_directory_comes_from_generate(self) -> None:
        """Naming it twice is how the two come to disagree, so it is
        named once, where `rbt generate` already needs it."""
        with tempfile.TemporaryDirectory() as state_directory:
            _, parser = self._parse(
                state_directory,
                rbtrc=(
                    '# Find the API files in `api/`.\n'
                    'generate api/\n'
                    '\n'
                    'generate --python=backend/api\n'
                    'generate --react=frontend/api\n'
                    '\n'
                    'dev run --application=backend/src/main.py\n'
                    'dev run:hmr --frontend-host=http://localhost:4444'
                ),
            )

            self.assertEqual(dashboard._api_directory(parser), 'api/')

    async def test_the_application_comes_from_dev_run(self) -> None:
        """Named once, where `rbt dev run` already needs it."""
        with tempfile.TemporaryDirectory() as state_directory:
            args, parser = self._parse(
                state_directory,
                rbtrc=(
                    'generate api/\n'
                    'dev run --application=backend/src/main.py'
                ),
            )

            env = dashboard._dashboard_env(
                args,
                parser,
                port=DEFAULT_DASHBOARD_PORT,
                api_directory=dashboard._api_directory(parser),
                application=dashboard._application(parser),
                generated_directory=dashboard._generated_directory(parser),
            )

            self.assertEqual(env['RBT_APPLICATION'], 'backend/src/main.py')

    async def test_an_rbtrc_that_names_no_application(self) -> None:
        """Somebody who names none gets a dashboard that looks for no
        implementations, rather than an error."""
        with tempfile.TemporaryDirectory() as state_directory:
            args, parser = self._parse(state_directory, rbtrc='generate api/')

            env = dashboard._dashboard_env(
                args,
                parser,
                port=DEFAULT_DASHBOARD_PORT,
                api_directory=dashboard._api_directory(parser),
                application=dashboard._application(parser),
                generated_directory=dashboard._generated_directory(parser),
            )

            self.assertNotIn('RBT_APPLICATION', env)

    async def test_an_rbtrc_that_says_nothing_about_generate(self) -> None:
        with tempfile.TemporaryDirectory() as state_directory:
            _, parser = self._parse(
                state_directory,
                rbtrc='dev run --application=backend/src/main.py',
            )

            with self.assertRaises(SystemExit):
                dashboard._api_directory(parser)

    async def test_env_is_isolated_from_any_application(self) -> None:
        with tempfile.TemporaryDirectory() as state_directory:
            args, parser = self._parse(state_directory)

            # Values naming a developer's application must not survive
            # into the dashboard's environment; if any did, the
            # dashboard would collide with their state directory or
            # port.
            with patch.dict(
                os.environ,
                {
                    'RBT_NAME': 'app',
                    'RBT_STATE_DIRECTORY': '/somewhere/app',
                    'RBT_NODEJS': 'true',
                    'REBOOT_LOCAL_ENVOY_PORT': '9991',
                    'RBT_DEV': 'true',
                    'RBT_EFFECT_VALIDATION': 'ENABLED',
                },
            ):
                env = dashboard._dashboard_env(
                    args,
                    parser,
                    port=DEFAULT_DASHBOARD_PORT,
                    api_directory=dashboard._api_directory(parser),
                    application=dashboard._application(parser),
                    generated_directory=dashboard._generated_directory(parser),
                )

            self.assertEqual(env['RBT_NAME'], 'dashboard')
            self.assertNotIn('RBT_NODEJS', env)
            self.assertEqual(
                env['REBOOT_LOCAL_ENVOY_PORT'],
                str(DEFAULT_DASHBOARD_PORT),
            )

            # One server, and Envoy explicitly on: one server would
            # otherwise turn Envoy off, and the browser has to reach
            # the dashboard.
            self.assertEqual(env['RBT_SERVERS'], '1')
            self.assertEqual(env['REBOOT_LOCAL_ENVOY'], 'true')

            # `rbt serve` defaults, not `rbt dev` ones: `RBT_SERVE`
            # alone is not enough to produce a `rbt serve`
            # environment, and `RBT_DEV` has to be gone rather than
            # merely unset, since it is read first.
            self.assertEqual(env['RBT_SERVE'], 'true')
            self.assertNotIn('RBT_DEV', env)
            self.assertEqual(env['RBT_EFFECT_VALIDATION'], 'DISABLED')

            # A sibling of `.rbt/dev/`, so that it can never collide
            # with an application's state at `.rbt/dev/<name>/`.
            self.assertEqual(
                env['RBT_STATE_DIRECTORY'],
                str(dot_rbt_directory(args, parser) / 'dashboard'),
            )

    async def test_keys_differ_from_any_application(self) -> None:
        with tempfile.TemporaryDirectory() as state_directory:
            args, parser = self._parse(state_directory)

            with patch.dict(
                os.environ, {'REBOOT_CRYPTO_ROOT_KEYS': 'v1:theirs'}
            ):
                env = dashboard._dashboard_env(
                    args,
                    parser,
                    port=DEFAULT_DASHBOARD_PORT,
                    api_directory=dashboard._api_directory(parser),
                    application=dashboard._application(parser),
                    generated_directory=dashboard._generated_directory(parser),
                )

            self.assertNotEqual(env['REBOOT_CRYPTO_ROOT_KEYS'], 'v1:theirs')

            # Stable across restarts, so tokens the dashboard mints
            # stay valid until its state is deleted.
            again = dashboard._dashboard_env(
                args,
                parser,
                port=DEFAULT_DASHBOARD_PORT,
                api_directory=dashboard._api_directory(parser),
                application=dashboard._application(parser),
                generated_directory=dashboard._generated_directory(parser),
            )
            self.assertEqual(
                env['REBOOT_CRYPTO_ROOT_KEYS'],
                again['REBOOT_CRYPTO_ROOT_KEYS'],
            )

    async def test_is_told_where_the_api_files_are(self) -> None:
        with tempfile.TemporaryDirectory() as state_directory:
            args, parser = self._parse(state_directory)

            env = dashboard._dashboard_env(
                args,
                parser,
                port=DEFAULT_DASHBOARD_PORT,
                api_directory=dashboard._api_directory(parser),
                application=dashboard._application(parser),
                generated_directory=dashboard._generated_directory(parser),
            )

            # As the developer spelled it, so files can be shown as
            # `api/bank/v1/account.py`; the dashboard runs in the
            # working directory where that spelling resolves.
            self.assertEqual(env['RBT_API_DIRECTORY'], 'api/')


class DashboardLockTest(unittest.IsolatedAsyncioTestCase):

    def test_second_lock_names_the_holder(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            state_directory = Path(directory) / 'dashboard'

            first = dashboard.DashboardLock(state_directory)
            self.assertIsNone(first.acquire(port=9871))

            # The lock belongs to the open file, so a second opening
            # of the same file sees it held even from this process,
            # the way a second `rbt dashboard` would.
            second = dashboard.DashboardLock(state_directory)
            self.assertEqual(
                second.acquire(port=9999),
                dashboard.RunningDashboard(pid=os.getpid(), port=9871),
            )

            # The holder keeps its lock across repeated attempts.
            self.assertIsNone(first.acquire(port=9871))

            # Released, the lock is free although the file remains.
            first.release()
            self.assertTrue(
                (state_directory / dashboard.LOCK_FILE_NAME).exists()
            )
            self.assertIsNone(second.acquire(port=9999))
            second.release()

    def test_a_child_that_inherits_the_lock_keeps_it(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            state_directory = Path(directory) / 'dashboard'

            first = dashboard.DashboardLock(state_directory)
            self.assertIsNone(first.acquire(port=9871))

            child = subprocess.Popen(
                [sys.executable, '-c', 'import time; time.sleep(60)'],
                pass_fds=(first.fd,),
            )
            try:
                # Released here, the lock lives on in the child, the
                # way a dashboard application outliving its
                # `rbt dashboard` keeps the state directory's.
                first.release()
                second = dashboard.DashboardLock(state_directory)
                self.assertEqual(
                    second.acquire(port=9999),
                    dashboard.RunningDashboard(pid=os.getpid(), port=9871),
                )
            finally:
                child.kill()
                child.wait()

            # Gone with the child.
            self.assertIsNone(second.acquire(port=9999))
            second.release()

    def test_alive(self) -> None:
        self.assertTrue(dashboard._alive(os.getpid()))
        gone = subprocess.Popen([sys.executable, '-c', 'pass'])
        gone.wait()
        self.assertFalse(dashboard._alive(gone.pid))

    async def test_port_taken_by_something_else_is_refused(self) -> None:
        # Something that is not a dashboard for this project is
        # serving on the port: `rbt dashboard` refuses rather than
        # sharing the port with it.
        server = await asyncio.start_server(
            lambda reader, writer: writer.close(), '127.0.0.1', 0
        )
        port = server.sockets[0].getsockname()[1]

        with self.assertRaises(SystemExit):
            await dashboard._fail_if_port_taken(port)

        server.close()
        await server.wait_closed()

        # Free again, the port passes.
        await dashboard._fail_if_port_taken(port)


if __name__ == '__main__':
    unittest.main()
