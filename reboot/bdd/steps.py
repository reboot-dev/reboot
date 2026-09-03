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
quotes, and to properties as `path=value` assignments, each in
backticks, separated by commas or 'and'; the value is JSON, with
JSON5's leniencies (object keys need no quotes), and an object or
array value is validated by the method's request type when calling
and, when asserting, compared as the complete message the actual
value's type parses it as. A dotted path nests when calling, e.g.
`owner.name="Frank"`, and reaches into the response when asserting:

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

import json5
import jsonpath_ng
import pytest
import re
from dataclasses import dataclass
from google.protobuf import json_format
from google.protobuf.message import Message
# Re-exported so that `from reboot.bdd.steps import *` brings in the
# fixtures the steps run on.
from pydantic import TypeAdapter, ValidationError
from pytest_bdd import parsers
from reboot.aio.aborted import Aborted
from reboot.aio.applications import Application
from reboot.aio.tests import Reboot
from reboot.api import Model
from reboot.bdd import given, then, when
from reboot.bdd.fixtures import (
    Assignment,
    JsonValue,
    PropertyPath,
    World,
    _json_object,
    _zero_indexed,
)
from reboot.bdd.fixtures import rbt as rbt
from reboot.bdd.fixtures import reboot_event_loop as reboot_event_loop
from reboot.bdd.fixtures import world as world
from reboot.bdd.registry import client_types_by_name
from typing import Any, Optional, Union, get_args, get_origin

# A property path in step text: a leading field, then dotted fields,
# bracketed list indices, and bracketed map keys.
_PATH = r'\w+(?:\.\w+|\[\d+\]|\["[^"]*"\])*'

# One 'path=value' property clause: the property's path and value
# in backticks, the value being anything up to the closing backtick.
# The groupless form embeds in step patterns and deliberately also
# matches lexical near-misses (':' for '=', spaces around the '=',
# an empty value) so that those route to a step whose parser
# raises the fix; the compiled form is the strict shape, for
# extraction.
_PROPERTY_CLAUSE = rf'`{_PATH}\s*[:=]\s*[^`]*`'
_PROPERTY_PATTERN = re.compile(rf'`(?P<path>{_PATH})=(?P<value>\S[^`]*)`')

# One saving clause: the (possibly dotted) property name in
# backticks, saved under a '$name'. The groupless form embeds in
# step patterns and deliberately also matches lexical near-misses
# ('saved to', a missing '$' or missing quotes) so that those route
# to a step whose parser raises the fix; the compiled form is the
# strict shape, for extraction.
_SAVE_CLAUSE = rf'`{_PATH}`\s+saved\s+(?:as|to)\s+"?\$?\w+"?'
_SAVE_PATTERN = re.compile(rf'`(?P<path>{_PATH})` saved as "\$(?P<saved>\w+)"')

# What separates two clauses in step text: a comma, an 'and', or a
# comma followed by an 'and'.
_SEPARATOR = r'\s*(?:,\s*and|,|and)\s+'

# A clause list of only 'path=value' properties: what a 'with'
# passes to a call, and what a Then 'has'/'where' asserts.
_PROPERTY_CLAUSES = rf'{_PROPERTY_CLAUSE}(?:{_SEPARATOR}{_PROPERTY_CLAUSE})*'

# A clause list of only saving clauses: what a Given or When 'has'
# saves.
_SAVE_CLAUSES = rf'{_SAVE_CLAUSE}(?:{_SEPARATOR}{_SAVE_CLAUSE})*'

# A clause list mixing both kinds, which no step accepts; it exists
# so the mistake gets a pointed error instead of an unmatched step.
# A property value can never contain a backtick, so the lookaheads
# can only hit an actual clause of each kind.
_CLAUSE = rf'(?:{_PROPERTY_CLAUSE}|{_SAVE_CLAUSE})'
_MIXED_CLAUSES = (
    rf'(?=.*`\s+saved\s)(?=.*`{_PATH}\s*[:=])'
    rf'{_CLAUSE}(?:{_SEPARATOR}{_CLAUSE})*'
)

# The 'the `Account` for "alice"' phrase naming the state a step acts
# on.
_STATE = r'the `(?P<state_type>[\w.]+)` for "(?P<state_id>[^"]*)"'


@dataclass(frozen=True)
class Equals:
    """A `path=value` clause in an asserting list: the property
    equals the value under the response type's semantics."""

    # The property asserted on.
    path: PropertyPath

    # The value it must equal, as written (JSON).
    value: JsonValue


