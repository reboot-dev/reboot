"""The pytest fixtures that the built-in `reboot.bdd` steps run on."""

import pytest
from dataclasses import dataclass, field
from google.protobuf import json_format
from google.protobuf.message import Message
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
    every property is reachable)."""
    if isinstance(message_or_model, Message):
        return json_format.MessageToDict(
            message_or_model,
            preserving_proto_field_name=True,
            always_print_fields_with_no_presence=True,
        )
    return message_or_model.model_dump()


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
        self.contexts_created += 1
        return self.rbt.create_external_context(
            name=f"{self.name}-{self.contexts_created}"
        )

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

    async def call(
        self,
        *,
        state_type: str,
        state_id: str,
        method: str,
        properties: dict[str, Any],
    ) -> Any:
        """Calls the named method on the named state, with the
        properties as the request's, and returns its response."""
        reference = self.client_type(state_type).ref(state_id)
        method_callable = getattr(reference, method, None)
        if not callable(method_callable):
            raise ValueError(f"`{state_type}` has no method `{method}`")
        return await method_callable(self.context(), **properties)


@pytest.fixture
def world() -> World:
    """The scenario's world: the mutable record its steps share."""
    return World()
