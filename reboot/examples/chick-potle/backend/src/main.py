import asyncio
import logging
from reboot.aio.applications import Application
from reboot.aio.auth.oauth_providers import Anonymous
from servicers.food import FoodOrderServicer, UserServicer

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)


async def main() -> None:
    application = Application(
        servicers=[UserServicer, FoodOrderServicer],
        # `User` is an auto-constructed state type, so Reboot
        # needs an OAuth provider to identify the caller.
        oauth=Anonymous(),
    )
    await application.run()


if __name__ == "__main__":
    asyncio.run(main())
