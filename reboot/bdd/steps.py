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
from reboot.bdd.fixtures import World
from reboot.bdd.fixtures import rbt as rbt
from reboot.bdd.fixtures import reboot_event_loop as reboot_event_loop
from reboot.bdd.fixtures import world as world
from reboot.bdd.registry import client_types_by_name
from typing import Any, Optional

# One 'name=value' property in step text: the name (possibly dotted,
# to reach a nested property) and value in backticks, the value
# being anything up to the closing backtick.
_PROPERTY_PATTERN = re.compile(r'`(?P<name>\w+(?:\.\w+)*)=(?P<value>[^`]+)`')

# What separates two properties in step text: a comma, an 'and', or a
# comma followed by an 'and'.
_SEPARATOR_PATTERN = re.compile(r'\s*(?:,\s*and|,|and)\s+')

# The 'the `Account` for "alice"' phrase naming the state a step acts
# on.
_STATE = r'the `(?P<state_type>[\w.]+)` for "(?P<state_id>[^"]*)"'

# A step's optional trailing property list.
_PROPERTIES = r'(?: with (?P<properties>.+))?'


def _parse_properties(properties: Optional[str]) -> dict[str, Any]:
    """Parses a step's property list, e.g. '`amount=50` and
    `reason="promo"`', into a dictionary of Python literal values."""
    if properties is None:
        return {}
    parsed: dict[str, Any] = {}
    text = properties.strip()
    position = 0
    while position < len(text):
        if position > 0:
            separator = _SEPARATOR_PATTERN.match(text, position)
            if separator is None:
                raise ValueError(
                    "Expected a ',' or 'and' between properties, but "
                    f"got: {text[position:]}"
                )
            position = separator.end()
        property_match = _PROPERTY_PATTERN.match(text, position)
        if property_match is None:
            raise ValueError(
                "Expected a property of the form `name=value`, but "
                f"got: {text[position:]}"
            )
        try:
            value = ast.literal_eval(property_match['value'])
        except (ValueError, SyntaxError) as error:
            raise ValueError(
                f"The value of `{property_match['name']}` must be a Python "
                "literal, e.g. 50, 2.5, \"text\", or True, but got: "
                f"{property_match['value']}"
            ) from error
        parsed[property_match['name']] = value
        position = property_match.end()
    return parsed


def _assert_properties(subject: Any, properties: dict[str, Any]) -> None:
    """Asserts that each of the given (possibly dotted) property names
    reaches the expected value on the given response, state, or
    error."""
    for name, expected in properties.items():
        actual = subject
        for attribute in name.split('.'):
            try:
                actual = getattr(actual, attribute)
            except AttributeError as error:
                raise AssertionError(
                    f"Expected `{type(actual).__name__}` to have a "
                    f"property `{attribute}` (from "
                    f"`{name}={expected!r}`), but it has no such "
                    "property"
                ) from error
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
            world.context(), state_id, **_parse_properties(properties)
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
    try:
        world.response = await world.call(
            state_type=state_type,
            state_id=state_id,
            method=method,
            properties=_parse_properties(properties),
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
    try:
        world.response = await world.call(
            state_type=state_type,
            state_id=state_id,
            method=method,
            properties=_parse_properties(properties),
        )
        world.aborted = None
    except Aborted as aborted:
        world.aborted = aborted


@then(
    parsers.re(
        r'the attempt aborts with `(?P<error_type>\w+)`'
        r'(?: where (?P<properties>.+))?$'
    )
)
def _the_attempt_aborts_with(
    world: World,
    error_type: str,
    properties: Optional[str],
) -> None:
    assert world.aborted is not None, (
        "Expected the most recent 'attempts' step to have aborted, "
        "but it succeeded"
    )
    error = world.aborted.error
    assert type(error).__name__ == error_type, (
        f"Expected the attempt to have aborted with `{error_type}`, "
        f"but it aborted with `{type(error).__name__}`: "
        f"{world.aborted}"
    )
    _assert_properties(error, _parse_properties(properties))


@then(
    parsers.re(rf'`(?P<method>\w+)` on {_STATE} '
               r'has (?P<properties>.+)$')
)
async def _has(
    world: World,
    method: str,
    state_type: str,
    state_id: str,
    properties: str,
) -> None:
    try:
        response = await world.call(
            state_type=state_type,
            state_id=state_id,
            method=method,
            properties={},
        )
    except Aborted as aborted:
        raise AssertionError(
            f"`{method}` on the `{state_type}` for \"{state_id}\" "
            f"{aborted}"
        ) from aborted
    _assert_properties(response, _parse_properties(properties))


@then(parsers.re(r'the response has (?P<properties>.+)$'))
def _the_response_has(world: World, properties: str) -> None:
    assert world.response is not None, (
        "Expected a preceding step to have made a call that returned "
        "a response, but there is none"
    )
    _assert_properties(world.response, _parse_properties(properties))
