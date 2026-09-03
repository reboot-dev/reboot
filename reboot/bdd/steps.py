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

A scenario says who it calls as with 'Given the authenticated
user is "alice"', which mints a test token for that user ID and
puts it on every context created from then on ('the bearer token is
"..." ' instead sets a raw token); say who the authenticated user
is before 'Given a shared context', whose context keeps the token
it was created with.

A call runs as a task instead by saying 'gets a `method` ...
spawned with its task id saved as `name`'; the task then awaits as
'the `method` task with id "${name}" of the `Account` completes
within 10 seconds', recording its response as the result. A task ID
a response carries saves and awaits the same way.

A Then 'eventually has' holds a reactive read open until its
assertions hold, waiting at most its required bound, e.g.:

    Then `balance` on the `Account` for "alice" eventually has
      `balance=150` within 30 seconds

A Then 'has' asserts and a Given or When 'has' saves, and readers
are only read that way: 'gets a' and 'attempts a' refuse readers the
way 'has' refuses writers, and a reader's abort is asserted with
'`reader` on ... aborts with ...'.

An asserting list can also say the predicates `path` containing
<value> (a substring of a string, an element of a list, or a key of
a map) and `path` of length <n>. A Given or When 'has' instead
saves a property under a backticked name, which later steps recall
as `${name}`, in a state's ID, a user's ID, a bearer token, or a
property value (a quoted "${name}" stays the literal string):

    When `get_owner` on the `Account` for "frank" has
      `owner.name` saved as `owner_name`
    And the resulting `updated_balance` is saved as `balance`
    And the `Account` for "${owner_name}" gets a `deposit` with
      `amount=1`
"""

# The step functions below take the `rbt` and `world`
# fixtures as parameters, which 'ruff' sees as shadowing this module's
# re-exports of those fixtures, so we need to silence their error.
#
# ruff: noqa: F811

import asyncio
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
from rbt.v1alpha1 import tasks_pb2
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

# One saving clause: the (possibly dotted) property path in
# backticks, saved under a backticked name. The groupless form
# embeds in step patterns and deliberately also matches lexical
# near-misses ('saved to', a quoted or '$'-prefixed name) so that
# those route to a step whose parser raises the fix; the compiled
# form is the strict shape, for extraction.
_SAVE_CLAUSE = rf'`{_PATH}`\s+saved\s+(?:as|to)\s+(?:`\w+`|"?\$?\w+"?)'
_SAVE_PATTERN = re.compile(rf'`(?P<path>{_PATH})` saved as `(?P<saved>\w+)`')

# A predicate clause's argument: a scalar JSON value (a quoted
# string may contain separators), or a '${name}' recall (a bare
# '$name' also matches, so its near-miss routes to the fix).
_ARGUMENT = r'(?:"(?:[^"\\]|\\.)*"|\$\{\w+\}|\$?[-+.\w]+)'

# One containing clause: asserts a substring of a string, an element
# of a list, or a key of a map. The groupless form embeds in step
# patterns and also matches 'contains', so that near-miss routes to
# a step whose parser raises the fix; the compiled form is the
# strict shape, for extraction.
_CONTAINING_CLAUSE = rf'`{_PATH}`\s+contain(?:s|ing)\s+{_ARGUMENT}'
_CONTAINING_PATTERN = re.compile(
    rf'`(?P<path>{_PATH})` containing (?P<argument>{_ARGUMENT})'
)

# One length clause: asserts the length of a string, list, or map.
# The groupless form embeds in step patterns and also matches a
# missing 'of' or a non-integer length, for diagnosis; the compiled
# form is the strict shape, for extraction.
_LENGTH_CLAUSE = rf'`{_PATH}`\s+(?:of\s+)?length\s+{_ARGUMENT}'
_LENGTH_PATTERN = re.compile(rf'`(?P<path>{_PATH})` of length (?P<length>\d+)')

# What separates two clauses in step text: a comma, an 'and', or a
# comma followed by an 'and'.
_SEPARATOR = r'\s*(?:,\s*and|,|and)\s+'

# A clause list of only 'path=value' properties: what a call's
# 'with' passes.
_PROPERTY_CLAUSES = rf'{_PROPERTY_CLAUSE}(?:{_SEPARATOR}{_PROPERTY_CLAUSE})*'

# One asserting clause: an equality or a predicate.
_ASSERT_CLAUSE = (
    rf'(?:{_PROPERTY_CLAUSE}|{_CONTAINING_CLAUSE}|{_LENGTH_CLAUSE})'
)

# A clause list of asserting clauses: what a Then 'has' and an
# abort's 'with' assert.
_ASSERT_CLAUSES = rf'{_ASSERT_CLAUSE}(?:{_SEPARATOR}{_ASSERT_CLAUSE})*'

# A clause list of only saving clauses: what a Given or When 'has'
# saves.
_SAVE_CLAUSES = rf'{_SAVE_CLAUSE}(?:{_SEPARATOR}{_SAVE_CLAUSE})*'

# A clause list mixing both kinds, which no step accepts; it exists
# so the mistake gets a pointed error instead of an unmatched step.
# A property value can never contain a backtick, so the lookaheads
# can only hit an actual clause of each kind.
_CLAUSE = rf'(?:{_ASSERT_CLAUSE}|{_SAVE_CLAUSE})'
_MIXED_CLAUSES = (
    rf'(?=.*`\s+saved\s)'
    rf'(?=.*(?:`{_PATH}\s*[:=]|`{_PATH}`\s+contain|'
    rf'`{_PATH}`\s+(?:of\s+)?length))'
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


@dataclass(frozen=True)
class Containing:
    """A `path` containing <value> clause: a substring of a string,
    an element of a list, or a key of a map."""

    # The property asserted on.
    path: PropertyPath

    # The substring, element, or key; a scalar.
    value: JsonValue


@dataclass(frozen=True)
class OfLength:
    """A `path` of length <n> clause: the length of a string, list,
    or map."""

    # The property asserted on.
    path: PropertyPath

    # The length asserted.
    length: int


# What one clause of an asserting list parses to.
Assertion = Union[Equals, Containing, OfLength]

# A step's optional trailing property list.
_PROPERTIES = rf'(?: with (?P<clauses>{_PROPERTY_CLAUSES}))?'


def _saved_value(world: World, name: str) -> JsonValue:
    """The saved value going by the given name; raises if there is
    none."""
    if name not in world.saved:
        raise ValueError(
            f"Nothing saved as `{name}`; saved: " +
            (', '.join(f'`{n}`' for n in sorted(world.saved)) or "nothing")
        )
    return world.saved[name]


def _maybe_saved(world: World, text: str) -> str:
    """The saved value the text names when it is of the form
    '${name}', which must be a string, otherwise the text itself."""
    if re.fullmatch(r'\$\w+', text):
        raise ValueError(
            f"Almost: recall a save as ${{{text[1:]}}}, not {text}"
        )
    if not re.fullmatch(r'\$\{\w+\}', text):
        return text
    value = _saved_value(world, text[2:-1])
    if not isinstance(value, str):
        raise ValueError(
            f"Expecting the value saved as `{text[2:-1]}` to be a "
            f"string, but it is {value!r}"
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


def _almost_containing_message(clause: str) -> str:
    """The 'Almost' error for a containing clause that is a lexical
    near-miss of `path` containing <value>."""
    if re.search(r'\bcontains\b', clause):
        return f"Almost: say 'containing', not 'contains': {clause}"
    return (
        "Expected a containing clause of the form `path` containing "
        f'"value", but got: {clause}'
    )


def _almost_length_message(clause: str) -> str:
    """The 'Almost' error for a length clause that is a lexical
    near-miss of `path` of length <n>."""
    if re.search(r'`\s+length\b', clause):
        return f"Almost: say 'of length', not 'length': {clause}"
    if not re.search(r'\blength\s+\d+$', clause):
        return (
            "Almost: 'of length' takes a whole number, e.g. of "
            f"length 2: {clause}"
        )
    return (
        "Expected a length clause of the form `path` of length 2, "
        f"but got: {clause}"
    )


def _almost_within_message(within: str) -> str:
    """The 'Almost' error for a wait bound that is a lexical
    near-miss of within <n> seconds."""
    if re.fullmatch(r'\d+(?:\.\d+)?\s*s', within):
        return (
            "Almost: say seconds, e.g. within 10 seconds: within "
            f"{within}"
        )
    return (
        "Expected a wait bound of the form within 10 seconds, but "
        f"got: within {within}"
    )


def _parsed_seconds(within: str) -> float:
    """The seconds a wait bound says; raises the 'Almost' fix for a
    lexical near-miss."""
    seconds_match = re.fullmatch(r'(\d+(?:\.\d+)?) seconds?', within)
    if seconds_match is None:
        raise ValueError(_almost_within_message(within))
    return float(seconds_match[1])


def _almost_save_message(clause: str) -> str:
    """The 'Almost' error for a saving clause that is a lexical
    near-miss of `path` saved as `name`."""
    if re.search(r'\bsaved\s+to\b', clause):
        return f"Almost: say 'saved as', not 'saved to': {clause}"
    if re.search(r'\bsaved\s+as\s+"?\$\w+"?$', clause):
        return (
            "Almost: drop the '$' and say the name in backticks, "
            f"e.g. saved as `name`: {clause}"
        )
    if re.search(r'\bsaved\s+as\s+"\w+"$', clause):
        return (
            "Almost: the name goes in backticks, not quotes, e.g. "
            f"saved as `name`: {clause}"
        )
    if re.search(r'\bsaved\s+as\s+\w+$', clause):
        return (
            "Almost: the name goes in backticks, e.g. saved as "
            f"`name`: {clause}"
        )
    return (
        "Expected a saving clause of the form `path` saved as "
        f"`name`, but got: {clause}"
    )


def _parse_assignments(
    world: World,
    clauses: Optional[str],
) -> list[Assignment]:
    """Parses a call's 'with' list, e.g. '`amount=50` and
    `reason="promo"`', into `Assignment`s; a property value of the
    form '${name}' becomes the saved value going by that name. The
    step
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
            raise ValueError(
                "Almost: recall a save as "
                f"${{{property_match['value'][1:]}}}, not "
                f"{property_match['value']}"
            )
        if re.fullmatch(r'\$\{\w+\}', property_match['value']):
            value = _saved_value(world, property_match['value'][2:-1])
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


def _parsed_argument(world: World, argument: str) -> JsonValue:
    """The JSON value a predicate clause's argument says; a
    '${name}' becomes the saved value going by that name."""
    if re.fullmatch(r'\$\w+', argument):
        raise ValueError(
            f"Almost: recall a save as ${{{argument[1:]}}}, not "
            f"{argument}"
        )
    if re.fullmatch(r'\$\{\w+\}', argument):
        return _saved_value(world, argument[2:-1])
    try:
        return json5.loads(argument)
    except ValueError as error:
        raise ValueError(
            f"The argument {argument} must be JSON, e.g. 50, 2.5, "
            '"text", or true'
        ) from error


def _parse_assertions(
    world: World,
    clauses: Optional[str],
) -> list[Assertion]:
    """Parses a Then 'has' or abort 'with' clause list into
    `Assertion`s: `Equals` for `path=value`, `Containing` for
    `path` containing <value>, and `OfLength` for `path` of length
    <n>. The step patterns admit lexical near-misses of a clause,
    so each clause is confirmed strict here, raising the fix."""
    assertions: list[Assertion] = []
    if clauses is None:
        return assertions
    for clause_match in re.finditer(_ASSERT_CLAUSE, clauses):
        clause = clause_match[0]
        containing_match = _CONTAINING_PATTERN.fullmatch(clause)
        if containing_match is not None:
            assertions.append(
                Containing(
                    path=PropertyPath.create(containing_match['path']),
                    value=_parsed_argument(
                        world, containing_match['argument']
                    ),
                )
            )
            continue
        length_match = _LENGTH_PATTERN.fullmatch(clause)
        if length_match is not None:
            assertions.append(
                OfLength(
                    path=PropertyPath.create(length_match['path']),
                    length=int(length_match['length']),
                )
            )
            continue
        if re.search(r'\bcontain', clause):
            raise ValueError(_almost_containing_message(clause))
        if re.search(r'\blength\b', clause):
            raise ValueError(_almost_length_message(clause))
        property_match = _PROPERTY_PATTERN.fullmatch(clause)
        if property_match is None:
            raise ValueError(_almost_property_message(clause))
        if re.fullmatch(r'\$\w+', property_match['value']):
            raise ValueError(
                "Almost: recall a save as "
                f"${{{property_match['value'][1:]}}}, not "
                f"{property_match['value']}"
            )
        if re.fullmatch(r'\$\{\w+\}', property_match['value']):
            value = _saved_value(world, property_match['value'][2:-1])
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
        assertions.append(
            Equals(
                path=PropertyPath.create(property_match['path']),
                value=value,
            )
        )
    return assertions


def _parse_saves(clauses: str) -> dict[str, PropertyPath]:
    """Parses a Given or When 'has' list of saving clauses, e.g.
    '`amount` saved as `amount`', into the property to save under
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


def _property_matches(
    subject: Union[Message, Model],
    path: PropertyPath,
    actual: JsonValue,
    expected: JsonValue,
) -> bool:
    """Whether the actual value of the property equals the expected
    JSON value under the subject type's semantics."""
    if isinstance(subject, Message):
        return _proto_property_matches(type(subject), path, actual, expected)
    return _pydantic_property_matches(type(subject), path, actual, expected)


def _element_path(path: PropertyPath) -> PropertyPath:
    """The path of the given list property's element."""
    return PropertyPath(
        text=f'{path.text}[0]',
        expression=jsonpath_ng.Child(path.expression, jsonpath_ng.Index(0)),
    )


def _assert_containing(
    subject: Union[Message, Model],
    path: PropertyPath,
    actual: JsonValue,
    argument: JsonValue,
) -> None:
    """Asserts the containing predicate on the property's actual
    value: a substring of a string, an element of a list (compared
    under the subject type's semantics), or a key of a map."""
    if isinstance(actual, str):
        if not isinstance(argument, str):
            raise ValueError(
                f"`{path.text}` is a string, so containing takes a "
                f"string, but got: {argument!r}"
            )
        assert argument in actual, (
            f"Expected `{path.text}` to contain {argument!r}, but "
            f"it is {actual!r}"
        )
        return
    if isinstance(actual, list):
        element = _element_path(path)
        assert any(
            _property_matches(subject, element, value, argument)
            for value in actual
        ), (
            f"Expected `{path.text}` to contain {argument!r}, but "
            f"it is {actual!r}"
        )
        return
    if isinstance(actual, dict):
        if not isinstance(argument, str):
            raise ValueError(
                f"`{path.text}` is a map, so containing takes a "
                f"string key, but got: {argument!r}"
            )
        assert argument in actual, (
            f"Expected `{path.text}` to contain the key "
            f"{argument!r}, but its keys are: " +
            (', '.join(repr(key) for key in sorted(actual)) or "none")
        )
        return
    raise ValueError(
        f"`{path.text}` is {actual!r}; containing needs a string, "
        "list, or map"
    )


def _assert_of_length(
    path: PropertyPath,
    actual: JsonValue,
    length: int,
) -> None:
    """Asserts the length predicate on the property's actual value:
    the length of a string, list, or map."""
    if not isinstance(actual, (str, list, dict)):
        raise ValueError(
            f"`{path.text}` is {actual!r}; of length needs a "
            "string, list, or map"
        )
    assert len(actual) == length, (
        f"Expected `{path.text}` to be of length {length}, but it "
        f"is of length {len(actual)}: {actual!r}"
    )


def _assert_properties(
    subject: Union[Message, Model],
    assertions: list[Assertion],
) -> None:
    """Asserts each of the given assertions against the given
    response or error, comparing under the subject type's
    semantics."""
    subject_json = _json_object(subject)
    for assertion in assertions:
        actual = _resolve_json_property(subject_json, assertion.path)
        match assertion:
            case Equals(path=path, value=value):
                assert _property_matches(subject, path, actual, value), (
                    f"Expected `{path.text}` to be {value!r}, "
                    f"but it is {actual!r}"
                )
            case Containing(path=path, value=value):
                _assert_containing(subject, path, actual, value)
            case OfLength(path=path, length=length):
                _assert_of_length(path, actual, length)


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


@given(parsers.re(r'the authenticated user is "(?P<user_id>[^"]*)"$'))
@when(parsers.re(r'the authenticated user is "(?P<user_id>[^"]*)"$'))
async def _the_authenticated_user_is(world: World, user_id: str) -> None:
    if world.rbt is None:
        raise ValueError(
            "The application is not up; start the scenario with "
            "'Given the application is up'"
        )
    world.set_bearer_token(
        await world.rbt.make_valid_oauth_access_token(
            user_id=_maybe_saved(world, user_id),
        )
    )


@given(parsers.re(r'the bearer token is "(?P<bearer_token>[^"]*)"$'))
@when(parsers.re(r'the bearer token is "(?P<bearer_token>[^"]*)"$'))
def _the_bearer_token_is(world: World, bearer_token: str) -> None:
    world.set_bearer_token(_maybe_saved(world, bearer_token))


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
    arguments = [world.context(), _maybe_saved(world, state_id)]
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


@given(
    parsers.re(
        rf'{_STATE} gets a `(?P<method>\w+)`{_PROPERTIES}'
        r'(?: spawned with its task id saved as `(?P<task>\w+)`)?$'
    )
)
@when(
    parsers.re(
        rf'{_STATE} gets a `(?P<method>\w+)`{_PROPERTIES}'
        r'(?: spawned with its task id saved as `(?P<task>\w+)`)?$'
    )
)
async def _gets_a(
    world: World,
    state_type: str,
    state_id: str,
    method: str,
    clauses: Optional[str],
    task: Optional[str],
) -> None:
    if task is not None:
        handle = await world.spawn(
            state_type=state_type,
            state_id=_maybe_saved(world, state_id),
            method=method,
            assignments=_parse_assignments(world, clauses),
        )
        world.saved[task] = _json_object(handle.task_id)
        return
    if world.is_reader(state_type=state_type, method=method):
        raise ValueError(
            f"`{method}` is a reader; read it with "
            f"'`{method}` on the `{state_type}` for \"...\" has ...'"
        )
    try:
        world.response = await world.call(
            state_type=state_type,
            state_id=_maybe_saved(world, state_id),
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
            state_id=_maybe_saved(world, state_id),
            method=method,
            assignments=_parse_assignments(world, clauses),
        )
        world.aborted = None
    except Aborted as aborted:
        world.aborted = aborted


@when(
    parsers.re(
        r'the `(?P<method>\w+)` task with id "\$\{(?P<name>\w+)\}" '
        r'of the `(?P<state_type>[\w.]+)` completes within '
        r'(?P<within>.+)$'
    )
)
@then(
    parsers.re(
        r'the `(?P<method>\w+)` task with id "\$\{(?P<name>\w+)\}" '
        r'of the `(?P<state_type>[\w.]+)` completes within '
        r'(?P<within>.+)$'
    )
)
async def _the_saved_task_completes(
    world: World,
    method: str,
    name: str,
    state_type: str,
    within: str,
) -> None:
    seconds = _parsed_seconds(within)
    saved = _saved_value(world, name)
    if not isinstance(saved, dict):
        raise ValueError(
            f"The value saved as `{name}` must be a task ID, but it "
            f"is {saved!r}"
        )
    task_type = world.task_type(state_type=state_type, method=method)
    if task_type is None:
        raise ValueError(f"`{state_type}` has no `{method}` task")
    task = getattr(task_type, 'retrieve')(
        world.context(),
        task_id=json_format.ParseDict(saved, tasks_pb2.TaskId()),
    )
    try:
        world.response = await asyncio.wait_for(task, timeout=seconds)
    except asyncio.TimeoutError:
        raise AssertionError(
            f"Waited {within} for the `{method}` task saved as "
            f"`{name}` to complete"
        ) from None


def _assert_aborted(
    world: World,
    aborted: Aborted,
    error_type: str,
    clauses: Optional[str],
) -> None:
    """Asserts that the given abort's error is of the named type and
    satisfies the given 'with' clauses."""
    error = aborted.error
    assert type(error).__name__ == error_type, (
        f"Expected an abort with `{error_type}`, but it aborted "
        f"with `{type(error).__name__}`: {aborted}"
    )
    _assert_properties(error, _parse_assertions(world, clauses))


@then(
    parsers.re(
        r'the attempt aborts with `(?P<error_type>\w+)`'
        rf'(?: with (?P<clauses>{_ASSERT_CLAUSES}))?$'
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
            state_id=_maybe_saved(world, state_id),
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
        rf'has (?P<clauses>{_ASSERT_CLAUSES})$'
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
    _assert_properties(response, _parse_assertions(world, clauses))


@then(
    parsers.re(
        rf'`(?P<method>\w+)` on {_STATE} '
        rf'eventually has (?P<clauses>{_ASSERT_CLAUSES}) '
        r'within (?P<within>.+)$'
    )
)
async def _eventually_has(
    world: World,
    method: str,
    state_type: str,
    state_id: str,
    clauses: str,
    within: str,
) -> None:
    seconds = _parsed_seconds(within)
    assertions = _parse_assertions(world, clauses)
    if not world.is_reader(state_type=state_type, method=method):
        raise ValueError(
            f"`{method}` is not a reader; 'eventually has' holds a "
            "reactive read open, which only readers serve"
        )
    reference = world.client_type(state_type).ref(
        _maybe_saved(world, state_id)
    )
    responses = getattr(reference.reactively(), method)(world.context())
    deadline = asyncio.get_running_loop().time() + seconds
    last_error: Optional[AssertionError] = None
    try:
        while True:
            remaining = deadline - asyncio.get_running_loop().time()
            if remaining <= 0:
                raise AssertionError(
                    f"Waited {within} for `{method}` on the "
                    f"`{state_type}` for \"{state_id}\", but " + (
                        str(last_error)
                        if last_error is not None else "no response arrived"
                    )
                )
            try:
                response = await asyncio.wait_for(
                    anext(responses), timeout=remaining
                )
            except asyncio.TimeoutError:
                continue
            except StopAsyncIteration:
                raise AssertionError(
                    f"The reactive read of `{method}` on the "
                    f"`{state_type}` for \"{state_id}\" ended, and " + (
                        str(last_error)
                        if last_error is not None else "no response arrived"
                    )
                ) from None
            else:
                try:
                    _assert_properties(response, assertions)
                except AssertionError as error:
                    last_error = error
                    continue
                world.response = response
                return
    finally:
        await responses.aclose()


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
        rf'(?: with (?P<clauses>{_ASSERT_CLAUSES}))?$'
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
            state_id=_maybe_saved(world, state_id),
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


@then(parsers.re(rf'the result has (?P<clauses>{_ASSERT_CLAUSES})$'))
def _the_result_has(world: World, clauses: str) -> None:
    assert world.response is not None, (
        "Expected a preceding step to have made a call that returned "
        "a response, but there is none"
    )
    _assert_properties(world.response, _parse_assertions(world, clauses))


@given(
    parsers.re(
        rf'the resulting `(?P<property_name>{_PATH})` '
        r'is saved as `(?P<name>\w+)`$'
    )
)
@when(
    parsers.re(
        rf'the resulting `(?P<property_name>{_PATH})` '
        r'is saved as `(?P<name>\w+)`$'
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


@when(
    parsers.
    re(r'the `\w+` task with id "\$\{\w+\}" of the `[\w.]+` completes$')
)
@then(
    parsers.
    re(r'the `\w+` task with id "\$\{\w+\}" of the `[\w.]+` completes$')
)
def _almost_completes_needs_within() -> None:
    raise ValueError(
        "Almost: say how long to wait for the task, e.g. within 10 "
        "seconds"
    )


@then(parsers.re(rf'.+ eventually has {_ASSERT_CLAUSES}$'))
def _almost_eventually_needs_within() -> None:
    raise ValueError(
        "Almost: say how long 'eventually has' keeps its reactive "
        "read open, e.g. within 10 seconds"
    )


@then(parsers.re(rf'.+(?<!eventually) has {_ASSERT_CLAUSES} within .+$'))
def _almost_within_needs_eventually() -> None:
    raise ValueError(
        "Almost: 'within' goes with 'eventually has'; a plain 'has' "
        "asserts the response it reads"
    )


@given(parsers.re(r'.+ eventually has .+$'))
@when(parsers.re(r'.+ eventually has .+$'))
def _almost_eventually_under_given_or_when() -> None:
    raise ValueError(
        "Almost: a Given or When 'has' saves what it reads now; "
        "'eventually has' asserts, under a Then"
    )


@given(parsers.re(rf'.+ has {_ASSERT_CLAUSES}$'))
@when(parsers.re(rf'.+ has {_ASSERT_CLAUSES}$'))
def _almost_asserting_under_given_or_when() -> None:
    raise ValueError(
        "Almost: a Given or When 'has' saves, e.g. `path` saved as "
        "`name`; assert `path=value` properties with a Then instead"
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
@then(
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


@given(
    parsers.re(
        rf'.+ with (?=.*`\s+contain|.*`\s+(?:of\s+)?length)'
        rf'{_ASSERT_CLAUSES}$'
    )
)
@when(
    parsers.re(
        rf'.+ with (?=.*`\s+contain|.*`\s+(?:of\s+)?length)'
        rf'{_ASSERT_CLAUSES}$'
    )
)
def _almost_predicate_in_call_with() -> None:
    raise ValueError(
        "Almost: 'containing' and 'of length' assert; they go in a "
        "Then 'has' or an abort's 'with', not a call's 'with'"
    )


# A clause list with no backticks at all, and one whose backticks do
# not pair up (a leading backtick followed by zero or more closed
# pairs leaves one unclosed): every valid clause list pairs its
# backticks, so both shapes are disjoint from every step above.
_UNBACKTICKED_CLAUSES = r'[^`]+'
_UNCLOSED_CLAUSES = r'`[^`]*(?:`[^`]*`[^`]*)*'


@given(parsers.re(rf'.+ (?:with|has) {_UNBACKTICKED_CLAUSES}$'))
@when(parsers.re(rf'.+ (?:with|has) {_UNBACKTICKED_CLAUSES}$'))
@then(parsers.re(rf'.+ (?:with|has) {_UNBACKTICKED_CLAUSES}$'))
def _almost_missing_backticks() -> None:
    raise ValueError(
        "Almost: each clause goes in backticks, e.g. `amount=50` "
        "or `amount` saved as `amount`"
    )


@given(parsers.re(rf'.+ (?:with|has) {_UNCLOSED_CLAUSES}$'))
@when(parsers.re(rf'.+ (?:with|has) {_UNCLOSED_CLAUSES}$'))
@then(parsers.re(rf'.+ (?:with|has) {_UNCLOSED_CLAUSES}$'))
def _almost_unclosed_backtick() -> None:
    raise ValueError("Almost: a backtick is unclosed")
