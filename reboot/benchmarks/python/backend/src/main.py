import asyncio
from benchmark_servicer import BenchmarkServicer
from reboot.aio.applications import Application


async def main():
    await Application(servicers=[BenchmarkServicer]).run()


if __name__ == '__main__':
    asyncio.run(main())
