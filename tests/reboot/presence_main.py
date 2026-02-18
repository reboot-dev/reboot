#!/usr/bin/env python3
"""
This is a main function for a container hosting only the `Presence` servicer.
"""
import asyncio
import reboot.std.presence.v1.presence
from reboot.aio.applications import Application
from reboot.aio.memoize import MemoizeServicer


async def main():
    application = Application(
        servicers=[MemoizeServicer] +
        reboot.std.presence.v1.presence.servicers(),
    )
    await application.run()


if __name__ == '__main__':
    asyncio.run(main())