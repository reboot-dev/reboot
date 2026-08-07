"""The inspect dashboard's companion application.

A Reboot application owned by the framework, holding the state the
inspect dashboard needs but which must not be written into the
application under development. It is not part of the Reboot API and
nothing imports it; it runs as its own process, with its own state
store, alongside the application being developed.
"""
import asyncio
from reboot.aio.applications import Application
from reboot.inspect.companion_app.servicers import servicers


async def main():
    application = Application(servicers=servicers())

    await application.run()


if __name__ == '__main__':
    asyncio.run(main())
