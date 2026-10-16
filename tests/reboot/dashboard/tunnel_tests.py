"""`cloudflared_tunnel` publishes its address, stops the tunnel when
the caller leaves the context, and raises `TunnelError` when the
tunnel fails or stops. A shell script
stands in for `cloudflared` and prints what it prints. And
`_cloudflared` finds the executable on `PATH` or where the Reboot
plugin installs it, or raises `CloudflaredNotFoundError`.
"""
import asyncio
import os
import tempfile
import unittest
from pathlib import Path
from reboot.cli.common.subprocesses import Subprocesses
from reboot.dashboard.tunnel import (
    CloudflaredNotFoundError,
    TunnelError,
    _cloudflared,
    cloudflared_tunnel,
)
from unittest.mock import patch

TUNNEL_URL = 'https://test-dashboard.trycloudflare.com'


def fake_cloudflared(
    directory: str,
    *,
    lifetime: str,
    publishes: bool = True,
) -> Path:
    """A `cloudflared` that records its pid and arguments beside
    itself, publishes `TUNNEL_URL` (unless `publishes` is false), and
    lives for `lifetime` seconds. A shell script, because a Python
    interpreter's path under Bazel's sandbox is longer than a shebang
    line may be."""
    executable = Path(directory) / 'cloudflared'
    lines = [
        '#!/bin/sh',
        f'echo $$ > {str(Path(directory) / "pid")!r}',
        f'echo "$0 $*" > {str(Path(directory) / "argv")!r}',
    ]
    if publishes:
        lines.append(f'echo {TUNNEL_URL!r}')
    lines.append(f'sleep {lifetime}')
    executable.write_text('\n'.join(lines) + '\n')
    executable.chmod(0o700)
    return executable


def _found(executable: Path):
    return patch(
        'reboot.dashboard.tunnel._cloudflared', return_value=str(executable)
    )


class TunnelTest(unittest.IsolatedAsyncioTestCase):

    subprocesses = Subprocesses()

    async def _enter(self) -> None:
        """Enters a tunnel and leaves it at once."""
        async with cloudflared_tunnel(
            port=9871, subprocesses=self.subprocesses
        ):
            pass

    async def test_tunnel_ends_when_left(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            executable = fake_cloudflared(directory, lifetime='60')
            with _found(executable):
                async with cloudflared_tunnel(
                    port=9871, subprocesses=self.subprocesses
                ) as tunnel:
                    self.assertEqual(tunnel.url, TUNNEL_URL)
                    pid = int((Path(directory) / 'pid').read_text())
                    argv = (Path(directory) / 'argv').read_text()
                    self.assertIn('--url http://127.0.0.1:9871', argv)
            with self.assertRaises(ProcessLookupError):
                os.kill(pid, 0)

    async def test_tunnel_that_exits_before_publishing(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            executable = fake_cloudflared(
                directory, lifetime='0', publishes=False
            )
            with _found(executable), self.assertRaisesRegex(
                TunnelError, 'exited before publishing'
            ):
                # Fails at once, not at the start timeout.
                await asyncio.wait_for(self._enter(), 10)

    async def test_tunnel_that_cannot_be_run(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            executable = fake_cloudflared(directory, lifetime='60')
            executable.chmod(0o600)
            with _found(executable), self.assertRaisesRegex(
                TunnelError, 'could not be run'
            ):
                await asyncio.wait_for(self._enter(), 10)

    async def test_tunnel_cancelled_while_starting(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            executable = fake_cloudflared(
                directory, lifetime='60', publishes=False
            )
            with _found(executable):
                starting = asyncio.create_task(self._enter())
                while not (Path(directory) / 'pid').exists():
                    await asyncio.sleep(0.05)
                starting.cancel()
                with self.assertRaises(asyncio.CancelledError):
                    await starting
            pid = int((Path(directory) / 'pid').read_text())
            with self.assertRaises(ProcessLookupError):
                os.kill(pid, 0)

    async def test_tunnel_that_stops(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            executable = fake_cloudflared(directory, lifetime='.1')
            with _found(executable):
                async with cloudflared_tunnel(
                    port=9871, subprocesses=self.subprocesses
                ) as tunnel:
                    with self.assertRaisesRegex(
                        TunnelError, 'Dashboard tunnel stopped'
                    ):
                        await asyncio.wait_for(tunnel.task, 10)


class CloudflaredTest(unittest.TestCase):

    def test_found_where_the_plugin_installs_it(self) -> None:
        with tempfile.TemporaryDirectory() as home, patch(
            'shutil.which', return_value=None
        ), patch('pathlib.Path.home', return_value=Path(home)):
            with self.assertRaisesRegex(
                CloudflaredNotFoundError, 'Installing the Reboot plugin'
            ):
                _cloudflared()
            installed = Path(home) / '.claude/plugins/data/reboot/bin'
            for version in ['2026.4.0', '2026.5.0']:
                directory = installed / f'cloudflared-v{version}'
                directory.mkdir(parents=True)
                (directory / 'cloudflared').touch(mode=0o700)
            self.assertEqual(
                _cloudflared(),
                str(installed / 'cloudflared-v2026.5.0' / 'cloudflared'),
            )

    def test_found_on_path(self) -> None:
        with patch('shutil.which', return_value='/usr/bin/cloudflared'):
            self.assertEqual(_cloudflared(), '/usr/bin/cloudflared')


if __name__ == '__main__':
    unittest.main()
