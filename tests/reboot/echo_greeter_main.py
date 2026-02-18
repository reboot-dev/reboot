#!/usr/bin/env python3
"""
This is a main function for a container hosting both the `Echo` and the
`Greeter` servicer.
"""
import asyncio
from reboot.aio.applications import Application
from tests.reboot.echo_servicers import MyEchoServicer
from tests.reboot.greeter_servicers import MyGreeterServicer


async def main():
    application = Application(servicers=[MyEchoServicer, MyGreeterServicer])
    await application.run()


if __name__ == '__main__':
    asyncio.run(main())
