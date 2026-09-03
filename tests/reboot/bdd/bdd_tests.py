"""Tests of the `reboot.bdd` built-in steps and fixtures, driven by
the scenarios in `accounts.feature`."""

# The star import below is how a test module gets the built-in steps
# and their fixtures, but 'ruff' doesn't like it, so we need to
# silence their error.
#
# ruff: noqa: F403

import pytest
import re
from pytest_bdd import parsers, scenarios
from reboot.aio.external import ExternalContext
from reboot.bdd import when
from reboot.bdd.fixtures import JsonValue, PropertyPath, World
from reboot.bdd.steps import *
from reboot.bdd.steps import (
    _ASSERT_CLAUSES,
    _MIXED_CLAUSES,
    _PROPERTY_CLAUSES,
    _SAVE_CLAUSES,
    Assertion,
    Containing,
    Equals,
    OfLength,
    _almost_asserting_under_given_or_when,
    _almost_eventually_needs_within,
    _almost_eventually_under_given_or_when,
    _almost_missing_backticks,
    _almost_mixing_clauses,
    _almost_predicate_in_call_with,
    _almost_saving_in_with,
    _almost_saving_under_then,
    _almost_unclosed_backtick,
    _almost_within_message,
    _almost_within_needs_eventually,
    _assert_aborted,
    _assert_properties,
    _parse_assertions,
    _parse_assignments,
    _parse_saves,
    _the_bearer_token_is,
)
from tests.reboot.bdd.account_pb2 import (
    BalanceResponse,
    GetOwnerResponse,
    OpenResponse,
    OverdraftError,
    Owner,
)
from tests.reboot.bdd.account_rbt import Account
from typing import cast


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


def test_the_bearer_token_is() -> None:
    world = World()
    _the_bearer_token_is(world, 'admin-key')
    assert world.bearer_token == 'admin-key'
    world.saved['token'] = 'saved-key'
    _the_bearer_token_is(world, '${token}')
    assert world.bearer_token == 'saved-key'


def test_set_bearer_token_guard() -> None:
    world = World()
    world.set_bearer_token('token')
    assert world.bearer_token == 'token'
    world.shared_context = cast(ExternalContext, object())
    with pytest.raises(ValueError, match="before 'Given a shared context'"):
        world.set_bearer_token('other')


def test_clause_grammar_routing() -> None:
    properties = '`balance=50` and `owner.name="F"`'
    saves = '`balance` saved as `b`, and `owner` saved as `o`'
    mixed = '`balance=50` and `owner` saved as `o`'
    assert re.fullmatch(_PROPERTY_CLAUSES, properties)
    assert not re.fullmatch(_PROPERTY_CLAUSES, saves)
    assert not re.fullmatch(_PROPERTY_CLAUSES, mixed)
    assert re.fullmatch(_SAVE_CLAUSES, saves)
    assert not re.fullmatch(_SAVE_CLAUSES, properties)
    assert not re.fullmatch(_SAVE_CLAUSES, mixed)
    assert re.fullmatch(_MIXED_CLAUSES, mixed)
    assert not re.fullmatch(_MIXED_CLAUSES, properties)
    assert not re.fullmatch(_MIXED_CLAUSES, saves)
    predicates = '`name` containing "a and b" and `tags` of length 2'
    assert re.fullmatch(_ASSERT_CLAUSES, predicates)
    assert re.fullmatch(_ASSERT_CLAUSES, properties)
    assert not re.fullmatch(_ASSERT_CLAUSES, saves)
    assert not re.fullmatch(_PROPERTY_CLAUSES, predicates)
    assert not re.fullmatch(_SAVE_CLAUSES, predicates)
    # Lexical near-misses still route to their kind.
    assert re.fullmatch(_PROPERTY_CLAUSES, '`amount: 50`')
    assert re.fullmatch(_PROPERTY_CLAUSES, '`amount = 50`')
    assert re.fullmatch(_SAVE_CLAUSES, '`balance` saved to `b`')
    assert re.fullmatch(_SAVE_CLAUSES, '`balance` saved as "$b"')
    assert re.fullmatch(_SAVE_CLAUSES, '`balance` saved as b')


