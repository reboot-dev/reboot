import os
import stat
import tempfile
import unittest
from pathlib import Path
from reboot.cli.common import portless
from unittest.mock import patch


class RunCommandTest(unittest.TestCase):

    def test_runs_the_command_as_the_name_on_a_free_port(self) -> None:
        self.assertEqual(
            portless.run_command('bank', 'python', 'main.py'),
            ['portless', 'run', '--name', 'bank', '--', 'python', 'main.py'],
        )

    def test_runs_the_command_on_a_fixed_port(self) -> None:
        self.assertEqual(
            portless.run_command('bank', 'python', 'main.py', port=9991),
            [
                'portless', 'run', '--name', 'bank', '--app-port', '9991',
                '--', 'python', 'main.py'
            ],
        )


class ProxyTest(unittest.IsolatedAsyncioTestCase):
    """`url` and `registered_port` ask the `portless` CLI; a fake one
    on PATH answers `portless get` and `portless list` from the
    environment."""

    def setUp(self) -> None:
        self.directory = Path(tempfile.mkdtemp())
        fake = self.directory / 'portless'
        fake.write_text(
            '#!/bin/sh\n'
            'case "$1" in\n'
            '  get) echo "https://${PORTLESS_FAKE_PREFIX:-}$2.localhost";;\n'
            '  list) echo "Active routes:"; printf "%b\\n" "${PORTLESS_FAKE_LIST:-}";;\n'
            '  *) echo "unexpected: $@"; exit 1;;\n'
            'esac\n'
        )
        fake.chmod(fake.stat().st_mode | stat.S_IXUSR)
        self.environment = patch.dict(
            os.environ,
            {'PATH': f'{self.directory}{os.pathsep}{os.environ["PATH"]}'},
        )
        self.environment.start()
        self.addCleanup(self.environment.stop)

    async def test_the_url_is_what_portless_says(self) -> None:
        """Which in a git worktree carries the branch as a prefix."""
        self.assertEqual(await portless.url('bank'), 'https://bank.localhost')
        with patch.dict(os.environ, {'PORTLESS_FAKE_PREFIX': 'feature.'}):
            url = await portless.url('bank')
        self.assertEqual(url, 'https://feature.bank.localhost')
        self.assertEqual(portless.hostname_of(url), 'feature.bank.localhost')

    async def test_the_port_is_the_routes(self) -> None:
        routes = (
            '  https://other.localhost  ->  localhost:4001  (pid 11)\\n'
            '  https://bank.localhost  ->  localhost:4002  (pid 12)'
        )
        with patch.dict(os.environ, {'PORTLESS_FAKE_LIST': routes}):
            self.assertEqual(
                await portless.registered_port('bank.localhost'), 4002
            )
            self.assertIsNone(
                await portless.registered_port('feature.bank.localhost')
            )

    async def test_without_a_cli_nothing_is_registered(self) -> None:
        with patch.dict(os.environ, {'PATH': str(self.directory / 'nowhere')}):
            self.assertIsNone(await portless.registered_port('bank.localhost'))


if __name__ == '__main__':
    unittest.main()
