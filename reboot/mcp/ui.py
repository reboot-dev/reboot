"""UI HTML serving for MCP (HMR dev mode and production builds)."""

import contextvars
import functools
import inspect
import json
import os
import re
from pathlib import Path
from reboot.mcp.proxy import dev_loader_html
from reboot.settings import ENVVAR_RBT_MCP_FRONTEND_HOST
from typing import Any

# Max number of UI resources to cache (project root lookups and
# production HTML reads). Most apps have only a handful of UIs.
_MAX_UI_CACHE_ENTRIES = 16

# Per-request resource metadata, set by `ui_html()` and read
# by the patched `FastMCP.read_resource()` in `factories.py`.
# Bridges dynamic CSP metadata into the MCP protocol response
# as `_meta.ui.csp` (see `McpUiResourceCsp` in
# `@modelcontextprotocol/ext-apps`).
_resource_meta: contextvars.ContextVar[dict[str, Any] |
                                       None] = contextvars.ContextVar(
                                           '_resource_meta', default=None
                                       )


# One entry per UI resource (e.g., clicker, chat); most apps
# have only a handful.
@functools.lru_cache(maxsize=_MAX_UI_CACHE_ENTRIES)
def _find_project_root_from(caller_file: str) -> Path:
    """Walk up from `caller_file` to find a directory with
    `web/` or `.rbtrc`."""
    current = Path(caller_file).resolve().parent
    for _ in range(10):  # Max 10 levels up.
        if (current / "web").is_dir() or (current / ".rbtrc").exists():
            return current
        if current.parent == current:
            break
        current = current.parent

    raise RuntimeError(
        "Could not find project root (directory with `web/` "
        "or `.rbtrc`)"
    )


def _find_project_root() -> Path:
    """Find project root by walking up from caller's file location.

    Looks for a directory containing `web/` or `.rbtrc`.
    Result is cached per caller file so the filesystem walk
    only happens once.
    """
    frame = inspect.currentframe()
    if (frame is None or frame.f_back is None or frame.f_back.f_back is None):
        raise RuntimeError("Cannot determine caller's file location")

    # Get the caller's caller's file (skip
    # _find_project_root and ui_html).
    caller_file = frame.f_back.f_back.f_globals.get("__file__")
    if caller_file is None:
        raise RuntimeError("Cannot determine caller's file location")

    return _find_project_root_from(caller_file)


def _inject_globals(
    html: str,
    reboot_url: str,
    ui_title: str,
) -> str:
    """Inject Reboot globals into HTML for remote access.

    Adds a script tag that sets `window.REBOOT_URL` and
    `window.REBOOT_MCP_UI_TITLE` before app loads. This allows
    UIs to connect to Reboot when loaded remotely (e.g., in
    MCPJam where `window.location.origin` is "null") and to
    auto-detect MCP mode from the injected title.
    """
    script = (
        f'<script>'
        f'window.REBOOT_URL={json.dumps(reboot_url)};'
        f'window.REBOOT_MCP_UI_TITLE={json.dumps(ui_title)};'
        f'</script>'
    )
    # Insert after <head> tag.
    result = re.sub(
        r'(<head[^>]*>)',
        rf'\1\n    {script}',
        html,
        count=1,
    )
    if result == html:
        raise ValueError(
            "Could not inject Reboot globals: no <head> tag "
            "found in HTML. Ensure your index.html contains "
            "a <head> element."
        )
    return result


def _build_not_found_html(title: str, ui_name: str) -> str:
    """Generate fallback HTML when a build artifact is not found."""
    return f'''<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{title}</title>
    <style>
        body {{
            font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
            background: #1a1a2e;
            min-height: 100vh;
            margin: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            color: #eee;
        }}
        .container {{ text-align: center; padding: 2rem; }}
        h1 {{ color: #4ade80; }}
        code {{
            background: #0f0f1a;
            padding: 0.25rem 0.5rem;
            border-radius: 4px;
            color: #fbbf24;
        }}
    </style>
</head>
<body>
    <div class="container">
        <h1>{title}</h1>
        <p>The React app needs to be built first.</p>
        <p>Run: <code>cd web && npm install && npm run build</code></p>
    </div>
</body>
</html>'''


