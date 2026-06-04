import asyncio
import logging
from reboot.aio.applications import Application
from reboot.aio.auth.oauth_providers import (
    Development,
    OAuthProviderByEnvironment,
)
from servicers.wiki import (
    PageServicer,
    TranscriptServicer,
    UserServicer,
    WikiServicer,
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)


async def main() -> None:
    application = Application(
        servicers=[
            UserServicer,
            WikiServicer,
            PageServicer,
            TranscriptServicer,
        ],
        # `User` is an auto-constructed state type, so Reboot
        # needs an OAuth provider to identify the caller.
        oauth=OAuthProviderByEnvironment(
            dev=Development(),
            # TODO: set a real provider (e.g. `Google(...)`) before
            # production; `prod=None` makes a production deployment fail
            # to start until one is chosen.
            prod=None,
        ),
    )
    await application.run()


if __name__ == "__main__":
    asyncio.run(main())
