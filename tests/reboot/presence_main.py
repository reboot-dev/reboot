#!/usr/bin/env python3
"""
This is a main function for a container hosting only the `Presence` servicer.
"""
import asyncio
from reboot.aio.applications import Application
from reboot.aio.auth.authorizers import allow
from reboot.aio.memoize import MemoizeServicer
from reboot.std.presence.v1.presence import presence_library


async def main():
    application = Application(
        servicers=[MemoizeServicer],
        libraries=[presence_library(authorizer=allow())],
    )
    await application.run()


if __name__ == '__main__':
    asyncio.run(main())
