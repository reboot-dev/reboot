"""The account's tests: the Gherkin scenarios in `account.feature`."""

import pytest
from account_servicer import AccountServicer
from reboot.aio.applications import Application
from reboot.bdd import scenarios, then
from typing import Iterator
from unittest import mock


@pytest.fixture
def application() -> Application:
    return Application(servicers=[AccountServicer])


# The welcome email goes through `send_email`, mocked so scenarios
# can observe it.
@pytest.fixture(autouse=True)
def send_email() -> Iterator[mock.AsyncMock]:
    with mock.patch('account_servicer.send_email') as mocked:
        yield mocked


@then('the welcome email was sent')
def _the_welcome_email_was_sent(send_email: mock.AsyncMock) -> None:
    # Reboot re-runs methods twice in development mode to validate
    # that they are idempotent, so the email sends twice.
    assert send_email.call_count == 2


scenarios('account.feature')
