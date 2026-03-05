"""A Reboot counter with MCP Applications.

A simple counter with MCP tools and React MCP App UIs.

All MCP tools are auto-generated from the API definition
in counter.py. Counter methods are automatically exposed
as MCP tools, and `UI()` methods open React MCP App UIs.
"""

import asyncio
import logging
from reboot.aio.applications import Application
from servicers.counter import CounterServicer, SessionServicer

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)


async def main() -> None:
    application = Application(
        servicers=[SessionServicer, CounterServicer],
    )
    await application.run()


if __name__ == "__main__":
    asyncio.run(main())
