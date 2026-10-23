"""The app's backend tests: the Gherkin scenarios in the `.feature`
files beside this module that need no browser.

The application runs with the real servicers and their authorizers;
the test harness supplies the OAuth provider that signs in the users
the scenarios declare."""

import pytest
from person_servicer import PersonServicer
from reboot.aio.applications import Application
from reboot.bdd import scenarios
from reboot.std.collections.ordered_map.v1.ordered_map import (
    ordered_map_library,
)
from user_servicer import UserServicer


@pytest.fixture
def application() -> Application:
    return Application(
        servicers=[PersonServicer, UserServicer],
        libraries=[ordered_map_library()],
    )


scenarios('upcoming_birthdays.feature', 'removing_people.feature')
