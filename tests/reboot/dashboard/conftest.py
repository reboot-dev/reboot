"""Fixtures for the dashboard's `.feature` files."""

import pytest
from reboot.aio.applications import Application
from reboot.dashboard.backend.main import application as dashboard_application

# The plugin the `reboot` distribution registers as an entry point,
# which these tests run from source: its hooks are what act on the
# scenarios' tags.
pytest_plugins = ['reboot.bdd_plugin']


@pytest.fixture
def application() -> Application:
    return dashboard_application()
