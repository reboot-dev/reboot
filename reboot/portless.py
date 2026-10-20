"""What Reboot knows about portless (https://github.com/vercel-labs/portless),
which `rbt dev run --portless` serves an application through: the
names it gives things, where its proxy listens, and how to trust the
certificates the proxy serves.

Shared by the CLI, which checks that portless is there, and by the
server, which registers its name with the proxy once it is serving,
trusts the named origins, and reaches named dev servers through the
proxy.
"""

import asyncio
import os
import ssl
from pathlib import Path
from reboot.settings import ENVVAR_RBT_PORTLESS_NAME

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
    developer dashboard under, `dashboard-<name>`: one hostname label,
    like the frontend dev server's `frontend-<name>`, so that every
    name of an application is a direct subdomain of one domain, which
    is what a single wildcard certificate covers once these names are
    served through a tunnel."""
    return f'dashboard-{name}'


async def alias(name: str, port: int) -> None:
    """Register `name` with the running proxy as a route to the local
    `port`, replacing whatever the name pointed at before, so that
    `https://<name>.localhost` reaches it. Called by the server once it
    is serving, which is when the port is known and when the name
    should start answering; `alias_remove` is its counterpart when the
    server stops. Raises when the `portless` CLI can't do it, saying
    what it said."""
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
