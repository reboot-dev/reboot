#!/usr/bin/env python3
"""
This is a main function for a container hosting only the `Bank`
servicer with authorization.
"""
import asyncio
from reboot.aio.applications import Application
from reboot.aio.external import InitializeContext
from tests.reboot.auth_bank import (
    SECRET,
    TEST_JWT,
    AuthAccountServicer,
    AuthBankServicer,
)
from tests.reboot.bank import SINGLETON_BANK_ID, LegacyRedTapeServicer
from tests.reboot.bank_rbt import Bank
from tests.reboot.test_token_verifier import TestTokenVerifier


async def initialize(context: InitializeContext):
    """Create the singleton bank in our application."""
    print("🏦🏦🏦 Creating Bank if it hasn't already been created.... 🏦🏦🏦")
    await Bank.Create(context, SINGLETON_BANK_ID)
    print("💰💰💰 Bank is ready for business! 💰💰💰")


async def main():
    application = Application(
        servicers=[AuthBankServicer, AuthAccountServicer],
        legacy_grpc_servicers=[LegacyRedTapeServicer],
        initialize=initialize,
        initialize_bearer_token=TEST_JWT,
        token_verifier=TestTokenVerifier(secret=SECRET),
    )
    await application.run()


if __name__ == '__main__':
    asyncio.run(main())
