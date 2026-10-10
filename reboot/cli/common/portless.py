"""The CLI's side of portless: checking that a `--portless` flag can
be honored, and registering names with the running proxy as routes
to a local port.

What the names are, and where the proxy is, is `reboot.portless`;
this is what talks to the `portless` CLI and the proxy.
"""

import asyncio
import socket
from reboot.cli.common import terminal
from reboot.cli.common.directories import is_on_path
from reboot.cli.common.subprocesses import Subprocesses
from reboot.portless import hostname, proxy_port

# How to get the `portless` CLI, for messages.
INSTALL_HINT = (
    'install it with `npm install -g portless` '
    '(https://github.com/vercel-labs/portless)'
)


def free_port() -> int:
    """A port nothing is listening on, for a server whose address is
    its name and whose port only the proxy needs to know. Bound and
    released rather than held: the server binds it next, and Envoy
    does not share a port with a reservation the way Node does."""
    with socket.socket() as reservation:
        reservation.bind(('', 0))
        return reservation.getsockname()[1]


async def check(flag: str) -> None:
    """Fail, saying what to do, unless `flag` can be honored: the
    `portless` CLI is on PATH, and its proxy is listening. The proxy
    is what answers `https://*.localhost`; without it the names
    registered below lead nowhere. portless starts it on first use in
    a terminal, asking for `sudo` to bind 443, which is not done on
    the developer's behalf."""
    if not is_on_path('portless'):
        terminal.fail(
            f'`{flag}` needs the `portless` CLI, which is not on '
            f'your PATH; {INSTALL_HINT}.'
        )

    port = proxy_port()
    try:
        _, writer = await asyncio.open_connection('127.0.0.1', port)
        writer.close()
    except OSError:
        terminal.fail(
            f'`{flag}` needs the portless proxy, which is not '
            f'listening on port {port}; start it with '
            '`portless proxy start` (or set `PORTLESS_PORT` to where '
            'it is listening).'
        )


async def alias(subprocesses: Subprocesses, name: str, port: int) -> None:
    """Register `name` with the proxy as a route to the local `port`,
    so that `https://<name>.localhost` reaches it, replacing whatever
    the name pointed at before. Fails saying why when it can't."""
    async with subprocesses.exec(
        'portless',
        'alias',
        name,
        str(port),
        '--force',
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.STDOUT,
    ) as process:
        stdout, _ = await process.communicate()
        if process.returncode != 0:
            terminal.fail(
                f'Could not register `https://{hostname(name)}` '
                'with portless:\n'
                f'{stdout.decode() if stdout else "<no output>"}'
            )


async def unalias(name: str) -> None:
    """Remove a name `alias` registered."""
    try:
        process = await asyncio.create_subprocess_exec(
            'portless',
            'alias',
            '--remove',
            name,
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.DEVNULL,
        )
        await process.wait()
    except OSError:
        # `portless` vanished from PATH since the name was registered;
        # the stale route is harmless and `portless alias --remove`
        # clears it by hand.
        pass
