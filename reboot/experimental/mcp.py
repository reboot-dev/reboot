"""MCP (Model Context Protocol) integration for Reboot.

Provides an Application class that supports mounting FastMCP.

Usage:
    from reboot.experimental.mcp import Application, get_reboot_context
    from mcp.server.fastmcp import Context, FastMCP

    mcp = FastMCP(name="my-server")

    # Tools with Reboot context:
    @mcp.tool()
    async def my_tool(ctx: Context, id: str) -> str:
        rbt = get_reboot_context(ctx)
        return await MyState.ref(id).get_value(rbt)

    # Resources with Reboot context:
    @mcp.resource("mystate://{id}")
    async def my_resource(ctx: Context, id: str) -> str:
        rbt = get_reboot_context(ctx)
        return await MyState.ref(id).get_value(rbt)

    async def main():
        application = Application(servicers=[MyServicer], mcp=mcp)
        await application.run()
"""

import anyio
import importlib
import inspect
import logging
import reboot.aio.applications
from mcp.server.fastmcp import Context, FastMCP
from mcp.server.streamable_http import StreamableHTTPServerTransport
from rebootdev.aio.external import ExternalContext
from starlette.requests import Request
from starlette.types import Receive, Scope, Send
from typing import Any, Callable

__all__ = [
    "Application",
    "get_reboot_context",
]

logger = logging.getLogger(__name__)

# Key used to store ExternalContext in request.state.
_REBOOT_CONTEXT_KEY = "reboot_external_context"


def get_reboot_context(ctx: Context) -> ExternalContext:
    """Get the current Reboot ExternalContext from MCP Context.

    Call this from within MCP tool or resource handlers to access Reboot
    state machines.

    Args:
        ctx: The MCP Context passed to your tool or resource handler.

    Returns:
        ExternalContext for calling Reboot state machines.

    Raises:
        RuntimeError: If called outside of an MCP request context or if
            Reboot context is not available.

    Example:
        @mcp.tool()
        async def get_counter(ctx: Context, id: str = "default") -> str:
            rbt = get_reboot_context(ctx)
            response = await Counter.ref(id).get(rbt)
            return f"Counter value: {response.value}"
    """
    request = ctx.request_context.request
    if request is None:
        raise RuntimeError(
            "No HTTP request in MCP context - this shouldn't happen"
        )

    ext_ctx = getattr(request.state, _REBOOT_CONTEXT_KEY, None)
    if ext_ctx is None:
        raise RuntimeError(
            "No Reboot context available - are you inside an MCP tool?"
        )
    return ext_ctx


class _McpFactory:
    """Picklable factory that creates MCP ASGI app.

    Uses per-request task groups for simplicity. Each request:
    1. Creates its own anyio task group
    2. Starts MCP server task in that group
    3. Handles request
    4. Task group cleans up when request completes

    Note: MCP SDK's StreamableHTTPSessionManager would share a task
    group across requests, but it requires ASGI lifespan events that
    Reboot's http.mount() doesn't propagate to mounted apps.
    """

    def __init__(self, module_name: str, attr_name: str = "mcp"):
        self.module_name = module_name
        self.attr_name = attr_name

    def __call__(
        self,
        external_context_from_request: Callable[[Request], ExternalContext],
    ) -> Callable[[Scope, Receive, Send], Any]:
        """Create stateless ASGI app for FastMCP."""
        # Import module and get mcp (runs in subprocess after unpickling).
        module = importlib.import_module(self.module_name)
        mcp: FastMCP = getattr(module, self.attr_name)

        mcp_app_id = mcp.name or "mcp"
        logger.info(f"[{mcp_app_id}] Creating MCP ASGI app (stateless=True)")

        async def mcp_asgi_app(
            scope: Scope, receive: Receive, send: Send
        ) -> None:
            request = Request(scope, receive, send)

            # Note on GET requests: In stateless mode (event_store=None),
            # StreamableHTTPServerTransport handles GET (SSE) by returning
            # an empty event stream. We don't reject GET explicitly - we
            # defer to the transport for consistent behavior with FastMCP.

            # Inject Reboot context into request.state.
            # Accessible in MCP tools via ctx.request_context.request.state
            setattr(
                request.state,
                _REBOOT_CONTEXT_KEY,
                external_context_from_request(request),
            )

            logger.debug(f"[{mcp_app_id}] {request.method} {request.url.path}")

            # Per-request task group - clean lifecycle, no zombie tasks.
            # Task group lives only for this request's duration.
            async with anyio.create_task_group() as tg:
                transport = StreamableHTTPServerTransport(
                    mcp_session_id=None,
                    is_json_response_enabled=False,
                    event_store=None,
                )

                async def run_server(
                    *, task_status: anyio.abc.
                    TaskStatus[None] = (anyio.TASK_STATUS_IGNORED)
                ) -> None:
                    async with transport.connect() as streams:
                        read_stream, write_stream = streams
                        task_status.started()
                        try:
                            await mcp._mcp_server.run(
                                read_stream,
                                write_stream,
                                mcp._mcp_server.create_initialization_options(
                                ),
                                stateless=True,
                            )
                        except Exception as e:
                            logger.error(
                                f"[{mcp_app_id}] MCP server error: {e}",
                                exc_info=True,
                            )

                await tg.start(run_server)
                await transport.handle_request(scope, receive, send)
                await transport.terminate()

        return mcp_asgi_app


