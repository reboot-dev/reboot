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

logger = logging.getLogger(__name__)


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

    return f'''<!DOCTYPE html>
<html lang="en" data-dev-app="{ui_name}">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{ui_name.title()} (Dev)</title>
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
        // before the Vite app has loaded. We queue those and replay
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

        // Saved notifications for replay on reconnect.
        let savedToolInput = null;
        let savedToolResult = null;

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

                // Reflect size-changed into body height for the
                // sandbox-proxy's ResizeObserver.
                if (d && d.method === SIZE_CHANGED) {{
                    const h = d.params && d.params.height;
                    if (typeof h === 'number') {{
                        document.documentElement.style.height = h + 'px';
                        document.body.style.height = h + 'px';
                    }}
                    return;
                }}

                // Forward: inner app -> host (sandbox-proxy).
                window.parent.postMessage(event.data, '*');
            }} else if (event.source === window.parent) {{
                const d = event.data;

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
    </script>
</body>
</html>'''
