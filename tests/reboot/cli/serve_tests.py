import os
import reboot.cli.cli as cli
import unittest
from reboot.cli.rc import ArgumentParser
from reboot.controller.settings import (
    ENVVAR_PORT,
    ENVVAR_RBT_PORT,
    USER_CONTAINER_GRPC_PORT,
)
from reboot.settings import (
    ENVVAR_RBT_STATE_DIRECTORY,
    ENVVAR_REBOOT_CLOUD_VERSION,
    REBOOT_STATE_DIRECTORY,
)
from tests.reboot.cli.mock_exit import (
    MockExitException,
    mock_raise_instead_of_exit,
)
from unittest.mock import patch


@patch('argparse.ArgumentParser.exit', mock_raise_instead_of_exit)
class RbtServeTestCase(unittest.IsolatedAsyncioTestCase):

    def setUp(self):
        self._environ_before = os.environ

    def tearDown(self):
        # Reset the environment variables to what they were before the tests.
        os.environ.clear()
        os.environ.update(self._environ_before)

    async def test_serve_nofail(self) -> None:
        # Tests: if all required arguments are passed, parsing succeeds.
        parser: ArgumentParser = cli.create_parser(
            argv=[
                'rbt',
                'serve',
                'run',
                '--application=backend/src/main.py',
                '--application-name=test',
                '--tls=external',
                '--state-directory=/tmp',
                '--port=1337',
            ]
        )
        args, _ = parser.parse_args()
        self.assertEqual(1337, args.port)
        self.assertEqual('/tmp', args.state_directory)

    async def test_serve_args_via_envvar(self) -> None:
        # Tests: some flags can also be set via environmetn variable.
        os.environ[ENVVAR_PORT] = '1337'
        os.environ[ENVVAR_RBT_STATE_DIRECTORY] = '/tmp'
        parser: ArgumentParser = cli.create_parser(
            argv=[
                'rbt',
                'serve',
                'run',
                '--application=backend/src/main.py',
                '--application-name=test',
                '--tls=external',
            ]
        )
        args, _ = parser.parse_args()
        self.assertEqual(1337, args.port)
        self.assertEqual('/tmp', args.state_directory)

    async def test_error_on_duplicate_arg_from_env_singular(self) -> None:
        # Tests: error for an argument set both on the command line and in its
        # (only) environment variable.
        os.environ[ENVVAR_RBT_STATE_DIRECTORY] = '/anywhere'
        parser: ArgumentParser = cli.create_parser(
            argv=[
                'rbt',
                'serve',
                'run',
                '--application=backend/src/main.py',
                '--application-name=test',
                '--tls=external',
                '--state-directory=/tmp',
                '--port=1337',
            ]
        )

        with self.assertRaises(MockExitException) as e:
            parser.parse_args()

        self.assertEqual(e.exception.status, 2)
        self.assertEqual(
            "rbt serve run: error: the flag '--state-directory' was set "
            "multiple times; it can only be set once, including in the "
            "`.rbtrc` file or in the environment variable "
            "'RBT_STATE_DIRECTORY'\n",
            e.exception.message,
        )

    async def test_error_on_duplicate_arg_from_env_plural(self) -> None:
        # Tests: error for an argument set both on the command line and in one
        # of several possible environment variables.
        os.environ[ENVVAR_PORT] = '1337'
        parser: ArgumentParser = cli.create_parser(
            argv=[
                'rbt',
                'serve',
                'run',
                '--application=backend/src/main.py',
                '--application-name=test',
                '--tls=external',
                '--state-directory=/tmp',
                '--port=1337',
            ]
        )

        with self.assertRaises(MockExitException) as e:
            parser.parse_args()

        self.assertEqual(e.exception.status, 2)
        self.assertEqual(
            "rbt serve run: error: the flag '--port' was set multiple times; "
            "it can only be set once, including in the `.rbtrc` file or in the "
            "environment variables 'PORT' or 'RBT_PORT'\n",
            e.exception.message,
        )

    async def test_error_on_duplicate_args_in_env(self) -> None:
        # Tests: same argument set in multiple environment variables.
        os.environ[ENVVAR_PORT] = '1337'
        os.environ[ENVVAR_RBT_PORT] = '31337'
        parser: ArgumentParser = cli.create_parser(
            argv=[
                'rbt',
                'serve',
                'run',
                '--application=backend/src/main.py',
                '--application-name=test',
                '--tls=external',
                '--state-directory=/tmp',
            ]
        )

        with self.assertRaises(MockExitException) as e:
            parser.parse_args()

        self.assertEqual(e.exception.status, 2)
        self.assertEqual(
            "rbt serve run: error: the flag '--port' was set multiple times; "
            "it can only be set once, including in the `.rbtrc` file or in the "
            "environment variables 'PORT' or 'RBT_PORT'\n",
            e.exception.message,
        )

    async def test_error_on_reboot_cloud_forbidden_args(self) -> None:
        # Simulate that we are running in the Reboot Cloud.
        os.environ[ENVVAR_REBOOT_CLOUD_VERSION] = '1.0.0'

        # NOTE: On the Reboot Cloud these environment variables would be set by
        # the Reboot cloud.
        os.environ[ENVVAR_PORT] = str(USER_CONTAINER_GRPC_PORT)
        os.environ[ENVVAR_RBT_STATE_DIRECTORY] = REBOOT_STATE_DIRECTORY

        parser: ArgumentParser = cli.create_parser(
            argv=[
                'rbt',
                'serve',
                'run',
                '--application=backend/src/main.py',
                '--application-name=test',
                '--tls=external',
                '--state-directory=/tmp',
            ]
        )

        with self.assertRaises(MockExitException) as e:
            parser.parse_args()

        self.assertEqual(e.exception.status, 2)
        self.assertEqual(
            "rbt serve run: error: the flag '--state-directory' is forbidden "
            "while using Reboot Cloud. The value is set to "
            f"'{REBOOT_STATE_DIRECTORY}' by default\n",
            e.exception.message,
        )

        parser = cli.create_parser(
            argv=[
                'rbt',
                'serve',
                'run',
                '--application=backend/src/main.py',
                '--application-name=test',
                '--tls=external',
                '--port=1234',
            ]
        )

        with self.assertRaises(MockExitException) as e:
            parser.parse_args()

        self.assertEqual(e.exception.status, 2)
        self.assertEqual(
            "rbt serve run: error: the flag '--port' is forbidden while "
            "using Reboot Cloud. The value is set to "
            f"'{USER_CONTAINER_GRPC_PORT}' by default\n",
            e.exception.message,
        )

    async def test_reboot_cloud_serve(self) -> None:
        # Simulate that we are running in the Reboot Cloud.
        os.environ[ENVVAR_REBOOT_CLOUD_VERSION] = '1.0.0'

        # NOTE: On the Reboot Cloud these environment variables would be set by
        # the Reboot cloud.
        os.environ[ENVVAR_PORT] = str(USER_CONTAINER_GRPC_PORT)
        os.environ[ENVVAR_RBT_STATE_DIRECTORY] = REBOOT_STATE_DIRECTORY

        parser: ArgumentParser = cli.create_parser(
            argv=[
                'rbt',
                'serve',
                'run',
                '--application=backend/src/main.py',
                '--application-name=test',
                '--tls=external',
            ]
        )

        # No error expected, since it is the only correct way to invoke 'rbt
        # serve' on the Reboot Cloud.
        args, _ = parser.parse_args()

        self.assertEqual(args.port, USER_CONTAINER_GRPC_PORT)
        self.assertEqual(args.state_directory, REBOOT_STATE_DIRECTORY)

    async def test_reboot_cloud_incorrect_environment(self) -> None:
        # Simulate that we are running in the Reboot Cloud.
        os.environ[ENVVAR_REBOOT_CLOUD_VERSION] = '1.0.0'

        # NOTE: On the Reboot Cloud these environment variables would be set by
        # the Reboot cloud, but check if somebody tries to overwrite them
        # with incorrect values.
        os.environ[ENVVAR_PORT] = '1337'

        parser: ArgumentParser = cli.create_parser(
            argv=[
                'rbt',
                'serve',
                'run',
                '--application=backend/src/main.py',
                '--application-name=test',
                '--tls=external',
            ]
        )

        with self.assertRaises(MockExitException) as e:
            parser.parse_args()
        self.assertEqual(e.exception.status, 2)
        self.assertEqual(
            "rbt serve run: error: Environment variable 'PORT' is set to "
            "non-default value '1337'; this setting is unnecessary and "
            "unsupported on Reboot Cloud. Unset 'PORT' to run your "
            "application.\n",
            e.exception.message,
        )

        os.environ[ENVVAR_PORT] = str(USER_CONTAINER_GRPC_PORT)
        os.environ[ENVVAR_RBT_STATE_DIRECTORY] = '/tmp'

        with self.assertRaises(MockExitException) as e:
            parser.parse_args()

        self.assertEqual(e.exception.status, 2)
        self.assertEqual(
            "rbt serve run: error: Environment variable "
            "'RBT_STATE_DIRECTORY' is set to non-default value "
            "'/tmp'; this setting is unnecessary and unsupported "
            "on Reboot Cloud. Unset 'RBT_STATE_DIRECTORY' to run your "
            "application.\n",
            e.exception.message,
        )


if __name__ == '__main__':
    unittest.main(verbosity=2)
