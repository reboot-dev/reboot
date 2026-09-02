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
from reboot.bdd.fixtures import JsonValue, PropertyPath, World
from reboot.bdd.steps import *
from reboot.bdd.steps import _assert_properties
from tests.reboot.bdd.pydantic.account_api import (
    GetOwnerResponse,
    GetOwnersResponse,
    Owner,
)
from tests.reboot.bdd.pydantic.account_api_rbt import Account


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


def test_unknown_property_raises() -> None:
    world = World(client_types={'tests.reboot.bdd.pydantic.Account': Account})
    with pytest.raises(ValueError) as raised:
        world.request(
            state_type='Account',
            method='deposit',
            properties={'amunt': 50},
        )
    assert 'has no property `amunt`' in str(raised.value)


def test_list_indices_build_requests() -> None:
    world = World(client_types={'tests.reboot.bdd.pydantic.Account': Account})
    request = world.request(
        state_type='Account',
        method='set_owner',
        properties={
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
            properties={
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
            properties={
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
            properties={
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
            properties={
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
            properties=[
                (PropertyPath.create('owner.name'), 'a'),
                (PropertyPath.create('owner.name'), 'b'),
            ],
        )
    assert 'collides' in str(raised.value)


def _properties(
    properties: dict[str, JsonValue],
) -> list[tuple[PropertyPath, JsonValue]]:
    return [
        (PropertyPath.create(text), value)
        for text, value in properties.items()
    ]


def test_assert_properties_pydantic_semantics() -> None:
    response = GetOwnerResponse(owner=Owner(name='Frank'))
    _assert_properties(response, _properties({'owner': {'name': 'Frank'}}))
    _assert_properties(response, _properties({'owner.name': 'Frank'}))
    with pytest.raises(AssertionError):
        _assert_properties(
            response,
            _properties({'owner': {
                'name': 'Frank',
                'tags': ['x']
            }}),
        )
    _assert_properties(
        GetOwnerResponse(owner=None), _properties({'owner': None})
    )
    owners = GetOwnersResponse(owners={'main': Owner(name='Heidi')})
    _assert_properties(owners, _properties({'owners["main"].name': 'Heidi'}))
    _assert_properties(owners, _properties({'owners.main.name': 'Heidi'}))
    _assert_properties(
        owners, _properties({'owners': {
            'main': {
                'name': 'Heidi'
            }
        }})
    )
    with pytest.raises(AssertionError):
        _assert_properties(owners, _properties({'owners': {}}))


scenarios('accounts.feature')
