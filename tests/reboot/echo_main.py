#!/usr/bin/env python3
"""
This is a main function for a container hosting only the `Echo` servicer.
"""
import asyncio
from reboot.aio.applications import Application
from tests.reboot.echo_servicers import MyEchoServicer


async def main():
    application = Application(servicers=[MyEchoServicer])
    await application.run()


if __name__ == '__main__':
    asyncio.run(main())
