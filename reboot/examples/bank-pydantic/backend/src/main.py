import asyncio
from account_servicer import AccountServicer
from bank.v1.pydantic.bank_rbt import Bank
from bank_servicer import BankServicer
from customer_servicer import CustomerServicer
from reboot.aio.applications import Application
from reboot.aio.external import InitializeContext
from reboot.std.collections.v1.sorted_map import sorted_map_library

SINGLETON_BANK_ID = 'reboot-bank'


async def initialize(context: InitializeContext):
    await Bank.create(context, SINGLETON_BANK_ID)


async def main():
    await Application(
        servicers=[AccountServicer, BankServicer, CustomerServicer],
        # Include `SortedMap` library.
        libraries=[sorted_map_library()],
        initialize=initialize,
    ).run()


if __name__ == '__main__':
    asyncio.run(main())
