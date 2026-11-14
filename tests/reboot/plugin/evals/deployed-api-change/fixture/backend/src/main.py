import asyncio
from reboot.aio.applications import Application
from servicers.task import TaskServicer


async def main():
    await Application(servicers=[TaskServicer]).run()


if __name__ == "__main__":
    asyncio.run(main())
