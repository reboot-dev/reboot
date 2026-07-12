"""UI HTML serving for MCP (HMR dev mode and production builds).

`ui_html` is the single entry point. What it returns depends on whether
we're in dev/HMR mode or serving a production build, and on which of
three MCP-client buckets is asking:

          | Claude             | ChatGPT           | Other
----------+--------------------+-------------------+-------------------
dev/HMR   | inline-from-Vite   | nested HMR iframe | nested HMR iframe
          | (dev_inline_html)  | (dev_iframe_html) | (dev_iframe_html)
----------+--------------------+-------------------+-------------------
prod      | inline bundle      | cache-busting     | inline bundle
(dist/)   | (_read_and_inject) | iframe            | (_read_and_inject)

The buckets and why they differ:

* **Claude.ai** ignores the `frameDomains` CSP, so can't serve iframes
  (https://github.com/anthropics/claude-ai-mcp/issues/54; see
  `host_supports_iframe`) — so it must render inline. Claude.ai (the
  website) and Claude Desktop are indistinguishable to the server, so
  are treated the same. Claude re-lists tools per session, so the
  resource-URI cache-bust token (`compute_ui_cache_bust`) keeps prod
  fresh.
* **ChatGPT** renders iframes but lists tools (which discovers resource
  URIs) once at install and never re-lists, so the cache-bust token
  never reaches it (see `host_needs_cache_busting_iframe`). In dev it
  gets the ordinary nested HMR iframe (`dev_iframe_html`) — HMR, not the
  token, keeps it fresh. In prod it gets a cache-busting iframe
  (`cache_busting_iframe_html`): a thin, stable outer iframe whose inner
  URL (`/mcp/ui-assets/<ui>/<bust>/index.html`) is re-fetched on every
  mount, sidestepping the resource cache it never invalidates.
* **Other** — assumed iframe-capable AND assumed to re-list per session,
  so the plain cache-bust token keeps them fresh and they need no
  cache-busting iframe. Dev: the nested HMR iframe (`dev_iframe_html`).
  Prod: the inline bundle (`_read_and_inject`).

Why the nested HMR iframe is the dev default (and inline only Claude's
fallback): the iframe *navigates* to the Reboot origin, so HMR and the
page's own relative/absolute URLs resolve there, which works even
through ngrok's free tier, which serves an interstitial. The inline
path's rewritten URLs become cross-origin fetches that trigger that
interstitial on ngrok's free tier, so the page fails to load.
"""

import contextvars
import functools
import hashlib
import inspect
import json
import logging
import os
import re
import urllib.request
import uuid
from pathlib import Path
from reboot.api import snake_to_camel
from reboot.mcp.iframe import (
    cache_busting_iframe_html,
    dev_iframe_html,
    host_needs_cache_busting_iframe,
    host_supports_iframe,
)
from reboot.settings import (
    ENVVAR_RBT_FRONTEND_DIST_PATH,
    ENVVAR_RBT_FRONTEND_HOST,
    ENVVAR_RBT_FRONTEND_ROOT_PATH,
)
from typing import Any, Optional
from urllib.parse import urlparse

logger = logging.getLogger(__name__)

# Max number of UI resources to cache (project root lookups and
# production HTML reads). Most apps have only a handful of UIs.
_MAX_UI_CACHE_ENTRIES = 16

# Per-process random token used as the cache-bust signature in
# HMR mode (`--config=hmr` / `--config=default`, i.e. when
# ENVVAR_RBT_FRONTEND_HOST is set). `dev_inline_html`
# bootstraps content live from the Vite dev server, so there
# is nothing on disk to hash; a per-process UUID gives host-
# side caches a fresh URI on every server restart, which
# matches the "restart to refresh" dev loop. Vite content
# changes within a session flow over the HMR WebSocket and
# never touch the MCP layer, so a stable URI within a session
# is correct. Computed once at module import.
_STARTUP_CACHE_BUST_TOKEN = uuid.uuid4().hex[:12]

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
    """Walk up from `caller_file` to find a directory with `.rbtrc`.

    Exported so generated code can resolve the project root from its own
    `__file__` without relying on caller-frame inspection.
    """
    # Resolve the project root from the module's *logical* location —
    # where it sits in the project layout — not the physical location of
    # its bytes. We use `absolute()` (which leaves symlinks intact)
    # rather than `resolve()` (which canonicalizes through them). The
    # upward walk is lexical regardless; only the starting path differs.
    # Following symlinks would answer the wrong question: a module's
    # bytes can live in a tree unrelated to its project (e.g. under
    # Bazel the module is a runfiles symlink into `bazel-out`, where no
    # `.rbtrc` exists, while `.rbtrc` sits beside it in runfiles).
    # `.exists()` below still follows symlinks, so a symlinked `.rbtrc`
    # marker is found correctly.
    current = Path(caller_file).absolute().parent
    while True:
        if (current / ".rbtrc").exists():
            return current
        if current.parent == current:
            break
        current = current.parent

    raise RuntimeError("Could not find project root (directory with `.rbtrc`)")


