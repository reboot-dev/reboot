"""The bank's tests: the Gherkin scenarios in `bank.feature`."""

import pytest
from account_servicer import AccountServicer
from bank_servicer import BankServicer
from reboot.aio.applications import Application
from reboot.bdd import scenarios


@pytest.fixture
def application() -> Application:
    return Application(servicers=[BankServicer, AccountServicer])


scenarios('bank.feature')
