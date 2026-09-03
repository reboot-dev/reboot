"""The pytest fixtures that the built-in `reboot.bdd` steps run on."""

import json
import jsonpath_ng
import pytest
from dataclasses import dataclass, field
from google.protobuf import json_format
from google.protobuf.message import Message
from jsonpath_ng.exceptions import JSONPathError
from pydantic import ValidationError
from reboot.aio.aborted import Aborted
from reboot.aio.external import ExternalContext
from reboot.aio.tests import Reboot
from reboot.api import Model
from reboot.bdd.loop import EventLoopThread, start_event_loop, stop_event_loop
from typing import Any, Callable, Iterator, Optional, Union


@pytest.fixture(autouse=True)
def reboot_event_loop() -> Iterator[EventLoopThread]:
    """The scenario's event loop, which `reboot.bdd.run()` and every
    `async def` step run on. One loop per scenario, the way one
    application runs on one event loop under `rbt dev run` and
    `rbt serve`."""
    event_loop = start_event_loop()
    try:
        yield event_loop
    finally:
        stop_event_loop(event_loop)


@pytest.fixture
def rbt(reboot_event_loop: EventLoopThread) -> Iterator[Reboot]:
    """A fresh `Reboot` test harness on the scenario's event loop,
    started before the scenario and stopped after it."""
    reboot = Reboot()
    reboot_event_loop.run(reboot.start())
    try:
        yield reboot
    finally:
        reboot_event_loop.run(reboot.stop())


# A JSON value: what property values, and the values saved under a
# name, are made of.
JsonValue = Union[None, bool, int, float, str, list['JsonValue'],
                  dict[str, 'JsonValue']]


def _json_object(
    message_or_model: Union[Message, Model],
) -> dict[str, 'JsonValue']:
    """The given message or model as its JSON object (a message via
    its canonical JSON, with fields without presence included, so
    every property is reachable, and a model via its JSON-mode dump,
    so e.g. a datetime is its string)."""
    if isinstance(message_or_model, Message):
        return json_format.MessageToDict(
            message_or_model,
            preserving_proto_field_name=True,
            always_print_fields_with_no_presence=True,
        )
    return message_or_model.model_dump(mode='json')


@dataclass(frozen=True)
class PropertyPath:
    """One property's path, in both its forms."""

    # The path as the developer wrote it, e.g. 'owners["main"].name';
    # what error messages say.
    text: str

    # The parsed path; what finds, updates, and grammar walks use.
    expression: jsonpath_ng.JSONPath

    @staticmethod
    def create(text: str) -> 'PropertyPath':
        """The property path the given text parses as."""
        try:
            expression = jsonpath_ng.parse(text)
        except JSONPathError as error:
            raise ValueError(f"Invalid property `{text}`: {error}") from error
        return PropertyPath(text=text, expression=expression)


@dataclass(frozen=True)
class Assignment:
    """A `path=value` clause in a call's 'with' list: the value put
    at the property's path when building the request."""

    # The property assigned.
    path: PropertyPath

    # The value put there, as written (JSON).
    value: JsonValue


def _json_type(value: Any) -> type:
    """The JSON type of a value: `int` and `float` are one number
    type, and `bool` is its own."""
    if isinstance(value, bool):
        return bool
    if isinstance(value, (int, float)):
        return float
    return type(value)


def _zero_indexed(path: jsonpath_ng.JSONPath) -> jsonpath_ng.JSONPath:
    """The path with every list index replaced by [0]; a path's list
    element type is the same at every index."""
    match path:
        case jsonpath_ng.Child(left=left, right=right):
            return jsonpath_ng.Child(_zero_indexed(left), _zero_indexed(right))
        case jsonpath_ng.Index():
            return jsonpath_ng.Index(0)
        case _:
            return path


