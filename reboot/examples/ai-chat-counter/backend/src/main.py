# backend/src/main.py
import asyncio
from example_prompts import example_prompts
from reboot.aio.applications import Application
from reboot.aio.auth.oauth_providers import (
    Development,
    OAuthProviderByEnvironment,
)
from servicers.counter import CounterServicer, UserServicer


async def main() -> None:
    application = Application(
        title="Chat Counter",
        description=(
            "Lets a chat client create, list, increment, and "
            "show counters on your behalf."
        ),
        servicers=[UserServicer, CounterServicer],
        oauth=OAuthProviderByEnvironment(
            dev=Development(),
            # TODO: set a real provider (e.g. `Google(...)`) before
            # production; `prod=None` makes a production deployment fail
            # to start until one is chosen.
            prod=None,
        ),
        example_prompts=example_prompts,
    )
    await application.run()


if __name__ == "__main__":
    asyncio.run(main())
