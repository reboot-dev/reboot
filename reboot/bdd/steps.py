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

A custom step is plain Reboot code: take the `world` fixture, get
a context from `world.context(user)`, naming a user the scenario
declared, whose token it carries, and call the generated clients
directly.

A scenario runs a different application by naming it: 'Given the
"proxy" application is up' runs the one the `proxy_application`
fixture returns (the quoted name, spaces as underscores, plus
`_application`), so the scenarios of one feature file vary the
application under test.

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
    And "alice" is an authenticated user
    And "alice" creates an `Account` of "alice" via `open`
    When "alice" does a `deposit` on `Account` of "alice" with
      `amount=50`
    Then as "alice", `balance` on the `Account` for "alice" has
      `balance=50`

Every step that calls says who calls, a user the scenario declared
with 'Given "alice" is an authenticated user', which mints a test
token for that user ID, 'Given "admin" has the bearer token "..."',
which names a user by a raw token, or 'Given "bob" is an
unauthenticated user', whose calls carry no token. A call starts
with the user, '"alice" does ...', and a read with 'as "alice",'.
'Given as "alice", a shared context' takes the reads' prefix, and
every call from then on must name the same user, since the context
keeps the token it was created with.

A factory makes the id up when the step leaves it out, '"alice"
creates an `Account` via `open` ...', and the next line saves it,
'the resulting state id is saved as "account_id"', so that later
steps can say <account_id>.

A call runs as a task instead by saying '"alice" spawns a `method`
on ...', with the next line saving 'the resulting task id is saved
as "name"'; the task then awaits as '"alice" awaits the `method`
task "<name>" on `Account` within 10 seconds', recording its
response as the result. A task ID a response carries saves and
awaits the same way.

A scenario tagged '@blocked' describes behavior the application does
not have yet, and says why in its description; it is skipped, with
the description as the reason, until the tag comes off. A feature,
rule or scenario tagged '@wip' is being worked on: it runs as usual,
and the dashboard shows what is in progress.

A Then 'eventually has' holds a reactive read open until its
assertions hold, waiting at most its required bound, e.g.:

    Then as "alice", `balance` on the `Account` for "alice" eventually
      has `balance=150` within 30 seconds

A Then 'has' asserts and a Given or When 'has' saves, and readers
are only read that way: 'does a' and 'attempts a' refuse readers the
way 'has' refuses writers, and a reader's abort is asserted with
'`reader` on ... aborts with ...'. A reader that takes properties is
given them before the 'has', the way a call is given its own:

    Then as "alice", `has_at_least` on the `Account` for "alice" with
      `amount=50` has `enough=true`

An asserting list can also say the predicates `path` containing
`value` (a substring of a string, an element of a list, or a key of
a map) and `path` of length `n`; the backticked argument is a JSON
value the way a property's value is, so it can say <name>. A Given
or When 'has' instead saves a property under a backticked name,
which later steps say as <name>, the way a Scenario Outline says a
column of its Examples table, in a state's ID, a user's ID, a bearer
token, or a property value (a quoted "<name>" stays the literal
string); a save may not use a column's name:

    When as "alice", `get_owner` on the `Account` for "frank" has
      `owner.name` saved as "owner_name"
    And the resulting `updated_balance` is saved as "balance"
    And "alice" does a `deposit` on `Account` of "<owner_name>" with
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
from reboot.bdd.frontend import Frontend, backend_url
from reboot.bdd.grammar import (
    ABORTS_WITH,
    APPLICATION_IS_UP,
    ASSERT_CLAUSE,
    ASSERT_CLAUSES,
    ATTEMPT_ABORTS_WITH,
    ATTEMPTS,
    AWAITS_TASK,
    CLAUSE,
    CONTAINING_PATTERN,
    CREATES_VIA,
    DOES,
    EVENTUALLY_HAS,
    HAS,
    HAS_BEARER_TOKEN,
    HAS_SAVED_AS,
    IS_AN_AUTHENTICATED_USER,
    IS_AN_UNAUTHENTICATED_USER,
    LENGTH_PATTERN,
    MIXED_CLAUSES,
    PATH,
    PROPERTY_CLAUSE,
    PROPERTY_PATTERN,
    RESULT_HAS,
    RESULTING_IS_SAVED_AS,
    RESULTING_STATE_ID_IS_SAVED_AS,
    RESULTING_TASK_ID_IS_SAVED_AS,
    SAVE_CLAUSE,
    SAVE_CLAUSES,
    SAVE_PATTERN,
    SEPARATOR,
    SHARED_CONTEXT,
)
from reboot.bdd.registry import client_types_by_name
from typing import Any, Optional, Union, get_args, get_origin