# Does not need to be cached, because its only expensive call
# (`find_project_root_from`) is already cached.
def _find_project_root() -> Path:
    """Find project root by walking up from caller's file location.

    Looks for a directory containing `.rbtrc`.
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


# The fixed URL prefix under which the frontend — its dev server or its
# built assets — is served, hardcoded identically in the Envoy route,
# that route's Lua tagging filter, the iframe loader, and the generated
# Vite `base`. It's a stable mount point, independent of which directory
# the frontend happens to live in on disk.
_FRONTEND_URL_PREFIX = "/__/frontend"


def _frontend_root_path() -> str:
    """The project-relative directory that is the frontend root: the
    prefix to strip off a project-relative `UI(path=...)` to get the
    UI's address within the frontend. Always named explicitly via
    `--frontend-root-path`, which is required alongside both
    `--frontend-host` (dev/HMR) and `--frontend-dist-path` (dist).
    Empty when unset. Surrounding slashes are stripped, so a flag
    value like `frontend/` still matches project-relative
    `UI(path=...)` values.
    """
    return (os.environ.get(ENVVAR_RBT_FRONTEND_ROOT_PATH) or "").strip("/")


def _ui_address(ui_path: str) -> str:
    """A UI's address within the frontend: its project-relative
    `UI(path=...)` with the frontend-root prefix stripped off the front.
    This is the segment that follows the `/__/frontend/` URL prefix and
    sits under the dist directory.
    """
    root = _frontend_root_path()
    if root and (ui_path == root or ui_path.startswith(root + "/")):
        return ui_path[len(root):].lstrip("/")
    return ui_path


def _resolve_dev_ui_paths(ui_path: str) -> tuple[str, str]:
    """Compute the dev-server URL prefix and the UI's served URL path.

    Returns `(vite_base, ui_url_path)`:

    * `vite_base` is the fixed `/__/frontend` URL prefix the dev server
      prepends to its own asset URLs (`@vite/client`, dep chunks, ...);
      Envoy routes that same prefix to the dev server and the generated
      Vite `base` matches it.
    * `ui_url_path` is the path (rooted at the Reboot origin) at which
      the dev server serves this UI's `index.html` directory:
      `<vite_base>/<ui-address>`.
    """
    return (
        _FRONTEND_URL_PREFIX,
        f"{_FRONTEND_URL_PREFIX}/{_ui_address(ui_path)}",
    )


def _resolve_dist_path(
    project_root: Path,
    ui_path: str,
    artifact_path: str | None,
) -> Optional[Path]:
    """Resolve the production-build `index.html` path for a UI.

    The built assets live under `--frontend-dist-path` at the UI's
    address within the frontend — i.e. `ui_path` with the explicit
    `--frontend-root-path` prefix stripped. For example, with
    `--frontend-dist-path` "frontend/dist", `--frontend-root-path`
    "frontend", and `ui_path` "frontend/mcp/clicker", the build is at
    "frontend/dist/mcp/clicker/index.html". `artifact_path`, when
    given, overrides this with an explicit project-relative directory.

    Returns `None` when neither `artifact_path` nor
    `--frontend-dist-path` names a directory to serve builds from: the
    only path that could be resolved then is the UI's unbuilt source
    `index.html` under the project root.
    """
    if artifact_path is not None:
        return project_root / artifact_path / "index.html"
    dist = os.environ.get(ENVVAR_RBT_FRONTEND_DIST_PATH)
    if not dist:
        return None
    return project_root / dist / _ui_address(ui_path) / "index.html"


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
    `tools/list` and never re-lists, so this cache token rotation is
    invisible to it; see `host_needs_cache_busting_iframe` for the
    workaround.

    We are in one of the following three modes:

    1. **HMR mode** (`ENVVAR_RBT_FRONTEND_HOST` set). `ui_html`
       serves Vite's live HTML — via `dev_iframe_html` or
       `dev_inline_html`, depending on the host — so there's
       nothing on disk to hash. Returns `_STARTUP_CACHE_BUST_TOKEN`,
       a per-process UUID, so each server restart busts host caches
       once.

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
    if os.environ.get(ENVVAR_RBT_FRONTEND_HOST):
        return _STARTUP_CACHE_BUST_TOKEN

    if isinstance(project_root, str):
        project_root = Path(project_root)
    dist_path = _resolve_dist_path(project_root, ui_path, artifact_path)
    if dist_path is None or not dist_path.exists():
        if dist_path is None:
            logger.warning(
                "`--frontend-dist-path` is not set, so there is no "
                f"directory to serve the '{ui_name}' UI's build "
                "from; we'll serve a 'build not found' placeholder."
            )
        else:
            root_path = (
                os.environ.get(ENVVAR_RBT_FRONTEND_ROOT_PATH) or "frontend"
            )
            logger.warning(
                f"Web artifact '{dist_path}' for MCP app is missing; "
                "we'll serve a 'build not found' placeholder. Run "
                f"`cd {root_path} && npm run build` and restart."
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
    without `.rbtrc` anywhere in the ancestor tree)
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
    root_path = os.environ.get(ENVVAR_RBT_FRONTEND_ROOT_PATH) or "frontend"
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
        <p>Run: <code>cd {root_path} && npm install && npm run build</code></p>
    </div>
</body>
</html>'''


# Free-tier ngrok tunnels are served from `<subdomain>.ngrok-free.app`,
# paid tunnels use a different domain.
_NGROK_FREE_HOST_SUFFIX = ".ngrok-free.app"


def _is_ngrok_free_url(url: str) -> bool:
    """True if `url`'s host is a free-tier ngrok tunnel."""
    host = (urlparse(url).hostname or "").lower()
    return host.endswith(_NGROK_FREE_HOST_SUFFIX)