# What one clause of an asserting list parses to.
Assertion = Equals

# A step's optional trailing property list.
_PROPERTIES = rf'(?: with (?P<clauses>{_PROPERTY_CLAUSES}))?'


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


def _almost_property_message(clause: str) -> str:
    """The 'Almost' error for a property clause that is a lexical
    near-miss of `path=value`."""
    if re.match(rf'`{_PATH}\s*:', clause):
        return f"Almost: say `path=value` with '=', not ':': {clause}"
    if re.fullmatch(rf'`{_PATH}\s*=\s*`', clause):
        return f"Almost: the value is missing: {clause}"
    if re.match(rf'`{_PATH}\s+=', clause) or re.match(rf'`{_PATH}=\s', clause):
        return (
            "Almost: write `path=value` without spaces around the "
            f"'=': {clause}"
        )
    return f"Expected a property of the form `path=value`, but got: {clause}"


def _almost_save_message(clause: str) -> str:
    """The 'Almost' error for a saving clause that is a lexical
    near-miss of `name` saved as "$name"."""
    if re.search(r'\bsaved\s+to\b', clause):
        return f"Almost: say 'saved as', not 'saved to': {clause}"
    if re.search(r'\bsaved\s+as\s+\$\w+$', clause):
        return f'Almost: quote the name, e.g. saved as "$name": {clause}'
    if re.search(r'\bsaved\s+as\s+"\w+"$', clause):
        return (
            "Almost: the name needs a '$', e.g. saved as "
            f'"$name": {clause}'
        )
    return (
        'Expected a saving clause of the form `name` saved as "$name", '
        f'but got: {clause}'
    )


def _parse_assignments(
    world: World,
    clauses: Optional[str],
) -> list[Assignment]:
    """Parses a call's 'with' list, e.g. '`amount=50` and
    `reason="promo"`', into `Assignment`s; a property value of the
    form '$name' becomes the saved value going by that name. The step
    patterns admit lexical near-misses of a clause, so each clause is
    confirmed strict here, raising the fix."""
    assignments: list[Assignment] = []
    if clauses is None:
        return assignments
    for clause_match in re.finditer(_PROPERTY_CLAUSE, clauses):
        property_match = _PROPERTY_PATTERN.fullmatch(clause_match[0])
        if property_match is None:
            raise ValueError(_almost_property_message(clause_match[0]))
        if re.fullmatch(r'\$\w+', property_match['value']):
            value = _saved_value(world, property_match['value'][1:])
        else:
            try:
                value = json5.loads(property_match['value'])
            except ValueError as error:
                raise ValueError(
                    f"The value of `{property_match['path']}` must "
                    "be JSON, e.g. 50, 2.5, \"text\", true, or "
                    '{name: "value"}, but got: '
                    f"{property_match['value']}"
                ) from error
        assignments.append(
            Assignment(
                path=PropertyPath.create(property_match['path']),
                value=value,
            )
        )
    return assignments


def _parse_saves(clauses: str) -> dict[str, PropertyPath]:
    """Parses a Given or When 'has' list of saving clauses, e.g.
    '`amount` saved as "$amount"', into the property to save under
    each name. The step patterns admit lexical near-misses of a
    clause, so each clause is confirmed strict here, raising the
    fix."""
    saves: dict[str, PropertyPath] = {}
    for clause_match in re.finditer(_SAVE_CLAUSE, clauses):
        save_match = _SAVE_PATTERN.fullmatch(clause_match[0])
        if save_match is None:
            raise ValueError(_almost_save_message(clause_match[0]))
        saves[save_match['saved']] = PropertyPath.create(save_match['path'])
    return saves


