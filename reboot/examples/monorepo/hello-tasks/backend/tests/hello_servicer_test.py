"""Hello's tests: the Gherkin scenarios in `hello.feature`."""

import hello_servicer
import pytest
from hello_servicer import HelloServicer
from reboot.aio.applications import Application
from reboot.bdd import scenarios
from typing import Iterator


# To make scenarios run quickly, remove the delays before warning
# about and before erasing a message.
@pytest.fixture(autouse=True)
def no_delays() -> Iterator[None]:
    secs_until_warning = hello_servicer.SECS_UNTIL_WARNING
    additional_secs_until_erase = hello_servicer.ADDITIONAL_SECS_UNTIL_ERASE
    hello_servicer.SECS_UNTIL_WARNING = 0
    hello_servicer.ADDITIONAL_SECS_UNTIL_ERASE = 0
    yield
    hello_servicer.SECS_UNTIL_WARNING = secs_until_warning
    hello_servicer.ADDITIONAL_SECS_UNTIL_ERASE = additional_secs_until_erase


@pytest.fixture
def application() -> Application:
    return Application(servicers=[HelloServicer])


scenarios('hello.feature')
