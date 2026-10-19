"""The CLI's side of portless: checking that a `--portless` flag can
be honored before anything is started, running the application under
`portless run`, and asking the proxy where a name goes.

`portless run` is what gives the application its name: it picks a free
port (or takes `--app-port`), registers `https://<name>.localhost` as
a route to it, owned by its own process, tells the application the
port in `PORT`, and removes the route when the application exits, or
when it is itself stopped, after stopping the application. It refuses
a name another running process holds, so two applications with one
name do not silently share an address. Nothing of Reboot's registers
or removes a name. What the names are, where the proxy is, and the
port the application is to serve on is `reboot.portless`.
"""

import asyncio
import re
from reboot.aio.backoff import Backoff
from reboot.cli.common import terminal
from reboot.cli.common.directories import is_on_path
from reboot.portless import proxy_port
from typing import Optional
from urllib.parse import urlparse

# How to get the `portless` CLI, for messages.
INSTALL_HINT = (
    'install it with `npm install -g portless` '
    '(https://github.com/vercel-labs/portless)'
)


def run_command(
    name: str,
    *command: str,
    port: Optional[int] = None,
) -> list[str]:
    """The command that runs `command` under `portless run` as `name`:
    on the port `port`, or a free one `portless` picks when `None`,
    either told to the command in `PORT`."""
    return [
        'portless',
        'run',
        '--name',
        name,
        *(['--app-port', str(port)] if port is not None else []),
        '--',
        *command,
    ]


async def url(name: str) -> str:
    """The URL `portless run` serves `name` at, asked of `portless get`,
    which applies the same rules as `portless run`: in a git worktree
    on a branch other than the default one, the branch name is a
    prefix (`https://<branch>.<name>.localhost`), so the URL is not
    simply `https://<name>.localhost`. Fails, saying so, when
    `portless` can not say."""
    process = await asyncio.create_subprocess_exec(
        'portless',
        'get',
        name,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.STDOUT,
    )
    stdout, _ = await process.communicate()
    output = stdout.decode(errors='replace').strip() if stdout else ''
    if process.returncode != 0 or not output.startswith('https://'):
        terminal.fail(
            f'Could not get the URL portless will serve `{name}` at '
            f'(`portless get {name}`):\n{output or "<no output>"}'
        )
    return output.splitlines()[-1]


def hostname_of(url: str) -> str:
    """The hostname of a URL `url()` returned."""
    hostname = urlparse(url).hostname
    assert hostname is not None, url
    return hostname


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


async def registered_port(hostname: str) -> Optional[int]:
    """The local port the proxy routes `hostname` to, or `None` when it
    is not registered. `portless run` registers it as it starts the
    application, so under `--portless` this is how the CLI learns where
    the application is. Asked of the `portless` CLI (`portless list`),
    which is how the proxy's routes are read, and which starts a
    Node.js process, so not to be asked in a loop: anything but a clean
    answer counts as not registered."""
    try:
        process = await asyncio.create_subprocess_exec(
            'portless',
            'list',
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.DEVNULL,
        )
        stdout, _ = await asyncio.wait_for(process.communicate(), timeout=5.0)
    except (OSError, asyncio.TimeoutError):
        return None
    if process.returncode != 0:
        return None
    # A route is listed as `https://<hostname>  ->  localhost:<port>`.
    for line in stdout.decode(errors='replace').splitlines():
        match = re.match(
            rf'\s*https://{re.escape(hostname)}\s+->\s+\S+:(\d+)',
            line,
        )
        if match is not None:
            return int(match.group(1))
    return None


async def wait_for_port(hostname: str) -> int:
    """The port the proxy routes `hostname` to, waited for until
    `portless run` has registered it, which it does before it starts
    the application. Asks again with a growing backoff, since asking
    starts the `portless` CLI, a Node.js process: a second at first, up
    to five."""
    backoff = Backoff(
        initial_backoff_seconds=1,
        max_backoff_seconds=5,
        backoff_multiplier=1.5,
    )
    while True:
        port = await registered_port(hostname)
        if port is not None:
            return port
        await backoff()
