import logging
from reboot.mcp.request_state import _UI_ASSETS_PREFIX, _request_user_agent
from urllib.parse import quote

logger = logging.getLogger(__name__)


def host_needs_cache_busting_iframe() -> bool:
    """
    Return True if the incoming request looks like it's from ChatGPT.

    See `cache_busting_iframe_html` below for why ChatGPT needs this.

    Matches `openai-mcp/*` and User-Agents containing `ChatGPT`
    so the detection works across minor client-version bumps.
    """
    user_agent = _request_user_agent.get()
    if not user_agent:
        return False
    return (user_agent.startswith("openai-mcp") or "ChatGPT" in user_agent)


def host_supports_iframe() -> bool:
    """
    Return True if the client can render iframes.

    Most MCP hosts can, so this defaults to True.

    The known exception is the **claude.ai website**, which ignores the
    `frameDomains` CSP and so can't load an inner iframe at all
    (https://github.com/anthropics/claude-ai-mcp/issues/54). We detect
    it by `Claude` (case-insensitive) in the User-Agent.

    NOTE: we could not find a User-Agent that reliably separates the
    claude.ai website from **Claude Desktop** — which *does* support the
    iframe and would benefit from it through tunnels. Remote MCP
    connectors for every Claude surface (web, Desktop, mobile) connect
    from Anthropic's shared cloud infrastructure rather than the local
    client, so they appear to present the same User-Agent. We therefore
    treat all `Claude` clients conservatively as iframe-incapable:
    inline renders correctly everywhere, it's just less robust through
    tunnels (e.g. the free ngrok tier's interstitial). TODO: If a
    distinguishing signal for Claude Desktop turns up, narrow this match
    so Desktop gets the iframe.
    """
    user_agent = _request_user_agent.get()
    if not user_agent:
        # No User-Agent — assume a capable host (the default path).
        return True
    return "claude" not in user_agent.lower()


def cache_busting_iframe_html(
    ui_name: str,
    cache_bust: str,
    reboot_url: str,
) -> str:
    """
    Generate wrapper HTML for MCP clients that need a cache-busting iframe.

    Most notably, that's ChatGPT.

    ## Why is this here?

    ChatGPT needs a cache-busting (nested) iframe. ChatGPT only runs tool
    discovery at app-install time, and discovers UI resource URIs (only)
    at that point. If the application changes its UIs (and thereby,
    because of cache busting, their URIs) ChatGPT will not notice and
    keep serving the old UIs - until the customer uninstalls and
    reinstalls the app.

    There's no way for us to make things better in terms of tool
    discovery, but we can at least give customers fresh UIs - by
    bringing in a nested iframe. The static content that ChatGPT caches
    will be only an iframe, which will point at a URL that serves the
    latest UI.

    ## Buffered message relay

    With ext-apps >=1.0.1, the sandbox-proxy delivers
    `ui/notifications/tool-input` and `ui/notifications/tool-result`
    immediately after its own initialization — before the inner iframe's
    `PostMessageTransport` listener is ready. Without buffering these
    messages are lost.

    The cache-busting iframe queues messages from the host until the inner
    iframe sends its first message (the `ui/initialize` request from
    `PostMessageTransport`), then flushes the queue. After that,
    messages flow directly.

    On reconnect (backend restart causes a new `ui/initialize`), saved
    `tool-input`/`tool-result` notifications are replayed so the user
    doesn't need to manually refresh.

    ## Size handling

    The inner iframe's `ui/notifications/size-changed` messages are NOT
    forwarded to the host. Instead, the cache-busting iframe reflects them
    into `document.body.style.height`, which the sandbox-proxy's own
    `ResizeObserver` picks up. Forwarding directly causes oscillation:
    the sandbox-proxy resizes, triggering a new `size-changed` from the
    inner iframe, in a loop. The CSS uses `overflow: hidden` and
    `display: block` on the iframe to prevent scrollbar-induced layout
    thrash and the inline baseline gap.

    Prior to ext-apps v1.0.1 the size-changed notification was broken in
    the sandbox-proxy; the uplift to v1.0.1 fixed it but exposed the
    oscillation issue in our nested-iframe pattern, hence the
    interception here.

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

    return _iframe_html(ui_url=ui_url, ui_name=ui_name)


def dev_iframe_html(
    ui_url_path: str,
    reboot_url: str,
    ui_name: str,
) -> str:
    """
    Nested-iframe wrapper for dev/HMR.

    The inner iframe loads the page the Vite dev server is serving
    (through Envoy, which proxies `/__/frontend/**`) rather than a built
    artifact. Because the inner iframe has a real origin (the Reboot
    server), Vite HMR and the page's own relative/absolute asset URLs
    resolve on the same origin — making this path "just work", including
    through tunnels.

    Args:
        ui_url_path: The dev server URL path (rooted at the Reboot
            origin) at which Vite serves this UI's `index.html`
            directory, e.g. "/__/frontend/mcp/clicker".
        reboot_url: Reboot server URL (extracted from request
            headers). The inner iframe is loaded from this origin.
        ui_name: Display name from the API definition (e.g.,
            "show_clicker").

    Returns: HTML.
    """
    ui_url = (
        f"{reboot_url}{ui_url_path}/index.html"
        f"?mcpUiTitle={quote(ui_name, safe='')}"
    )

    logger.debug(f"[mcp] Generating dev iframe wrapper for: {ui_url}")

    return _iframe_html(ui_url=ui_url, ui_name=ui_name)


def _iframe_html(ui_url: str, ui_name: str) -> str:
    """
    HTML for an outer page with an iframe and `postMessage` forwarding.

    Queues messages from the host until the iframe's
    `PostMessageTransport` sends its first message (`ui/initialize`),
    then replays them in order. On reconnect (new `ui/initialize`),
    saved `tool-input`/`tool-result` notifications are replayed.
    """
    return f'''<!DOCTYPE html>
<html lang="en" data-dev-app="{ui_name}">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{ui_name.title()}</title>
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
