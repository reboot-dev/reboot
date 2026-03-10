"""MCP context and session management for Reboot.

Provides helpers for accessing the Reboot `ExternalContext` and
MCP session identity from within MCP tool/resource handlers.
"""

from mcp.server.fastmcp import Context
from reboot.aio.external import ExternalContext
from reboot.mcp.helpers import \
    get_mcp_session_id  # noqa: F401 — PEP 484 re-export for `reboot.py.j2`
from reboot.mcp.helpers import _MCP_SESSION_ID_KEY
from reboot.uuidv7 import uuid7
from starlette.requests import Request

# Key used to store ExternalContext in request.state.
_REBOOT_CONTEXT_KEY = "reboot_external_context"

# Key used to track whether this is a new MCP session.
_MCP_NEW_SESSION_KEY = "mcp_new_session"

# HTTP header name for MCP session identity.
MCP_SESSION_ID_HEADER = "mcp-session-id"


def get_reboot_context(ctx: Context) -> ExternalContext:
    """
    Get the current Reboot `ExternalContext` from MCP `Context`.
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


def is_new_mcp_session(ctx: Context) -> bool:
    """
    Check whether this request started a new MCP session.

    Returns `True` when the client did not send an `Mcp-Session-Id`
    header (i.e. we just generated a fresh UUIDv7). Returns `False` for
    all subsequent requests in the same session.

    Args:
        ctx: The MCP `Context` passed to your tool or resource
            handler.
    """
    request = ctx.request_context.request
    if request is None:
        return False
    return getattr(request.state, _MCP_NEW_SESSION_KEY, False)


def _set_session_id(request: Request) -> str:
    """
    Determine and store session identity on `request.state`.

    Reuses the client's `Mcp-Session-Id` header when present; otherwise
    generates a fresh UUIDv7.  Also records whether the session is new
    (no header) so that `is_new_mcp_session` can report it.

    Returns:
        The session ID string.
    """
    incoming = request.headers.get(MCP_SESSION_ID_HEADER)
    session_id = incoming or uuid7().hex
    setattr(request.state, _MCP_SESSION_ID_KEY, session_id)
    setattr(
        request.state,
        _MCP_NEW_SESSION_KEY,
        incoming is None,
    )
    return session_id
