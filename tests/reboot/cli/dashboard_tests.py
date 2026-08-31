import os
import tempfile
import unittest
from reboot.cli.commands import dashboard
from reboot.cli.common import cli
from reboot.cli.common.directories import dot_rbt_directory
from reboot.cli.common.rc import ArgumentParser
from reboot.dashboard.backend.constants import DEFAULT_DASHBOARD_PORT
from tests.reboot.cli.mock_exit import mock_raise_instead_of_exit
from unittest.mock import patch


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


if __name__ == '__main__':
    unittest.main()