class Application(reboot.aio.applications.Application):
    """Reboot Application with MCP support.

    Extends reboot.aio.applications.Application to support FastMCP.

    Usage:
        # Option 1: Pass mcp to constructor (mounts at /mcp)
        application = Application(servicers=[...], mcp=mcp)

        # Option 2: Use mount_mcp for custom path
        application = Application(servicers=[...])
        application.mount_mcp(mcp, "/custom-path")
    """

    def __init__(
        self,
        *,
        mcp: FastMCP | None = None,
        **kwargs: Any,
    ):
        super().__init__(**kwargs)

        if mcp is not None:
            # Reboot uses multiprocessing, so the factory must be picklable.
            # We can't pickle the mcp instance directly (or closures over it),
            # but we can pickle strings. By discovering the module and
            # attribute name here, _McpFactory can reimport the module in each
            # subprocess and access the mcp instance by name.
            frame = inspect.currentframe()
            if frame is None or frame.f_back is None:
                raise RuntimeError("Cannot determine caller module")
            caller_module = inspect.getmodule(frame.f_back)
            if caller_module is None:
                raise RuntimeError("Cannot determine caller module")

            attr_name = None
            for name in dir(caller_module):
                if getattr(caller_module, name, None) is mcp:
                    attr_name = name
                    break
            if attr_name is None:
                raise RuntimeError(
                    "Could not find mcp instance in caller's module. "
                    "Make sure 'mcp' is defined at module level."
                )

            self.http.mount(
                "/mcp",
                factory=_McpFactory(  # type: ignore[arg-type]
                    caller_module.__name__, attr_name
                ),
            )

    def mount_mcp(self, mcp: FastMCP, path: str = "/mcp") -> None:
        """Mount a FastMCP instance at the given path.

        Args:
            mcp: The FastMCP instance to mount.
            path: HTTP path for the MCP endpoint (default: "/mcp").

        Example:
            mcp = FastMCP(name="my-server")

            @mcp.tool()
            async def my_tool(): ...

            async def main():
                application = Application(servicers=[...])
                application.mount_mcp(mcp)
                await application.run()
        """
        # Same pickling constraint as __init__: discover module/attr as
        # strings so _McpFactory can reimport in subprocesses.
        frame = inspect.currentframe()
        if frame is None or frame.f_back is None:
            raise RuntimeError("Cannot determine caller module")
        caller_module = inspect.getmodule(frame.f_back)
        if caller_module is None:
            raise RuntimeError("Cannot determine caller module")

        attr_name = None
        for name in dir(caller_module):
            if getattr(caller_module, name, None) is mcp:
                attr_name = name
                break
        if attr_name is None:
            raise RuntimeError(
                "Could not find mcp instance in caller's module. "
                "Make sure 'mcp' is defined at module level."
            )

        self.http.mount(
            path,
            factory=_McpFactory(  # type: ignore[arg-type]
                caller_module.__name__, attr_name
            ),
        )