def test_almost_clause_messages() -> None:
    world = World()
    with pytest.raises(ValueError, match="with '=', not ':'"):
        _parse_assignments(world, '`amount: 50`')
    with pytest.raises(ValueError, match="without spaces around the '='"):
        _parse_assignments(world, '`amount = 50`')
    with pytest.raises(ValueError, match="without spaces around the '='"):
        _parse_assignments(world, '`amount= 50`')
    with pytest.raises(ValueError, match="the value is missing"):
        _parse_assignments(world, '`amount=`')
    with pytest.raises(ValueError, match="must be JSON"):
        _parse_assignments(world, '`amount=abc`')
    assert _parse_assignments(world, '`owner={name: "F"}`')[0].value == {
        'name': 'F'
    }
    with pytest.raises(ValueError, match="'saved as', not 'saved to'"):
        _parse_saves('`balance` saved to `b`')
    with pytest.raises(ValueError, match=r"drop the '\$'"):
        _parse_saves('`balance` saved as "$b"')
    with pytest.raises(ValueError, match="backticks, not quotes"):
        _parse_saves('`balance` saved as "b"')
    with pytest.raises(ValueError, match="name goes in backticks"):
        _parse_saves('`balance` saved as b')
    with pytest.raises(ValueError, match=r"recall a save as \$\{amount\}"):
        _parse_assignments(world, '`amount=$amount`')


def test_almost_steps_raise() -> None:
    with pytest.raises(ValueError, match="with a Then instead"):
        _almost_asserting_under_given_or_when()
    with pytest.raises(ValueError, match="Given or When 'has' instead"):
        _almost_saving_under_then()
    with pytest.raises(ValueError, match="all one kind"):
        _almost_mixing_clauses()
    with pytest.raises(ValueError, match="not a 'with' list"):
        _almost_saving_in_with()
    with pytest.raises(ValueError, match="not a call's 'with'"):
        _almost_predicate_in_call_with()
    with pytest.raises(ValueError, match="say how long"):
        _almost_eventually_needs_within()
    with pytest.raises(ValueError, match="goes with 'eventually has'"):
        _almost_within_needs_eventually()
    with pytest.raises(ValueError, match="asserts, under a Then"):
        _almost_eventually_under_given_or_when()
    assert "say seconds" in _almost_within_message('10s')
    assert "within 10 seconds" in _almost_within_message('ten seconds')
    with pytest.raises(ValueError, match="goes in backticks"):
        _almost_missing_backticks()
    with pytest.raises(ValueError, match="backtick is unclosed"):
        _almost_unclosed_backtick()


def test_parse_assertions() -> None:
    world = World()
    assert _parse_assertions(
        world,
        '`name` containing "a and b", `tags` of length 2, and '
        '`balance=50`',
    ) == [
        Containing(path=PropertyPath.create('name'), value='a and b'),
        OfLength(path=PropertyPath.create('tags'), length=2),
        Equals(path=PropertyPath.create('balance'), value=50),
    ]
    with pytest.raises(ValueError, match="'containing', not 'contains'"):
        _parse_assertions(world, '`name` contains "a"')
    with pytest.raises(ValueError, match="'of length', not 'length'"):
        _parse_assertions(world, '`tags` length 2')
    with pytest.raises(ValueError, match="takes a whole number"):
        _parse_assertions(world, '`tags` of length "2"')


