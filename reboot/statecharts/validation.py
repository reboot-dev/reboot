"""Checks a `rbt.v1alpha1.statecharts.Statechart` message against the
rules that the message alone can break, without running anything.

A state is identified by its hierarchical state name: the names of the
states it is within, outermost first, and then its own name, separated
by `/`. The state `WAITING` within the state `FOO` is `FOO/WAITING`,
and a state of the statechart itself is just its own name.
"""
from __future__ import annotations

import itertools
from rbt.v1alpha1.statecharts import statechart_pb2
from typing import Iterable, Iterator, Optional, overload

# What separates the names in a hierarchical state name, as in
# "FOO/WAITING".
_HIERARCHICAL_STATE_NAME_SEPARATOR = "/"


def _hierarchical_state_name(
    state_name: str,
    *,
    hierarchical_superstate_name: Optional[str],
) -> str:
    """Returns the hierarchical state name of the state named
    `state_name`. `hierarchical_superstate_name` is the hierarchical
    state name of the state that it is a substate of, or `None` if it
    is a state of the statechart itself."""
    if hierarchical_superstate_name is None:
        return state_name
    return (
        f"{hierarchical_superstate_name}"
        f"{_HIERARCHICAL_STATE_NAME_SEPARATOR}{state_name}"
    )


def _hierarchical_state_names(
    states: Iterable[statechart_pb2.Statechart.State],
    *,
    hierarchical_superstate_name: Optional[str],
) -> list[str]:
    """Returns the hierarchical state name of each of `states`, and of
    every state within them. `hierarchical_superstate_name` is the
    hierarchical state name of the state that `states` are the
    substates of, or `None` if they are the states of the statechart
    itself."""
    hierarchical_state_names: list[str] = []

    for state in states:
        hierarchical_state_name = _hierarchical_state_name(
            state.name,
            hierarchical_superstate_name=hierarchical_superstate_name,
        )
        hierarchical_state_names.append(hierarchical_state_name)
        hierarchical_state_names.extend(
            _hierarchical_state_names(
                state.states,
                hierarchical_superstate_name=hierarchical_state_name,
            )
        )

    return hierarchical_state_names


def _check_call(call: statechart_pb2.Statechart.Call) -> list[str]:
    """Returns every problem with `call`: it has a description, and it
    names a method."""
    problems: list[str] = []

    if not call.description.strip():
        problems.append("the `call` has no `description`")

    if not call.inline.method:
        problems.append("the `call` has no `method`")

    return problems


def _check_inject(inject: statechart_pb2.Statechart.Inject) -> list[str]:
    """Returns every problem with `inject`: it has an event."""
    problems: list[str] = []

    if not inject.event:
        problems.append("the `inject` has no `event`")

    return problems


def _check_schedule(
    schedule: statechart_pb2.Statechart.Schedule,
) -> list[str]:
    """Returns every problem with `schedule`: it names a method."""
    problems: list[str] = []

    if not schedule.inline.method:
        problems.append("the `schedule` has no `method`")

    return problems


def _check_timer(timer: statechart_pb2.Statechart.Timer) -> list[str]:
    """Returns every problem with `timer`: it has an event to enqueue,
    and a delay that is more than zero."""
    problems: list[str] = []

    if not timer.enqueue.event:
        problems.append("the `timer` has no event to `enqueue`")

    # A timer's delay is the sum of whichever of these it gives.
    delay_seconds = (
        timer.seconds + 60 * timer.minutes + 60 * 60 * timer.hours +
        24 * 60 * 60 * timer.days
    )
    if delay_seconds <= 0:
        problems.append(
            "the `timer` has no delay: its `seconds`, `minutes`, `hours` "
            "and `days` must add up to more than zero"
        )

    return problems


@overload
def _check_initial(*, statechart: statechart_pb2.Statechart) -> list[str]:
    ...


@overload
def _check_initial(
    *,
    state: statechart_pb2.Statechart.State,
    hierarchical_state_name: str,
) -> list[str]:
    ...


