"""The bank's interest: the one feature that needs the account's
scheduled interest running, which the other test modules turn off so
balances stay put."""

import pytest
from account_servicer import AccountServicer
from bank_servicer import BankServicer
from customer_servicer import CustomerServicer
from reboot.aio.applications import Application
from reboot.bdd import scenarios
from reboot.std.collections.v1.sorted_map import sorted_map_library


@pytest.fixture
def application() -> Application:
    return Application(
        servicers=[AccountServicer, BankServicer, CustomerServicer],
        libraries=[sorted_map_library()],
    )


scenarios('interest.feature')
