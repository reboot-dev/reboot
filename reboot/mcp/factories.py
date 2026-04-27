"""MCP factory for creating ASGI apps.

Provides a factory function that creates MCP ASGI apps for
Reboot applications.
"""

import anyio
import logging
import mcp.types
from log.log import log_at_most_once_per
from mcp.server.auth.middleware.bearer_auth import BearerAuthBackend
from mcp.server.fastmcp import FastMCP
from mcp.server.lowlevel.helper_types import ReadResourceContents
from mcp.server.streamable_http import StreamableHTTPServerTransport
from reboot.aio.external import ExternalContext
from reboot.mcp.context import (
    _REBOOT_CONTEXT_KEY,
    _get_user_id,
    _init_session_state,
    _set_user_id,
)
from reboot.mcp.proxy import _UI_ASSETS_PREFIX
from reboot.mcp.ui import (
    _request_user_agent,
    _resolve_dist_path,
    _resource_meta,
    _ui_tool_cache_bust_info,
    compute_ui_cache_bust,
    find_project_root_from,
    find_ui_asset_info,
)
from starlette.requests import Request
from starlette.responses import FileResponse, JSONResponse, Response
from starlette.types import Receive, Scope, Send
from typing import Any, Awaitable, Callable, Optional, Sequence
from urllib.parse import unquote

logger = logging.getLogger(__name__)

# Silence chatty INFO-level logs from the MCP library
# (e.g. "Terminating session: ...").
logging.getLogger("mcp.server").setLevel(logging.WARNING)

# ---------------------------------------------------------------------------
# Patch `FastMCP.read_resource` for dynamic CSP metadata.
#
# ext-apps UI resources require per-response CSP metadata
# (`_meta.ui.csp`) so the host knows which origins to allow in
# the sandbox iframe (see `McpUiResourceCsp` in
# `@modelcontextprotocol/ext-apps`). The CSP domains must
# include the Reboot server URL, which is derived from the
# request's `Host` header and isn't known until the resource is
# actually read.
#
# FastMCP only supports *static* metadata via
# `@mcp.resource(meta=...)`, set once at registration time. Its
# `read_resource()` hardcodes `meta=resource.meta` — there is
# no hook to inject per-request metadata.
#
# The workaround: `ui_html()` sets a contextvar with the
# request-specific CSP metadata. This wrapper reads that
# contextvar after the original handler returns and injects it
# into the response.
#
# Patched at the class level (before any `FastMCP` instances are
# created) so that `FastMCP.__init__` / `_setup_handlers`
# captures the patched version automatically — no need to
# re-register with the low-level server after construction.
# ---------------------------------------------------------------------------

_original_read_resource = FastMCP.read_resource


async def _read_resource_with_dynamic_meta(
    self: FastMCP,
    uri: str,
) -> list[ReadResourceContents]:
    # Reset before calling the handler so stale metadata
    # from a previous request is never carried over.
    _resource_meta.set(None)
    results: list[ReadResourceContents] = list(
        await _original_read_resource(self, uri)
    )
    meta = _resource_meta.get()
    if meta is not None:
        # Override (not merge): each resource handler sets
        # its own complete metadata via the contextvar, so
        # there is nothing to merge with.
        for r in results:
            r.meta = meta
    return results


FastMCP.read_resource = _read_resource_with_dynamic_meta  # type: ignore[method-assign]

# ---------------------------------------------------------------------------
# Patch `FastMCP.list_tools` to recompute UI cache-bust tokens on
# each call so clients that re-list tools on new sessions (Claude,
# MCPJam) pick up dist-file changes without requiring a server
# restart.
#
# Each UI tool's recompute inputs live in the server-local
# `_ui_tool_cache_bust_info` registry in `reboot.mcp.ui`,
# populated by generated `_add_mcp` code via
# `register_ui_tool_for_cache_bust`. On every `tools/list`, we
# look up each tool by name, re-hash the current dist artifact,
# and rewrite `_meta.ui.resourceUri` with the fresh token.
# ChatGPT doesn't re-list so it doesn't benefit here — but for
# clients that do, this turns the `--config=dist` dev loop from
# "edit, build, restart, test" into "edit, build, new session".
#
# The registry is intentionally kept server-local rather than
# stashed in tool `_meta`: the client never sees our internal
# bookkeeping, and correctness doesn't depend on how MCP hosts
# treat unknown `_meta` keys.
#
# Failures during recompute are swallowed (the existing URI
# stays) so `tools/list` never breaks over a cache-bust issue.
# ---------------------------------------------------------------------------