@dataclass
class World:
    """What one scenario's steps have accumulated so far.

    Mutable: steps write what they did so that later steps can assert
    on it.
    """

    # The generated client class of each of the application's state
    # types, under the full state type name (e.g. 'bank.v1.Account');
    # empty until the application is up.
    client_types: dict[str, type] = field(default_factory=dict)

    # The harness the scenario's application runs on; `None` until
    # the application is up.
    rbt: Optional[Reboot] = None

    # The scenario's name; every context's name begins with it.
    name: Optional[str] = None

    # The context every call shares, once a 'Given a shared context'
    # step has created it; while `None`, each call runs on a fresh
    # context, the way each external call in production arrives with
    # its own.
    shared_context: Optional[ExternalContext] = None

    # Number of contexts created so far; makes each context's name
    # unique within the scenario.
    contexts_created: int = 0

    # The response of the most recent call a step made.
    response: Optional[Any] = None

    # Values saved under a name, as JSON; later steps say '$name' to
    # use.
    saved: dict[str, JsonValue] = field(default_factory=dict)

    # The error the most recent 'attempts' step's call aborted with,
    # or `None` if that call succeeded.
    aborted: Optional[Aborted] = None

    # The bearer token every context created from here on carries;
    # `None` calls unauthenticated.
    bearer_token: Optional[str] = None

    # Whether the scenario has said who calls, authenticated or
    # not; every call requires it.
    user_declared: bool = False

    def context(self) -> ExternalContext:
        """The context for one step's call: the scenario's shared
        context once a 'Given a shared context' step has created it,
        otherwise a fresh context."""
        if self.shared_context is not None:
            return self.shared_context
        if self.rbt is None:
            raise ValueError(
                "The application is not up; start the scenario with "
                "'Given the application is up'"
            )
        if not self.user_declared:
            raise ValueError(
                "The scenario has not declared a user; say 'Given "
                'the authenticated user is "..."\' or \'Given the '
                "user is unauthenticated'"
            )
        self.contexts_created += 1
        return self.rbt.create_external_context(
            name=f"{self.name}-{self.contexts_created}",
            bearer_token=self.bearer_token,
        )

    def set_bearer_token(self, bearer_token: Optional[str]) -> None:
        """Sets the bearer token every context created from here on
        carries, `None` for unauthenticated, satisfying the say-who-
        calls requirement either way; raises once a shared context
        exists, which keeps the token it was created with."""
        if self.shared_context is not None:
            raise ValueError(
                "The shared context already carries an identity; say "
                "who the authenticated user is before 'Given a "
                "shared context'"
            )
        self.bearer_token = bearer_token
        self.user_declared = True

    def client_type(self, state_type: str) -> Any:
        """The generated client class of the named state type, named
        by its full state type name (e.g. 'bank.v1.Account') or, when
        only one state type goes by it, its unqualified name (e.g.
        'Account'); raises if the application serves no such state
        type or the unqualified name is ambiguous."""
        client_type = self.client_types.get(state_type)
        if client_type is not None:
            return client_type
        qualified = sorted(
            name for name in self.client_types
            if name.endswith('.' + state_type)
        )
        if len(qualified) == 1:
            return self.client_types[qualified[0]]
        if len(qualified) > 1:
            raise ValueError(
                f"`{state_type}` names more than one of the "
                "application's state types; say one of: " +
                ', '.join(f'`{name}`' for name in qualified)
            )
        raise ValueError(
            f"Unknown state type `{state_type}`; the application "
            "serves: " +
            (', '.join(sorted(self.client_types)) or "no state types")
        )

    def factory(
        self,
        *,
        state_type: str,
        method: str,
    ) -> Callable[..., Any]:
        """The named factory on the state type's generated client
        class; raises if there is none."""
        factory = getattr(self.client_type(state_type), method, None)
        if not callable(factory):
            raise ValueError(f"`{state_type}` has no factory `{method}`")
        return factory

    def is_reader(self, *, state_type: str, method: str) -> bool:
        """Whether the named method is one of the named state type's
        unary readers."""
        # TODO: this is a bit of a hack! We check to see if
        # `StateType.reactively().method()` exists to know if it is a
        # reader because `reactively` is only for readers.
        reference = self.client_type(state_type).ref('is-reader')
        return hasattr(reference.reactively(), method)

    def request_type(
        self,
        *,
        state_type: str,
        method: str,
    ) -> Optional[type]:
        """The request type of the named method, from the generated
        client class's `<Method>Request` alias, or `None` when the
        method takes no request."""
        client_type = self.client_type(state_type)
        alias = method.replace('_', '').lower() + 'request'
        for name in dir(client_type):
            if name.lower() == alias:
                request_type = getattr(client_type, name)
                if isinstance(request_type, type):
                    return request_type
        return None

    def task_type(
        self,
        *,
        state_type: str,
        method: str,
    ) -> Optional[type]:
        """The task type of the named method, from the generated
        client class's `<Method>Task` class, or `None` when there is
        none."""
        client_type = self.client_type(state_type)
        alias = method.replace('_', '').lower() + 'task'
        for name in dir(client_type):
            if name.lower() == alias:
                task_type = getattr(client_type, name)
                if isinstance(task_type, type):
                    return task_type
        return None

    async def spawn(
        self,
        *,
        state_type: str,
        state_id: str,
        method: str,
        assignments: Union[dict[str, JsonValue], list[Assignment]],
    ) -> Any:
        """Spawns the named method as a task on the named state,
        using the specified `assignments` to create a request, and
        returns the task handle to await for its response."""
        reference = self.client_type(state_type).ref(state_id)
        spawn = getattr(reference.spawn(), method, None)
        if not callable(spawn):
            raise ValueError(f"`{state_type}` has no method `{method}`")
        if not assignments:
            return await spawn(self.context())
        return await spawn(
            self.context(),
            self.request(
                state_type=state_type,
                method=method,
                assignments=assignments,
            ),
        )

    def request(
        self,
        *,
        state_type: str,
        method: str,
        assignments: Union[dict[str, JsonValue], list[Assignment]],
    ) -> Any:
        """Returns a request with properties derived from the assignments,
        validated by the named method's request type. A dotted
        property name nests, e.g., 'owner.name' describes the
        request's `owner` message's `name`."""
        request_type = self.request_type(state_type=state_type, method=method)
        if request_type is None:
            raise ValueError(
                f"`{state_type}`'s `{method}` takes no properties"
            )

        if isinstance(assignments, dict):
            assignments = [
                Assignment(path=PropertyPath.create(text), value=value)
                for text, value in assignments.items()
            ]

        # Build the JSON object a property at a time, where a property
        # may add but never overwrite (a `find` hit is a collision).
        result: dict[str, JsonValue] = {}

        def validate(path: PropertyPath) -> None:
            """Raises for a path that names zero or many locations,
            because building a request needs each property to name
            exactly one place to update."""

            def confirmed(expression: jsonpath_ng.JSONPath) -> None:
                match expression:
                    case jsonpath_ng.Child(left=left, right=right):
                        confirmed(left)
                        confirmed(right)
                    case jsonpath_ng.Root():
                        pass
                    case jsonpath_ng.Fields(fields=(_,)):
                        pass
                    case jsonpath_ng.Index(indices=(_,)):
                        pass
                    case _:
                        raise ValueError(
                            f"Property `{path.text}` may only say "
                            'fields, ["key"]s, and [index]es, but '
                            f"says: {expression}"
                        )

            confirmed(path.expression)

        for assignment in assignments:
            # For creating a JSON object we disallow certain kinds of
            # paths that just don't make sense or are not useful.
            validate(assignment.path)
            if assignment.path.expression.find(result):
                raise ValueError(
                    f"Property `{assignment.path.text}` collides with "
                    "another property"
                )

            def update(
                # Object being updated.
                child: Any,
                # Containing object.
                parent: Any,
                # Field of containing object being updated.
                field: Any,
            ) -> Any:
                if isinstance(parent, list):
                    # A list index past a list's current end, e.g.,
                    # 'foo[5]' where the list only has 1 element, will
                    # pad the list with `{}` placeholders, even if the
                    # list is of strings or numbers, so we also
                    # confirm the value's JSON type matches the other
                    # elements': that refuses both a padded gap in a
                    # list of scalars and a mistyped element, while a
                    # gap in a list of objects stays, validated below
                    # as default-valued elements. The real backstop is
                    # doing the `model_validate` for Pydantic types
                    # and `ParseDict` for protobuf below, this is just
                    # extra.
                    for index, element in enumerate(parent):
                        if index == field:
                            continue
                        if _json_type(element) is not _json_type(
                            assignment.value
                        ):
                            raise ValueError(
                                f"Property `{assignment.path.text}` indexes "
                                f"into a list whose element "
                                f"{element!r} is not the same type "
                                "as its value"
                            )
                # There is currently a bug in jsonpath-ng where
                # returning a value does not always store it correctly
                # so we need to store it ourselves and return it until
                # h2non/jsonpath-ng#238 gets fixed.
                parent[field] = assignment.value
                return assignment.value

            try:
                # NOTE: we are using the version of `update_or_create`
                # that takes a callable because that forces
                # jsonpath-ng to raise a KeyError if a path attempts
                # to do a list index in an already existing dict
                # (i.e., treating the dict like a list incorrectly).
                assignment.path.expression.update_or_create(result, update)
            except (KeyError, TypeError) as error:
                raise ValueError(
                    f"Property `{assignment.path.text}` cannot be "
                    "applied to "
                    "what is already built"
                ) from error
        # If the request is a Pydantic model, we use `model_validate`.
        if hasattr(request_type, 'model_validate'):
            # Guard against pydantic's default of ignoring unknown
            # keys, which would make a mistyped property a silent
            # no-op.
            model_fields = getattr(request_type, 'model_fields')
            for name in result:
                if name not in model_fields:
                    raise ValueError(
                        f"`{request_type.__name__}` has no property "
                        f"`{name}`"
                    )
            try:
                return request_type.model_validate(result)
            except ValidationError as error:
                raise ValueError(
                    f"Could not build a `{request_type.__name__}` "
                    f"from {json.dumps(result)}: {error}"
                ) from error
        # The request must be protobuf, use `ParseDict`.
        try:
            return json_format.ParseDict(result, request_type())
        except json_format.ParseError as error:
            raise ValueError(
                f"Could not build a `{request_type.__name__}` from "
                f"{json.dumps(result)}: {error}"
            ) from error

    async def call(
        self,
        *,
        state_type: str,
        state_id: str,
        method: str,
        assignments: Union[dict[str, JsonValue], list[Assignment]],
    ) -> Any:
        """Returns the response from calling the named method on the named
        state using the specified `assignments` to create a request."""
        reference = self.client_type(state_type).ref(state_id)
        method_callable = getattr(reference, method, None)
        if not callable(method_callable):
            raise ValueError(f"`{state_type}` has no method `{method}`")
        if not assignments:
            return await method_callable(self.context())
        return await method_callable(
            self.context(),
            self.request(
                state_type=state_type,
                method=method,
                assignments=assignments,
            ),
        )


@pytest.fixture
def world() -> World:
    """The scenario's world: the mutable record its steps share."""
    return World()
