"""The gateway's listener and the tunnel's process live exactly as long
as their blocks, and a tunnel that fails says so, all without a real
tunnel: `cloudflared` is stood in for by a script that says what one
says.
"""
import aiohttp
import asyncio
import os
import socket
import sys
import tempfile
import unittest
from pathlib import Path
from reboot.cli.common.subprocesses import Subprocesses
from reboot.dashboard.gateway import (
    TunnelError,
    cloudflare_tunnel,
    dashboard_gateway,
)
from unittest.mock import AsyncMock, patch

TUNNEL_URL = 'https://test-dashboard.trycloudflare.com'


def unused_port() -> int:
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        return sock.getsockname()[1]


def fake_cloudflared(directory: str, *, lifetime: str) -> Path:
    """A `cloudflared` that publishes `TUNNEL_URL`, records its pid
    beside itself, and lives for `lifetime`, a Python expression in
    seconds."""
    executable = Path(directory) / 'cloudflared'
    pid_file = Path(directory) / 'pid'
    executable.write_text(
        f'#!{sys.executable}\n'
        'import os, time\n'
        f'open({str(pid_file)!r}, "w").write(str(os.getpid()))\n'
        f'print({TUNNEL_URL!r}, flush=True)\n'
        f'time.sleep({lifetime})\n'
    )
    executable.chmod(0o700)
    return executable


class GatewayTest(unittest.IsolatedAsyncioTestCase):

    async def test_listener_ends_with_its_block(self) -> None:
        port = unused_port()
        async with dashboard_gateway(
            port=port,
            backend_port=unused_port(),
            token='token',
        ) as gateway:
            self.assertEqual(gateway.public_url, f'http://127.0.0.1:{port}')
            # Nothing is serving behind the gateway.
            async with aiohttp.ClientSession() as client:
                async with client.get(f'http://127.0.0.1:{port}/') as response:
                    self.assertEqual(response.status, 502)
        with socket.socket() as sock:
            self.assertNotEqual(sock.connect_ex(('127.0.0.1', port)), 0)

    async def test_taken_port_is_refused_not_incremented(self) -> None:
        with socket.socket() as occupied:
            occupied.bind(('127.0.0.1', 0))
            occupied.listen()
            with self.assertRaises(OSError):
                async with dashboard_gateway(
                    port=occupied.getsockname()[1],
                    backend_port=unused_port(),
                    token='token',
                ):
                    self.fail('a taken port was served on')


if __name__ == '__main__':
    unittest.main()


class TunnelTest(unittest.IsolatedAsyncioTestCase):

    subprocesses = Subprocesses()

    async def test_tunnel_ends_with_its_block(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            executable = fake_cloudflared(directory, lifetime='60')
            with patch(
                'reboot.dashboard.gateway._cloudflared',
                AsyncMock(return_value=str(executable)),
            ):
                async with dashboard_gateway(
                    port=unused_port(),
                    backend_port=unused_port(),
                    token='token',
                ) as gateway, cloudflare_tunnel(
                    gateway, subprocesses=self.subprocesses
                ) as tunnel:
                    self.assertEqual(tunnel.url, TUNNEL_URL)
                    self.assertEqual(gateway.public_url, TUNNEL_URL)
                    pid = int((Path(directory) / 'pid').read_text())
                with self.assertRaises(ProcessLookupError):
                    os.kill(pid, 0)

    async def test_tunnel_that_cannot_start(self) -> None:
        port = unused_port()
        async with dashboard_gateway(
            port=port,
            backend_port=unused_port(),
            token='token',
        ) as gateway:
            with patch(
                'reboot.dashboard.gateway._cloudflared',
                AsyncMock(side_effect=TunnelError('install failed')),
            ), self.assertRaisesRegex(TunnelError, 'install failed'):
                async with cloudflare_tunnel(
                    gateway, subprocesses=self.subprocesses
                ):
                    self.fail('a tunnel that did not start was yielded')
            # The gateway is none the worse for it.
            self.assertEqual(gateway.public_url, f'http://127.0.0.1:{port}')

    async def test_tunnel_that_stops_ends_what_it_runs(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            executable = fake_cloudflared(directory, lifetime='.1')
            with patch(
                'reboot.dashboard.gateway._cloudflared',
                AsyncMock(return_value=str(executable)),
            ):
                async with dashboard_gateway(
                    port=unused_port(),
                    backend_port=unused_port(),
                    token='token',
                ) as gateway, cloudflare_tunnel(
                    gateway, subprocesses=self.subprocesses
                ) as tunnel:
                    with self.assertRaisesRegex(
                        TunnelError, 'Dashboard tunnel stopped'
                    ):
                        await tunnel.run(asyncio.Event().wait())
