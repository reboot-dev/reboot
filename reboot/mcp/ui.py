"""UI HTML serving for MCP (HMR dev mode and production builds)."""

import contextvars
import functools
import hashlib
import inspect
import json
import logging
import os
import re
import uuid
from pathlib import Path
from reboot.mcp.proxy import dev_loader_html, prod_loader_html
from reboot.settings import ENVVAR_RBT_MCP_FRONTEND_HOST
from typing import Any

logger = logging.getLogger(__name__)

# Max number of UI resources to cache (project root lookups and
# production HTML reads). Most apps have only a handful of UIs.
_MAX_UI_CACHE_ENTRIES = 16

# Per-process random token used as the cache-bust signature in
# HMR mode (`--config=hmr` / `--config=default`, i.e. when
# ENVVAR_RBT_MCP_FRONTEND_HOST is set). `dev_loader_html`
# bootstraps content live from the Vite dev server, so there
# is nothing on disk to hash; a per-process UUID gives host-
# side caches a fresh URI on every server restart, which
# matches the "restart to refresh" dev loop. Vite content
# changes within a session flow over the HMR WebSocket and
# never touch the MCP layer, so a stable URI within a session
# is correct. Computed once at module import.
_STARTUP_CACHE_BUST_TOKEN = uuid.uuid4().hex[:12]

# Per-request User-Agent for the incoming `resources/read`.
# Set by `mcp_asgi_app` in `factories.py` before handing off to
# the MCP transport. Read by `ui_html()` to decide whether to
# emit the relay iframe (ChatGPT needs it) or the inlined
# bundle (everyone else is fine).
_request_user_agent: contextvars.ContextVar[str | None] = (
    contextvars.ContextVar("_request_user_agent", default=None)
)


def _host_needs_relay_iframe() -> bool:
    """Return True if the incoming request looks like ChatGPT.

    ChatGPT runs `tools/list` only once per connector lifetime
    and never re-discovers, so it keeps using the
    `_meta.ui.resourceUri` it cached on first connection
    indefinitely. After a server restart with new bundle bytes,
    inlining the bundle in the `resources/read` response
    therefore strands ChatGPT on the original bytes — its URI
    never changes, and the only way out is to uninstall and
    reinstall the connector. Other hosts (Claude, MCPJam, etc.)
    re-list per session, so a rotated cache-bust token in the
    URI surfaces the new bundle on next session.

    For ChatGPT we instead serve a thin relay whose nested
    iframe fetches the bundle from `/mcp/ui-assets/...` on
    every mount; that GET runs against the live filesystem and
    returns current bytes regardless of what URI ChatGPT
    cached. Others get the inlined bundle, which avoids the
    extra round-trip.

    Matches `openai-mcp/*` and User-Agents containing `ChatGPT`
    so the detection works across minor client-version bumps.
    """
    user_agent = _request_user_agent.get()
    if not user_agent:
        return False
    return (user_agent.startswith("openai-mcp") or "ChatGPT" in user_agent)


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
def find_project_root_from(caller_file: str) -> Path:
    """Walk up from `caller_file` to find a directory with
    `web/` or `.rbtrc`.

    Exported so generated code can resolve the project root
    from its own `__file__` without relying on caller-frame
    inspection.
    """
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

    return find_project_root_from(caller_file)


def _resolve_dist_path(
    project_root: Path,
    ui_path: str,
    artifact_path: str | None,
) -> Path:
    """Resolve the production-build `index.html` path for a UI."""
    if artifact_path is not None:
        return project_root / artifact_path / "index.html"
    # Default: insert `dist/` after the first path component.
    # e.g., "web/ui/clicker" -> "web/dist/ui/clicker".
    parts = ui_path.split("/", 1)
    if len(parts) == 2:
        dist_rel = f"{parts[0]}/dist/{parts[1]}"
    else:
        dist_rel = f"{parts[0]}/dist"
    return project_root / dist_rel / "index.html"