_CLAUDE_NGROK_ERROR_HTML_PATH = (
    Path(__file__).parent / "claude_ngrok_error.html"
)


@functools.lru_cache(maxsize=1)
def _build_claude_ngrok_free_error_html() -> str:
    """
    Branded error page for the Claude + free-ngrok dead end.

    Claude renders dev UIs inline because it can't host an iframe (see
    `dev_inline_html`). The inline page's assets are fetched
    cross-origin from the Reboot server, and ngrok's free tier answers
    those fetches with its browser interstitial instead of the real
    bytes, so the UI never loads. We surface a clear explanation instead
    of a blank frame.
    """
    return _CLAUDE_NGROK_ERROR_HTML_PATH.read_text(encoding="utf-8")


def dev_inline_html(
    ui_path: str,
    reboot_url: str,
    ui_name: str,
    frontend_host: str,
    project_root: Path,
) -> str:
    """
    Return the HTML that the Vite dev server is serving, by fetching it
    from Vite. The goal is to give the developer Hot Module Reloading
    (HMR).

    This is the **Claude.ai** dev render path. Claude.ai ignores the
    `frameDomains` CSP and so can't render our nested relay iframe
    (https://github.com/anthropics/claude-ai-mcp/issues/54), so instead
    of an iframe (see `dev_iframe_html`, used for every other client)
    we return the page's HTML inline.

    Why not serve inline to *everyone* and drop the iframe entirely?
    Because the inline path is fragile behind tunnels that gate traffic
    on an interstitial. Once we rewrite the document's URLs to the
    Reboot origin (below), they become cross-origin relative to the
    sandbox-proxy document, so the browser issues plain cross-origin
    fetches for `@vite/client`, the user's modules, and assets. ngrok's
    free tier answers the first such fetch with its HTML interstitial
    rather than the real bytes, and the page fails to load. The nested
    iframe avoids this: it *navigates* to the Reboot-origin URL (which
    clears the interstitial for that frame) instead of fetching
    cross-origin from a foreign document. So the iframe is the default
    and this inline path is only the fallback for hosts that can't host
    an iframe at all.

    To do HMR without an iframe, we must fetch Vite's served HTML and
    rewrite its URLs to be absolute Reboot-origin URLs so the MCP host
    can render the page directly (no nested iframe). We hand the MCP
    host the exact bytes Vite would have served — react-refresh shim,
    `@vite/client`, the user's `index.html` body — and rewrite every URL
    in the document so it points at `{reboot_url}/__/<base>/...`, which
    Envoy proxies to Vite. HMR works because `@vite/client` computes the
    WebSocket URL from its own `import.meta.url`, which (post-rewrite)
    lands on the Reboot origin.

    The dev server must be configured with `allowedHosts: true` and
    `cors: { origin: true }` so it accepts the cross-origin fetches the
    rewritten URLs produce (the document's origin is the MCP
    sandbox-proxy, not the Reboot origin).

    A `<base href>` would have been the natural fix to avoid needing
    rewrites, but MCP Apps' sandbox-proxy ships a CSP with `base-uri
    'none'` that rejects it outright.
    """
    # Claude + free ngrok is a dead end. Show an explanation rather than
    # a blank frame.
    if _is_ngrok_free_url(reboot_url):
        return _build_claude_ngrok_free_error_html()

    # `vite_base` is the prefix Vite prepends to its own asset URLs;
    # `ui_url_path` is where Vite serves this UI's `index.html`
    # directory. See `_resolve_dev_ui_paths` (incl. its `base`
    # assumption).
    vite_base, ui_url_path = _resolve_dev_ui_paths(ui_path)

    # This fetch goes straight to the Vite dev server, bypassing Envoy —
    # there's no point routing the server-side request through our own
    # proxy.
    fetch_url = f"{frontend_host.rstrip('/')}{ui_url_path}/index.html"
    request = urllib.request.Request(fetch_url)
    with urllib.request.urlopen(request) as response:
        html = response.read().decode("utf-8")

    # Two rewrites cover everything Vite emits:
    #
    # * `"<base>/...` -> `"{reboot_url}<base>/...` catches every URL
    #   prefixed by Vite's `base` (so `@vite/client`, `@react-refresh`,
    #   dep chunks, CSS, fonts, ...). It also catches the import
    #   specifier inside Vite's inline `<script type="module">import ...
    #   from "<base>/@react-refresh"</script>` because that's just a
    #   quoted path inside JS source — same shape as an HTML attribute
    #   value.
    # * `"./...` -> `"{reboot_url}<ui_url_path>/...` catches the user's
    #   relative module imports in their `index.html` (e.g. `<script
    #   src="./main.tsx">`); those resolve inside the UI's own
    #   directory, which Vite serves at `<base>/<ui-path-within-root>`.
    #
    # Both quote styles are handled since either is valid in HTML
    # attributes and JS string literals.
    for quote in ('"', "'"):
        html = html.replace(
            f'{quote}{vite_base}/', f'{quote}{reboot_url}{vite_base}/'
        )
        html = html.replace(f'{quote}./', f'{quote}{reboot_url}{ui_url_path}/')
    return _inject_globals(html, reboot_url, ui_name)