_original_list_tools = FastMCP.list_tools


async def _list_tools_with_fresh_cache_busts(
    self: FastMCP,
) -> list[mcp.types.Tool]:
    tools = await _original_list_tools(self)
    for tool in tools:
        info = _ui_tool_cache_bust_info.get(tool.name)
        if info is None:
            continue
        try:
            project_root = find_project_root_from(info["caller_file"])
            token = compute_ui_cache_bust(
                project_root,
                info["ui_path"],
                info["ui_name"],
                info.get("artifact_path"),
            )
        except Exception:
            # Keep the existing URI baked in at registration.
            # A `tools/list` response must never fail just
            # because a cache-bust refresh couldn't resolve.
            continue
        meta = tool.meta
        if not isinstance(meta, dict):
            continue
        ui_meta = meta.get("ui")
        if isinstance(ui_meta, dict):
            ui_meta["resourceUri"] = info["uri_prefix"] + token
    return tools


FastMCP.list_tools = _list_tools_with_fresh_cache_busts  # type: ignore[method-assign]


async def _serve_ui_asset(
    scope: Scope,
    receive: Receive,
    send: Send,
    path: str,
) -> None:
    """Serve a file from a UI's dist directory.

    Called for requests matching `/ui-assets/<ui_name>/<cache_bust>/<rest>`.
    The `<cache_bust>` segment is part of the URL identity (so
    browser HTTP caches invalidate when it rotates) but is
    otherwise ignored server-side — the actual bytes come from
    the current filesystem. Looks up `<ui_name>` in the
    `_ui_tool_cache_bust_info` registry to find the project
    root and ui_path, resolves the dist directory via
    `_resolve_dist_path`, and serves `<rest>` (defaulting to
    `index.html` if empty) from inside that directory.

    Returns 404 if the UI isn't registered, the file isn't in
    the dist, or the resolved path escapes the dist directory.
    """

    async def reject(reason: str) -> None:
        # Reason is for the server log only; never echoed in
        # the response body, since these can leak filesystem
        # layout and registry contents.
        logger.debug("ui-assets 404: %s (path=%s)", reason, path)
        await Response(status_code=404)(scope, receive, send)

    # Parse: `<_UI_ASSETS_PREFIX><ui_name>/<cache_bust>/<rest>`.
    parts = path[len(_UI_ASSETS_PREFIX):].split("/", 2)
    if len(parts) < 2:
        await reject("bad ui-assets path")
        return
    ui_name = unquote(parts[0])
    # `parts[1]` is the cache-bust segment; intentionally
    # unused for lookup — it exists purely for URL-identity
    # cache-busting.
    rest = parts[2] if len(parts) == 3 else "index.html"

    info = find_ui_asset_info(ui_name)
    if info is None:
        await reject(f"unknown ui: {ui_name}")
        return

    try:
        project_root = find_project_root_from(info["caller_file"])
    except RuntimeError:
        await reject("project root missing")
        return

    # Dist directory = parent of the `index.html` path that
    # `_resolve_dist_path` returns.
    dist_index = _resolve_dist_path(
        project_root, info["ui_path"], info.get("artifact_path")
    )
    dist_dir = dist_index.parent
    # Defend against path traversal: the resolved file must
    # live under `dist_dir`.
    resolved = (dist_dir / rest).resolve()
    try:
        resolved.relative_to(dist_dir.resolve())
    except ValueError:
        await reject("path escape")
        return

    if not resolved.is_file():
        await reject(f"not found: {rest}")
        return

    # Short-lived freshness: the URL path already varies by
    # `cache_bust`, so immutable caching is safe. But keep it
    # conservative for now (dev-mode iteration without restart
    # could still matter).
    response = FileResponse(
        path=str(resolved),
        headers={"Cache-Control": "no-cache"},
    )
    await response(scope, receive, send)


