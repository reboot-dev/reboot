import asyncio
from reboot.aio.applications import Application
from reboot.aio.auth.oauth_providers import Anonymous
from servicers.counter import CounterServicer, UserServicer


async def main() -> None:
    application = Application(
        servicers=[UserServicer, CounterServicer],
        oauth=Anonymous(),
    )
    await application.run()


if __name__ == "__main__":
    asyncio.run(main())
