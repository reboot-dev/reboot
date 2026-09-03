"""The chick-potle tests: the Gherkin scenarios in `food.feature`.

The scenarios register the real servicers with their real
authorizers and say who the authenticated user is, so the
authorization rules run in every scenario, exactly as in
production; minting the user's token also constructs their `User`
state, the way a production sign-in does.
"""

import pytest
from reboot.aio.applications import Application
from reboot.bdd import scenarios
from servicers.food import FoodOrderServicer, UserServicer


@pytest.fixture
def application() -> Application:
    return Application(servicers=[FoodOrderServicer, UserServicer])


scenarios('food.feature')
