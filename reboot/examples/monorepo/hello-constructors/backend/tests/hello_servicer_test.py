"""Hello's tests: the Gherkin scenarios in `hello.feature`."""

import pytest
from hello_servicer import HelloServicer
from reboot.aio.applications import Application
from reboot.bdd import scenarios


@pytest.fixture
def application() -> Application:
    return Application(servicers=[HelloServicer])


scenarios('hello.feature')
