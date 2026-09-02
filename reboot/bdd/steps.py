"""The built-in `reboot.bdd` steps.

A test module makes these steps, and the fixtures they run on,
available to its scenarios with:

    from reboot.bdd.steps import *

The steps run against the `Application` returned by the
`application` fixture, which each test suite defines in its
`conftest.py` or test module, for example:

    @pytest.fixture
    def application() -> Application:
        return Application(servicers=[AccountServicer])

Step text refers to a state type by its class name in backticks (or
by its full state type name, e.g. `bank.v1.Account`, when more than
one state type goes by the class name), to a state's ID in double
quotes, and to properties as a list of
`name=value` pairs, each in backticks, separated by commas or 'and',
whose values are Python literals:

    Given the application is up
    And an `Account` for "alice" gets created via `open`
    When the `Account` for "alice" gets a `deposit` with `amount=50`
    Then `balance` on the `Account` for "alice" has
      `balance=50`

A Then 'has' asserts and a Given or When 'has' saves, and readers
are only read that way: 'gets a' and 'attempts a' refuse readers the
way 'has' refuses writers, and a reader's abort is asserted with
'`reader` on ... aborts with ...'.

A 'has' or 'where' list can also save a property under a name,
which later steps say as `$name`, in a state's ID or as a property
value (a quoted "$name" stays the literal string):

    When `get_owner` on the `Account` for "frank" has
      `owner.name` saved as "$owner_name"
    And the resulting `updated_balance` is saved as "$balance"
    And the `Account` for "$owner_name" gets a `deposit` with
      `amount=1`
"""

# The step functions below take the `rbt` and `world`
# fixtures as parameters, which 'ruff' sees as shadowing this module's
# re-exports of those fixtures, so we need to silence their error.
#
# ruff: noqa: F811

import ast
import pytest
import re
from pytest_bdd import parsers
from reboot.aio.aborted import Aborted
from reboot.aio.applications import Application
from reboot.aio.tests import Reboot
from reboot.bdd import given, then, when
# Re-exported so that `from reboot.bdd.steps import *` brings in the
# fixtures the steps run on.
from reboot.bdd.fixtures import JsonValue, World, _json_object
from reboot.bdd.fixtures import rbt as rbt
from reboot.bdd.fixtures import reboot_event_loop as reboot_event_loop
from reboot.bdd.fixtures import world as world
from reboot.bdd.registry import client_types_by_name
from typing import Any, Optional

# One 'name=value' property in step text: the name (possibly dotted,
# to reach a nested property) and value in backticks, the value
# being anything up to the closing backtick.
_PROPERTY_PATTERN = re.compile(r'`(?P<name>\w+(?:\.\w+)*)=(?P<value>[^`]+)`')

# One saving clause in a 'has' or 'where' list: the (possibly
# dotted) property name in backticks, saved under a '$name'.
_SAVE_PATTERN = re.compile(
    r'`(?P<name>\w+(?:\.\w+)*)` saved as "\$(?P<saved>\w+)"'
)

# What separates two clauses in step text: a comma, an 'and', or a
# comma followed by an 'and'.
_SEPARATOR_PATTERN = re.compile(r'\s*(?:,\s*and|,|and)\s+')

# The 'the `Account` for "alice"' phrase naming the state a step acts
# on.
_STATE = r'the `(?P<state_type>[\w.]+)` for "(?P<state_id>[^"]*)"'

# A step's optional trailing property list.
_PROPERTIES = r'(?: with (?P<properties>.+))?'


def _saved_value(world: World, name: str) -> JsonValue:
    """The saved value going by the given name; raises if there is
    none."""
    if name not in world.saved:
        raise ValueError(
            f'Nothing saved as "${name}"; saved: ' +
            (', '.join(f'"${n}"' for n in sorted(world.saved)) or "nothing")
        )
    return world.saved[name]


def _resolve_state_id(world: World, state_id: str) -> str:
    """The state ID a step names: the saved value when the ID is of
    the form '$name', otherwise the ID itself."""
    if not re.fullmatch(r'\$\w+', state_id):
        return state_id
    value = _saved_value(world, state_id[1:])
    if not isinstance(value, str):
        raise ValueError(
            f'The value saved as "${state_id[1:]}" must be a string '
            f"to name a state, but it is {value!r}"
        )
    return value