def _check_initial(
    *,
    statechart: Optional[statechart_pb2.Statechart] = None,
    state: Optional[statechart_pb2.Statechart.State] = None,
    hierarchical_state_name: Optional[str] = None,
) -> list[str]:
    """Returns every problem with where `statechart`, or `state`, and
    every state within it, is entered: one that has substates has an
    `initial` that names one of them, and one without has none.
    `hierarchical_state_name` is that of `state`."""
    # `subject` is what a message calls the statechart or the state.
    if statechart is not None:
        subject = "the statechart"
        initial = statechart.initial
        substates = statechart.states
    else:
        assert state is not None and hierarchical_state_name is not None
        subject = f"state `{hierarchical_state_name}`"
        initial = state.initial
        substates = state.states

    problems: list[str] = []

    substate_names = [substate.name for substate in substates]
    if len(substate_names) == 0:
        if initial:
            problems.append(
                f"{subject} has `initial: \"{initial}\"` but no states"
            )
    elif not initial:
        problems.append(f"{subject} has states but no `initial`")
    elif initial not in substate_names:
        problems.append(
            f"`initial: \"{initial}\"` of {subject} is not one of its states"
        )

    for substate in substates:
        problems.extend(
            _check_initial(
                state=substate,
                hierarchical_state_name=_hierarchical_state_name(
                    substate.name,
                    hierarchical_superstate_name=hierarchical_state_name,
                ),
            )
        )

    return problems


@overload
def _check_state_names(*, statechart: statechart_pb2.Statechart) -> list[str]:
    ...


@overload
def _check_state_names(
    *,
    state: statechart_pb2.Statechart.State,
    hierarchical_state_name: str,
) -> list[str]:
    ...


def _check_state_names(
    *,
    statechart: Optional[statechart_pb2.Statechart] = None,
    state: Optional[statechart_pb2.Statechart.State] = None,
    hierarchical_state_name: Optional[str] = None,
) -> list[str]:
    """Returns every problem with the names of the substates of
    `statechart`, or of `state`, and of every state within it: each
    substate has a name, which does not contain `/`, and no two
    substates of one state have the same name.
    `hierarchical_state_name` is that of `state`."""
    # `subject` is what a message calls the statechart or the state.
    if statechart is not None:
        subject = "the statechart"
        substates = statechart.states
    else:
        assert state is not None and hierarchical_state_name is not None
        subject = f"state `{hierarchical_state_name}`"
        substates = state.states

    problems: list[str] = []

    # How many substates have each name.
    count_by_name: dict[str, int] = {}
    for substate in substates:
        count_by_name[substate.name
                     ] = (count_by_name.get(substate.name, 0) + 1)

    for name, count in count_by_name.items():
        if name == "":
            # However many substates have no name, that is one problem,
            # and the checks of a name below do not apply.
            problems.append(f"{subject} has a state without a `name`")
            continue
        if _HIERARCHICAL_STATE_NAME_SEPARATOR in name:
            # Otherwise the state `B` within the state `A` and a state
            # named "A/B" would have the same hierarchical state name.
            problems.append(
                f"{subject} has a state named '{name}', but a state's "
                f"name cannot contain `{_HIERARCHICAL_STATE_NAME_SEPARATOR}`"
            )
        if count > 1:
            problems.append(
                f"{subject} has more than one state named '{name}'"
            )

    for substate in substates:
        problems.extend(
            _check_state_names(
                state=substate,
                hierarchical_state_name=_hierarchical_state_name(
                    substate.name,
                    hierarchical_superstate_name=hierarchical_state_name,
                ),
            )
        )

    return problems


@overload
def _check_transitions(
    *,
    statechart: statechart_pb2.Statechart,
    all_hierarchical_state_names: frozenset[str],
) -> list[str]:
    ...


@overload
def _check_transitions(
    *,
    state: statechart_pb2.Statechart.State,
    hierarchical_state_name: str,
    all_hierarchical_state_names: frozenset[str],
) -> list[str]:
    ...


