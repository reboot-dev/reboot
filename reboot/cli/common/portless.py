"""The CLI's side of portless: checking that a `--portless` flag can
be honored, and registering names with the running proxy as routes
to a local port.

What the names are, and where the proxy is, is `reboot.portless`;
this is what talks to the `portless` CLI and the proxy.
"""

import asyncio
import socket
import ssl
from reboot.cli.common import terminal
from reboot.cli.common.directories import is_on_path
from reboot.cli.common.subprocesses import Subprocesses
from reboot.portless import hostname, proxy_port, ssl_context

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


async def reachable(host: str) -> bool:
    """Whether something answers at `https://<host>` through the proxy:
    the name is registered, and what it routes to is up. The proxy
    answers 404 for a name it has no route for and 502 for a route
    whose target is not responding, so a request for `/` tells the
    two apart from a server that is there. Asked at the loopback
    address with the name as SNI and `Host`, the way a browser's
    request arrives, so that no resolver has to know the name."""
    context = ssl_context()
    context.set_alpn_protocols(['http/1.1'])
    try:
        reader, writer = await asyncio.wait_for(
            asyncio.open_connection(
                '127.0.0.1',
                proxy_port(),
                ssl=context,
                server_hostname=host,
            ),
            timeout=2.0,
        )
    except (OSError, asyncio.TimeoutError, ssl.SSLError):
        return False
    try:
        writer.write(
            f'GET / HTTP/1.1\r\nHost: {host}\r\nConnection: close\r\n\r\n'.
            encode()
        )
        await writer.drain()
        status_line = await asyncio.wait_for(reader.readline(), timeout=2.0)
    except (OSError, asyncio.TimeoutError, ssl.SSLError):
        return False
    finally:
        writer.close()
    # `HTTP/1.1 200 OK`: anything the server itself said, including a
    # redirect, means it is there; the proxy's own 404 and 502 mean
    # it is not.
    parts = status_line.decode(errors='replace').split()
    return len(parts) >= 2 and parts[1].isdigit() and int(parts[1]) < 400


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