def _parse_clauses(
    world: World,
    clauses: Optional[str],
) -> tuple[dict[str, Any], dict[str, str]]:
    """Parses a step's clause list into the properties to compare,
    e.g. '`amount=50`', and, keyed by the name to save under, the
    properties to save, e.g. '`amount` saved as "$amount"'; a
    property value of the form '$name' becomes the saved value going
    by that name."""
    properties: dict[str, Any] = {}
    saves: dict[str, str] = {}
    if clauses is None:
        return properties, saves
    text = clauses.strip()
    position = 0
    while position < len(text):
        if position > 0:
            separator = _SEPARATOR_PATTERN.match(text, position)
            if separator is None:
                raise ValueError(
                    "Expected a ',' or 'and' between clauses, but "
                    f"got: {text[position:]}"
                )
            position = separator.end()
        save_match = _SAVE_PATTERN.match(text, position)
        if save_match is not None:
            saves[save_match['saved']] = save_match['name']
            position = save_match.end()
            continue
        property_match = _PROPERTY_PATTERN.match(text, position)
        if property_match is None:
            raise ValueError(
                "Expected a clause of the form `name=value` or "
                "`name` saved as \"$name\", but got: "
                f"{text[position:]}"
            )
        try:
            if re.fullmatch(r'\$\w+', property_match['value']):
                value = _saved_value(world, property_match['value'][1:])
            else:
                value = ast.literal_eval(property_match['value'])
        except (ValueError, SyntaxError) as error:
            raise ValueError(
                f"The value of `{property_match['name']}` must be a Python "
                "literal, e.g. 50, 2.5, \"text\", or True, but got: "
                f"{property_match['value']}"
            ) from error
        properties[property_match['name']] = value
        position = property_match.end()
    return properties, saves


def _parse_properties(
    world: World,
    properties: Optional[str],
) -> dict[str, Any]:
    """Parses a step's property list, e.g. '`amount=50` and
    `reason="promo"`', into a dictionary of Python literal values; a
    saving clause is refused, it belongs in a 'has' or 'where'
    list."""
    parsed, saves = _parse_clauses(world, properties)
    if saves:
        raise ValueError(
            "A property can only be saved from a 'has' or 'where' "
            "list, not passed to a call: " +
            ', '.join(f'"${name}"' for name in sorted(saves))
        )
    return parsed


def _assert_clauses(
    world: World,
    subject: Any,
    clauses: Optional[str],
) -> None:
    """Asserts the given clause list against the given response,
    state, or error; saving clauses are refused, they belong under
    Given or When."""
    properties, saves = _parse_clauses(world, clauses)
    if saves:
        raise ValueError(
            "A Then 'has' or 'where' asserts; save under Given or "
            "When instead: " +
            ', '.join(f'"${name}"' for name in sorted(saves))
        )
    _assert_properties(subject, properties)


def _save_clauses(
    world: World,
    subject: Any,
    clauses: Optional[str],
) -> None:
    """Saves the properties the given clause list names from the
    given response; comparing clauses are refused, they belong in a
    Then."""
    properties, saves = _parse_clauses(world, clauses)
    if properties:
        raise ValueError(
            "A Given or When 'has' saves; assert with a Then "
            "instead: " +
            ', '.join(f'`{name}`' for name in sorted(properties))
        )
    if not saves:
        raise ValueError(
            "Expected at least one saving clause, e.g. "
            '`name` saved as "$name"'
        )
    subject_json = _json_object(subject)
    for name, property_name in saves.items():
        world.saved[name] = _resolve_json_property(subject_json, property_name)


def _resolve_json_property(json_object: JsonValue, name: str) -> JsonValue:
    """The value the (possibly dotted) property name reaches in the
    given JSON object; saving walks the response's JSON, rather than
    the live response the way asserting does, so that saved values
    are canonical JSON."""
    value = json_object
    for part in name.split('.'):
        if not isinstance(value, dict):
            raise AssertionError(
                f"Expected an object with a property `{part}` (from "
                f"`{name}`), but got: {value!r}"
            )
        if part not in value:
            raise AssertionError(
                f"Expected a property `{part}` (from `{name}`), but "
                "there are: " + (
                    ', '.join(f'`{n}`'
                              for n in sorted(value)) or "no properties"
                )
            )
        value = value[part]
    return value