def compute_ui_cache_bust(
    project_root: Path | str,
    ui_path: str,
    ui_name: str,
    artifact_path: str | None = None,
) -> str:
    """Compute a cache-bust token for a UI resource URI.

    Hosts that re-list tools per session (Claude, MCPJam, ...)
    receive a fresh `_meta.ui.resourceUri` on every connection.
    Embedding a content-derived token in that URI gives them a
    different URI when the bundle changes, so any host-side
    cache keyed by URI invalidates naturally on next session.
    ChatGPT is the exception — it caches the URI from its first
    `tools/list` and never re-lists, so the token rotation is
    invisible to it; see `_host_needs_relay_iframe` for the workaround.

    Three branches, all picked deterministically:

    1. **HMR mode** (ENVVAR_RBT_MCP_FRONTEND_HOST set). `ui_html`
       returns `dev_loader_html`, a static bootstrap that loads
       the Vite dev server live; nothing on disk to hash.
       Returns `_STARTUP_CACHE_BUST_TOKEN`, a per-process UUID,
       so each server restart busts host caches once.

    2. **Dist mode, build present**. Returns the first 12 hex
       chars of a SHA-1 over the dist `index.html`. Pure
       function of file bytes: identical across restarts and
       across replicas of the same deploy, only changes when
       the build actually changes.

    3. **Dist mode, build missing**. `ui_html` will serve the
       "build not found" placeholder, which is itself fully
       determined by `ui_name`. Returns SHA-1 of that exact
       placeholder, so the token is stable across restarts and
       replicas (no chaos-monkey thrash) AND naturally busts
       exactly once when a real build appears (the real
       `index.html` hash differs from the placeholder hash).
       Logs a warning naming the missing path so the operator
       sees the misconfig.

    Hash is not cryptographic — just enough entropy (12 hex =
    48 bits) to distinguish builds.
    """
    if os.environ.get(ENVVAR_RBT_MCP_FRONTEND_HOST):
        return _STARTUP_CACHE_BUST_TOKEN

    if isinstance(project_root, str):
        project_root = Path(project_root)
    dist_path = _resolve_dist_path(project_root, ui_path, artifact_path)
    if not dist_path.exists():
        logger.warning(
            "Web artifact '%s' for MCP app is missing; we'll "
            "serve a 'build not found' placeholder. Run "
            "`cd web && npm run build` and restart.",
            dist_path,
        )
        # Hash the placeholder we will actually serve. Same call
        # `ui_html` makes in this branch, so the cache-bust
        # token is derived from the bytes the host will see.
        placeholder = _build_not_found_html(f"{ui_name.title()} UI", ui_name)
        return hashlib.sha1(placeholder.encode()).hexdigest()[:12]
    return hashlib.sha1(dist_path.read_bytes()).hexdigest()[:12]


def compute_ui_cache_busts(
    caller_file: str,
    ui_app_paths: dict[str, str],
    ui_artifact_paths: dict[str, str],
) -> dict[str, str]:
    """Compute cache-bust tokens for a whole set of UIs.

    Intended to be called once at servicer setup time from
    generated `_add_mcp` code. Wraps project-root discovery and
    per-UI hashing so that any failure (e.g. a minimal container
    without `web/` or `.rbtrc` anywhere in the ancestor tree)
    falls back to the per-process `_STARTUP_CACHE_BUST_TOKEN` for
    every UI and logs a warning, rather than raising and blocking
    the application from starting.
    """
    try:
        project_root = find_project_root_from(caller_file)
    except RuntimeError as error:
        logger.warning(
            "UI cache-bust disabled: could not find project "
            "root from %s (%s). UIs will still serve, but host-"
            "side caches won't invalidate on rebuilds until the "
            "server restarts.",
            caller_file,
            error,
        )
        return {ui_name: _STARTUP_CACHE_BUST_TOKEN for ui_name in ui_app_paths}
    tokens: dict[str, str] = {}
    for ui_name, ui_path in ui_app_paths.items():
        try:
            tokens[ui_name] = compute_ui_cache_bust(
                project_root,
                ui_path,
                ui_name,
                ui_artifact_paths.get(ui_name),
            )
        except Exception as error:
            # A single misbehaving UI must not prevent the
            # servicer from registering. Fall back to the startup
            # token for just this UI.
            logger.warning(
                "UI cache-bust failed for '%s': %s; falling "
                "back to startup token.",
                ui_name,
                error,
            )
            tokens[ui_name] = _STARTUP_CACHE_BUST_TOKEN
    return tokens


