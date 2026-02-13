"""A Reboot counter with MCP Applications.

A simple counter with MCP tools and React MCP App UIs.
"""

import asyncio
import json
import logging
from apps import get_app_html
from mcp.server.fastmcp import FastMCP
from mcp.server.fastmcp.server import Context
from mcp_counter.v1.counter_rbt import Counter
from reboot.aio.external import InitializeContext
from reboot.experimental.mcp import Application, get_reboot_context
from servicers.counter import CounterServicer

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)

# --- MCP Server ---

mcp = FastMCP(
    name="counter-server",
    instructions=(
        "This server provides a simple counter that can be incremented "
        "and decremented."
    ),
)

# --- Counter Tools ---


@mcp.tool(
    name="get_counter",
    title="Get Counter",
    description="Get the current counter value.",
)
async def get_counter(ctx: Context, id: str = "default") -> str:
    reboot_context = get_reboot_context(ctx)
    response = await Counter.ref(id).get(reboot_context)
    return f"Counter value: {response.value}"


@mcp.tool(
    name="increment_counter",
    title="Increment Counter",
    description="Increment the counter by 1.",
)
async def increment_counter(ctx: Context, id: str = "default") -> str:
    reboot_context = get_reboot_context(ctx)
    counter = Counter.ref(id)
    await counter.increment(reboot_context)
    response = await counter.get(reboot_context)
    return f"Incremented to: {response.value}"


@mcp.tool(
    name="decrement_counter",
    title="Decrement Counter",
    description="Decrement the counter by 1.",
)
async def decrement_counter(ctx: Context, id: str = "default") -> str:
    reboot_context = get_reboot_context(ctx)
    counter = Counter.ref(id)
    await counter.decrement(reboot_context)
    response = await counter.get(reboot_context)
    return f"Decremented to: {response.value}"


# --- Counter Resource ---


@mcp.resource(
    "counter://{id}",
    name="counter",
    title="Counter",
    description="Current counter state.",
    mime_type="application/json",
)
async def counter_resource(ctx: Context, id: str) -> str:
    reboot_context = get_reboot_context(ctx)
    response = await Counter.ref(id).get(reboot_context)
    return json.dumps({"value": response.value})


# --- UI Tools ---


@mcp.tool(
    name="show_clicker_ui",
    title="Show Clicker UI",
    description="Opens the clicker interface.",
    meta={"ui/resourceUri": "ui://counter/clicker"},
)
async def show_clicker_ui() -> dict:
    return {"status": "ui_ready", "variant": "clicker"}


@mcp.tool(
    name="show_dashboard_ui",
    title="Show Dashboard UI",
    description="Opens the dashboard interface.",
    meta={"ui/resourceUri": "ui://counter/dashboard"},
)
async def show_dashboard_ui() -> dict:
    return {"status": "ui_ready", "variant": "dashboard"}


# --- UI Resources ---


def _get_reboot_url_from_request(ctx: Context) -> str | None:
    """Extract Reboot URL from request headers.

    When MCP Apps are loaded remotely (e.g., via MCPJam connecting to a
    codespace), we need to tell the app the public URL of the Reboot
    server since window.location.origin will be null in the iframe.

    Uses X-Forwarded-Host if available (set by reverse proxies like
    GitHub Codespaces), otherwise falls back to Host header.
    """
    request = ctx.request_context.request
    if request is None:
        return None

    # Prefer x-forwarded-host (set by reverse proxies) over host.
    host = (
        request.headers.get("x-forwarded-host") or request.headers.get("host")
    )
    if not host:
        return None

    # Use x-forwarded-proto if available, otherwise infer from request.
    scheme = (
        request.headers.get("x-forwarded-proto") or
        ("https" if request.url.scheme == "https" else "http")
    )

    return f"{scheme}://{host}"


@mcp.resource(
    "ui://counter/{app}",
    name="counter-ui",
    title="Counter UI",
    description="Counter UI apps (clicker or dashboard).",
    mime_type="text/html;profile=mcp-app",
)
def counter_ui_resource(ctx: Context, app: str) -> str:
    """Serve counter UI apps with injected Reboot URL for remote access."""
    reboot_url = _get_reboot_url_from_request(ctx)
    if app not in ("clicker", "dashboard"):
        raise ValueError(f"Unknown app: {app}")
    return get_app_html(app, reboot_url)


# --- Application ---


async def initialize(context: InitializeContext) -> None:
    """Initialize the default counter."""
    await Counter.create(context, "default")


async def main() -> None:
    application = Application(
        servicers=[CounterServicer],
        initialize=initialize,
        mcp=mcp,
    )
    await application.run()


if __name__ == "__main__":
    asyncio.run(main())
