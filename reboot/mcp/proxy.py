"""HMR loader for UIs (nested iframe with buffered relay).

Why nested iframes:

ext-apps renders UI HTML inside a sandbox-proxy iframe. The
sandbox-proxy has origin "null" (srcdoc), so relative URLs
don't resolve. We nest a real iframe that loads from Envoy
with a proper origin, so Vite HMR and relative imports work.

Traffic flow::

    Host -> sandbox-proxy -> dev_loader (this HTML) -> inner iframe
                                                           |
                                                     Envoy `/__/web/**`
                                                           |
                                                     Vite dev server

Buffered relay (added with ext-apps v1.0.1 uplift):

With ext-apps >=1.0.1, the sandbox-proxy delivers
`ui/notifications/tool-input` and `ui/notifications/tool-result`
immediately after its own initialization — before the inner
iframe's `PostMessageTransport` listener is ready. Without
buffering these messages are lost.

The relay queues messages from the host until the inner
iframe sends its first message (the `ui/initialize` request
from `PostMessageTransport`), then flushes the queue. After
that, messages flow directly.

On reconnect (backend restart causes a new `ui/initialize`),
saved `tool-input`/`tool-result` notifications are replayed so
the user doesn't need to manually refresh.

Size handling (added with ext-apps v1.0.1 uplift):

The inner iframe's `ui/notifications/size-changed` messages
are NOT forwarded to the host. Instead, the relay reflects
them into `document.body.style.height`, which the
sandbox-proxy's own `ResizeObserver` picks up. Forwarding
directly causes oscillation: the sandbox-proxy resizes,
triggering a new `size-changed` from the inner iframe, in a
loop. The CSS uses `overflow: hidden` and `display: block` on
the iframe to prevent scrollbar-induced layout thrash and the
inline baseline gap.

Prior to ext-apps v1.0.1 the size-changed notification was
broken in the sandbox-proxy; the uplift to v1.0.1 fixed it
but exposed the oscillation issue in our nested-iframe
pattern, hence the interception here.
"""

import logging
from urllib.parse import quote

logger = logging.getLogger(__name__)

# URL prefix for the production UI-assets endpoint. Used by
# `prod_loader_html` to build the inner-iframe URL and by the
# MCP ASGI dispatcher in `factories.py` to recognize incoming
# requests. Concatenated against the MCP mount path (`/mcp`)
# and matched verbatim against `scope["path"]`.
_UI_ASSETS_PREFIX = "/ui-assets/"


def dev_loader_html(
    ui_path: str,
    reboot_url: str,
    ui_name: str,
) -> str:
    """Generate wrapper HTML with buffered relay for dev server.

    The sandbox-proxy (ext-apps host code) loads this HTML via
    srcdoc. We create an inner iframe that loads from Envoy so
    that the React app has a real origin for Vite HMR and
    relative imports.

    Messages from the host (via sandbox-proxy) are buffered
    until the inner iframe's `PostMessageTransport` sends its
    first message (`ui/initialize`), then replayed in order. On
    reconnect (new `ui/initialize`), saved `tool-input`/
    `tool-result` notifications are replayed.

    Args:
        ui_path: Path to the UI relative to project root
            (e.g., "web/ui/clicker").
        reboot_url: Reboot server URL (extracted from request
            headers).
        ui_name: Display name from the API definition
            (e.g., "show_clicker").

    Returns:
        HTML wrapper with embedded iframe and buffered relay.
    """

    # Inner iframe loads from Envoy which routes
    # "/__/web/**" to dev server.
    ui_url = (
        f"{reboot_url}/__/{ui_path}/index.html"
        f"?mcpUiTitle={ui_name}"
    )

    logger.debug(f"[mcp] Generating iframe wrapper for: {ui_url}")

    return _iframe_relay(ui_url=ui_url, ui_name=ui_name, variant="Dev")


