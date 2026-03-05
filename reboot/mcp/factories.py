"""MCP factory for creating ASGI apps.

Provides a factory function that creates MCP ASGI apps for
Reboot applications.
"""

import anyio
import logging
from log.log import log_at_most_once_per
from mcp.server.fastmcp import FastMCP
from mcp.server.lowlevel.helper_types import ReadResourceContents
from mcp.server.streamable_http import StreamableHTTPServerTransport
from reboot.aio.external import ExternalContext
from reboot.mcp.context import (
    _MCP_NEW_SESSION_KEY,
    _REBOOT_CONTEXT_KEY,
    _set_session_id,
)
from reboot.mcp.ui import _resource_meta
from starlette.requests import Request
from starlette.responses import JSONResponse
from starlette.types import Receive, Scope, Send
from typing import Any, Awaitable, Callable, Sequence

logger = logging.getLogger(__name__)

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
    new_session_hooks: Sequence[Callable[[ExternalContext, str],
                                         Awaitable[None]]],
) -> Callable[
    [Callable[[Request], Any]],
    Callable[[Scope, Receive, Send], Any],
]:
    """Create a factory for mounting MCP on a Reboot app.

    Args:
        server: A pre-configured `FastMCP` server with
            tools/resources already registered.
        new_session_hooks: Async callables to invoke when a
            new MCP session starts (e.g. to auto-construct state).
            Arguments passed: an external context, and the new MCP
            session's ID.
    """

    def factory(
        external_context_from_request: Callable[[Request], ExternalContext],
    ) -> Callable[[Scope, Receive, Send], Any]:
        """Create ASGI app with MCP tools."""
        ui_id = server.name or "mcp"
        logger.info(f"[{ui_id}] Creating MCP ASGI app")

        has_mcp_tools = len(server._tool_manager.list_tools()) > 0

        async def mcp_asgi_app(
            scope: Scope, receive: Receive, send: Send
        ) -> None:
            request = Request(scope, receive, send)

            # If no tools are registered, there is nothing useful for an
            # MCP client to do.
            if not has_mcp_tools:
                NO_TOOLS_MESSAGE = (
                    "MCP client correctly connected, but no `Chat` type or "
                    "MCP-enabled method was found in the API."
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

            session_id = _set_session_id(request)

            # Inject Reboot context into `request.state`.
            # Accessible in MCP tools via
            # `ctx.request_context.request.state`.
            ext_ctx = external_context_from_request(request)
            setattr(
                request.state,
                _REBOOT_CONTEXT_KEY,
                ext_ctx,
            )

            # On new sessions, construct state for any
            # auto-constructed state types.
            if getattr(request.state, _MCP_NEW_SESSION_KEY, False):
                for hook in new_session_hooks:
                    await hook(ext_ctx, session_id)

            logger.debug(f"[{ui_id}] {request.method} "
                         f"{request.url.path}")

            # Per-request task group — clean lifecycle, no
            # zombie tasks.
            async with anyio.create_task_group() as tg:
                transport = StreamableHTTPServerTransport(
                    mcp_session_id=session_id,
                    is_json_response_enabled=False,
                    event_store=None,
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
