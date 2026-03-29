"""Lightweight MCP helpers importable without heavy dependencies.

This module contains utility functions used by generated code
(`reboot.py.j2`), factored out from other MCP code to help us break
dependency cycles.
"""

from typing import Any

# Key used to store user ID in request.state.
_MCP_USER_ID_KEY = "mcp_user_id"


def get_mcp_user_id(context: Any) -> str | None:
    """Get the authenticated user ID from MCP `Context`.

    Call this from within MCP tool or resource handlers to get
    the user ID extracted from the OAuth bearer token.

    Args:
        context: The MCP `Context` passed to your tool or
            resource handler.

    Returns:
        The user ID string, or `None` if unavailable.
    """
    request = context.request_context.request
    if request is None:
        return None
    return getattr(request.state, _MCP_USER_ID_KEY, None)