# The tag of a scenario describing behavior the application does not
# have yet: skipped, with the scenario's description as the reason.
BLOCKED_TAG = 'blocked'

# The tag of a feature, rule or scenario being worked on, which runs
# as usual.
WIP_TAG = 'wip'


def pytest_configure(config: pytest.Config) -> None:
    config.addinivalue_line(
        'markers',
        f'{BLOCKED_TAG}: a scenario describing behavior the application does '
        "not have yet; skipped, with the scenario's description saying why",
    )
    config.addinivalue_line(
        'markers',
        f'{WIP_TAG}: a feature, rule or scenario being worked on',
    )


def pytest_collection_modifyitems(
    config: pytest.Config,
    items: list[pytest.Item],
) -> None:
    for item in items:
        if item.get_closest_marker(BLOCKED_TAG) is None:
            continue
        scenario = getattr(getattr(item, 'obj', None), '__scenario__', None)
        description = getattr(scenario, 'description', None)
        reason = (
            description.strip().split('\n\n')[0].replace('\n', ' ')
            if description else 'the scenario describes behavior the '
            'application does not have yet'
        )
        item.add_marker(pytest.mark.skip(reason=f'blocked: {reason}'))


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


def _saved_value(world: World, name: str) -> JsonValue:
    """The saved value going by the given name; raises if there is
    none."""
    if name not in world.saved:
        raise ValueError(
            f'Nothing saved as "{name}"; saved: ' +
            (', '.join(f'"{n}"' for n in sorted(world.saved)) or "nothing")
        )
    return world.saved[name]


def _almost_variable_message(text: str) -> Optional[str]:
    """The 'Almost' error for a text that is a lexical near-miss of
    the variable <name>, and `None` for a text that is not."""
    if re.fullmatch(r'\$\{\w+\}', text):
        return f"Almost: say a saved value as <{text[2:-1]}>, not {text}"
    if re.fullmatch(r'\$\w+', text):
        return f"Almost: say a saved value as <{text[1:]}>, not {text}"
    return None


def _maybe_saved(world: World, text: str) -> str:
    """The saved value the text names when it is of the form
    '<name>', which must be a string, otherwise the text itself."""
    almost = _almost_variable_message(text)
    if almost is not None:
        raise ValueError(almost)
    if not re.fullmatch(r'<[^<>]+>', text):
        return text
    value = _saved_value(world, text[1:-1])
    if not isinstance(value, str):
        raise ValueError(
            f'Expecting the value saved as "{text[1:-1]}" to be a '
            f"string, but it is {value!r}"
        )
    return value


def _almost_property_message(clause: str) -> str:
    """The 'Almost' error for a property clause that is a lexical
    near-miss of `path=value`."""
    if re.match(rf'`{PATH}\s*:', clause):
        return f"Almost: say `path=value` with '=', not ':': {clause}"
    if re.fullmatch(rf'`{PATH}\s*=\s*`', clause):
        return f"Almost: the value is missing: {clause}"
    if re.match(rf'`{PATH}\s+=', clause) or re.match(rf'`{PATH}=\s', clause):
        return (
            "Almost: write `path=value` without spaces around the "
            f"'=': {clause}"
        )
    return f"Expected a property of the form `path=value`, but got: {clause}"


def _almost_containing_message(clause: str) -> str:
    """The 'Almost' error for a containing clause that is a lexical
    near-miss of `path` containing `value`."""
    if re.search(r'\bcontains\b', clause):
        return f"Almost: say 'containing', not 'contains': {clause}"
    if re.search(r'\bcontaining\s+(?!`)\S', clause):
        return (
            "Almost: the value goes in backticks, e.g. containing "
            f'`"text"`: {clause}'
        )
    return (
        "Expected a containing clause of the form `path` containing "
        f"`value`, but got: {clause}"
    )


def _almost_length_message(clause: str) -> str:
    """The 'Almost' error for a length clause that is a lexical
    near-miss of `path` of length `n`."""
    if re.search(r'`\s+length\b', clause):
        return f"Almost: say 'of length', not 'length': {clause}"
    if re.search(r'\blength\s+(?!`)\S', clause):
        return (
            "Almost: the length goes in backticks, e.g. of length "
            f"`2`: {clause}"
        )
    return (
        "Expected a length clause of the form `path` of length `2`, "
        f"but got: {clause}"
    )


