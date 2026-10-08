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
from dataclasses import dataclass
from pathlib import Path
from reboot.cli.common.subprocesses import Subprocesses

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


class TunnelError(Exception):
    """A tunnel that could not be started, or that stopped."""


@dataclass(frozen=True)
class Tunnel:
    """A running tunnel: its address, and the task running it, which
    ends when the tunnel does, with the `TunnelError` saying what
    `cloudflared` said last."""
    url: str
    task: 'asyncio.Task[None]'

    async def stop(self) -> None:
        self.task.cancel()
        await asyncio.gather(self.task, return_exceptions=True)


async def start_tunnel(*, port: int, subprocesses: Subprocesses) -> Tunnel:
    """Starts a Cloudflare quick tunnel to the dashboard on `port`,
    returning it once it has published its address. Raises
    `TunnelError` when it could not: no `cloudflared` to run, or one
    that exited, or said nothing, before publishing an address."""
    published: asyncio.Future[str] = asyncio.get_running_loop().create_future()
    # The last of what `cloudflared` said, for when it fails.
    diagnostics: deque[str] = deque(maxlen=8)
    task = asyncio.create_task(
        _run_tunnel(
            port=port,
            subprocesses=subprocesses,
            published=published,
            diagnostics=diagnostics,
        ),
        name=f'_run_tunnel(...) in {__name__}',
    )
    try:
        url = await asyncio.wait_for(
            asyncio.shield(published), timeout=_START_TIMEOUT_SECONDS
        )
    except asyncio.TimeoutError:
        task.cancel()
        await asyncio.gather(task, return_exceptions=True)
        raise TunnelError(
            'Dashboard tunnel failed to start: no address published in '
            f'{_START_TIMEOUT_SECONDS}s\n' + '\n'.join(diagnostics)
        ) from None
    except TunnelError:
        await asyncio.gather(task, return_exceptions=True)
        raise
    return Tunnel(url=url, task=task)


async def _run_tunnel(
    *,
    port: int,
    subprocesses: Subprocesses,
    published: 'asyncio.Future[str]',
    diagnostics: 'deque[str]',
) -> None:
    """Runs `cloudflared` until it exits or this task is cancelled,
    resolving `published` with the address it publishes, and raising
    `TunnelError` when it exits, since a tunnel never exits on its
    own for a good reason."""
    try:
        executable = await _cloudflared(subprocesses)
    except TunnelError as error:
        published.set_exception(error)
        raise
    async with subprocesses.exec(
        executable,
        'tunnel',
        '--url',
        f'http://127.0.0.1:{port}',
        '--http-host-header',
        TUNNEL_HOST,
        # Left to itself, `cloudflared` replaces its binary and
        # restarts within a day, and a restarted quick tunnel has a
        # new address, which nobody was told.
        '--no-autoupdate',
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.STDOUT,
    ) as process:
        assert process.stdout is not None
        async for line in process.stdout:
            diagnostics.append(line.decode(errors='replace').strip())
            match = _URL.search(line) if not published.done() else None
            if match is not None:
                published.set_result(match[0].decode())
        await process.wait()
    if published.done():
        stopped = TunnelError(
            'Dashboard tunnel stopped: ' + '\n'.join(diagnostics)
        )
    else:
        stopped = TunnelError(
            'cloudflared exited before publishing a dashboard URL: ' +
            '\n'.join(diagnostics)
        )
        published.set_exception(stopped)
    raise stopped


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