def _resolve_json_property(
    json_object: JsonValue,
    path: PropertyPath,
) -> JsonValue:
    """The value the property's path finds in the given JSON object;
    walking the response's JSON, rather than the live response, keeps
    every value canonical JSON."""
    found = path.expression.find(json_object)
    if len(found) == 1:
        return found[0].value
    if len(found) > 1:
        raise AssertionError(
            f"Expected `{path.text}` to find one value, but it found "
            f"{len(found)}"
        )

    # Nothing found: probe the path prefix by prefix for an error
    # naming where and why.
    def atoms(
        expression: jsonpath_ng.JSONPath,
    ) -> list[jsonpath_ng.JSONPath]:
        match expression:
            case jsonpath_ng.Child(left=left, right=right):
                return atoms(left) + atoms(right)
            case jsonpath_ng.Root():
                return []
            case _:
                return [expression]

    prefix: Optional[jsonpath_ng.JSONPath] = None
    value: JsonValue = json_object
    for atom in atoms(path.expression):
        prefix = atom if prefix is None else jsonpath_ng.Child(prefix, atom)
        prefixed = prefix.find(json_object)
        if prefixed:
            value = prefixed[0].value
            continue
        match atom:
            case jsonpath_ng.Index(indices=(index,)
                                  ) if isinstance(value, list):
                raise AssertionError(
                    f"Expected at least {index + 1} elements at "
                    f"`{prefix}` (from `{path.text}`), but there "
                    f"are {len(value)}"
                )
            case jsonpath_ng.Index():
                raise AssertionError(
                    f"Expected a list at `{prefix}` (from "
                    f"`{path.text}`), but got: {value!r}"
                )
            case jsonpath_ng.Fields(fields=(fieldname,)
                                   ) if isinstance(value, dict):
                raise AssertionError(
                    f"Expected a property `{fieldname}` (from "
                    f"`{path.text}`), but there are: " + (
                        ', '.join(f'`{n}`'
                                  for n in sorted(value)) or "no properties"
                    )
                )
            case _:
                raise AssertionError(
                    f"Expected an object at `{prefix}` (from "
                    f"`{path.text}`), but got: {value!r}"
                )
    raise AssertionError(f"Expected `{path.text}` to find one value")


def _proto_property_matches(
    message_type: type[Message],
    path: PropertyPath,
    actual: JsonValue,
    expected: JsonValue,
) -> bool:
    """Whether the actual (canonical JSON) value of the named
    property equals the expected JSON value under the message type's
    semantics: both are parsed into the type as just that property
    and the resulting messages compared, so e.g. a 64-bit integer
    matches its canonical string form and an object compares as the
    complete message with unset properties at their defaults."""
    # We transform the path to always set the first (0th index) of a
    # list vs what ever the path originally was extracting (e.g., [2]
    # for the 3rd element) so that we aren't comparing lists with gaps
    # (which won't always work and doesn't buy us anything anyway).
    expression = _zero_indexed(path.expression)

    def sparse(value: JsonValue) -> Message:
        result: dict[str, JsonValue] = {}
        expression.update_or_create(result, value)
        try:
            return json_format.ParseDict(result, message_type())
        except json_format.ParseError as error:
            raise AssertionError(
                f"`{path.text}` cannot be {value!r} on "
                f"`{message_type.__name__}`: {error}"
            ) from error

    # Create a sparse message that only has the values set from what
    # `path` dictates, such that we can then just rely on protobuf
    # comparisons to handle things like 64-bit integers (which are
    # strings in JSON) or bytes (which are base64 encoded).
    return sparse(actual) == sparse(expected)


def _without_optional(annotation: Any) -> Any:
    """The annotation with an `Optional[...]` wrapper removed."""
    if get_origin(annotation) is Union:
        arguments = [
            argument for argument in get_args(annotation)
            if argument is not type(None)
        ]
        if len(arguments) == 1:
            return arguments[0]
    return annotation


def _pydantic_annotation(model_type: type[Model], path: PropertyPath) -> Any:
    """The annotation the property's path reaches on the given model
    type: a field reaches a model's field or a `dict` value, and an
    index a `list` element."""

    def reached(annotation: Any, expression: jsonpath_ng.JSONPath) -> Any:
        match expression:
            case jsonpath_ng.Child(left=left, right=right):
                return reached(reached(annotation, left), right)
            case jsonpath_ng.Root():
                return annotation
        annotation = _without_optional(annotation)
        match expression:
            case jsonpath_ng.Fields(fields=(fieldname,)) if (
                isinstance(annotation, type) and issubclass(annotation, Model)
            ):
                field = annotation.model_fields.get(str(fieldname))
                if field is None:
                    raise AssertionError(
                        f"`{annotation.__name__}` has no property "
                        f"`{fieldname}` (from `{path.text}`)"
                    )
                return field.annotation
            case jsonpath_ng.Fields() if get_origin(annotation) is dict:
                return get_args(annotation)[1]
            case jsonpath_ng.Index() if get_origin(annotation) is list:
                return get_args(annotation)[0]
            case _:
                raise AssertionError(
                    f"Cannot reach `{expression}` (from `{path.text}`) "
                    f"in {annotation!r}"
                )

    return reached(model_type, path.expression)


