"""Tests of the `reboot.bdd` built-in steps against a pydantic API,
driven by the scenarios in `accounts.feature`."""

# The star import below is how a test module gets the built-in steps
# and their fixtures, but 'ruff' doesn't like it, so we need to
# silence their error.
#
# ruff: noqa: F403

from pytest_bdd import parsers, scenarios
from reboot.bdd import when
from reboot.bdd.fixtures import World
from reboot.bdd.steps import *


# A custom `async def` step, the way a developer would write one: it
# calls through `World.call()` rather than importing the generated
# code.
@when(parsers.parse('"{state_id}" makes {count:d} deposits of {amount:d}'))
async def _makes_deposits(
    world: World,
    state_id: str,
    count: int,
    amount: int,
) -> None:
    for _ in range(count):
        await world.call(
            state_type='Account',
            state_id=state_id,
            method='deposit',
            properties={'amount': amount},
        )


scenarios('accounts.feature')
