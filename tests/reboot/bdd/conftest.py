"""Fixtures for the `reboot.bdd` tests."""

import pytest
from reboot.aio.applications import Application
from tests.reboot.bdd.account_servicer import AccountServicer


@pytest.fixture
def application() -> Application:
    return Application(servicers=[AccountServicer])