def _resolve_property(subject: Any, name: str) -> Any:
    """The value the (possibly dotted) property name reaches on the
    given response, state, or error."""
    actual = subject
    for attribute in name.split('.'):
        try:
            actual = getattr(actual, attribute)
        except AttributeError as error:
            raise AssertionError(
                f"Expected `{type(actual).__name__}` to have a "
                f"property `{attribute}` (from `{name}`), but it has "
                "no such property"
            ) from error
    return actual


def _assert_properties(subject: Any, properties: dict[str, Any]) -> None:
    """Asserts that each of the given (possibly dotted) property names
    reaches the expected value on the given response, state, or
    error."""
    for name, expected in properties.items():
        actual = _resolve_property(subject, name)
        assert actual == expected, (
            f"Expected `{name}` to be {expected!r}, but it is {actual!r}"
        )


@given('the application is up')
async def _the_application_is_up(
    rbt: Reboot,
    application: Application,
    world: World,
    request: pytest.FixtureRequest,
) -> None:
    await rbt.up(application)
    world.client_types = client_types_by_name(application)
    world.rbt = rbt
    world.name = request.node.name


@given('a shared context')
def _a_shared_context(world: World) -> None:
    world.shared_context = world.context()


@given(
    parsers.re(
        r'(?:a|an) `(?P<state_type>[\w.]+)` for "(?P<state_id>[^"]*)" '
        rf'gets created via `(?P<method>\w+)`{_PROPERTIES}$'
    )
)
async def _gets_created_via(
    world: World,
    state_type: str,
    state_id: str,
    method: str,
    properties: Optional[str],
) -> None:
    factory = world.factory(state_type=state_type, method=method)
    try:
        _, world.response = await factory(
            world.context(), _resolve_state_id(world, state_id),
            **_parse_properties(world, properties)
        )
    except Aborted as aborted:
        raise AssertionError(
            f"Creating the `{state_type}` for \"{state_id}\" via "
            f"`{method}` {aborted}"
        ) from aborted


@given(parsers.re(rf'{_STATE} gets a `(?P<method>\w+)`{_PROPERTIES}$'))
@when(parsers.re(rf'{_STATE} gets a `(?P<method>\w+)`{_PROPERTIES}$'))
async def _gets_a(
    world: World,
    state_type: str,
    state_id: str,
    method: str,
    properties: Optional[str],
) -> None:
    if world.is_reader(state_type=state_type, method=method):
        raise ValueError(
            f"`{method}` is a reader; read it with "
            f"'`{method}` on the `{state_type}` for \"...\" has ...'"
        )
    try:
        world.response = await world.call(
            state_type=state_type,
            state_id=_resolve_state_id(world, state_id),
            method=method,
            properties=_parse_properties(world, properties),
        )
    except Aborted as aborted:
        raise AssertionError(
            f"The `{state_type}` for \"{state_id}\" getting a "
            f"`{method}` {aborted}; to assert an expected abort, "
            "write 'attempts a' with 'Then the attempt aborts with "
            f"`{type(aborted.error).__name__}`'"
        ) from aborted


@when(parsers.re(rf'{_STATE} attempts a `(?P<method>\w+)`{_PROPERTIES}$'))
async def _attempts_a(
    world: World,
    state_type: str,
    state_id: str,
    method: str,
    properties: Optional[str],
) -> None:
    if world.is_reader(state_type=state_type, method=method):
        raise ValueError(
            f"`{method}` is a reader; assert its abort with "
            f"'`{method}` on the `{state_type}` for \"...\" aborts "
            "with ...'"
        )
    try:
        world.response = await world.call(
            state_type=state_type,
            state_id=_resolve_state_id(world, state_id),
            method=method,
            properties=_parse_properties(world, properties),
        )
        world.aborted = None
    except Aborted as aborted:
        world.aborted = aborted


def _assert_aborted(
    world: World,
    aborted: Aborted,
    error_type: str,
    clauses: Optional[str],
) -> None:
    """Asserts that the given abort's error is of the named type and
    satisfies the given 'where' clauses."""
    error = aborted.error
    assert type(error).__name__ == error_type, (
        f"Expected an abort with `{error_type}`, but it aborted "
        f"with `{type(error).__name__}`: {aborted}"
    )
    _assert_clauses(world, error, clauses)