def _pydantic_property_matches(
    model_type: type[Model],
    path: PropertyPath,
    actual: JsonValue,
    expected: JsonValue,
) -> bool:
    """Whether the actual (dumped) value of the named property equals
    the expected JSON value under the model type's semantics: both
    sides validate as the property's annotation, so an object
    compares as the complete model with missing properties at their
    defaults, and a value in its JSON spelling equals the value it
    validates as."""
    adapter = TypeAdapter(_pydantic_annotation(model_type, path))
    try:
        return adapter.validate_python(actual
                                      ) == adapter.validate_python(expected)
    except ValidationError as error:
        raise AssertionError(
            f"`{path.text}` cannot be {expected!r} on "
            f"`{model_type.__name__}`: {error}"
        ) from error


def _assert_properties(
    subject: Union[Message, Model],
    assertions: list[Assertion],
) -> None:
    """Asserts that each of the given assertions holds on the given
    response or error, comparing under the subject type's
    semantics."""
    subject_json = _json_object(subject)
    for assertion in assertions:
        actual = _resolve_json_property(subject_json, assertion.path)
        if isinstance(subject, Message):
            matches = _proto_property_matches(
                type(subject), assertion.path, actual, assertion.value
            )
        else:
            matches = _pydantic_property_matches(
                type(subject), assertion.path, actual, assertion.value
            )
        assert matches, (
            f"Expected `{assertion.path.text}` to be "
            f"{assertion.value!r}, but it is {actual!r}"
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
@when(
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
    clauses: Optional[str],
) -> None:
    factory = world.factory(state_type=state_type, method=method)
    assignments = _parse_assignments(world, clauses)
    arguments = [world.context(), _resolve_state_id(world, state_id)]
    if assignments:
        arguments.append(
            world.request(
                state_type=state_type, method=method, assignments=assignments
            )
        )
    try:
        _, world.response = await factory(*arguments)
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
    clauses: Optional[str],
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
            assignments=_parse_assignments(world, clauses),
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
    clauses: Optional[str],
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
            assignments=_parse_assignments(world, clauses),
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
    _assert_properties(
        error,
        [
            Equals(path=assignment.path, value=assignment.value)
            for assignment in _parse_assignments(world, clauses)
        ],
    )


@then(
    parsers.re(
        r'the attempt aborts with `(?P<error_type>\w+)`'
        rf'(?: where (?P<clauses>{_PROPERTY_CLAUSES}))?$'
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
            assignments={},
        )
        return world.response
    except Aborted as aborted:
        raise AssertionError(
            f"`{method}` on the `{state_type}` for \"{state_id}\" "
            f"{aborted}"
        ) from aborted


@then(
    parsers.re(
        rf'`(?P<method>\w+)` on {_STATE} '
        rf'has (?P<clauses>{_PROPERTY_CLAUSES})$'
    )
)
async def _then_has(
    world: World,
    method: str,
    state_type: str,
    state_id: str,
    clauses: str,
) -> None:
    response = await _read(world, method, state_type, state_id)
    _assert_properties(
        response,
        [
            Equals(path=assignment.path, value=assignment.value)
            for assignment in _parse_assignments(world, clauses)
        ],
    )


@given(
    parsers.re(
        rf'`(?P<method>\w+)` on {_STATE} '
        rf'has (?P<clauses>{_SAVE_CLAUSES})$'
    )
)
@when(
    parsers.re(
        rf'`(?P<method>\w+)` on {_STATE} '
        rf'has (?P<clauses>{_SAVE_CLAUSES})$'
    )
)
async def _has_saved_as(
    world: World,
    method: str,
    state_type: str,
    state_id: str,
    clauses: str,
) -> None:
    response = await _read(world, method, state_type, state_id)
    response_json = _json_object(response)
    for name, path in _parse_saves(clauses).items():
        world.saved[name] = _resolve_json_property(response_json, path)


@then(
    parsers.re(
        rf'`(?P<method>\w+)` on {_STATE} '
        r'aborts with `(?P<error_type>\w+)`'
        rf'(?: where (?P<clauses>{_PROPERTY_CLAUSES}))?$'
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
            assignments={},
        )
    except Aborted as aborted:
        _assert_aborted(world, aborted, error_type, clauses)
        return
    raise AssertionError(
        f"Expected `{method}` on the `{state_type}` for "
        f'"{state_id}" to abort with `{error_type}`, but it '
        "succeeded"
    )


@then(parsers.re(rf'the result has (?P<clauses>{_PROPERTY_CLAUSES})$'))
def _the_result_has(world: World, clauses: str) -> None:
    assert world.response is not None, (
        "Expected a preceding step to have made a call that returned "
        "a response, but there is none"
    )
    _assert_properties(
        world.response,
        [
            Equals(path=assignment.path, value=assignment.value)
            for assignment in _parse_assignments(world, clauses)
        ],
    )


@given(
    parsers.re(
        rf'the resulting `(?P<property_name>{_PATH})` '
        r'is saved as "\$(?P<name>\w+)"$'
    )
)
@when(
    parsers.re(
        rf'the resulting `(?P<property_name>{_PATH})` '
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
        _json_object(world.response), PropertyPath.create(property_name)
    )


# The steps below match only *invalid* clause lists, each a
# near-miss of the grammar the steps above declare, so that the
# mistake raises a pointed error instead of pytest-bdd's unmatched
# step. Each pattern is disjoint from every real step's: a real
# step's tail never matches one of these.


@given(parsers.re(rf'.+ has {_PROPERTY_CLAUSES}$'))
@when(parsers.re(rf'.+ has {_PROPERTY_CLAUSES}$'))
def _almost_asserting_under_given_or_when() -> None:
    raise ValueError(
        "Almost: a Given or When 'has' saves, e.g. `name` saved as "
        "\"$name\"; assert `path=value` properties with a Then "
        "instead"
    )


@then(parsers.re(rf'.+ has {_SAVE_CLAUSES}$'))
def _almost_saving_under_then() -> None:
    raise ValueError(
        "Almost: a Then 'has' asserts `path=value` properties; "
        "save under a Given or When 'has' instead"
    )


@given(parsers.re(rf'.+ has {_MIXED_CLAUSES}$'))
@when(parsers.re(rf'.+ has {_MIXED_CLAUSES}$'))
@then(parsers.re(rf'.+ has {_MIXED_CLAUSES}$'))
def _almost_mixing_clauses() -> None:
    raise ValueError(
        "Almost: a 'has' list is all one kind; a Given or When "
        "'has' saves, and a Then 'has' asserts `path=value` "
        "properties"
    )


@given(
    parsers.re(
        rf'.+ with (?=.*`\s+saved\s){_CLAUSE}'
        rf'(?:{_SEPARATOR}{_CLAUSE})*$'
    )
)
@when(
    parsers.re(
        rf'.+ with (?=.*`\s+saved\s){_CLAUSE}'
        rf'(?:{_SEPARATOR}{_CLAUSE})*$'
    )
)
def _almost_saving_in_with() -> None:
    raise ValueError(
        "Almost: saving goes under a Given or When 'has', not a "
        "'with' list"
    )


@then(
    parsers.re(
        rf'.+ where (?=.*`\s+saved\s){_CLAUSE}'
        rf'(?:{_SEPARATOR}{_CLAUSE})*$'
    )
)
def _almost_saving_in_where() -> None:
    raise ValueError(
        "Almost: saving goes under a Given or When 'has', not a "
        "'where' list"
    )


# A clause list with no backticks at all, and one whose backticks do
# not pair up (a leading backtick followed by zero or more closed
# pairs leaves one unclosed): every valid clause list pairs its
# backticks, so both shapes are disjoint from every step above.
_UNBACKTICKED_CLAUSES = r'[^`]+'
_UNCLOSED_CLAUSES = r'`[^`]*(?:`[^`]*`[^`]*)*'


@given(parsers.re(rf'.+ (?:with|has|where) {_UNBACKTICKED_CLAUSES}$'))
@when(parsers.re(rf'.+ (?:with|has|where) {_UNBACKTICKED_CLAUSES}$'))
@then(parsers.re(rf'.+ (?:with|has|where) {_UNBACKTICKED_CLAUSES}$'))
def _almost_missing_backticks() -> None:
    raise ValueError(
        "Almost: each clause goes in backticks, e.g. `amount=50` "
        'or `amount` saved as "$amount"'
    )


@given(parsers.re(rf'.+ (?:with|has|where) {_UNCLOSED_CLAUSES}$'))
@when(parsers.re(rf'.+ (?:with|has|where) {_UNCLOSED_CLAUSES}$'))
@then(parsers.re(rf'.+ (?:with|has|where) {_UNCLOSED_CLAUSES}$'))
def _almost_unclosed_backtick() -> None:
    raise ValueError("Almost: a backtick is unclosed")
