import reboot.cli.cli as cli
import unittest
from reboot.cli.cloud.secrets import cloud_secret_set
from reboot.cli.rc import ArgumentParser
from tests.reboot.cli.mock_exit import (
    MockExitException,
    mock_raise_instead_of_exit,
)
from unittest.mock import AsyncMock, MagicMock, patch


@patch('argparse.ArgumentParser.exit', mock_raise_instead_of_exit)
class CloudSecretSetTestCase(unittest.IsolatedAsyncioTestCase):

    async def test_requires_application_name(self) -> None:
        """Tests that `--application-name` is required."""
        parser: ArgumentParser = cli.create_parser(
            argv=[
                'rbt',
                'cloud',
                'secret',
                'set',
                '--api-key=test-key',
                'SECRET_FOO=bar',
            ]
        )
        with self.assertRaises(MockExitException) as e:
            parser.parse_args()

        self.assertEqual(e.exception.status, 2)
        self.assertIn('--application-name', e.exception.message)

    async def test_requires_key_value_pairs(self) -> None:
        """Tests that at least one KEY=VALUE is required."""
        parser: ArgumentParser = cli.create_parser(
            argv=[
                'rbt',
                'cloud',
                'secret',
                'set',
                '--api-key=test-key',
                '--application-name=my-app',
            ]
        )
        with self.assertRaises(MockExitException) as e:
            parser.parse_args()

        self.assertEqual(e.exception.status, 2)
        self.assertIn('key_values', e.exception.message)

    async def test_parses_key_values(self) -> None:
        """Tests that KEY=VALUE pairs are parsed into `key_values`."""
        parser: ArgumentParser = cli.create_parser(
            argv=[
                'rbt',
                'cloud',
                'secret',
                'set',
                '--api-key=test-key',
                '--application-name=my-app',
                'OPENAI_API_KEY=bar',
                'MAILGUN_API_KEY=qux',
            ]
        )
        args, _ = parser.parse_args()
        self.assertEqual(args.application_name, 'my-app')
        self.assertEqual(
            args.key_values, ['OPENAI_API_KEY=bar', 'MAILGUN_API_KEY=qux']
        )

    async def test_fails_when_env_var_not_set(self) -> None:
        """Tests that a key without '=' fails when the env var
        is not set."""
        parser: ArgumentParser = cli.create_parser(
            argv=[
                'rbt',
                'cloud',
                'secret',
                'set',
                '--api-key=test-key',
                '--application-name=my-app',
                'SOMETHING_NOT_IN_ENV',
            ]
        )
        args, _ = parser.parse_args()

        mock_fail = MagicMock()
        mock_fail.side_effect = SystemExit(1)
        # `_parse_common_cloud_args` would hit the Reboot Cloud API to
        # authenticate the API key; stub it out so this unit test can
        # run without a live cloud.
        with (
            self.assertRaises(SystemExit),
            patch('reboot.cli.cloud.secrets.terminal.fail', mock_fail),
            patch(
                'reboot.cli.cloud.secrets._parse_common_cloud_args',
                new_callable=AsyncMock,
                return_value=(None, 'test/my-app', None),
            ),
            # Ensure the env var is NOT set.
            patch.dict('os.environ', {}, clear=False),
        ):
            await cloud_secret_set(args)

        mock_fail.assert_called_once()
        self.assertIn(
            "environment variable not found",
            mock_fail.call_args[0][0],
        )

    async def test_reads_value_from_environment(self) -> None:
        """Tests that a key without '=' reads the value from
        the environment."""
        parser: ArgumentParser = cli.create_parser(
            argv=[
                'rbt',
                'cloud',
                'secret',
                'set',
                '--api-key=test-key',
                '--application-name=my-app',
                'SOMETHING_FROM_ENV',
            ]
        )
        args, _ = parser.parse_args()

        mock_set_secrets = AsyncMock()
        # `_parse_common_cloud_args` would hit the Reboot Cloud API to
        # authenticate the API key; stub it out so this unit test can
        # run without a live cloud.
        with (
            patch.dict('os.environ', {'SOMETHING_FROM_ENV': 'env-value'}),
            patch(
                'reboot.cli.cloud.secrets._parse_common_cloud_args',
                new_callable=AsyncMock,
                return_value=(None, 'test/my-app', None),
            ),
            patch(
                'reboot.cli.cloud.secrets.Application.ref',
                return_value=MagicMock(set_secrets=mock_set_secrets),
            ),
        ):
            await cloud_secret_set(args)

        # Verify `set_secrets` was called with the value from
        # the environment.
        mock_set_secrets.assert_called_once()
        call_kwargs = mock_set_secrets.call_args
        self.assertEqual(
            call_kwargs.kwargs['secrets'],
            {'SOMETHING_FROM_ENV': 'env-value'},
        )


@patch('argparse.ArgumentParser.exit', mock_raise_instead_of_exit)
class CloudSecretListTestCase(unittest.IsolatedAsyncioTestCase):

    async def test_requires_application_name(self) -> None:
        """Tests that `--application-name` is required."""
        parser: ArgumentParser = cli.create_parser(
            argv=[
                'rbt',
                'cloud',
                'secret',
                'list',
                '--api-key=test-key',
            ]
        )
        with self.assertRaises(MockExitException) as e:
            parser.parse_args()

        self.assertEqual(e.exception.status, 2)
        self.assertIn('--application-name', e.exception.message)

    async def test_parses_application_name(self) -> None:
        """Tests that `--application-name` is correctly parsed."""
        parser: ArgumentParser = cli.create_parser(
            argv=[
                'rbt',
                'cloud',
                'secret',
                'list',
                '--api-key=test-key',
                '--application-name=my-app',
            ]
        )
        args, _ = parser.parse_args()
        self.assertEqual(args.application_name, 'my-app')


@patch('argparse.ArgumentParser.exit', mock_raise_instead_of_exit)
class CloudSecretDeleteTestCase(unittest.IsolatedAsyncioTestCase):

    async def test_requires_application_name(self) -> None:
        """Tests that `--application-name` is required."""
        parser: ArgumentParser = cli.create_parser(
            argv=[
                'rbt',
                'cloud',
                'secret',
                'delete',
                '--api-key=test-key',
                'SECRET_FOO',
            ]
        )
        with self.assertRaises(MockExitException) as e:
            parser.parse_args()

        self.assertEqual(e.exception.status, 2)
        self.assertIn('--application-name', e.exception.message)

    async def test_requires_names(self) -> None:
        """Tests that at least one secret name is required."""
        parser: ArgumentParser = cli.create_parser(
            argv=[
                'rbt',
                'cloud',
                'secret',
                'delete',
                '--api-key=test-key',
                '--application-name=my-app',
            ]
        )
        with self.assertRaises(MockExitException) as e:
            parser.parse_args()

        self.assertEqual(e.exception.status, 2)
        self.assertIn('names', e.exception.message)

    async def test_parses_names(self) -> None:
        """Tests that names are correctly parsed."""
        parser: ArgumentParser = cli.create_parser(
            argv=[
                'rbt',
                'cloud',
                'secret',
                'delete',
                '--api-key=test-key',
                '--application-name=my-app',
                'SECRET_FOO',
                'SECRET_BAR',
            ]
        )
        args, _ = parser.parse_args()
        self.assertEqual(args.application_name, 'my-app')
        self.assertEqual(args.names, ['SECRET_FOO', 'SECRET_BAR'])


if __name__ == '__main__':
    unittest.main(verbosity=2)
