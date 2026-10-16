"""A Cloudflare quick tunnel to the dashboard's port, through which an
MCP host reaches the dashboard; `rbt dashboard` prints its address for
the developer to add as an MCP connector.

Anyone with the address reaches the dashboard, and its OAuth server
signs in whoever reaches it, so the address, which Cloudflare draws at
random, is what keeps the dashboard off the internet. Cloudflare
terminates TLS and sees every request.
"""
import asyncio
import os
import re
import shutil
from collections import deque
from contextlib import asynccontextmanager
from dataclasses import dataclass
from pathlib import Path
from reboot.cli.common.subprocesses import Subprocesses
from typing import AsyncIterator

# Cloudflare usually publishes an address within a few seconds.
_START_TIMEOUT_SECONDS = 30

# `cloudflared` prints a quick tunnel's address only in its log output.
_TUNNEL_URL_PATTERN = re.compile(rb'https://[a-z0-9-]+\.trycloudflare\.com')

# Where the Reboot plugin installs `cloudflared`, relative to the home
# directory, one directory per version; see
# `reboot/plugin/lib/install_cloudflared.sh`.
_PLUGIN_CLOUDFLARED_DIRECTORY = Path('.claude/plugins/data/reboot/bin')


class TunnelError(Exception):
    """A tunnel that could not be started, or that stopped."""


class CloudflaredNotFoundError(TunnelError):
    """No `cloudflared` to run a tunnel with."""


@dataclass(frozen=True)
class Tunnel:
    """A running tunnel: its address, and the task running it, which
    ends when the tunnel does, with a `TunnelError` carrying
    `cloudflared`'s last output."""
    url: str
    task: 'asyncio.Task[None]'


@asynccontextmanager
async def cloudflared_tunnel(
    *,
    port: int,
    subprocesses: Subprocesses,
) -> AsyncIterator[Tunnel]:
    """A Cloudflare quick tunnel to the dashboard on `port`, entered
    once it has published its address and stopped on exit. Raises
    `TunnelError` on entry when it could not start: no `cloudflared`
    to run (`CloudflaredNotFoundError`), or one that exited, or that
    published no address in time."""
    executable = _cloudflared()
    published: asyncio.Future[str] = asyncio.get_running_loop().create_future()
    # Enough of `cloudflared`'s output to show an error and what led
    # to it.
    diagnostics: deque[str] = deque(maxlen=8)

    async def run() -> None:
        """Runs `cloudflared` until it exits or this task is cancelled.
        Its exit is always a failure, because the dashboard needs the
        tunnel for as long as this task runs."""
        try:
            async with subprocesses.exec(
                executable,
                'tunnel',
                '--url',
                f'http://127.0.0.1:{port}',
                # Without this flag `cloudflared` updates itself and
                # restarts within a day, and the restarted quick tunnel
                # has a new address that no connector was given.
                '--no-autoupdate',
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.STDOUT,
            ) as process:
                assert process.stdout is not None
                async for line in process.stdout:
                    diagnostics.append(line.decode(errors='replace').strip())
                    if not published.done():
                        match = _TUNNEL_URL_PATTERN.search(line)
                        if match is not None:
                            published.set_result(match[0].decode())
                await process.wait()
            if published.done():
                reason = (
                    'Dashboard tunnel stopped, so a connector added with its '
                    'address no longer reaches the dashboard: '
                )
            else:
                reason = 'cloudflared exited before publishing a dashboard URL: '
            error = TunnelError(reason + '\n'.join(diagnostics))
        except asyncio.CancelledError:
            raise
        except Exception as cause:
            error = TunnelError(
                f'cloudflared could not be run: {cause}\n' +
                '\n'.join(diagnostics)
            )
        # If `cloudflared` exits before it publishes an address, fail
        # the start now rather than at its timeout.
        if not published.done():
            published.set_exception(error)
        raise error

    task = asyncio.create_task(run(), name=f'cloudflared_tunnel in {__name__}')
    try:
        url = await asyncio.wait_for(
            asyncio.shield(published), timeout=_START_TIMEOUT_SECONDS
        )
    except BaseException as error:
        # Cancelling a task that has already ended does nothing, so
        # this covers all three cases: the timeout, the tunnel's own
        # failure and cancellation.
        task.cancel()
        await asyncio.gather(task, return_exceptions=True)
        if isinstance(error, asyncio.TimeoutError):
            raise TunnelError(
                'Dashboard tunnel failed to start: no address published '
                f'in {_START_TIMEOUT_SECONDS}s\n' + '\n'.join(diagnostics)
            ) from None
        raise
    try:
        yield Tunnel(url=url, task=task)
    finally:
        task.cancel()
        await asyncio.gather(task, return_exceptions=True)


def _cloudflared() -> str:
    """The `cloudflared` executable to run: one on `PATH`, otherwise
    the pinned one the Reboot plugin installed, the newest when it
    installed several. Raises `CloudflaredNotFoundError` with
    neither."""
    executable = shutil.which('cloudflared')
    if executable is not None:
        return executable
    installed = sorted(
        (Path.home() /
         _PLUGIN_CLOUDFLARED_DIRECTORY).glob('cloudflared-v*/cloudflared')
    )
    for candidate in reversed(installed):
        if os.access(candidate, os.X_OK):
            return str(candidate)
    raise CloudflaredNotFoundError(
        'No `cloudflared` was found on `PATH` or where the Reboot plugin '
        'installs one, so an MCP host cannot show the dashboard, which '
        'it reaches through a tunnel. Installing the Reboot plugin '
        'provides `cloudflared`; so does installing it yourself '
        '(https://github.com/cloudflare/cloudflared).'
    )
