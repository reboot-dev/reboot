"""The tunnel's process lives exactly as long as its block, names what
it forwards after itself, and says so when it fails, all without a
real tunnel: `cloudflared` is stood in for by a script that says what
one says.
"""
import asyncio
import os
import sys
import tempfile
import unittest
from pathlib import Path
from reboot.cli.common.subprocesses import Subprocesses
from reboot.dashboard.tunnel import TUNNEL_HOST, TunnelError, cloudflare_tunnel
from unittest.mock import AsyncMock, patch

TUNNEL_URL = 'https://test-dashboard.trycloudflare.com'


def fake_cloudflared(directory: str, *, lifetime: str) -> Path:
    """A `cloudflared` that records its pid and arguments beside
    itself, publishes `TUNNEL_URL`, and lives for `lifetime`, a Python
    expression in seconds."""
    executable = Path(directory) / 'cloudflared'
    executable.write_text(
        f'#!{sys.executable}\n'
        'import os, sys, time\n'
        f'open({str(Path(directory) / "pid")!r}, "w").write(str(os.getpid()))\n'
        f'open({str(Path(directory) / "argv")!r}, "w").write(" ".join(sys.argv))\n'
        f'print({TUNNEL_URL!r}, flush=True)\n'
        f'time.sleep({lifetime})\n'
    )
    executable.chmod(0o700)
    return executable


class TunnelTest(unittest.IsolatedAsyncioTestCase):

    subprocesses = Subprocesses()

    async def test_tunnel_ends_with_its_block(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            executable = fake_cloudflared(directory, lifetime='60')
            with patch(
                'reboot.dashboard.tunnel._cloudflared',
                AsyncMock(return_value=str(executable)),
            ):
                async with cloudflare_tunnel(
                    port=9871, subprocesses=self.subprocesses
                ) as tunnel:
                    self.assertEqual(tunnel.url, TUNNEL_URL)
                    pid = int((Path(directory) / 'pid').read_text())
                    argv = (Path(directory) / 'argv').read_text()
                    self.assertIn('--url http://127.0.0.1:9871', argv)
                    self.assertIn(f'--http-host-header {TUNNEL_HOST}', argv)
                with self.assertRaises(ProcessLookupError):
                    os.kill(pid, 0)

    async def test_tunnel_that_cannot_start(self) -> None:
        with patch(
            'reboot.dashboard.tunnel._cloudflared',
            AsyncMock(side_effect=TunnelError('install failed')),
        ), self.assertRaisesRegex(TunnelError, 'install failed'):
            async with cloudflare_tunnel(
                port=9871, subprocesses=self.subprocesses
            ):
                self.fail('a tunnel that did not start was yielded')

    async def test_tunnel_that_stops_ends_what_it_runs(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            executable = fake_cloudflared(directory, lifetime='.1')
            with patch(
                'reboot.dashboard.tunnel._cloudflared',
                AsyncMock(return_value=str(executable)),
            ):
                async with cloudflare_tunnel(
                    port=9871, subprocesses=self.subprocesses
                ) as tunnel:
                    with self.assertRaisesRegex(
                        TunnelError, 'Dashboard tunnel stopped'
                    ):
                        await tunnel.run(asyncio.Event().wait())


if __name__ == '__main__':
    unittest.main()
