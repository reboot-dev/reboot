import os
import stat
import tempfile
import unittest
from pathlib import Path
from reboot import portless
from unittest.mock import patch


class RegisterTest(unittest.IsolatedAsyncioTestCase):
    """`reboot.portless.alias` and `alias_remove` talk to the
    `portless` CLI; a fake one on PATH records what it was told."""

    def setUp(self) -> None:
        self.directory = Path(tempfile.mkdtemp())
        self.log = self.directory / 'calls'
        fake = self.directory / 'portless'
        fake.write_text(
            '#!/bin/sh\n'
            f'echo "$@" >> "{self.log}"\n'
            'if [ "${PORTLESS_FAKE_FAIL:-}" = "true" ]; then\n'
            '  echo "no proxy"; exit 1\n'
            'fi\n'
        )
        fake.chmod(fake.stat().st_mode | stat.S_IXUSR)
        self.environment = patch.dict(
            os.environ,
            {'PATH': f'{self.directory}{os.pathsep}{os.environ["PATH"]}'},
        )
        self.environment.start()
        self.addCleanup(self.environment.stop)

    async def test_aliases_with_force_and_removes_the_alias(self) -> None:
        await portless.alias('bank', 54321)
        self.assertEqual(self.log.read_text(), 'alias bank 54321 --force\n')
        await portless.alias_remove('bank')
        self.assertEqual(
            self.log.read_text(),
            'alias bank 54321 --force\nalias --remove bank\n',
        )

    async def test_says_what_portless_said_when_it_fails(self) -> None:
        with patch.dict(os.environ, {'PORTLESS_FAKE_FAIL': 'true'}):
            with self.assertRaises(RuntimeError) as raised:
                await portless.alias('bank', 54321)
        self.assertIn('https://bank.localhost', str(raised.exception))
        self.assertIn('no proxy', str(raised.exception))

    async def test_removing_the_alias_is_best_effort(self) -> None:
        with patch.dict(os.environ, {'PORTLESS_FAKE_FAIL': 'true'}):
            await portless.alias_remove('bank')  # A failing CLI: no raise.
        with patch.dict(os.environ, {'PATH': str(self.directory / 'nowhere')}):
            await portless.alias_remove('bank')  # No CLI at all: no raise.


if __name__ == '__main__':
    unittest.main()
