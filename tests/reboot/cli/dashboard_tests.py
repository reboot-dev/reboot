import os
import tempfile
import unittest
from reboot.cli.commands import dashboard
from reboot.cli.common import cli
from reboot.cli.common.directories import dot_rbt_directory
from reboot.cli.common.rc import ArgumentParser
from reboot.dashboard.constants import DEFAULT_DASHBOARD_PORT
from tests.reboot.cli.mock_exit import (
    MockExitException,
    mock_raise_instead_of_exit,
)
from typing import Optional
from unittest.mock import patch


@patch('argparse.ArgumentParser.exit', mock_raise_instead_of_exit)
class RbtDashboardTestCase(unittest.IsolatedAsyncioTestCase):

    def _parse(
        self,
        state_directory: str,
        source_directory: Optional[str] = None,
    ):
        argv = [
            'rbt',
            f'--state-directory={state_directory}',
            'dashboard',
            '--api-directory=api',
        ]
        if source_directory is not None:
            argv.append(f'--source-directory={source_directory}')
        parser: ArgumentParser = cli.create_parser(argv=argv)
        args, _ = parser.parse_args()
        return args, parser

    async def test_api_directory_is_required(self) -> None:
        parser: ArgumentParser = cli.create_parser(argv=['rbt', 'dashboard'])
        with self.assertRaises(MockExitException):
            parser.parse_args()

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
                },
            ):
                env = dashboard._dashboard_env(
                    args,
                    parser,
                    port=DEFAULT_DASHBOARD_PORT,
                    api_directory=args.api_directory,
                    source_directory=args.source_directory,
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
                    api_directory=args.api_directory,
                    source_directory=args.source_directory,
                )

            self.assertNotEqual(env['REBOOT_CRYPTO_ROOT_KEYS'], 'v1:theirs')

            # Stable across restarts, so tokens the dashboard mints
            # stay valid until its state is deleted.
            again = dashboard._dashboard_env(
                args,
                parser,
                port=DEFAULT_DASHBOARD_PORT,
                api_directory=args.api_directory,
                source_directory=args.source_directory,
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
                api_directory=args.api_directory,
                source_directory=args.source_directory,
            )

            # As the developer spelled it, so files can be shown as
            # `api/bank/v1/account.py`; the dashboard runs in the
            # working directory where that spelling resolves.
            self.assertEqual(env['RBT_API_DIRECTORY'], 'api')

    async def test_is_told_where_the_servicers_are(self) -> None:
        with tempfile.TemporaryDirectory() as state_directory:
            args, parser = self._parse(state_directory, 'backend/src')

            env = dashboard._dashboard_env(
                args,
                parser,
                port=DEFAULT_DASHBOARD_PORT,
                source_directory=args.source_directory,
                api_directory=args.api_directory,
            )

            self.assertEqual(env['RBT_SOURCE_DIRECTORY'], 'backend/src')

    async def test_a_source_directory_is_not_required(self) -> None:
        """Somebody who names none gets a dashboard without calls,
        rather than an error; a Node.js application has no directory
        this could read."""
        with tempfile.TemporaryDirectory() as state_directory:
            args, parser = self._parse(state_directory)

            env = dashboard._dashboard_env(
                args,
                parser,
                port=DEFAULT_DASHBOARD_PORT,
                source_directory=args.source_directory,
                api_directory=args.api_directory,
            )

            self.assertNotIn('RBT_SOURCE_DIRECTORY', env)


if __name__ == '__main__':
    unittest.main()
