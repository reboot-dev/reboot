"""Tests of the `reboot.bdd` built-in steps and fixtures, driven by
the scenarios in `accounts.feature`."""

# The star import below is how a test module gets the built-in steps
# and their fixtures, but 'ruff' doesn't like it, so we need to
# silence their error.
#
# ruff: noqa: F403

from pytest_bdd import parsers, scenarios
from reboot.bdd import when
from reboot.bdd.fixtures import World
from reboot.bdd.steps import *
from tests.reboot.bdd.account_rbt import Account


# A custom `async def` step, the way a developer would write one: it
# runs on the same event loop as the built-in steps and can call the
# generated code directly.
@when(parsers.parse('"{state_id}" makes {count:d} deposits of {amount:d}'))
async def _makes_deposits(
    world: World,
    state_id: str,
    count: int,
    amount: int,
) -> None:
    context = world.context()
    for _ in range(count):
        await Account.ref(state_id).deposit(context, amount=amount)


scenarios('accounts.feature')