def prod_loader_html(
    ui_name: str,
    cache_bust: str,
    reboot_url: str,
) -> str:
    """Generate wrapper HTML for a production (built) UI.

    Same shape as `dev_loader_html`: the outer sandbox-proxy
    iframe (srcdoc, null origin) nests a real iframe that loads
    from a Reboot backend URL with a proper origin, so relative
    imports and CSP `connect-src` work. The buffered relay
    forwards postMessage traffic between the sandbox-proxy and
    the inner app.

    Why this exists for production:

    ChatGPT runs `tools/list` only once per connector lifetime;
    once it has cached a UI tool's `_meta.ui.resourceUri`, it
    keeps using that URI forever (uninstall + reinstall is the
    only refresh path). UI resource URIs are discovered at
    list-tools time, so the cache-bust token embedded in the
    URI was computed at first-connection time and never
    rotates from ChatGPT's perspective. Hosts that re-list per
    session (Claude, MCPJam) get a fresh URI each session and
    don't have this problem.

    Returning the bundle inline therefore strands ChatGPT on
    whatever bytes were on disk when it first connected. By
    returning a thin relay whose nested iframe loads from
    `/mcp{_UI_ASSETS_PREFIX}<ui_name>/<token>/index.html`,
    freshness no longer depends on the URI changing. Every
    iframe mount triggers a new GET against the server, which
    serves the current dist file from disk (the `<token>`
    segment is ignored server-side), and the user sees the
    latest bundle.

    Args:
        ui_name: Display name from the API definition
            (e.g., "show_clicker"). Used as the key for the
            server-side asset lookup and for the iframe
            `mcpUiTitle` query parameter.
        cache_bust: Content-hash token computed by
            `compute_ui_cache_bust`. Appears as a URL path
            segment so browser HTTP caches also invalidate when
            content changes.
        reboot_url: Reboot server URL (extracted from request
            headers). The inner iframe is loaded from this
            origin.

    Returns:
        HTML wrapper. The inner iframe loads
        `{reboot_url}/mcp/ui-assets/{ui_name}/{cache_bust}/index.html`.
    """
    # Include the token as a path segment so it's part of the
    # cacheable URL identity; include `mcpUiTitle` as a query
    # param for symmetry with dev mode.
    ui_url = (
        f"{reboot_url}/mcp{_UI_ASSETS_PREFIX}{quote(ui_name, safe='')}"
        f"/{quote(cache_bust, safe='')}/index.html"
        f"?mcpUiTitle={quote(ui_name, safe='')}"
    )

    logger.debug(f"[mcp] Generating prod iframe wrapper for: {ui_url}")

    return _iframe_relay(ui_url=ui_url, ui_name=ui_name, variant="")


