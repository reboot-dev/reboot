"""MCP context helpers for Reboot.

Provides helpers for accessing the Reboot `ExternalContext`
from within MCP tool/resource handlers.
"""

from mcp.server.fastmcp import Context
from reboot.aio.external import ExternalContext
from reboot.mcp.helpers import \
    get_mcp_user_id  # noqa: F401 — PEP 484 re-export for `reboot.py.j2`
from reboot.mcp.helpers import _MCP_USER_ID_KEY
from reboot.uuidv7 import uuid7
from starlette.requests import Request

# Key used to store ExternalContext in request.state.
_REBOOT_CONTEXT_KEY = "reboot_external_context"

# HTTP header name for MCP session identity.
MCP_SESSION_ID_HEADER = "mcp-session-id"


def get_reboot_context(context: Context) -> ExternalContext:
    """
    Get the current Reboot `ExternalContext` from MCP `Context`.
    """
    request = context.request_context.request
    if request is None:
        raise RuntimeError(
            "No HTTP request in MCP context — this shouldn't happen"
        )

    external_context = getattr(request.state, _REBOOT_CONTEXT_KEY, None)
    if external_context is None:
        raise RuntimeError(
            "No Reboot context available — are you inside an MCP tool?"
        )
    return external_context


def _init_session_state(request: Request) -> tuple[str, bool]:
    """
    Determine session identity from the request.

    Reuses the client's `Mcp-Session-Id` header when present; otherwise
    generates a fresh UUIDv7.

    Returns:
        A `(session_id, is_new)` tuple.  `is_new` is `True` when
        the client did not send a session ID header (i.e. this is the
        first request in a new session).
    """
    incoming = request.headers.get(MCP_SESSION_ID_HEADER)
    session_id = incoming or uuid7().hex
    return session_id, incoming is None


def _set_user_id(request: Request, user_id: str) -> None:
    """Store the authenticated user ID on `request.state`."""
    setattr(request.state, _MCP_USER_ID_KEY, user_id)


def _get_user_id(request: Request) -> str | None:
    """Retrieve the authenticated user ID from `request.state`."""
    return getattr(request.state, _MCP_USER_ID_KEY, None)
