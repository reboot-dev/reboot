from reboot.aio.applications import Application
from reboot.aio.external import InitializeContext
from tests.reboot.bank import SINGLETON_BANK_ID, AccountServicer, BankServicer
from tests.reboot.bank_rbt import Bank
from tests.reboot.react.test_against_local_envoy import (
    web_test_against_local_envoy,
)
from tests.reboot.react.test_undeclared_errors.test import test


async def initialize(context: InitializeContext):
    """Create the singleton bank for our test."""
    await Bank.Create(context, SINGLETON_BANK_ID)


if __name__ == '__main__':
    web_test_against_local_envoy(
        test=test,
        application=Application(
            servicers=[AccountServicer, BankServicer],
            initialize=initialize,
        ),
    )
