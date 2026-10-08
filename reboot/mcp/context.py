"""MCP context helpers for Reboot.

Provides helpers for accessing the Reboot `ExternalContext`
from within MCP tool/resource handlers.
"""

import os
from mcp.server.fastmcp import Context
from reboot.aio.external import ExternalContext
from reboot.mcp.helpers import \
    get_mcp_user_id  # noqa: F401 — PEP 484 re-export for `reboot.py.j2`
from reboot.mcp.helpers import _MCP_USER_ID_KEY
from reboot.settings import ENVVAR_RBT_MCP_UI_URL
from reboot.uuidv7 import uuid7
from starlette.requests import Request
from typing import Optional

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


def reboot_url_from_request(request: Optional[Request]) -> str:
    """The URL an MCP App served in reply to `request` calls the
    application back on: `RBT_MCP_UI_URL` when that is set (see
    `reboot.settings`), otherwise the URL the request reached the
    application at.

    A proxy in front of the application (a tunnel, say) names the
    address it was reached at in `X-Forwarded-Host` and
    `X-Forwarded-Proto`; absent those, the request's own `Host` and
    scheme are the address.
    """
    url = os.environ.get(ENVVAR_RBT_MCP_UI_URL)
    if url:
        return url
    if request is None:
        raise RuntimeError("No HTTP request in MCP context")
    host = (
        request.headers.get("x-forwarded-host") or request.headers.get("host")
    )
    if not host:
        raise RuntimeError("No host header in request")
    scheme = (
        request.headers.get("x-forwarded-proto") or
        ("https" if request.url.scheme == "https" else "http")
    )
    return f"{scheme}://{host}"


def _session_id_for_request(request: Request) -> str:
    """
    Determine session identity from the request.

    Reuses the client's `Mcp-Session-Id` header when present; otherwise
    generates a fresh UUIDv7.
    """
    return request.headers.get(MCP_SESSION_ID_HEADER) or uuid7().hex


def _set_user_id(request: Request, user_id: str) -> None:
    """Store the authenticated user ID on `request.state`."""
    setattr(request.state, _MCP_USER_ID_KEY, user_id)


def _get_user_id(request: Request) -> str | None:
    """Retrieve the authenticated user ID from `request.state`."""
    return getattr(request.state, _MCP_USER_ID_KEY, None)
