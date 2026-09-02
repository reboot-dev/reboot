"""Tests of the `reboot.bdd` built-in steps and fixtures, driven by
the scenarios in `accounts.feature`."""

# The star import below is how a test module gets the built-in steps
# and their fixtures, but 'ruff' doesn't like it, so we need to
# silence their error.
#
# ruff: noqa: F403

import pytest
from pytest_bdd import parsers, scenarios
from reboot.bdd import when
from reboot.bdd.fixtures import World
from reboot.bdd.steps import *
from reboot.bdd.steps import _assert_aborted
from tests.reboot.bdd.account_pb2 import OverdraftError
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


def test_is_reader() -> None:
    world = World(client_types={'tests.reboot.bdd.Account': Account})
    assert world.is_reader(state_type='Account', method='balance')
    assert not world.is_reader(state_type='Account', method='deposit')


def test_assert_aborted_where() -> None:
    world = World()
    aborted = Account.WithdrawAborted(OverdraftError(amount=20))
    _assert_aborted(world, aborted, 'OverdraftError', '`amount=20`')
    with pytest.raises(AssertionError):
        _assert_aborted(world, aborted, 'OverdraftError', '`amount=21`')
    with pytest.raises(AssertionError):
        _assert_aborted(world, aborted, 'SomeOtherError', None)


scenarios('accounts.feature')