# Server-local registry of cache-bust recompute inputs, keyed by
# MCP tool name. Populated by generated `_add_mcp` code via
# `register_ui_tool_for_cache_bust()` and read back by the
# patched `FastMCP.list_tools` in `reboot.mcp.factories` to
# refresh each UI tool's `resourceUri` on every tools/list call.
#
# Kept server-local (not in tool `_meta`) so internal bookkeeping
# never rides on the wire and the implementation doesn't depend
# on how MCP hosts treat unknown `_meta` keys.
#
# Tool names are unique per FastMCP server and MCP's protocol
# requires uniqueness across a server, so a flat dict keyed by
# tool name is safe even in the rare case of multiple FastMCP
# instances in one process.
_ui_tool_cache_bust_info: dict[str, dict[str, Any]] = {}


def register_ui_tool_for_cache_bust(
    tool_name: str,
    caller_file: str,
    ui_path: str,
    ui_name: str,
    artifact_path: str | None,
    uri_prefix: str,
) -> None:
    """Register the inputs needed to recompute `tool_name`'s
    cache-bust token later. Called from generated `_add_mcp`
    code right after each UI tool is registered with FastMCP.
    """
    _ui_tool_cache_bust_info[tool_name] = {
        "caller_file": caller_file,
        "ui_path": ui_path,
        "ui_name": ui_name,
        "artifact_path": artifact_path,
        "uri_prefix": uri_prefix,
    }


def find_ui_asset_info(ui_name: str) -> dict[str, Any] | None:
    """Find registry entry by `ui_name` (as opposed to tool name).

    Used by the MCP ASGI app's static-asset handler to map an
    incoming `/mcp/ui-assets/<ui_name>/...` URL back to the
    filesystem dist directory. Returns the first entry matching
    `ui_name`, or `None` if not registered.
    """
    for info in _ui_tool_cache_bust_info.values():
        if info.get("ui_name") == ui_name:
            return info
    return None


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
    cache_bust: str | None = None,
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
        cache_bust: Content-hash token from the incoming URI's
            trailing segment (the value `list_tools` computed
            via `compute_ui_cache_bust`). Used as an extra
            cache-key component so the per-process HTML cache
            invalidates when the dist artifact changes. Omit
            for ad-hoc callers that don't have a token.

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

    # Production mode. Two strategies, picked by the host's
    # User-Agent:
    #
    # * ChatGPT — emit a thin relay that nests an iframe
    #   pointing at `/mcp/ui-assets/<ui_name>/<cache_bust>/
    #   index.html`. The host caches the small, stable relay;
    #   each iframe mount fetches the nested URL fresh, busting
    #   past the host's resource cache after a rebuild + server
    #   restart (token rotates). Without this, ChatGPT will
    #   render stale bundles until the connector is re-added.
    # * Everyone else (Claude, MCPJam, …) — return the inlined
    #   bundle directly. These hosts either don't cache
    #   aggressively or invalidate on session reset, so the
    #   relay's extra round-trip isn't worth it.
    #
    # If the dist isn't present we serve the "build not found"
    # placeholder inline regardless of host.
    if project_root is None:
        project_root = _find_project_root()
    elif isinstance(project_root, str):
        project_root = Path(project_root)

    dist_path = _resolve_dist_path(project_root, ui_path, artifact_path)

    if dist_path.exists():
        if _host_needs_relay_iframe():
            return prod_loader_html(
                ui_name=ui_name,
                cache_bust=cache_bust or "",
                reboot_url=reboot_url,
            )
        return _read_and_inject(dist_path, reboot_url, ui_name, cache_bust)

    # No build found — show instructions.
    return _build_not_found_html(f"{ui_name.title()} UI", ui_name)


# One entry per (UI resource, content version); most apps have
# only a handful of UIs and one active version at a time.
@functools.lru_cache(maxsize=_MAX_UI_CACHE_ENTRIES)
def _read_and_inject(
    dist_path: Path,
    reboot_url: str,
    ui_name: str,
    cache_bust: str | None,
) -> str:
    """Read a build artifact and inject globals.

    The `cache_bust` parameter isn't read inside the function —
    it's part of the lru_cache key. Callers thread in the token
    from the incoming URI's trailing segment (computed by
    `list_tools` via `compute_ui_cache_bust`), so a changed dist
    file produces a changed token, which produces a cache miss,
    which reads the fresh bytes. Same content = same token =
    cache hit, no redundant reads.
    """
    del cache_bust  # Intentionally unused in the body.
    html = dist_path.read_text()
    return _inject_globals(html, reboot_url, ui_name)
