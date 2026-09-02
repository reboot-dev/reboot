"""Fixtures for the pydantic `reboot.bdd` tests."""

import pytest
from reboot.aio.applications import Application
from tests.reboot.bdd.pydantic.account_servicer import AccountServicer


@pytest.fixture
def application() -> Application:
    return Application(servicers=[AccountServicer])
