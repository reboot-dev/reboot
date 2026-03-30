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
from reboot.mcp.ui import _resource_meta
from starlette.requests import Request
from starlette.responses import JSONResponse
from starlette.types import Receive, Scope, Send
from typing import Any, Awaitable, Callable, Optional, Sequence

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
            request = Request(scope, receive, send)

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
