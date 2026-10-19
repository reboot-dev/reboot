"""What Reboot knows about portless (https://github.com/vercel-labs/portless),
which `rbt dev run --portless` serves an application through: the
names it gives things, where its proxy listens, and how to trust the
certificates the proxy serves.

Shared by the CLI, which checks that portless is there and asks the
proxy where a name goes, and by the server, which registers its name
with the proxy once it is serving and removes it when it stops, trusts
the named origins, and reaches named dev servers through the proxy.
"""

import asyncio
import os
import psutil
import re
import ssl
from pathlib import Path
from reboot.aio.exceptions import InputError
from reboot.settings import ENVVAR_RBT_PORTLESS_NAME
from typing import Optional

# Where portless keeps the locally generated CA its proxy's
# certificates chain to. `portless trust` may or may not have put it
# in the system store; a client that reaches a named server through
# the proxy trusts it from here either way.
CA_PATH = Path.home() / '.portless' / 'ca.pem'


def proxy_port() -> int:
    """The port the portless proxy listens on: 443 unless moved with
    `PORTLESS_PORT`, which portless itself honors."""
    return int(os.environ.get('PORTLESS_PORT', '443'))


def hostname(name: str) -> str:
    """The hostname portless serves a name at: `<name>.localhost`."""
    return f'{name}.localhost'


def dashboard_name(name: str) -> str:
    """The name `rbt dashboard --portless` registers an application's
    developer dashboard under, `dashboard.<name>`."""
    return f'dashboard.{name}'


async def registered_port(name: str) -> Optional[int]:
    """The local port the proxy routes `name` to, or `None` when the
    name is not registered. Asked of the `portless` CLI (`portless
    list`), which is how the proxy's routes are read, and which starts
    a Node.js process, so not to be asked in a loop: anything but a
    clean answer counts as not registered."""
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
    # A route is listed as `https://<name>.localhost  ->  localhost:<port>`.
    for line in stdout.decode(errors='replace').splitlines():
        match = re.match(
            rf'\s*https://{re.escape(hostname(name))}\s+->\s+\S+:(\d+)',
            line,
        )
        if match is not None:
            return int(match.group(1))
    return None


async def _listening(port: int) -> bool:
    """Whether something accepts connections on the local `port`, where
    the proxy sends a name's traffic: Envoy binds the IPv4 loopback."""
    try:
        _, writer = await asyncio.wait_for(
            asyncio.open_connection('127.0.0.1', port),
            timeout=1.0,
        )
    except (OSError, asyncio.TimeoutError):
        return False
    writer.close()
    try:
        await writer.wait_closed()
    except OSError:
        pass
    return True


def _listener(port: int) -> Optional[str]:
    """The process listening on the local `port`, named for a message
    ("`envoy` (pid 1234, in /path/to/app)"), or `None` when it can not
    be found: on macOS another user's processes do not say what they
    listen on. Blocking, so run it in a thread."""
    for process in psutil.process_iter():
        try:
            for connection in process.net_connections(kind='tcp'):
                if (
                    connection.status == psutil.CONN_LISTEN and
                    connection.laddr.port == port
                ):
                    description = f'`{process.name()}` (pid {process.pid}'
                    try:
                        description += f', in {process.cwd()}'
                    except psutil.Error:
                        pass
                    return description + ')'
        except psutil.Error:
            # Gone, or not ours to look at.
            continue
    return None


async def alias(name: str, port: int) -> None:
    """Register `name` with the running proxy as a route to the local
    `port`, so that `https://<name>.localhost` reaches it. Called by the
    server once it is serving, which is when the port is known and
    when the name should start answering; `alias_remove` is its
    counterpart when the server stops.

    The proxy does not tell a live route from a stale one, so what the
    name points at is looked at first. A name that is not registered
    is registered; one registered to `port` already is ours, from a
    server that went down and came up on the same port, and is left
    as it is; one registered to a port nothing listens on any more was
    left behind by a server that died without removing it, and is
    taken over (`--force`). One registered to a port something listens
    on is somebody else's, serving right now, who would silently lose
    their address to us, so it is refused, naming them (see
    https://github.com/reboot-dev/reboot/issues/269).

    Raises `InputError` for a name in use, and `RuntimeError` when the
    `portless` CLI can't register, saying what it said."""
    registered = await registered_port(name)
    if registered == port:
        return
    if registered is not None and await _listening(registered):
        listener = await asyncio.to_thread(_listener, registered)
        raise InputError(
            f'`https://{hostname(name)}` is in use: the portless proxy '
            f'routes it to port {registered}, where '
            f'{listener or "something"} is listening, so something else '
            'is serving under this name right now (another application '
            'with the same name, or another `rbt dashboard` for it). '
            'Stop it, or give this application another '
            '`--application-name`.'
        )

    process = await asyncio.create_subprocess_exec(
        'portless',
        'alias',
        name,
        str(port),
        '--force',
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.STDOUT,
    )
    stdout, _ = await process.communicate()
    if process.returncode != 0:
        raise RuntimeError(
            f'Could not register `https://{hostname(name)}` with '
            f'portless:\n{stdout.decode() if stdout else "<no output>"}'
        )


async def alias_remove(name: str) -> None:
    """Remove a name `alias` registered, since the port is going
    away with the server. Best effort: a stale name is harmless, the
    next `alias` replaces it, and a server that dies without
    getting here leaves one anyway."""
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
        pass


def enabled() -> bool:
    """Whether this process runs under portless, which
    `RBT_PORTLESS_NAME` says: the CLI sets it only when told
    `--portless`."""
    return bool(os.environ.get(ENVVAR_RBT_PORTLESS_NAME))


def ssl_context() -> ssl.SSLContext:
    """A client context for reaching a name the portless proxy serves:
    the system's trust, plus portless's CA where portless keeps it.
    Only under portless (see `enabled`)."""
    assert enabled(), 'not running under portless'
    context = ssl.create_default_context()
    if CA_PATH.is_file():
        context.load_verify_locations(cafile=str(CA_PATH))
    return context
