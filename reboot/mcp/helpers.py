"""Lightweight MCP helpers importable without heavy dependencies.

This module contains utility functions used by generated code
(`reboot.py.j2`), factored out from other MCP code to help us break
dependency cycles.
"""

from typing import Any

# Key used to store MCP session ID in request.state.
_MCP_SESSION_ID_KEY = "mcp_session_id"


def get_mcp_session_id(ctx: Any) -> str | None:
    """Get the current MCP session ID from MCP `Context`.

    Call this from within MCP tool or resource handlers to get
    the session ID assigned to this MCP connection.

    Args:
        ctx: The MCP `Context` passed to your tool or resource
            handler.

    Returns:
        The session ID string, or `None` if unavailable.
    """
    request = ctx.request_context.request
    if request is None:
        return None
    return getattr(request.state, _MCP_SESSION_ID_KEY, None)
