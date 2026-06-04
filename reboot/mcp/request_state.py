"""Shared request-handling state for the MCP ASGI layer.

These definitions form the contract between the MCP ASGI
dispatcher in `factories.py` (which routes UI-asset requests and
publishes the per-request User-Agent) and the downstream HTML
builders in `iframe.py` / `ui.py` (which consume them to decide
what to emit). They live in their own leaf module — imported by
`factories.py`, `ui.py`, and `iframe.py` alike — so ownership
sits with neither consumer nor producer and the package stays
free of import cycles.
"""

import contextvars

# URL prefix for the production UI-assets endpoint. Used by
# `cache_busting_iframe_html` to build the inner-iframe URL and by
# the MCP ASGI dispatcher in `factories.py` to recognize incoming
# requests. Concatenated against the MCP mount path (`/mcp`)
# and matched verbatim against `scope["path"]`.
_UI_ASSETS_PREFIX = "/ui-assets/"

# Per-request User-Agent for the incoming `resources/read`.
# Set by `mcp_asgi_app` in `factories.py` before handing off to
# the MCP transport. Read by `host_needs_cache_busting_iframe()`
# to decide whether to emit the cache-busting iframe (ChatGPT
# needs it) or the inlined bundle (everyone else is fine).
_request_user_agent: contextvars.ContextVar[str | None] = (
    contextvars.ContextVar("_request_user_agent", default=None)
)