@then(
    parsers.re(
        r'the attempt aborts with `(?P<error_type>\w+)`'
        r'(?: where (?P<clauses>.+))?$'
    )
)
def _the_attempt_aborts_with(
    world: World,
    error_type: str,
    clauses: Optional[str],
) -> None:
    assert world.aborted is not None, (
        "Expected the most recent 'attempts' step to have aborted, "
        "but it succeeded"
    )
    _assert_aborted(world, world.aborted, error_type, clauses)


async def _read(
    world: World,
    method: str,
    state_type: str,
    state_id: str,
) -> Any:
    """Calls the named reader on the named state, recording and
    returning its response; raises if the method is not a reader."""
    if not world.is_reader(state_type=state_type, method=method):
        raise ValueError(
            f"`{method}` is not a reader; call it with 'the "
            f"`{state_type}` for \"...\" gets a `{method}`'"
        )
    try:
        world.response = await world.call(
            state_type=state_type,
            state_id=_resolve_state_id(world, state_id),
            method=method,
            properties={},
        )
        return world.response
    except Aborted as aborted:
        raise AssertionError(
            f"`{method}` on the `{state_type}` for \"{state_id}\" "
            f"{aborted}"
        ) from aborted


@then(parsers.re(rf'`(?P<method>\w+)` on {_STATE} '
                 r'has (?P<clauses>.+)$'))
async def _then_has(
    world: World,
    method: str,
    state_type: str,
    state_id: str,
    clauses: str,
) -> None:
    response = await _read(world, method, state_type, state_id)
    _assert_clauses(world, response, clauses)


@given(parsers.re(rf'`(?P<method>\w+)` on {_STATE} '
                  r'has (?P<clauses>.+)$'))
@when(parsers.re(rf'`(?P<method>\w+)` on {_STATE} '
                 r'has (?P<clauses>.+)$'))
async def _when_has(
    world: World,
    method: str,
    state_type: str,
    state_id: str,
    clauses: str,
) -> None:
    response = await _read(world, method, state_type, state_id)
    _save_clauses(world, response, clauses)


@then(
    parsers.re(
        rf'`(?P<method>\w+)` on {_STATE} '
        r'aborts with `(?P<error_type>\w+)`'
        r'(?: where (?P<clauses>.+))?$'
    )
)
async def _aborts_with(
    world: World,
    method: str,
    state_type: str,
    state_id: str,
    error_type: str,
    clauses: Optional[str],
) -> None:
    if not world.is_reader(state_type=state_type, method=method):
        raise ValueError(
            f"`{method}` is not a reader; assert its abort with "
            f"'attempts a `{method}`' and 'the attempt aborts with "
            "...'"
        )
    try:
        await world.call(
            state_type=state_type,
            state_id=_resolve_state_id(world, state_id),
            method=method,
            properties={},
        )
    except Aborted as aborted:
        _assert_aborted(world, aborted, error_type, clauses)
        return
    raise AssertionError(
        f"Expected `{method}` on the `{state_type}` for "
        f'"{state_id}" to abort with `{error_type}`, but it '
        "succeeded"
    )


@then(parsers.re(r'the result has (?P<clauses>.+)$'))
def _the_result_has(world: World, clauses: str) -> None:
    assert world.response is not None, (
        "Expected a preceding step to have made a call that returned "
        "a response, but there is none"
    )
    _assert_clauses(world, world.response, clauses)


@given(
    parsers.re(
        r'the resulting `(?P<property_name>\w+(?:\.\w+)*)` '
        r'is saved as "\$(?P<name>\w+)"$'
    )
)
@when(
    parsers.re(
        r'the resulting `(?P<property_name>\w+(?:\.\w+)*)` '
        r'is saved as "\$(?P<name>\w+)"$'
    )
)
def _the_resulting_property_is_saved_as(
    world: World,
    property_name: str,
    name: str,
) -> None:
    assert world.response is not None, (
        "Expected a preceding step to have made a call that returned "
        "a response, but there is none"
    )
    world.saved[name] = _resolve_json_property(
        _json_object(world.response), property_name
    )
