"""What Reboot knows about portless (https://github.com/vercel-labs/portless),
which `rbt dev run --portless` serves an application through: the
names it gives things, where its proxy listens, and how to trust the
certificates the proxy serves.

Shared by the CLI, which checks that portless is there and runs the
application under `portless run` (see `reboot.cli.common.portless`),
and by the server, which serves on the port portless picked, trusts
the named origins, and reaches named dev servers through the proxy.
Nothing here registers a name: `portless run` registers the name for
as long as the application runs, and removes it when it exits.
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
    developer dashboard under, `dashboard.<name>`."""
    return f'dashboard.{name}'


def enabled() -> bool:
    """Whether this process runs under portless, which
    `RBT_PORTLESS_NAME` says: the CLI sets it only when told
    `--portless`."""
    return bool(os.environ.get(ENVVAR_RBT_PORTLESS_NAME))


def port() -> int:
    """The port the application serves on under portless: the one
    `portless run` picked (or `--app-port` fixed) and routes
    `https://<name>.localhost` to, told in `PORT`, which `portless run`
    sets for the command it runs. Only under portless (see `enabled`)."""
    assert enabled(), 'not running under portless'
    value = os.environ.get('PORT')
    if value is None:
        raise RuntimeError(
            f'`{ENVVAR_RBT_PORTLESS_NAME}` is set but `PORT` is not: an '
            'application under `--portless` is run by `portless run`, '
            'which sets `PORT` to the port it routes the name to'
        )
    return int(value)


def ssl_context() -> ssl.SSLContext:
    """A client context for reaching a name the portless proxy serves:
    the system's trust, plus portless's CA where portless keeps it.
    Only under portless (see `enabled`)."""
    assert enabled(), 'not running under portless'
    context = ssl.create_default_context()
    if CA_PATH.is_file():
        context.load_verify_locations(cafile=str(CA_PATH))
    return context