def _check_transitions(
    *,
    statechart: Optional[statechart_pb2.Statechart] = None,
    state: Optional[statechart_pb2.Statechart.State] = None,
    hierarchical_state_name: Optional[str] = None,
    all_hierarchical_state_names: frozenset[str],
) -> list[str]:
    """Returns every problem with the transitions of `statechart`, or
    of `state`, and of every state within it: each transition is an
    `on` or a `when`, an `on` has an event and its guard, if it has
    one, names a method, a `when` has a description and a condition
    that names a method, each action of either is a `call` or an
    `inject`, and the `to` of either, if it has one, is the
    hierarchical state name of a state. `hierarchical_state_name` is
    that of `state`, and `all_hierarchical_state_names` are those of
    every state of the statechart."""
    # `subject` is what a message calls the statechart or the state.
    if statechart is not None:
        subject = "the statechart"
        transitions = statechart.transitions
        substates = statechart.states
    else:
        assert state is not None and hierarchical_state_name is not None
        subject = f"state `{hierarchical_state_name}`"
        transitions = state.transitions
        substates = state.states

    problems: list[str] = []

    for transition in transitions:
        match transition.WhichOneof("transition"):
            case "on":
                if not transition.on.event:
                    problems.append(
                        f"an `on` transition of {subject} has no `event`"
                    )
                if (
                    transition.on.HasField("guard") and
                    not transition.on.guard.inline.method
                ):
                    problems.append(
                        f"the `guard` of an `on` transition of {subject} "
                        "has no `method`"
                    )
                if (
                    transition.on.HasField("to") and
                    transition.on.to not in all_hierarchical_state_names
                ):
                    problems.append(
                        f"`to: \"{transition.on.to}\"` of an `on` "
                        f"transition of {subject} is not the hierarchical "
                        "state name of a state"
                    )
                for action in transition.on.actions:
                    match action.WhichOneof("action"):
                        case "call":
                            for problem in _check_call(action.call):
                                problems.append(
                                    f"in an `on` transition of {subject}: "
                                    f"{problem}"
                                )
                        case "inject":
                            for problem in _check_inject(action.inject):
                                problems.append(
                                    f"in an `on` transition of {subject}: "
                                    f"{problem}"
                                )
                        case _:
                            problems.append(
                                "an action of an `on` transition of "
                                f"{subject} is neither a `call` nor an "
                                "`inject`"
                            )
            case "when":
                if not transition.when.description.strip():
                    problems.append(
                        f"a `when` transition of {subject} has no "
                        "`description`"
                    )
                match transition.when.condition.WhichOneof("condition"):
                    case "inline":
                        if not transition.when.condition.inline.method:
                            problems.append(
                                "the `condition` of a `when` transition of "
                                f"{subject} has no `method`"
                            )
                    case _:
                        problems.append(
                            f"a `when` transition of {subject} has no "
                            "`condition`"
                        )
                if (
                    transition.when.HasField("to") and
                    transition.when.to not in all_hierarchical_state_names
                ):
                    problems.append(
                        f"`to: \"{transition.when.to}\"` of a `when` "
                        f"transition of {subject} is not the hierarchical "
                        "state name of a state"
                    )
                for action in transition.when.actions:
                    match action.WhichOneof("action"):
                        case "call":
                            for problem in _check_call(action.call):
                                problems.append(
                                    f"in a `when` transition of {subject}: "
                                    f"{problem}"
                                )
                        case "inject":
                            for problem in _check_inject(action.inject):
                                problems.append(
                                    f"in a `when` transition of {subject}: "
                                    f"{problem}"
                                )
                        case _:
                            problems.append(
                                "an action of a `when` transition of "
                                f"{subject} is neither a `call` nor an "
                                "`inject`"
                            )
            case _:
                problems.append(
                    f"a transition of {subject} is neither an `on` nor a "
                    "`when`"
                )

    for substate in substates:
        problems.extend(
            _check_transitions(
                state=substate,
                hierarchical_state_name=_hierarchical_state_name(
                    substate.name,
                    hierarchical_superstate_name=hierarchical_state_name,
                ),
                all_hierarchical_state_names=all_hierarchical_state_names,
            )
        )

    return problems


@overload
def _check_entries(*, statechart: statechart_pb2.Statechart) -> list[str]:
    ...


@overload
def _check_entries(
    *,
    state: statechart_pb2.Statechart.State,
    hierarchical_state_name: str,
) -> list[str]:
    ...