def create_mcp_factory(
    *,
    server: FastMCP,
    new_session_hooks: Sequence[Callable[[ExternalContext, Optional[str]],
                                         Awaitable[None]]],
    token_verifier: Optional[Any],
) -> Callable[
    [Callable[[Request], Any]],
    Callable[[Scope, Receive, Send], Any],
]:
    """Create a factory for mounting MCP on a Reboot app.

    Args:
        server: A pre-configured `FastMCP` server with
            tools/resources already registered.
        new_session_hooks: Async callables to invoke when a new
            MCP session starts (e.g. to auto-construct state). Arguments
           passed: (external_context, user_id_or_none).
        token_verifier: Optional MCP SDK `TokenVerifier`
            (from `mcp.server.auth.provider`). When set, it can reject
            requests with missing or expired bearer tokens with an HTTP
            401 code before reaching the MCP protocol layer (after which
            every failure is an internal server error).
    """

    def factory(
        external_context_from_request: Callable[[Request], ExternalContext],
    ) -> Callable[[Scope, Receive, Send], Any]:
        """Create ASGI app with MCP tools."""
        ui_id = server.name or "mcp"
        logger.debug(f"[{ui_id}] Creating MCP ASGI app")

        has_mcp_tools = len(server._tool_manager.list_tools()) > 0

        @server._mcp_server.set_logging_level()
        async def handle_set_logging_level(
            level: mcp.types.LoggingLevel
        ) -> mcp.types.EmptyResult:
            # This method is here to silence an error that e.g. MCPJam
            # gets when trying to call `logging/setLevel` when it first
            # connects to an MCP server.
            #
            # TODO: do we want to actually adjust the log level in some
            # way?
            pass

        async def mcp_asgi_app(
            scope: Scope, receive: Receive, send: Send
        ) -> None:
            # Static-asset branch: serve the UI's dist files
            # directly from disk for production-mode MCP Apps.
            # The path shape, set by `prod_loader_html`, is
            # `/mcp<_UI_ASSETS_PREFIX><ui_name>/<cache_bust>/<rest>`.
            # Handled before any MCP-protocol logic (including
            # bearer-token auth) so the iframe, which has no
            # credentials, can load the bundle freely.
            #
            # Starlette mounts may or may not strip the mount
            # prefix depending on wiring; accept both forms.
            raw_path = scope.get("path", "")
            idx = raw_path.find(_UI_ASSETS_PREFIX)
            if idx != -1:
                subpath = raw_path[idx:]
                await _serve_ui_asset(scope, receive, send, subpath)
                return

            request = Request(scope, receive, send)

            # Publish the incoming User-Agent so `ui_html()` can
            # branch on host identity (ChatGPT gets the relay
            # iframe; others get the inlined bundle). Set here,
            # before handing off to the MCP transport, so the
            # contextvar is captured into downstream tasks.
            _request_user_agent.set(request.headers.get("user-agent"))

            # If no tools are registered, there is nothing useful for an
            # MCP client to do.
            if not has_mcp_tools:
                NO_TOOLS_MESSAGE = (
                    "MCP client correctly connected, but no auto-constructed "
                    "state type or MCP-enabled method was found in the API."
                )
                log_at_most_once_per(
                    seconds=300,
                    log_method=logger.error,
                    message=NO_TOOLS_MESSAGE,
                )
                response = JSONResponse(
                    status_code=501,
                    content={
                        "error": "no_mcp_tools",
                        "message": NO_TOOLS_MESSAGE,
                    },
                )
                await response(scope, receive, send)
                return

            # Validate the bearer token early — before session hooks or
            # MCP transport — so expired or invalid tokens get a proper
            # HTTP 401 with `WWW-Authenticate` instead of a 500 later.
            authenticated_user_id = None
            if token_verifier is not None:
                backend = BearerAuthBackend(token_verifier)
                # `authenticate` returns a Starlette `(AuthCredentials,
                # BaseUser)` tuple, or `None` on failure. We only need
                # the user object (`[1]`) — `[0]` holds scopes which we
                # don't use.
                credentials = await backend.authenticate(request)
                if (
                    credentials is None or not credentials[1].is_authenticated
                ):
                    # Return a 401 with a `WWW-Authenticate: Bearer`
                    # challenge. `invalid_token` is the standard error
                    # code defined by RFC 6750 Section 3.1 for expired,
                    # revoked, or malformed tokens. Per RFC 9728,
                    # include `resource_metadata` so clients can
                    # discover where to authenticate.
                    base = str(request.base_url).rstrip("/")
                    resource_metadata_url = (
                        f"{base}/.well-known/oauth-protected-resource"
                    )
                    response = JSONResponse(
                        status_code=401,
                        content={"error": "invalid_token"},
                        headers={
                            "WWW-Authenticate":
                                "Bearer "
                                'error="invalid_token", '
                                f'resource_metadata="{resource_metadata_url}"'
                        },
                    )
                    await response(scope, receive, send)
                    return
                # Extract `user_id` from the authenticated credentials.
                # `BearerAuthBackend` sets `username` to the
                # AccessToken's `client_id`, which our adapter sets to
                # the JWT `sub` claim (the user ID).
                authenticated_user_id = (  # noqa: F841
                    credentials[1].username or None
                )

            # We replicate the MCP SDK's `StreamableHTTPSessionManager`
            # logic here so that we can detect when a new session starts
            # (first request without an `Mcp-Session-Id` header) and run
            # auto-construction hooks before any tools execute. The
            # SDK's manager provides no callback or hook for this.
            session_id, is_new_session = (_init_session_state(request))

            # Store the authenticated user ID (if any) on
            # `request.state` so MCP tools can access it via
            # `get_mcp_user_id()`.
            if authenticated_user_id is not None:
                _set_user_id(request, authenticated_user_id)

            # Inject Reboot context into `request.state`. Accessible in
            # MCP tools via `ctx.request_context.request.state`.
            external_context = external_context_from_request(request)
            setattr(
                request.state,
                _REBOOT_CONTEXT_KEY,
                external_context,
            )

            # On new sessions, auto-construct `User` state if we have an
            # authenticated user. We do this only when a new session
            # starts; that's an optimization - it would be safe to e.g.
            # do it for every tool call, but that would ~double the
            # number of operations for every tool call.
            if is_new_session:
                user_id = _get_user_id(request)
                for hook in new_session_hooks:
                    await hook(external_context, user_id)

            logger.debug(f"[{ui_id}] {request.method} {request.url.path}")

            # Per-request task group — clean lifecycle, no
            # zombie tasks.
            async with anyio.create_task_group() as tg:
                transport = StreamableHTTPServerTransport(
                    mcp_session_id=session_id,
                    is_json_response_enabled=False,
                    event_store=None,
                )

                # Make session validation lenient: return
                # the session ID in responses (so clients
                # can send it back) but don't reject
                # requests that omit it. Some MCP clients
                # (e.g. "claude.ai") send notifications
                # from a separate internal service that
                # doesn't propagate the session ID.
                async def _lenient_validate_session(request, send):
                    return True

                transport._validate_session = (  # type: ignore[assignment]
                    _lenient_validate_session
                )

                async def run_server(
                    *,
                    task_status: anyio.abc.
                    TaskStatus[None] = (anyio.TASK_STATUS_IGNORED),
                ) -> None:
                    async with transport.connect() as streams:
                        read_stream, write_stream = streams
                        task_status.started()
                        try:
                            await server._mcp_server.run(
                                read_stream,
                                write_stream,
                                server._mcp_server.
                                create_initialization_options(),
                                stateless=True,
                            )
                        except Exception as e:
                            logger.error(
                                f"[{ui_id}] MCP server "
                                f"error: {e}",
                                exc_info=True,
                            )

                await tg.start(run_server)
                await transport.handle_request(scope, receive, send)
                await transport.terminate()

        return mcp_asgi_app

    return factory