def ui_html(
    ui_path: str,
    reboot_url: str,
    ui_name: str,
    project_root: Path | str | None = None,
    artifact_path: str | None = None,
    cache_bust: str | None = None,
) -> str:
    """Get HTML for a UI.

    In dev mode (`--frontend-host`), serves Vite's live HTML
    for HMR: inline with rewritten URLs for Claude.ai (see
    `dev_inline_html`) or wrapped in a nested relay iframe for
    every other client (see `dev_iframe_html`). In production,
    returns pre-built HTML — either inlined for hosts that
    re-list per session or wrapped in a cache-busting iframe for
    ChatGPT (see `cache_busting_iframe_html`).

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
            looking for `.rbtrc`.
        artifact_path: Override for the build artifact path,
            relative to project root. Defaults to
            `<--frontend-dist-path>/<ui-address>` (e.g. dist
            path "web/dist" and "web/ui/clicker" ->
            "web/dist/ui/clicker"); see `_resolve_dist_path`.
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
    #     "null"). See `iframe.py` for details.
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

    # Resolve the project root up front: production serving joins it
    # with `--frontend-dist-path` to locate the built `index.html`, and
    # the dev-inline path reads from it too. `_find_project_root` walks
    # up from the caller's file, so it must be called directly from
    # `ui_html`.
    if project_root is None:
        project_root = _find_project_root()
    elif isinstance(project_root, str):
        project_root = Path(project_root)

    frontend_host = os.environ.get(ENVVAR_RBT_FRONTEND_HOST)
    if frontend_host:
        # Dev mode: deliver hot module reloading. Two strategies, picked
        # by whether the host can render iframes:
        #
        # * Hosts that can render iframes (the default) load a Vite page
        #   through Envoy on the Reboot origin (`dev_iframe_html`). This
        #   is preferred because the iframe *navigates* to that origin,
        #   so it also works through ngrok's free tier, which gates
        #   traffic on an interstitial.
        # * Hosts that can't (e.g. claude.ai) get Vite's HTML inline
        #   (`dev_inline_html`), with its URLs rewritten to the Reboot
        #   origin. This is the fallback, not the default: those
        #   rewritten URLs turn into cross-origin fetches, which an
        #   interstitial-gating tunnel (ngrok free) answers with its
        #   interstitial instead of the real bytes, so the page fails to
        #   load. See `dev_inline_html` for the full explanation.
        if host_supports_iframe():
            _, ui_url_path = _resolve_dev_ui_paths(ui_path)
            return dev_iframe_html(ui_url_path, reboot_url, ui_name)
        return dev_inline_html(
            ui_path,
            reboot_url,
            ui_name,
            frontend_host,
            project_root,
        )

    # Production mode. Deliver static content from the `dist` folder,
    # but do ensure the content is updated when the application is
    # updated.

    # If the dist isn't present we serve the "build not found"
    # placeholder inline regardless of host.
    dist_path = _resolve_dist_path(project_root, ui_path, artifact_path)
    if dist_path is None or not dist_path.exists():
        # No build found — show instructions.
        return _build_not_found_html(f"{ui_name.title()} UI", ui_name)

    if host_needs_cache_busting_iframe():
        # Hosts that don't notice a change of resource URI (ChatGPT) and
        # thereby don't respond to our cache busting - for these we emit
        # a thin static "cache-busting iframe" that points at
        # `/mcp/ui-assets/<ui_name>/<cache_bust>/index.html`. The host
        # caches the small, stable outer iframe; each mount fetches the
        # nested URL fresh, avoiding the host's resource cache entirely.
        # Without this, ChatGPT would render stale UIs until the app is
        # removed and re-added.
        return cache_busting_iframe_html(
            ui_name=ui_name,
            cache_bust=cache_bust or "",
            reboot_url=reboot_url,
        )

    # Everyone else (Claude, MCPJam, ...) — return the inlined bundle
    # directly. These hosts either don't cache aggressively or notice a
    # change of resource URI (e.g. because of our cache busting) on
    # session reset.
    return _read_and_inject(dist_path, reboot_url, ui_name, cache_bust)


# One entry per (UI resource, content version); most apps have only a
# handful of UIs and one active version at a time.
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


def camelize_request_payload(value: Any) -> Any:
    """Recursively convert snake_case dict keys to camelCase.

    Produces the protobuf-canonical JSON shape for a validated
    `request: <Model>` payload — i.e., `primary_color` becomes
    `primaryColor`, matching the protobuf-es generated TypeScript
    field names that customer components are typed against.
    Pydantic's `model_dump(mode='json')` defaults to Python
    attribute names (snake_case), so without this step a UI request
    field named `personalized_message` would land as
    `personalized_message` on the React side while the TS type
    expected `personalizedMessage`, and the prop would silently be
    undefined. Recurses through lists and nested dicts so nested
    Models in the request payload convert too.
    """
    if isinstance(value, dict):
        return {
            snake_to_camel(key): camelize_request_payload(inner)
            for key, inner in value.items()
        }
    if isinstance(value, list):
        return [camelize_request_payload(item) for item in value]
    return value