def _check_entries(
    *,
    statechart: Optional[statechart_pb2.Statechart] = None,
    state: Optional[statechart_pb2.Statechart.State] = None,
    hierarchical_state_name: Optional[str] = None,
) -> list[str]:
    """Returns every problem with the entries of `statechart`, or of
    `state`, and of every state within it: each entry is a `call`, an
    `inject`, a `schedule` or a `timer`. `hierarchical_state_name` is
    that of `state`."""
    # `subject` is what a message calls the statechart or the state.
    if statechart is not None:
        subject = "the statechart"
        entries = statechart.entry
        substates = statechart.states
    else:
        assert state is not None and hierarchical_state_name is not None
        subject = f"state `{hierarchical_state_name}`"
        entries = state.entry
        substates = state.states

    problems: list[str] = []

    for entry in entries:
        match entry.WhichOneof("entry"):
            case "call":
                for problem in _check_call(entry.call):
                    problems.append(f"in an `entry` of {subject}: {problem}")
            case "inject":
                for problem in _check_inject(entry.inject):
                    problems.append(f"in an `entry` of {subject}: {problem}")
            case "schedule":
                for problem in _check_schedule(entry.schedule):
                    problems.append(f"in an `entry` of {subject}: {problem}")
            case "timer":
                for problem in _check_timer(entry.timer):
                    problems.append(f"in an `entry` of {subject}: {problem}")
            case _:
                problems.append(
                    f"an `entry` of {subject} is neither a `call`, an "
                    "`inject`, a `schedule` nor a `timer`"
                )

    for substate in substates:
        problems.extend(
            _check_entries(
                state=substate,
                hierarchical_state_name=_hierarchical_state_name(
                    substate.name,
                    hierarchical_superstate_name=hierarchical_state_name,
                ),
            )
        )

    return problems


@overload
def _check_exits(*, statechart: statechart_pb2.Statechart) -> list[str]:
    ...


@overload
def _check_exits(
    *,
    state: statechart_pb2.Statechart.State,
    hierarchical_state_name: str,
) -> list[str]:
    ...


def _check_exits(
    *,
    statechart: Optional[statechart_pb2.Statechart] = None,
    state: Optional[statechart_pb2.Statechart.State] = None,
    hierarchical_state_name: Optional[str] = None,
) -> list[str]:
    """Returns every problem with the exits of `statechart`, or of
    `state`, and of every state within it: each exit is a `call` or an
    `inject`. `hierarchical_state_name` is that of `state`."""
    # `subject` is what a message calls the statechart or the state.
    if statechart is not None:
        subject = "the statechart"
        exits = statechart.exit
        substates = statechart.states
    else:
        assert state is not None and hierarchical_state_name is not None
        subject = f"state `{hierarchical_state_name}`"
        exits = state.exit
        substates = state.states

    problems: list[str] = []

    for exit in exits:
        match exit.WhichOneof("exit"):
            case "call":
                for problem in _check_call(exit.call):
                    problems.append(f"in an `exit` of {subject}: {problem}")
            case "inject":
                for problem in _check_inject(exit.inject):
                    problems.append(f"in an `exit` of {subject}: {problem}")
            case _:
                problems.append(
                    f"an `exit` of {subject} is neither a `call` nor an "
                    "`inject`"
                )

    for substate in substates:
        problems.extend(
            _check_exits(
                state=substate,
                hierarchical_state_name=_hierarchical_state_name(
                    substate.name,
                    hierarchical_superstate_name=hierarchical_state_name,
                ),
            )
        )

    return problems


def _check_final(
    state: statechart_pb2.Statechart.State,
    *,
    hierarchical_state_name: str,
) -> list[str]:
    """Returns every problem with `state`, and with every state within
    it, being final: a final state has no `schedule`, no `timer`, no
    transitions and no substates. `hierarchical_state_name` is that of
    `state`."""
    problems: list[str] = []

    if state.final:
        if any(
            entry.WhichOneof("entry") in ("schedule", "timer")
            for entry in state.entry
        ):
            problems.append(
                f"state `{hierarchical_state_name}` is final and cannot have a "
                "`schedule` or a `timer`"
            )
        if len(state.transitions) > 0:
            problems.append(
                f"state `{hierarchical_state_name}` is final and cannot have "
                "transitions"
            )
        if len(state.states) > 0:
            problems.append(
                f"state `{hierarchical_state_name}` is final and cannot "
                "have states"
            )

    for substate in state.states:
        problems.extend(
            _check_final(
                substate,
                hierarchical_state_name=_hierarchical_state_name(
                    substate.name,
                    hierarchical_superstate_name=hierarchical_state_name,
                ),
            )
        )

    return problems


