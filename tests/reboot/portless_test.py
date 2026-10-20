import asyncio
import os
import stat
import tempfile
import unittest
from pathlib import Path
from reboot import portless
from reboot.aio.exceptions import InputError
from unittest.mock import patch


class RegisterTest(unittest.IsolatedAsyncioTestCase):
    """`reboot.portless.alias` and `alias_remove` talk to the
    `portless` CLI; a fake one on PATH records what it was told, and
    answers `portless list` with the routes `PORTLESS_FAKE_LIST`
    holds."""

    def setUp(self) -> None:
        self.directory = Path(tempfile.mkdtemp())
        self.log = self.directory / 'calls'
        fake = self.directory / 'portless'
        fake.write_text(
            '#!/bin/sh\n'
            'if [ "${PORTLESS_FAKE_FAIL:-}" = "true" ]; then\n'
            '  echo "no proxy"; exit 1\n'
            'fi\n'
            'if [ "$1" = "list" ]; then\n'
            '  echo "Active routes:"\n'
            '  printf "%b\\n" "${PORTLESS_FAKE_LIST:-}"\n'
            '  exit 0\n'
            'fi\n'
            f'echo "$@" >> "{self.log}"\n'
        )
        fake.chmod(fake.stat().st_mode | stat.S_IXUSR)
        self.environment = patch.dict(
            os.environ,
            {'PATH': f'{self.directory}{os.pathsep}{os.environ["PATH"]}'},
        )
        self.environment.start()
        self.addCleanup(self.environment.stop)

    def _calls(self) -> str:
        return self.log.read_text() if self.log.exists() else ''

    @staticmethod
    def _route(name: str, port: int) -> str:
        """A line of `portless list`."""
        return f'  https://{name}.localhost  ->  localhost:{port}  (alias)'

    async def _free_port(self) -> int:
        """A port nothing listens on: one that was just given out and
        closed again."""
        server = await asyncio.start_server(lambda r, w: None, '127.0.0.1', 0)
        port = server.sockets[0].getsockname()[1]
        server.close()
        await server.wait_closed()
        return port

    async def _listening_port(self) -> int:
        """A port this process listens on, for the rest of the test."""
        server = await asyncio.start_server(lambda r, w: None, '127.0.0.1', 0)
        self.addAsyncCleanup(server.wait_closed)
        self.addCleanup(server.close)
        return server.sockets[0].getsockname()[1]

    async def test_aliases_with_force_and_removes_the_alias(self) -> None:
        with patch.dict(
            os.environ, {'PORTLESS_FAKE_LIST': self._route('other', 1234)}
        ):
            self.assertIsNone(await portless.registered_port('bank'))
            await portless.alias('bank', 54321)
        self.assertEqual(self._calls(), 'alias bank 54321 --force\n')
        await portless.alias_remove('bank')
        self.assertEqual(
            self._calls(),
            'alias bank 54321 --force\nalias --remove bank\n',
        )

    async def test_takes_back_a_name_nothing_listens_behind(self) -> None:
        """What a server that died without removing its name leaves
        behind, which is what `--force` is for."""
        port = await self._free_port()
        with patch.dict(
            os.environ, {'PORTLESS_FAKE_LIST': self._route('bank', port)}
        ):
            self.assertEqual(await portless.registered_port('bank'), port)
            await portless.alias('bank', 54321)
        self.assertEqual(self._calls(), 'alias bank 54321 --force\n')

    async def test_leaves_a_name_that_already_points_at_the_port(self) -> None:
        """A server that went down and came up on the same port."""
        port = await self._listening_port()
        with patch.dict(
            os.environ, {'PORTLESS_FAKE_LIST': self._route('bank', port)}
        ):
            await portless.alias('bank', port)
        self.assertEqual(self._calls(), '')

    async def test_refuses_a_name_something_is_serving_under(self) -> None:
        """Another server, running right now, which registering would
        take the name from: named, with the process listening there,
        which here is this one."""
        port = await self._listening_port()
        with patch.dict(
            os.environ,
            {
                'PORTLESS_FAKE_LIST':
                    self._route('other', 1234) + '\\n' +
                    self._route('bank', port)
            },
        ):
            with self.assertRaises(portless.NameInUse) as raised:
                await portless.alias('bank', 54321)
        self.assertIsInstance(raised.exception, InputError)
        message = str(raised.exception)
        self.assertIn('https://bank.localhost', message)
        self.assertIn(f'port {port}', message)
        self.assertIn(f'pid {os.getpid()}', message)
        self.assertIn(os.getcwd(), message)
        self.assertEqual(self._calls(), '')

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
