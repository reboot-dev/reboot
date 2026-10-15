"""What Reboot knows about portless (https://github.com/vercel-labs/portless),
which `rbt dev run --portless` serves an application through: the
names it gives things, where its proxy listens, and how to trust the
certificates the proxy serves.

Shared by the CLI, which registers names with the proxy, and by the
server, which trusts the named origins and reaches named dev servers
through the proxy.
"""

import os
import ssl
from pathlib import Path

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


def vite_name(name: str) -> str:
    """The name an application's frontend dev server is expected
    under, `vite.<name>`, which is where `portless vite.<name> vite`
    (the frontend's `npm run dev:portless`) serves it. An address for
    the application, not for people: `rbt dev run --portless`
    registers the application itself as `<name>`, and
    `https://<name>.localhost` serves the API, the web app and the
    MCP Apps, the latter two proxied from the dev server."""
    return f'vite.{name}'


def vite_hostname(name: str) -> str:
    """`vite.<name>.localhost`: where an application's frontend dev
    server is."""
    return hostname(vite_name(name))


def dashboard_name(name: str) -> str:
    """The name `rbt dashboard --portless` registers an application's
    developer dashboard under, `dashboard.<name>`."""
    return f'dashboard.{name}'


def dashboard_hostname(name: str) -> str:
    """`dashboard.<name>.localhost`: where an application's developer
    dashboard is."""
    return hostname(dashboard_name(name))


def ssl_context() -> ssl.SSLContext:
    """A client context for reaching a server the portless proxy
    serves as `https://<name>.localhost`: the system's trust, plus
    portless's CA where portless keeps it."""
    context = ssl.create_default_context()
    if CA_PATH.is_file():
        context.load_verify_locations(cafile=str(CA_PATH))
    return context