def _states_and_substates(
    states: Iterable[statechart_pb2.Statechart.State],
) -> Iterator[statechart_pb2.Statechart.State]:
    """Yields each of `states`, and every state within them."""
    for state in states:
        yield state
        yield from _states_and_substates(state.states)


def _entries(
    statechart: statechart_pb2.Statechart,
) -> Iterator[statechart_pb2.Statechart.Entry]:
    """Yields every `entry` of `statechart` and of every state within
    it."""
    yield from statechart.entry
    for state in _states_and_substates(statechart.states):
        yield from state.entry


def _exits(
    statechart: statechart_pb2.Statechart,
) -> Iterator[statechart_pb2.Statechart.Exit]:
    """Yields every `exit` of `statechart` and of every state within
    it."""
    yield from statechart.exit
    for state in _states_and_substates(statechart.states):
        yield from state.exit


def _transitions(
    statechart: statechart_pb2.Statechart,
) -> Iterator[statechart_pb2.Statechart.Transition]:
    """Yields every transition of `statechart` and of every state
    within it."""
    yield from statechart.transitions
    for state in _states_and_substates(statechart.states):
        yield from state.transitions


def _on_transitions(
    statechart: statechart_pb2.Statechart,
) -> Iterator[statechart_pb2.Statechart.On]:
    """Yields every `on` transition of `statechart` and of every state
    within it."""
    for transition in _transitions(statechart):
        if transition.WhichOneof("transition") == "on":
            yield transition.on


def _when_transitions(
    statechart: statechart_pb2.Statechart,
) -> Iterator[statechart_pb2.Statechart.When]:
    """Yields every `when` transition of `statechart` and of every
    state within it."""
    for transition in _transitions(statechart):
        if transition.WhichOneof("transition") == "when":
            yield transition.when


def _calls(
    statechart: statechart_pb2.Statechart,
) -> Iterator[statechart_pb2.Statechart.Call]:
    """Yields every `call` of `statechart` and of every state within
    it: each one that is an `entry`, an `exit`, or an action of an
    `on` or a `when` transition."""
    for entry in _entries(statechart):
        if entry.WhichOneof("entry") == "call":
            yield entry.call

    for exit in _exits(statechart):
        if exit.WhichOneof("exit") == "call":
            yield exit.call

    for on in _on_transitions(statechart):
        for action in on.actions:
            if action.WhichOneof("action") == "call":
                yield action.call

    for when in _when_transitions(statechart):
        for action in when.actions:
            if action.WhichOneof("action") == "call":
                yield action.call


def _schedules(
    statechart: statechart_pb2.Statechart,
) -> Iterator[statechart_pb2.Statechart.Schedule]:
    """Yields every `schedule` of `statechart` and of every state
    within it."""
    for entry in _entries(statechart):
        if entry.WhichOneof("entry") == "schedule":
            yield entry.schedule


def _injects(
    statechart: statechart_pb2.Statechart,
) -> Iterator[statechart_pb2.Statechart.Inject]:
    """Yields every `inject` of `statechart` and of every state within
    it: each one that is an `entry`, an `exit`, or an action of an
    `on` or a `when` transition."""
    for entry in _entries(statechart):
        if entry.WhichOneof("entry") == "inject":
            yield entry.inject

    for exit in _exits(statechart):
        if exit.WhichOneof("exit") == "inject":
            yield exit.inject

    for on in _on_transitions(statechart):
        for action in on.actions:
            if action.WhichOneof("action") == "inject":
                yield action.inject

    for when in _when_transitions(statechart):
        for action in when.actions:
            if action.WhichOneof("action") == "inject":
                yield action.inject


