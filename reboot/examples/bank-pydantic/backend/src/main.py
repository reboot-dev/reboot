import asyncio
from account_servicer import AccountServicer
from bank.v1.pydantic.bank_rbt import Bank
from bank_servicer import BankServicer
from constants import SINGLETON_BANK_ID
from customer_servicer import CustomerServicer
from example_prompts import example_prompts
from reboot.aio.applications import Application
from reboot.aio.auth.oauth_providers import (
    Development,
    OAuthProviderByEnvironment,
)
from reboot.aio.external import InitializeContext
from reboot.std.collections.v1.sorted_map import sorted_map_library
from user_servicer import UserServicer


async def initialize(context: InitializeContext):
    await Bank.create(context, SINGLETON_BANK_ID)


async def main():
    await Application(
        title="Rebank",
        servicers=[
            AccountServicer,
            BankServicer,
            CustomerServicer,
            UserServicer,
        ],
        # The `User` type is auto-constructed per authenticated user,
        # which requires an OAuth provider to identify users.
        oauth=OAuthProviderByEnvironment(
            dev=Development(),
            # TODO: set a real provider (e.g. `Google(...)`) before
            # production; `prod=None` makes a production deployment fail
            # to start until one is chosen.
            prod=None,
        ),
        # Include `SortedMap` library.
        libraries=[sorted_map_library()],
        initialize=initialize,
        example_prompts=example_prompts,
    ).run()


if __name__ == '__main__':
    asyncio.run(main())
