"""Fixtures for the pydantic `reboot.bdd` tests."""

import pytest
from reboot.aio.applications import Application
from tests.reboot.bdd.pydantic.account_servicer import AccountServicer

# The plugin the `reboot` distribution registers as an entry point,
# which these tests run from source: its hooks are what act on the
# scenarios' tags.
pytest_plugins = ['reboot.bdd_plugin']


@pytest.fixture
def application() -> Application:
    return Application(servicers=[AccountServicer])
