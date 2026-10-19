"""The CLI's side of portless: checking that a `--portless` flag can
be honored before anything is started, and waiting for the proxy to
say where a name is registered to.

What the names are, where the proxy is, reading where a name goes and
registering one is `reboot.portless`: the server registers itself once
it is serving, and the CLI learns the port from that.
"""

import asyncio
from reboot.aio.backoff import Backoff
from reboot.cli.common import terminal
from reboot.cli.common.directories import is_on_path
from reboot.portless import proxy_port, registered_port

# How to get the `portless` CLI, for messages.
INSTALL_HINT = (
    'install it with `npm install -g portless` '
    '(https://github.com/vercel-labs/portless)'
)


async def check(flag: str) -> None:
    """Fail, saying what to do, unless `flag` can be honored: the
    `portless` CLI is on PATH, and its proxy is listening. The proxy
    is what answers `https://*.localhost`; without it the names
    the server registers lead nowhere. portless starts it on first use in
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


async def wait_for_port(name: str) -> int:
    """The port the proxy routes `name` to, waited for until the server
    has registered it, which it does once it is serving
    (`reboot.portless.alias`). Asks again with a growing backoff, since
    asking starts the `portless` CLI, a Node.js process: a second at
    first, up to five while the server takes its time."""
    backoff = Backoff(
        initial_backoff_seconds=1,
        max_backoff_seconds=5,
        backoff_multiplier=1.5,
    )
    while True:
        port = await registered_port(name)
        if port is not None:
            return port
        await backoff()
