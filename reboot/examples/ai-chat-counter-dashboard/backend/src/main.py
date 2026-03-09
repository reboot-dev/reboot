import asyncio
from reboot.aio.applications import Application
from servicers.counter import CounterServicer, SessionServicer


async def main() -> None:
    application = Application(
        servicers=[SessionServicer, CounterServicer],
    )
    await application.run()


if __name__ == "__main__":
    asyncio.run(main())