def ui_html(
    ui_path: str,
    reboot_url: str,
    ui_name: str,
    project_root: Path | str | None = None,
    artifact_path: str | None = None,
) -> str:
    """Get HTML for a UI.

    In dev mode (`--mcp-frontend-host`), returns HTML that
    loads from the web dev server via Envoy proxy. In
    production, returns pre-built HTML.

    Note: UIs receive state instance IDs via the MCP
    `ontoolinput` event, not via URL parameters or injected
    globals.

    Args:
        ui_path: Path to the UI relative to project root
            (e.g., "web/ui/clicker").
        reboot_url: Reboot server URL (extracted from request
            headers).
        ui_name: Display name from the API definition
            (e.g., "show_clicker").
        project_root: Project root directory. If not provided,
            auto-discovers by walking up from caller's file
            looking for `web/` or `.rbtrc`.
        artifact_path: Override for the build artifact path,
            relative to project root. Defaults to inserting
            `dist/` after the first component of `ui_path`
            (e.g., "web/ui/clicker" ->
            "web/dist/ui/clicker").

    Returns:
        HTML content for the app.
    """
    # Set ext-apps CSP metadata for this resource response.
    # The patched `FastMCP.read_resource()` (in `factories.py`)
    # picks this up via the contextvar and includes it in the
    # protocol response as `_meta.ui.csp`.
    #
    # `connectDomains`: allows WebSocket/gRPC connections to
    #     the Reboot server (CSP `connect-src`).
    # `resourceDomains`: allows loading scripts, styles, and
    #     images from the Reboot server (CSP `script-src`,
    #     `style-src`, `img-src`, etc.).
    # `frameDomains`: allows the dev-loader's nested iframe to
    #     load from the Reboot server (CSP `frame-src`). The
    #     ext-apps spec discourages `frameDomains`, but our dev
    #     loader requires a nested iframe to give Vite HMR a
    #     real origin (the sandbox-proxy's srcdoc origin is
    #     "null"). See `proxy.py` for details.
    assert (
        reboot_url.startswith("http://") or reboot_url.startswith("https://")
    )
    websocket_prefix = (
        "ws://" if reboot_url.startswith("http://") else "wss://"
    )
    websocket_url = (
        websocket_prefix +
        reboot_url.removeprefix("http://").removeprefix("https://")
    )
    _resource_meta.set(
        {
            "ui":
                {
                    # These settings are NOT enough to completely
                    # suppress CSP errors in e.g. MCPJam: Zod runs an
                    # `allowEval` method that runs `new Function("")` -
                    # explicitly to figure out whether the 'unsafe-eval'
                    # CSP is active; it most likely finds it _is_ active
                    # and thus produces an error, in which case Zod
                    # gracefully falls back to non-`eval`-based code.
                    # MCPJam will, however, detect this violation and
                    # show an error in its logs. There's nothing we can
                    # do about that short of patching Zod; MCP does not
                    # support configuring the 'unsafe-eval' CSP setting.
                    "csp":
                        {
                            "connectDomains": [reboot_url, websocket_url],
                            "resourceDomains": [reboot_url, websocket_url],
                            "frameDomains": [reboot_url, websocket_url],
                        },
                },
        }
    )

    # Dev mode: Envoy proxies to dev server
    # (`--mcp-frontend-host`).
    mcp_frontend_host = os.environ.get(ENVVAR_RBT_MCP_FRONTEND_HOST)
    if mcp_frontend_host:
        return dev_loader_html(ui_path, reboot_url, ui_name)

    # Production mode: serve built HTML.
    if project_root is None:
        project_root = _find_project_root()
    elif isinstance(project_root, str):
        project_root = Path(project_root)

    if artifact_path is not None:
        # Explicit artifact path override.
        dist_path = (project_root / artifact_path / "index.html")
    else:
        # Default: insert `dist/` after the first path
        # component.
        # e.g., "web/ui/clicker" ->
        #       "web/dist/ui/clicker".
        parts = ui_path.split("/", 1)
        if len(parts) == 2:
            dist_rel = f"{parts[0]}/dist/{parts[1]}"
        else:
            dist_rel = f"{parts[0]}/dist"
        dist_path = project_root / dist_rel / "index.html"

    if dist_path.exists():
        return _read_and_inject(dist_path, reboot_url, ui_name)

    # No build found — show instructions.
    return _build_not_found_html(f"{ui_name.title()} UI", ui_name)


# One entry per UI resource (e.g., clicker, chat); most apps
# have only a handful.
@functools.lru_cache(maxsize=_MAX_UI_CACHE_ENTRIES)
def _read_and_inject(
    dist_path: Path,
    reboot_url: str,
    ui_name: str,
) -> str:
    """Read a build artifact and inject globals. Cached because
    the artifact is static at runtime."""
    html = dist_path.read_text()
    return _inject_globals(html, reboot_url, ui_name)
