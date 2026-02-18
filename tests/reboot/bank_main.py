#!/usr/bin/env python3
"""
This is a main function for a container hosting only the `Bank` servicer.
"""
import asyncio
from reboot.aio.applications import Application
from reboot.aio.external import InitializeContext
from tests.reboot.bank import (
    SINGLETON_BANK_ID,
    AccountServicer,
    BankServicer,
    LegacyRedTapeServicer,
)
from tests.reboot.bank_rbt import Bank


async def initialize(context: InitializeContext):
    """Create the singleton bank in our application."""
    print("🏦🏦🏦 Creating Bank if it hasn't already been created.... 🏦🏦🏦")
    await Bank.Create(context, SINGLETON_BANK_ID)
    print("💰💰💰 Bank is ready for business! 💰💰💰")


async def main():
    application = Application(
        servicers=[BankServicer, AccountServicer],
        legacy_grpc_servicers=[LegacyRedTapeServicer],
        initialize=initialize,
    )
    await application.run()


if __name__ == '__main__':
    asyncio.run(main())