def _timers(
    statechart: statechart_pb2.Statechart,
) -> Iterator[statechart_pb2.Statechart.Timer]:
    """Yields every `timer` of `statechart` and of every state within
    it."""
    for entry in _entries(statechart):
        if entry.WhichOneof("entry") == "timer":
            yield entry.timer


def _check_events(statechart: statechart_pb2.Statechart) -> list[str]:
    """Returns every problem with the events of `statechart`: each
    event that it mentions, as the event of an `on` transition or as
    one that it injects or enqueues, is one of its `events`, and each
    event that it injects or enqueues is the event of an `on`
    transition."""
    problems: list[str] = []

    events_of_on_transitions = {on.event for on in _on_transitions(statechart)}

    # The event of each `inject`, and each event that a `call` may
    # inject.
    injected_events = {inject.event for inject in _injects(statechart)}
    for call in _calls(statechart):
        injected_events.update(call.inline.injects)

    # The event of each `timer`, and each event that a `schedule` may
    # enqueue.
    enqueued_events = {timer.enqueue.event for timer in _timers(statechart)}
    for schedule in _schedules(statechart):
        enqueued_events.update(schedule.inline.enqueues)

    injected_and_enqueued_events = injected_events | enqueued_events

    # An `on`, an `inject` or a `timer` that has no event has an empty
    # `event` field, which was collected above as the empty string.
    # That is not an event, so it is left out.
    events_of_on_transitions.discard("")
    injected_and_enqueued_events.discard("")

    mentioned_events = events_of_on_transitions | injected_and_enqueued_events

    for event in sorted(mentioned_events - set(statechart.events)):
        problems.append(
            f"the statechart mentions the event `{event}`, which is not "
            "one of its `events`",
        )

    for event in sorted(
        injected_and_enqueued_events - events_of_on_transitions,
    ):
        problems.append(
            f"the statechart injects or enqueues the event `{event}`, but "
            "has no `on` transition for it",
        )

    return problems


def _check_methods(statechart: statechart_pb2.Statechart) -> list[str]:
    """Returns every problem with the methods of `statechart`: no
    method is named by two of a `condition`, a `guard`, a `call` and a
    `schedule`."""
    problems: list[str] = []

    condition_methods = {
        when.condition.inline.method for when in _when_transitions(statechart)
    }
    guard_methods = {
        on.guard.inline.method for on in _on_transitions(statechart)
    }
    call_methods = {call.inline.method for call in _calls(statechart)}
    schedule_methods = {
        schedule.inline.method for schedule in _schedules(statechart)
    }

    # The methods that the statechart names, by what names them.
    methods = {
        "condition": condition_methods,
        "guard": guard_methods,
        "call": call_methods,
        "schedule": schedule_methods,
    }

    # A `condition`, a `guard`, a `call` or a `schedule` that has no
    # method, and an `on` that has no `guard`, has an empty `method`
    # field, which was collected above as the empty string. That is
    # not a method, so it is left out.
    for methods_named_the_same_way in methods.values():
        methods_named_the_same_way.discard("")

    # Each two of "condition", "guard", "call" and "schedule", once.
    for one, other in itertools.combinations(methods, 2):
        for method in sorted(methods[one] & methods[other]):
            problems.append(
                f"the method `{method}` is both a `{one}` and a `{other}`",
            )

    return problems


def check_statechart(statechart: statechart_pb2.Statechart) -> list[str]:
    """Returns every problem with `statechart`, each as a message for
    the statechart's author. A statechart without problems returns
    none."""
    problems: list[str] = []

    problems.extend(_check_state_names(statechart=statechart))
    problems.extend(_check_initial(statechart=statechart))
    problems.extend(_check_entries(statechart=statechart))
    problems.extend(_check_exits(statechart=statechart))
    problems.extend(
        _check_transitions(
            statechart=statechart,
            all_hierarchical_state_names=frozenset(
                _hierarchical_state_names(
                    statechart.states,
                    hierarchical_superstate_name=None,
                )
            ),
        )
    )
    for state in statechart.states:
        problems.extend(
            _check_final(
                state,
                hierarchical_state_name=_hierarchical_state_name(
                    state.name,
                    hierarchical_superstate_name=None,
                ),
            )
        )
    problems.extend(_check_events(statechart))
    problems.extend(_check_methods(statechart))

    return problems