def _parsed_value(world: World, label: str, text: str) -> JsonValue:
    """The JSON value the text says, a '<name>' being the saved value
    going by that name; a lexical near-miss raises the fix."""
    almost = _almost_variable_message(text)
    if almost is not None:
        raise ValueError(almost)
    if re.fullmatch(r'<[^<>]+>', text):
        return _saved_value(world, text[1:-1])
    try:
        return json5.loads(text)
    except ValueError as error:
        raise ValueError(
            f"The value of {label} must be JSON, e.g. 50, 2.5, "
            '"text", true, or {name: "value"}, but got: '
            f"{text}"
        ) from error


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
    near-miss of `path` saved as "name"."""
    if re.search(r'\bsaved\s+to\b', clause):
        return f"Almost: say 'saved as', not 'saved to': {clause}"
    if re.search(r'\bsaved\s+as\s+"?\$\w+"?$', clause):
        return (
            "Almost: drop the '$' and say the name in quotes, e.g. saved "
            f'as "name": {clause}'
        )
    if re.search(r'\bsaved\s+as\s+"?<[^<>]+>"?$', clause):
        return (
            "Almost: the name goes in quotes without angle brackets, e.g. "
            f'saved as "name"; <name> is how a later step says it: {clause}'
        )
    if re.search(r'\bsaved\s+as\s+`[^`]*`$', clause):
        return (
            "Almost: the name goes in quotes, not backticks, e.g. saved as "
            f'"name": {clause}'
        )
    if re.search(r'\bsaved\s+as\s+\w+$', clause):
        return (
            f'Almost: the name goes in quotes, e.g. saved as "name": {clause}'
        )
    return (
        'Expected a saving clause of the form `path` saved as "name", but '
        f"got: {clause}"
    )


def _parse_assignments(
    world: World,
    clauses: Optional[str],
) -> list[Assignment]:
    """Parses a call's 'with' list, e.g. '`amount=50` and
    `reason="promo"`', into `Assignment`s; a property value of the
    form '<name>' becomes the saved value going by that name. The
    step patterns admit lexical near-misses of a clause, so each
    clause is confirmed strict here, raising the fix."""
    assignments: list[Assignment] = []
    if clauses is None:
        return assignments
    for clause_match in re.finditer(PROPERTY_CLAUSE, clauses):
        property_match = PROPERTY_PATTERN.fullmatch(clause_match[0])
        if property_match is None:
            raise ValueError(_almost_property_message(clause_match[0]))
        value = _parsed_value(
            world,
            f"`{property_match['path']}`",
            property_match['value'],
        )
        assignments.append(
            Assignment(
                path=PropertyPath.create(property_match['path']),
                value=value,
            )
        )
    return assignments


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
    for clause_match in re.finditer(ASSERT_CLAUSE, clauses):
        clause = clause_match[0]
        containing_match = CONTAINING_PATTERN.fullmatch(clause)
        if containing_match is not None:
            assertions.append(
                Containing(
                    path=PropertyPath.create(containing_match['path']),
                    value=_parsed_value(
                        world,
                        f"`{containing_match['path']}` containing",
                        containing_match['argument'],
                    ),
                )
            )
            continue
        length_match = LENGTH_PATTERN.fullmatch(clause)
        if length_match is not None:
            length = _parsed_value(
                world,
                f"`{length_match['path']}` of length",
                length_match['length'],
            )
            if isinstance(length, bool) or not isinstance(length, int):
                raise ValueError(
                    f"`{length_match['path']}` of length takes a "
                    f"whole number, but got: {length!r}"
                )
            assertions.append(
                OfLength(
                    path=PropertyPath.create(length_match['path']),
                    length=length,
                )
            )
            continue
        if re.search(r'\bcontain', clause):
            raise ValueError(_almost_containing_message(clause))
        if re.search(r'\blength\b', clause):
            raise ValueError(_almost_length_message(clause))
        property_match = PROPERTY_PATTERN.fullmatch(clause)
        if property_match is None:
            raise ValueError(_almost_property_message(clause))
        value = _parsed_value(
            world,
            f"`{property_match['path']}`",
            property_match['value'],
        )
        assertions.append(
            Equals(
                path=PropertyPath.create(property_match['path']),
                value=value,
            )
        )
    return assertions


def _parse_saves(clauses: str) -> dict[str, PropertyPath]:
    """Parses a Given or When 'has' list of saving clauses, e.g.
    '`amount` saved as "amount"', into the property to save under
    each name. The step patterns admit lexical near-misses of a
    clause, so each clause is confirmed strict here, raising the
    fix."""
    saves: dict[str, PropertyPath] = {}
    for clause_match in re.finditer(SAVE_CLAUSE, clauses):
        save_match = SAVE_PATTERN.fullmatch(clause_match[0])
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


@given(parsers.re(APPLICATION_IS_UP))
async def _the_application_is_up(
    rbt: Reboot,
    world: World,
    request: pytest.FixtureRequest,
    name: Optional[str],
) -> None:
    fixture = (
        'application' if name is None else name.replace(' ', '_') +
        '_application'
    )
    try:
        application = request.getfixturevalue(fixture)
    except pytest.FixtureLookupError:
        raise ValueError(
            f"No `{fixture}` fixture (the quoted name, spaces as "
            "underscores, plus `_application`); define one "
            "returning the `Application` the scenario runs"
        ) from None
    if not isinstance(application, Application):
        raise ValueError(
            f"Expecting the `{fixture}` fixture to return an "
            f"`Application`, but it returned {application!r}"
        )
    await rbt.up(application)
    world.client_types = client_types_by_name(application)
    world.rbt = rbt
    world.name = request.node.name

    # A scenario with a frontend has it served against the backend
    # from here, so that it comes up while the steps before the one
    # that opens it run.
    try:
        frontend = request.getfixturevalue('frontend')
    except pytest.FixtureLookupError:
        return
    if not isinstance(frontend, Frontend):
        raise ValueError(
            "Expecting the `frontend` fixture to return a `Frontend`, "
            f"but it returned {frontend!r}"
        )
    await frontend.serve(backend_url=backend_url(rbt))


@given(parsers.re(IS_AN_AUTHENTICATED_USER))
@when(parsers.re(IS_AN_AUTHENTICATED_USER))
async def _is_an_authenticated_user(world: World, user_id: str) -> None:
    if world.rbt is None:
        raise ValueError(
            "The application is not up; start the scenario with "
            "'Given the application is up'"
        )
    user_id = _maybe_saved(world, user_id)
    world.declare_user(
        user_id,
        await world.rbt.make_valid_oauth_access_token(user_id=user_id),
    )


@given(parsers.re(HAS_BEARER_TOKEN))
@when(parsers.re(HAS_BEARER_TOKEN))
def _has_bearer_token(world: World, user_id: str, bearer_token: str) -> None:
    world.declare_user(
        _maybe_saved(world, user_id),
        _maybe_saved(world, bearer_token),
    )


@given(parsers.re(IS_AN_UNAUTHENTICATED_USER))
@when(parsers.re(IS_AN_UNAUTHENTICATED_USER))
def _is_an_unauthenticated_user(world: World, user_id: str) -> None:
    world.declare_user(_maybe_saved(world, user_id), None)


@given(parsers.re(SHARED_CONTEXT))
def _a_shared_context(world: World, user: str) -> None:
    world.share_context(user)


@given(parsers.re(CREATES_VIA))
@when(parsers.re(CREATES_VIA))
async def _creates_via(
    world: World,
    user: str,
    state_type: str,
    state_id: Optional[str],
    method: str,
    clauses: Optional[str],
) -> None:
    """Creates the state via the factory, with the id the step gives
    or, without one, an id the factory makes up."""
    factory = world.factory(state_type=state_type, method=method)
    assignments = _parse_assignments(world, clauses)
    arguments: list[Any] = [world.context(user)]
    if state_id is not None:
        arguments.append(_maybe_saved(world, state_id))
    if assignments:
        arguments.append(
            world.request(
                state_type=state_type, method=method, assignments=assignments
            )
        )
    try:
        reference, world.response = await factory(*arguments)
    except Aborted as aborted:
        raise AssertionError(
            f"Creating {'an' if state_id is None else 'the'} `{state_type}`" +
            ('' if state_id is None else f' of "{state_id}"') +
            f" via `{method}` {aborted}"
        ) from aborted
    world.created_state_id = reference.state_id


@given(parsers.re(DOES))
@when(parsers.re(DOES))
async def _does(
    world: World,
    user: str,
    verb: str,
    state_type: str,
    state_id: str,
    method: str,
    clauses: Optional[str],
) -> None:
    if verb == 'spawns':
        handle = await world.spawn(
            state_type=state_type,
            state_id=_maybe_saved(world, state_id),
            method=method,
            assignments=_parse_assignments(world, clauses),
            user=user,
        )
        world.spawned_task_id = _json_object(handle.task_id)
        return
    if world.is_reader(state_type=state_type, method=method):
        raise ValueError(
            f"`{method}` is a reader; read it with "
            f"'as \"...\", `{method}` on the `{state_type}` for \"...\" has "
            "...'"
        )
    try:
        world.response = await world.call(
            state_type=state_type,
            state_id=_maybe_saved(world, state_id),
            method=method,
            assignments=_parse_assignments(world, clauses),
            user=user,
        )
    except Aborted as aborted:
        raise AssertionError(
            f"Doing a `{method}` on `{state_type}` of \"{state_id}\" "
            f"{aborted}; to assert an expected abort, write 'attempts' "
            "with 'Then the attempt aborts with "
            f"`{type(aborted.error).__name__}`'"
        ) from aborted


@when(parsers.re(ATTEMPTS))
async def _attempts(
    world: World,
    user: str,
    state_type: str,
    state_id: str,
    method: str,
    clauses: Optional[str],
) -> None:
    if world.is_reader(state_type=state_type, method=method):
        raise ValueError(
            f"`{method}` is a reader; assert its abort with "
            f"'as \"...\", `{method}` on the `{state_type}` for \"...\" "
            "aborts with ...'"
        )
    try:
        world.response = await world.call(
            state_type=state_type,
            state_id=_maybe_saved(world, state_id),
            method=method,
            assignments=_parse_assignments(world, clauses),
            user=user,
        )
        world.aborted = None
    except Aborted as aborted:
        world.aborted = aborted


@when(parsers.re(AWAITS_TASK))
@then(parsers.re(AWAITS_TASK))
async def _awaits_task(
    world: World,
    user: str,
    method: str,
    name: str,
    state_type: str,
    within: str,
) -> None:
    seconds = _parsed_seconds(within)
    saved = _saved_value(world, name)
    if not isinstance(saved, dict):
        raise ValueError(
            f'The value saved as "{name}" must be a task ID, but it '
            f"is {saved!r}"
        )
    task_type = world.task_type(state_type=state_type, method=method)
    if task_type is None:
        raise ValueError(f"`{state_type}` has no `{method}` task")
    task = getattr(task_type, 'retrieve')(
        world.context(user),
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


@then(parsers.re(ATTEMPT_ABORTS_WITH))
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
    user: str,
    method: str,
    state_type: str,
    state_id: str,
    arguments: Optional[str],
) -> Any:
    """Calls the named reader on the named state as the given user,
    with the request the argument clauses describe, recording and
    returning its response; raises if the method is not a reader."""
    if not world.is_reader(state_type=state_type, method=method):
        raise ValueError(
            f"`{method}` is not a reader; call it with '\"...\" does a "
            f"`{method}` on `{state_type}` of \"...\"'"
        )
    try:
        world.response = await world.call(
            state_type=state_type,
            state_id=_maybe_saved(world, state_id),
            method=method,
            assignments=_parse_assignments(world, arguments),
            user=user,
        )
        return world.response
    except Aborted as aborted:
        raise AssertionError(
            f"`{method}` on the `{state_type}` for \"{state_id}\" "
            f"{aborted}"
        ) from aborted


@then(parsers.re(HAS))
async def _then_has(
    world: World,
    user: str,
    method: str,
    state_type: str,
    state_id: str,
    arguments: Optional[str],
    clauses: str,
) -> None:
    response = await _read(
        world, user, method, state_type, state_id, arguments
    )
    _assert_properties(response, _parse_assertions(world, clauses))


@then(parsers.re(EVENTUALLY_HAS))
async def _eventually_has(
    world: World,
    user: str,
    method: str,
    state_type: str,
    state_id: str,
    arguments: Optional[str],
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
    assignments = _parse_assignments(world, arguments)
    read = getattr(reference.reactively(), method)
    responses = (
        read(world.context(user)) if not assignments else read(
            world.context(user),
            world.request(
                state_type=state_type,
                method=method,
                assignments=assignments,
            ),
        )
    )
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


@given(parsers.re(HAS_SAVED_AS))
@when(parsers.re(HAS_SAVED_AS))
async def _has_saved_as(
    world: World,
    user: str,
    method: str,
    state_type: str,
    state_id: str,
    arguments: Optional[str],
    clauses: str,
) -> None:
    response = await _read(
        world, user, method, state_type, state_id, arguments
    )
    response_json = _json_object(response)
    for name, path in _parse_saves(clauses).items():
        world.save(name, _resolve_json_property(response_json, path))


@then(parsers.re(ABORTS_WITH))
async def _aborts_with(
    world: World,
    user: str,
    method: str,
    state_type: str,
    state_id: str,
    arguments: Optional[str],
    error_type: str,
    clauses: Optional[str],
) -> None:
    if not world.is_reader(state_type=state_type, method=method):
        raise ValueError(
            f"`{method}` is not a reader; assert its abort with "
            f"'\"...\" attempts a `{method}` on `{state_type}` of \"...\"' "
            "and 'the attempt aborts with ...'"
        )
    try:
        await world.call(
            state_type=state_type,
            state_id=_maybe_saved(world, state_id),
            method=method,
            assignments=_parse_assignments(world, arguments),
            user=user,
        )
    except Aborted as aborted:
        _assert_aborted(world, aborted, error_type, clauses)
        return
    raise AssertionError(
        f"Expected `{method}` on the `{state_type}` for "
        f'"{state_id}" to abort with `{error_type}`, but it '
        "succeeded"
    )


@then(parsers.re(RESULT_HAS))
def _the_result_has(world: World, clauses: str) -> None:
    assert world.response is not None, (
        "Expected a preceding step to have made a call that returned "
        "a response, but there is none"
    )
    _assert_properties(world.response, _parse_assertions(world, clauses))


@given(parsers.re(RESULTING_STATE_ID_IS_SAVED_AS))
@when(parsers.re(RESULTING_STATE_ID_IS_SAVED_AS))
def _the_resulting_state_id_is_saved_as(world: World, name: str) -> None:
    if world.created_state_id is None:
        raise ValueError(
            "Expected a preceding 'creates' step to have created a state, "
            "but there is none"
        )
    world.save(name, world.created_state_id)


@given(parsers.re(RESULTING_TASK_ID_IS_SAVED_AS))
@when(parsers.re(RESULTING_TASK_ID_IS_SAVED_AS))
def _the_resulting_task_id_is_saved_as(world: World, name: str) -> None:
    if world.spawned_task_id is None:
        raise ValueError(
            "Expected a preceding 'spawns' step to have spawned a task, "
            "but there is none"
        )
    world.save(name, world.spawned_task_id)


@given(parsers.re(RESULTING_IS_SAVED_AS))
@when(parsers.re(RESULTING_IS_SAVED_AS))
def _the_resulting_property_is_saved_as(
    world: World,
    property_name: str,
    name: str,
) -> None:
    assert world.response is not None, (
        "Expected a preceding step to have made a call that returned "
        "a response, but there is none"
    )
    world.save(
        name,
        _resolve_json_property(
            _json_object(world.response), PropertyPath.create(property_name)
        ),
    )


# The steps below match only *invalid* clause lists, each a
# near-miss of the grammar the steps above declare, so that the
# mistake raises a pointed error instead of pytest-bdd's unmatched
# step. Each pattern is disjoint from every real step's: a real
# step's tail never matches one of these.


@when(parsers.re(r'"[^"]*" awaits the `\w+` task "<[^<>"]+>" on `[\w.]+`$'))
@then(parsers.re(r'"[^"]*" awaits the `\w+` task "<[^<>"]+>" on `[\w.]+`$'))
def _almost_awaits_needs_within() -> None:
    raise ValueError(
        "Almost: say how long to wait for the task, e.g. within 10 "
        "seconds"
    )


@then(parsers.re(rf'.+ eventually has {ASSERT_CLAUSES}$'))
def _almost_eventually_needs_within() -> None:
    raise ValueError(
        "Almost: say how long 'eventually has' keeps its reactive "
        "read open, e.g. within 10 seconds"
    )


@then(parsers.re(rf'.+(?<!eventually) has {ASSERT_CLAUSES} within .+$'))
def _almost_within_needs_eventually() -> None:
    raise ValueError(
        "Almost: 'within' goes with 'eventually has'; a plain 'has' "
        "asserts the response it reads"
    )


@given(parsers.re(r'the \w+ application is up$'))
@when(parsers.re(r'the \w+ application is up$'))
def _almost_unquoted_application() -> None:
    raise ValueError(
        "Almost: quote the application's name, e.g. 'the \"proxy\" "
        "application is up'"
    )


@given(parsers.re(r'I am "[^"]*"$'))
@when(parsers.re(r'I am "[^"]*"$'))
def _almost_i_am() -> None:
    raise ValueError(
        "Almost: say '\"...\" is an authenticated user', then start each "
        "step that calls as them with 'as \"...\",'"
    )


@given(parsers.re(r'the authenticated user is "[^"]*"$'))
@when(parsers.re(r'the authenticated user is "[^"]*"$'))
def _almost_the_authenticated_user_is() -> None:
    raise ValueError(
        "Almost: say '\"...\" is an authenticated user', then start each "
        "step that calls as them with 'as \"...\",'"
    )


@given(parsers.re(r'the bearer token is "[^"]*"$'))
@when(parsers.re(r'the bearer token is "[^"]*"$'))
def _almost_the_bearer_token_is() -> None:
    raise ValueError(
        "Almost: say '\"...\" has the bearer token \"...\"', naming the "
        "user, then start each step that calls as them with 'as \"...\",'"
    )


@given(parsers.re(r'"[^"]*" saves their user id as ["`][^"`]*["`]$'))
@when(parsers.re(r'"[^"]*" saves their user id as ["`][^"`]*["`]$'))
@then(parsers.re(r'"[^"]*" saves their user id as ["`][^"`]*["`]$'))
def _almost_saves_user_id() -> None:
    raise ValueError(
        "Almost: the user id is saved as the user signs in; say "
        "'\"...\" is signed in to the web app with their user id saved "
        "as \"...\"'"
    )


@given(parsers.re(r'"[^"]*" signs in(?: as "[^"]*")?$'))
@when(parsers.re(r'"[^"]*" signs in(?: as "[^"]*")?$'))
def _almost_signs_in() -> None:
    raise ValueError(
        "Almost: no step signs a user in; a scenario signs in the way a "
        "person does, clicking through the app's own sign-in with the "
        "web app steps, and then says '\"...\" is signed in to the web "
        "app'"
    )


@given(parsers.re(r'the user is (?:anonymous|unauthenticated)$'))
@when(parsers.re(r'the user is (?:anonymous|unauthenticated)$'))
def _almost_anonymous() -> None:
    raise ValueError(
        "Almost: say '\"...\" is an unauthenticated user', naming the "
        "user, then start each step that calls as them with 'as \"...\",'"
    )


# A calling step written with its caller but no comma after them.
_CALLER_WITHOUT_COMMA = r'as "[^"]*" .+'


@given(parsers.re(_CALLER_WITHOUT_COMMA))
@when(parsers.re(_CALLER_WITHOUT_COMMA))
@then(parsers.re(_CALLER_WITHOUT_COMMA))
def _almost_caller_without_comma() -> None:
    raise ValueError(
        "Almost: a comma sets the caller off from the call, 'as \"...\", "
        "the ...'"
    )


# A call in its former spelling, the state first and the caller, if
# any, before it: 'the `Account` for "alice" gets a `deposit`'.
_CALL_STATE_FIRST = (
    r'(?:as "[^"]*", )?(?:'
    r'(?:a|an) `[\w.]+` for "[^"]*" gets created via|'
    r'the `[\w.]+` for "[^"]*" (?:gets|attempts) (?:a|an) `|'
    r'the `\w+` task with id "<\w+>" of the `'
    r').*'
)


@given(parsers.re(_CALL_STATE_FIRST))
@when(parsers.re(_CALL_STATE_FIRST))
@then(parsers.re(_CALL_STATE_FIRST))
def _almost_call_state_first() -> None:
    raise ValueError(
        "Almost: a call starts with who calls: '\"...\" does a `method` on "
        "`Type` of \"id\" with ...', '\"...\" creates a `Type` of \"id\" via "
        "`method`', '\"...\" attempts a `method` on `Type` of \"id\"', or "
        "'\"...\" awaits the `method` task \"<name>\" on `Type` within ...'"
    )


@given(parsers.re(r'.+ and saves its (?:task )?id as ["`][^"`]*["`]$'))
@when(parsers.re(r'.+ and saves its (?:task )?id as ["`][^"`]*["`]$'))
def _almost_saves_on_the_call() -> None:
    raise ValueError(
        "Almost: a call's result is saved on the next line, 'And the "
        "resulting state id is saved as \"...\"' after 'creates' or 'And the "
        "resulting task id is saved as \"...\"' after 'spawns'"
    )


# A call written without saying who calls.
_CALL_WITHOUT_USER = r'(?:does|spawns|creates|attempts|awaits) .*'


@given(parsers.re(_CALL_WITHOUT_USER))
@when(parsers.re(_CALL_WITHOUT_USER))
@then(parsers.re(_CALL_WITHOUT_USER))
def _almost_call_without_user() -> None:
    raise ValueError(
        "Almost: say who calls by starting the step with '\"...\"', naming "
        "a user the scenario declared, e.g. with '\"...\" is an "
        "unauthenticated user'"
    )


# A read, or a shared context, written without saying who reads.
_READ_WITHOUT_USER = (
    r'(?!as ")(?:'
    r'`\w+` on the `[\w.]+` for "[^"]*" (?:has|eventually has|aborts with)|'
    r'a shared context$'
    r')'
)


@given(parsers.re(_READ_WITHOUT_USER))
@when(parsers.re(_READ_WITHOUT_USER))
@then(parsers.re(_READ_WITHOUT_USER))
def _almost_read_without_user() -> None:
    raise ValueError(
        "Almost: say who reads by starting the step with 'as \"...\",', "
        "naming a user the scenario declared, e.g. with '\"...\" is an "
        "unauthenticated user'"
    )


@given(parsers.re(r'.+ eventually has .+$'))
@when(parsers.re(r'.+ eventually has .+$'))
def _almost_eventually_under_given_or_when() -> None:
    raise ValueError(
        "Almost: a Given or When 'has' saves what it reads now; "
        "'eventually has' asserts, under a Then"
    )


@given(parsers.re(rf'.+ has {ASSERT_CLAUSES}$'))
@when(parsers.re(rf'.+ has {ASSERT_CLAUSES}$'))
def _almost_asserting_under_given_or_when() -> None:
    raise ValueError(
        "Almost: a Given or When 'has' saves, e.g. `path` saved as "
        "`name`; assert `path=value` properties with a Then instead"
    )


@then(parsers.re(rf'.+ has {SAVE_CLAUSES}$'))
def _almost_saving_under_then() -> None:
    raise ValueError(
        "Almost: a Then 'has' asserts `path=value` properties; "
        "save under a Given or When 'has' instead"
    )


@given(parsers.re(rf'.+ has {MIXED_CLAUSES}$'))
@when(parsers.re(rf'.+ has {MIXED_CLAUSES}$'))
@then(parsers.re(rf'.+ has {MIXED_CLAUSES}$'))
def _almost_mixing_clauses() -> None:
    raise ValueError(
        "Almost: a 'has' list is all one kind; a Given or When "
        "'has' saves, and a Then 'has' asserts `path=value` "
        "properties"
    )


@given(
    parsers.re(
        rf'.+ with (?=.*`\s+saved\s){CLAUSE}'
        rf'(?:{SEPARATOR}{CLAUSE})*$'
    )
)
@when(
    parsers.re(
        rf'.+ with (?=.*`\s+saved\s){CLAUSE}'
        rf'(?:{SEPARATOR}{CLAUSE})*$'
    )
)
@then(
    parsers.re(
        rf'.+ with (?=.*`\s+saved\s){CLAUSE}'
        rf'(?:{SEPARATOR}{CLAUSE})*$'
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
        rf'{ASSERT_CLAUSES}$'
    )
)
@when(
    parsers.re(
        rf'.+ with (?=.*`\s+contain|.*`\s+(?:of\s+)?length)'
        rf'{ASSERT_CLAUSES}$'
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
# backticks, so both shapes are disjoint from every step above. The
# two steps whose 'has' or 'with' is followed by a quoted string and
# no clauses, '"admin" has the bearer token "..."' and 'is signed in
# to the web app with their user id saved as "..."', are left out.
_UNBACKTICKED_CLAUSES = (
    r'(?!the bearer token ")(?!their user id saved as ")[^`]+'
)
_UNCLOSED_CLAUSES = r'`[^`]*(?:`[^`]*`[^`]*)*'


@given(parsers.re(rf'.+ (?:with|has) {_UNBACKTICKED_CLAUSES}$'))
@when(parsers.re(rf'.+ (?:with|has) {_UNBACKTICKED_CLAUSES}$'))
@then(parsers.re(rf'.+ (?:with|has) {_UNBACKTICKED_CLAUSES}$'))
def _almost_missing_backticks() -> None:
    raise ValueError(
        "Almost: each clause goes in backticks, e.g. `amount=50` "
        "or `amount` saved as \"amount\""
    )


@given(parsers.re(rf'.+ (?:with|has) {_UNCLOSED_CLAUSES}$'))
@when(parsers.re(rf'.+ (?:with|has) {_UNCLOSED_CLAUSES}$'))
@then(parsers.re(rf'.+ (?:with|has) {_UNCLOSED_CLAUSES}$'))
def _almost_unclosed_backtick() -> None:
    raise ValueError("Almost: a backtick is unclosed")
