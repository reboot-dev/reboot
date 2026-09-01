"""Tests of `reboot.bdd` resolving colliding state type names, driven
by the scenarios in `collisions.feature`."""

# The star import below is how a test module gets the built-in steps
# and their fixtures, but 'ruff' doesn't like it, so we need to
# silence their error.
#
# ruff: noqa: F403

import pytest
from pytest_bdd import scenarios
from reboot.aio.applications import Application
from reboot.bdd.fixtures import World
from reboot.bdd.steps import *
from tests.reboot.bdd.account_rbt import Account
from tests.reboot.bdd.account_servicer import AccountServicer
from tests.reboot.bdd.other.account_rbt import Account as OtherAccount
from tests.reboot.bdd.other.account_servicer import \
    AccountServicer as OtherAccountServicer


@pytest.fixture
def application() -> Application:
    return Application(servicers=[AccountServicer, OtherAccountServicer])


def test_ambiguous_unqualified_name() -> None:
    world = World(
        client_types={
            'tests.reboot.bdd.Account': Account,
            'tests.reboot.bdd.other.Account': OtherAccount,
        }
    )
    with pytest.raises(ValueError) as raised:
        world.client_type('Account')
    assert 'names more than one' in str(raised.value)
    assert '`tests.reboot.bdd.Account`' in str(raised.value)
    assert '`tests.reboot.bdd.other.Account`' in str(raised.value)


scenarios('collisions.feature')