def test_assert_predicates() -> None:
    tagged = GetOwnerResponse(owner=Owner(name='Frank', tags=['vip', 'beta']))
    _assert_properties(
        tagged,
        [Containing(path=PropertyPath.create('owner.name'), value='ran')],
    )
    _assert_properties(
        tagged,
        [Containing(path=PropertyPath.create('owner.tags'), value='vip')],
    )
    _assert_properties(
        tagged,
        [OfLength(path=PropertyPath.create('owner.tags'), length=2)],
    )
    with pytest.raises(AssertionError):
        _assert_properties(
            tagged,
            [Containing(path=PropertyPath.create('owner.name'), value='z')],
        )
    with pytest.raises(AssertionError):
        _assert_properties(
            tagged,
            [Containing(path=PropertyPath.create('owner.tags'), value='x')],
        )
    with pytest.raises(AssertionError):
        _assert_properties(
            tagged,
            [OfLength(path=PropertyPath.create('owner.tags'), length=3)],
        )
    with pytest.raises(ValueError, match="takes a string"):
        _assert_properties(
            tagged,
            [Containing(path=PropertyPath.create('owner.name'), value=5)],
        )
    _assert_properties(
        tagged,
        [Containing(path=PropertyPath.create('owner'), value='name')],
    )
    with pytest.raises(ValueError, match="takes a string key"):
        _assert_properties(
            tagged,
            [Containing(path=PropertyPath.create('owner'), value=5)],
        )


def test_assert_aborted_with() -> None:
    world = World()
    aborted = Account.WithdrawAborted(OverdraftError(amount=20))
    _assert_aborted(world, aborted, 'OverdraftError', '`amount=20`')
    with pytest.raises(AssertionError):
        _assert_aborted(world, aborted, 'OverdraftError', '`amount=21`')
    with pytest.raises(AssertionError):
        _assert_aborted(world, aborted, 'SomeOtherError', None)


def test_list_indices_build_requests() -> None:
    world = World(client_types={'tests.reboot.bdd.Account': Account})
    # An [index] past a list of messages pads the list, so the
    # elements below it are default-valued, proto's meaning of a
    # present-but-unset message.
    request = world.request(
        state_type='Account',
        method='set_owner',
        assignments={
            'owner.name': 'F',
            'co_owners[1].name': 'x'
        },
    )
    assert len(request.co_owners) == 2
    assert request.co_owners[0].name == ''
    assert request.co_owners[1].name == 'x'
    # A value the request type refuses prints the constructed JSON.
    with pytest.raises(ValueError) as raised:
        world.request(
            state_type='Account',
            method='deposit',
            assignments={'amount': 'abc'},
        )
    assert 'Could not build a `DepositRequest` from' in str(raised.value)
    assert '"amount": "abc"' in str(raised.value)


def _assertions(
    properties: dict[str, JsonValue],
) -> list[Assertion]:
    return [
        Equals(path=PropertyPath.create(text), value=value)
        for text, value in properties.items()
    ]


def test_assert_properties_proto_semantics() -> None:
    _assert_properties(
        BalanceResponse(balance=150), _assertions({'balance': 150})
    )
    with pytest.raises(AssertionError):
        _assert_properties(
            BalanceResponse(balance=150), _assertions({'balance': 151})
        )
    response = GetOwnerResponse(owner=Owner(name='Frank'))
    _assert_properties(response, _assertions({'owner': {'name': 'Frank'}}))
    _assert_properties(response, _assertions({'owner.name': 'Frank'}))
    tagged = GetOwnerResponse(owner=Owner(name='Frank', tags=['vip', 'beta']))
    _assert_properties(tagged, _assertions({'owner.tags[1]': 'beta'}))
    with pytest.raises(AssertionError):
        _assert_properties(tagged, _assertions({'owner.tags[2]': 'x'}))
    with pytest.raises(AssertionError):
        _assert_properties(
            response,
            _assertions({'owner': {
                'name': 'Frank',
                'tags': ['x']
            }}),
        )
    with pytest.raises(AssertionError):
        _assert_properties(
            OpenResponse(account_id='150'), _assertions({'account_id': 150})
        )


scenarios('accounts.feature')
