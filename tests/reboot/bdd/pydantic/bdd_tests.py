"""Tests of the `reboot.bdd` built-in steps against a pydantic API,
driven by the scenarios in `accounts.feature`."""

# The star import below is how a test module gets the built-in steps
# and their fixtures, but 'ruff' doesn't like it, so we need to
# silence their error.
#
# ruff: noqa: F403

import pytest
from pytest_bdd import parsers, scenarios
from reboot.bdd import when
from reboot.bdd.fixtures import Assignment, JsonValue, PropertyPath, World
from reboot.bdd.steps import *
from reboot.bdd.steps import (
    Assertion,
    Containing,
    Equals,
    OfLength,
    _assert_properties,
)
from tests.reboot.bdd.pydantic.account_api import (
    DepositResponse,
    GetOwnerResponse,
    GetOwnersResponse,
    Owner,
)
from tests.reboot.bdd.pydantic.account_api_rbt import Account


# A custom `async def` step, the way a developer would write one:
# plain Reboot code, a context from the world and calls on the
# generated clients.
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


def test_unknown_property_raises() -> None:
    world = World(client_types={'tests.reboot.bdd.pydantic.Account': Account})
    with pytest.raises(ValueError) as raised:
        world.request(
            state_type='Account',
            method='deposit',
            assignments={'amunt': 50},
        )
    assert 'has no property `amunt`' in str(raised.value)


def test_list_indices_build_requests() -> None:
    world = World(client_types={'tests.reboot.bdd.pydantic.Account': Account})
    request = world.request(
        state_type='Account',
        method='set_owner',
        assignments={
            'owner.name': 'Frank',
            'owner.tags[0]': 'a',
            'owner.tags[1]': 'b',
        },
    )
    assert request.owner.tags == ['a', 'b']
    # An [index] past a scalar list's end pads the list with `{}`
    # placeholders, the wrong type for its elements.
    with pytest.raises(ValueError) as raised:
        world.request(
            state_type='Account',
            method='set_owner',
            assignments={
                'owner.name': 'F',
                'owner.tags[1]': 'b'
            },
        )
    assert 'not the same type' in str(raised.value)
    # An element of a different type than the list's.
    with pytest.raises(ValueError) as raised:
        world.request(
            state_type='Account',
            method='set_owner',
            assignments={
                'owner.tags[0]': 'a',
                'owner.tags[1]': 5
            },
        )
    assert 'not the same type' in str(raised.value)
    # An [index] past a list of models pads with default-valued
    # elements, which `Owner`'s required `name` refuses, printing the
    # constructed JSON.
    with pytest.raises(ValueError) as raised:
        world.request(
            state_type='Account',
            method='set_owner',
            assignments={
                'owner.name': 'F',
                'co_owners[1].name': 'x'
            },
        )
    assert 'Could not build a `SetOwnerRequest` from' in str(raised.value)
    assert '"co_owners": [{}, {"name": "x"}]' in str(raised.value)


def test_colliding_properties_raise() -> None:
    world = World(client_types={'tests.reboot.bdd.pydantic.Account': Account})
    with pytest.raises(ValueError) as raised:
        world.request(
            state_type='Account',
            method='set_owner',
            assignments={
                'owner': {
                    'name': 'a'
                },
                'owner.name': 'b'
            },
        )
    assert 'collides' in str(raised.value)
    # As a list of pairs, the way the built-in steps call, even a
    # literal repeat of one property collides.
    with pytest.raises(ValueError) as raised:
        world.request(
            state_type='Account',
            method='set_owner',
            assignments=[
                Assignment(path=PropertyPath.create('owner.name'), value='a'),
                Assignment(path=PropertyPath.create('owner.name'), value='b'),
            ],
        )
    assert 'collides' in str(raised.value)


def _assertions(
    properties: dict[str, JsonValue],
) -> list[Assertion]:
    return [
        Equals(path=PropertyPath.create(text), value=value)
        for text, value in properties.items()
    ]


def test_assert_predicates_pydantic_semantics() -> None:
    owners = GetOwnersResponse(owners={'main': Owner(name='Heidi')})
    _assert_properties(
        owners,
        [Containing(path=PropertyPath.create('owners'), value='main')],
    )
    _assert_properties(
        owners,
        [OfLength(path=PropertyPath.create('owners'), length=1)],
    )
    with pytest.raises(AssertionError):
        _assert_properties(
            owners,
            [Containing(path=PropertyPath.create('owners'), value='other')],
        )
    # A pydantic number is a number in JSON, so neither predicate
    # applies to it.
    response = DepositResponse(updated_balance=150)
    with pytest.raises(ValueError, match="needs a string, list, or map"):
        _assert_properties(
            response,
            [OfLength(path=PropertyPath.create('updated_balance'), length=3)],
        )


def test_assert_properties_pydantic_semantics() -> None:
    response = GetOwnerResponse(owner=Owner(name='Frank'))
    _assert_properties(response, _assertions({'owner': {'name': 'Frank'}}))
    _assert_properties(response, _assertions({'owner.name': 'Frank'}))
    with pytest.raises(AssertionError):
        _assert_properties(
            response,
            _assertions({'owner': {
                'name': 'Frank',
                'tags': ['x']
            }}),
        )
    _assert_properties(
        GetOwnerResponse(owner=None), _assertions({'owner': None})
    )
    owners = GetOwnersResponse(owners={'main': Owner(name='Heidi')})
    _assert_properties(owners, _assertions({'owners["main"].name': 'Heidi'}))
    _assert_properties(owners, _assertions({'owners.main.name': 'Heidi'}))
    _assert_properties(
        owners, _assertions({'owners': {
            'main': {
                'name': 'Heidi'
            }
        }})
    )
    with pytest.raises(AssertionError):
        _assert_properties(owners, _assertions({'owners': {}}))


scenarios('accounts.feature')
