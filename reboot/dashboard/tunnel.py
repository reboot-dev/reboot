"""The tunnel through which an MCP App reaches the dashboard.

An MCP host shows an App in a sandbox of its own that cannot reach
this machine, so `rbt dashboard` runs a Cloudflare quick tunnel to
the dashboard's port and tells the application that the tunnel's
address is where the App calls back (`RBT_MCP_UI_URL`).

The tunnel is told to name every request it forwards `TUNNEL_HOST`,
which the dashboard application's OAuth server refuses to sign in
under (`OAuth(hosts=...)`), so that nothing arriving through the
tunnel can obtain a token: what reaches the dashboard through it is
whatever an App that already holds one asks, and nothing else.
"""
import asyncio
import re
import shutil
from collections import deque
from collections.abc import AsyncIterator, Awaitable
from contextlib import asynccontextmanager, suppress
from pathlib import Path
from reboot.cli.common.subprocesses import Subprocesses
from typing import TypeVar

# The `Host` the tunnel gives every request it forwards: a name under
# which nobody can sign in. `.invalid` is reserved for names that
# resolve nowhere (RFC 2606).
TUNNEL_HOST = 'dashboard-tunnel.invalid'

# How long a tunnel gets to publish its address before it is given up
# on. Cloudflare usually answers in a few seconds.
_START_TIMEOUT_SECONDS = 60

# What a Cloudflare quick tunnel prints its address as, somewhere in
# its diagnostics, which is the only place it says it.
_URL = re.compile(rb'https://[a-z0-9-]+\.trycloudflare\.com')

T = TypeVar('T')


class TunnelError(Exception):
    """A tunnel that could not be started, or that stopped."""


class DashboardTunnel:
    """A running tunnel: its address, and the means to stop with it."""

    def __init__(
        self,
        *,
        url: str,
        process: asyncio.subprocess.Process,
        diagnostics: 'deque[str]',
        drain: asyncio.Task,
    ):
        self.url = url
        self._process = process
        self._diagnostics = diagnostics
        self._drain = drain

    async def run(self, awaitable: Awaitable[T]) -> T:
        """Awaits `awaitable` for as long as the tunnel runs. A tunnel
        that stops first ends it, and is a `TunnelError`: the address
        the MCP App was given no longer reaches the dashboard."""
        task = asyncio.ensure_future(awaitable)
        exited = asyncio.ensure_future(self._process.wait())
        try:
            await asyncio.wait(
                {task, exited}, return_when=asyncio.FIRST_COMPLETED
            )
            if task.done():
                return task.result()
            # Give the last of what the tunnel said time to be read.
            with suppress(asyncio.TimeoutError):
                await asyncio.wait_for(self._drain, timeout=1)
            raise TunnelError(
                'Dashboard tunnel stopped: ' + '\n'.join(self._diagnostics)
            )
        finally:
            task.cancel()
            exited.cancel()
            await asyncio.gather(task, exited, return_exceptions=True)


async def _cloudflared(subprocesses: Subprocesses) -> str:
    """The `cloudflared` executable to run: the developer's own when
    they have one, otherwise the pinned, checksum-verified one the
    Reboot plugin installs, by the plugin's own installer, packaged
    beside this module and sharing the plugin's cache."""
    executable = shutil.which('cloudflared')
    if executable is not None:
        return executable
    async with subprocesses.exec(
        'sh',
        str(Path(__file__).with_name('install_cloudflared.sh')),
        stdout=asyncio.subprocess.PIPE,
    ) as process:
        stdout, _ = await process.communicate()
        if process.returncode != 0:
            raise TunnelError(
                'Could not install cloudflared for the dashboard'
            )
        return str(Path(stdout.decode().strip()) / 'cloudflared')


@asynccontextmanager
async def cloudflare_tunnel(
    *,
    port: int,
    subprocesses: Subprocesses,
) -> AsyncIterator[DashboardTunnel]:
    """Runs a Cloudflare quick tunnel to the dashboard on `port`
    until the block ends. Raises `TunnelError` when no tunnel could
    be started, with what `cloudflared` said about it."""
    executable = await _cloudflared(subprocesses)
    async with subprocesses.exec(
        executable,
        'tunnel',
        '--url',
        f'http://127.0.0.1:{port}',
        '--http-host-header',
        TUNNEL_HOST,
        '--no-autoupdate',
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.STDOUT,
    ) as process:
        assert process.stdout is not None
        output = process.stdout
        # The last of what `cloudflared` said, for when it fails.
        diagnostics: deque[str] = deque(maxlen=8)

        async def published_url() -> str:
            while line := await output.readline():
                diagnostics.append(line.decode(errors='replace').strip())
                match = _URL.search(line)
                if match is not None:
                    return match[0].decode()
            raise TunnelError(
                'cloudflared exited before publishing a dashboard URL'
            )

        try:
            url = await asyncio.wait_for(
                published_url(), timeout=_START_TIMEOUT_SECONDS
            )
        except (asyncio.TimeoutError, TunnelError) as error:
            raise TunnelError(
                'Dashboard tunnel failed to start: ' + '\n'.join(diagnostics)
            ) from error

        async def drain() -> None:
            async for line in output:
                diagnostics.append(line.decode(errors='replace').strip())

        drain_task = asyncio.create_task(drain())
        try:
            yield DashboardTunnel(
                url=url,
                process=process,
                diagnostics=diagnostics,
                drain=drain_task,
            )
        finally:
            drain_task.cancel()
            await asyncio.gather(drain_task, return_exceptions=True)