def _iframe_relay(ui_url: str, ui_name: str, variant: str) -> str:
    """Shared HTML: an outer page with a nested iframe and
    postMessage forwarding. Used by both `dev_loader_html` and
    `prod_loader_html`.

    The relay queues messages from the host until the inner
    iframe's `PostMessageTransport` sends its first message
    (`ui/initialize`), then replays them in order. On reconnect
    (new `ui/initialize`), saved `tool-input`/`tool-result`
    notifications are replayed.
    """
    title_suffix = f" ({variant})" if variant else ""
    return f'''<!DOCTYPE html>
<html lang="en" data-dev-app="{ui_name}">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{ui_name.title()}{title_suffix}</title>
    <style>
        /* overflow:hidden prevents scrollbar-induced layout thrash
           between nested iframes. No fixed height — set dynamically
           by the SIZE_CHANGED relay below. */
        html, body {{ margin: 0; padding: 0; overflow: hidden; }}
        /* display:block eliminates the inline baseline gap that
           causes a few-pixel height mismatch between the iframe
           content and the sandbox-proxy's ResizeObserver reading. */
        #dev-app {{ display: block; width: 100%; height: 100%; border: none; }}
    </style>
</head>
<body>
    <iframe id="dev-app" src="{ui_url}"></iframe>
    <script>
        // Buffered PostMessage relay with reconnect support.
        //
        // First load: the sandbox-proxy sends tool-input/tool-result
        // before the inner app has loaded. We queue those and replay
        // once the app sends its first message (ui/initialize).
        //
        // Reconnect: if the backend restarts, the inner iframe
        // reloads and sends a new ui/initialize. The host won't
        // re-send tool-input, so we replay saved notifications.
        const iframe = document.getElementById('dev-app');
        const queue = [];
        let innerReady = false;

        const SIZE_CHANGED = 'ui/notifications/size-changed';
        const TOOL_INPUT = 'ui/notifications/tool-input';
        const TOOL_RESULT = 'ui/notifications/tool-result';
        const SANDBOX_PROXY_READY = 'ui/notifications/sandbox-proxy-ready';
        const SANDBOX_RESOURCE_READY =
            'ui/notifications/sandbox-resource-ready';

        // Saved notifications for replay on reconnect.
        let savedToolInput = null;
        let savedToolResult = null;

        // Last size forwarded to the host; used to suppress
        // duplicate `size-changed` forwards that would otherwise
        // drive an oscillation loop.
        let lastForwardedHeight = null;
        let lastForwardedWidth = null;

        window.addEventListener('message', (event) => {{
            if (event.source === iframe.contentWindow) {{
                const d = event.data;

                if (!innerReady) {{
                    // First connection: flush buffered messages.
                    innerReady = true;
                    for (const msg of queue) {{
                        iframe.contentWindow.postMessage(msg, '*');
                    }}
                    queue.length = 0;
                }} else if (d && d.method === 'ui/initialize') {{
                    // Inner iframe reloaded (backend restart). Forward
                    // the init, then replay saved tool notifications
                    // after the host responds.
                    window.parent.postMessage(d, '*');
                    setTimeout(() => {{
                        if (savedToolInput) {{
                            iframe.contentWindow.postMessage(
                                savedToolInput, '*');
                        }}
                        if (savedToolResult) {{
                            iframe.contentWindow.postMessage(
                                savedToolResult, '*');
                        }}
                    }}, 0);
                    return;
                }}

                // Reflect the inner size into our body height
                // and also forward `size-changed` to the host.
                // De-duplicated to avoid oscillation.
                if (d && d.method === SIZE_CHANGED) {{
                    const h = d.params && d.params.height;
                    const w = d.params && d.params.width;
                    if (typeof h === 'number') {{
                        document.documentElement.style.height = h + 'px';
                        document.body.style.height = h + 'px';
                    }}
                    if (h !== lastForwardedHeight ||
                        w !== lastForwardedWidth) {{
                        lastForwardedHeight = h;
                        lastForwardedWidth = w;
                        window.parent.postMessage(d, '*');
                    }}
                    return;
                }}

                // Forward: inner app -> host (sandbox-proxy).
                window.parent.postMessage(event.data, '*');
            }} else if (event.source === window.parent) {{
                const d = event.data;

                // We loaded our own ui_url instead of waiting for HTML
                // from the host, so consume the host's reply to our
                // `sandbox-proxy-ready` instead of forwarding it to
                // the inner iframe.
                if (d && d.method === SANDBOX_RESOURCE_READY) return;

                // Save tool notifications for reconnect replay.
                if (d && d.method === TOOL_INPUT) savedToolInput = d;
                if (d && d.method === TOOL_RESULT) savedToolResult = d;

                if (innerReady) {{
                    iframe.contentWindow.postMessage(event.data, '*');
                }} else {{
                    queue.push(event.data);
                }}
            }}
        }});

        // Tell the host we're ready. The host (e.g. Goose) gates its
        // iframe-load timeout on this notification; without it a cold
        // inner-iframe boot through ngrok can exceed the host's
        // window and the UI fails to mount.
        window.parent.postMessage({{
            jsonrpc: '2.0',
            method: SANDBOX_PROXY_READY,
            params: {{}},
        }}, '*');
    </script>
</body>
</html>'''
