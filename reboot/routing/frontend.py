"""The frontend's dev server, as the upstreams the application
forwards it on."""

import dataclasses
import reboot.portless
from reboot.portless import proxy_port
from reboot.routing.upstreams import Upstream
from urllib.parse import urlparse

# The path prefix the frontend's dev server is reached on, on the
# application's origin; the dev server is configured with it as its
# `base`, so paths match directly.
FRONTEND_PREFIX = "/__/frontend/"

# The page shown in place of a bare 503 when the frontend's dev
# server cannot be reached.
_FRONTEND_UNREACHABLE_HTML = (
    '<!DOCTYPE html>'
    '<html lang="en"><head><meta charset="UTF-8">'
    '<meta name="viewport" '
    'content="width=device-width, initial-scale=1.0">'
    '<style>'
    'body{font-family:ui-monospace,SFMono-Regular,Menlo,'
    'monospace;background:#1a1a2e;color:#eee;display:flex;'
    'align-items:center;justify-content:center;'
    'min-height:100vh;margin:0}'
    '.c{text-align:center;padding:2rem}'
    'h2{color:#f87171}'
    'code{background:#0f0f1a;padding:.2rem .5rem;'
    'border-radius:4px;color:#fbbf24}'
    '</style></head><body><div class="c">'
    '<h2>Dev server not reachable</h2>'
    "<p>Couldn't reach the dev web server at "
    '<code>__FRONTEND_URL__</code>.</p>'
    '<p style="margin-top:1rem;opacity:.7">'
    'Is the dev web server running?</p>'
    '</div>'
    '<script>'
    # Send a `size-changed` postMessage so the
    # dev-loader relay (proxy.py) resizes the
    # wrapper to fit this error page.
    'window.parent.postMessage({'
    'jsonrpc:"2.0",'
    'method:"ui/notifications/size-changed",'
    'params:{height:document.body.scrollHeight}'
    '},"*");'
    '</script>'
    '</body></html>'
)


def frontend_upstreams(
    frontend_url: str,
    *,
    web_app: bool,
) -> list[Upstream]:
    """The frontend's dev server as upstreams: a dev server at the
    given URL (e.g., "http://localhost:5173", or
    "https://frontend-<name>.localhost" under `--portless`), serving
    the MCP Apps, the web app (`web_app`), or both, reached on
    `/__/frontend/**`, and with `web_app` also on `/` and every path
    the application doesn't answer, as a second upstream on `/`."""
    parsed = urlparse(frontend_url)
    if parsed.scheme not in ("http", "https"):
        raise ValueError(
            "The frontend dev server must be an http:// or https:// "
            f"URL; got '{frontend_url}'"
        )
    if not parsed.hostname:
        raise ValueError(
            f"RBT_FRONTEND_URL must include a hostname; got '{frontend_url}'"
        )
    # An upstream is on the loopback, which a `*.localhost` name
    # resolves to as well, portless's included.
    if not (
        parsed.hostname in ("localhost", "127.0.0.1", "0.0.0.0", "::1") or
        parsed.hostname.endswith(".localhost")
    ):
        raise ValueError(
            "The frontend dev server must run on this machine, at "
            "`localhost`, `127.0.0.1` or a `*.localhost` name; got "
            f"'{frontend_url}'"
        )
    tls = parsed.scheme == "https"
    default_port = (proxy_port() if tls else 80)
    # Under portless the dev server's name is the proxy's on loopback,
    # reached with the name carried as SNI and as the `Host` header,
    # since the proxy routes by name: asked for by the name the
    # browser asked us for, which is ours, it would loop back here.
    portless = reboot.portless.enabled()
    frontend = Upstream(
        name="frontend",
        prefix=FRONTEND_PREFIX,
        port=parsed.port or default_port,
        # The dev server is configured with the prefix as its `base`,
        # so the path goes through as it is.
        prefix_rewrite=None,
        host_rewrite=parsed.hostname if portless else "",
        tls=tls,
        unreachable_html=_FRONTEND_UNREACHABLE_HTML.replace(
            "__FRONTEND_URL__", frontend_url
        ),
    )
    if not web_app:
        return [frontend]
    return [
        frontend,
        dataclasses.replace(frontend, name="web-app", prefix="/"),
    ]
