"""Checks a `rbt.v1alpha1.statecharts.Statechart` message against the
rules that the message alone can break, without running anything."""
from __future__ import annotations

from rbt.v1alpha1.statecharts import statechart_pb2
from typing import Optional, overload


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
def _check_initial(*, state: statechart_pb2.Statechart.State) -> list[str]:
    ...


def _check_initial(
    *,
    statechart: Optional[statechart_pb2.Statechart] = None,
    state: Optional[statechart_pb2.Statechart.State] = None,
) -> list[str]:
    """Returns every problem with where `statechart`, or `state`, and
    every state within it, is entered: one that has substates has an
    `initial` that names one of them, and one without has none."""
    # `subject` is what a message calls the statechart or the state.
    if statechart is not None:
        subject = "the statechart"
        initial = statechart.initial
        substates = statechart.states
    else:
        assert state is not None
        subject = f"state '{state.name}'"
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
        problems.extend(_check_initial(state=substate))

    return problems


@overload
def _check_state_names(*, statechart: statechart_pb2.Statechart) -> list[str]:
    ...


@overload
def _check_state_names(
    *,
    state: statechart_pb2.Statechart.State,
) -> list[str]:
    ...


def _check_state_names(
    *,
    statechart: Optional[statechart_pb2.Statechart] = None,
    state: Optional[statechart_pb2.Statechart.State] = None,
) -> list[str]:
    """Returns every problem with the names of the substates of
    `statechart`, or of `state`, and of every state within it: each
    substate has a name, and no two substates of one state have the
    same name."""
    # `subject` is what a message calls the statechart or the state.
    if statechart is not None:
        subject = "the statechart"
        substates = statechart.states
    else:
        assert state is not None
        subject = f"state '{state.name}'"
        substates = state.states

    problems: list[str] = []

    # How many substates have each name.
    count_by_name: dict[str, int] = {}
    for substate in substates:
        count_by_name[substate.name
                     ] = (count_by_name.get(substate.name, 0) + 1)

    for name, count in count_by_name.items():
        if name == "":
            problems.append(f"{subject} has a state without a `name`")
        elif count > 1:
            problems.append(
                f"{subject} has more than one state named '{name}'"
            )

    for substate in substates:
        problems.extend(_check_state_names(state=substate))

    return problems


@overload
def _check_transitions(*, statechart: statechart_pb2.Statechart) -> list[str]:
    ...


@overload
def _check_transitions(
    *,
    state: statechart_pb2.Statechart.State,
) -> list[str]:
    ...


def _check_transitions(
    *,
    statechart: Optional[statechart_pb2.Statechart] = None,
    state: Optional[statechart_pb2.Statechart.State] = None,
) -> list[str]:
    """Returns every problem with the transitions of `statechart`, or
    of `state`, and of every state within it: each transition is an
    `on` or a `when`, an `on` has an event and its guard, if it has
    one, names a method, a `when` has a description and a condition
    that names a method, and each action of either is a `call` or an
    `inject`."""
    # `subject` is what a message calls the statechart or the state.
    if statechart is not None:
        subject = "the statechart"
        transitions = statechart.transitions
        substates = statechart.states
    else:
        assert state is not None
        subject = f"state '{state.name}'"
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
        problems.extend(_check_transitions(state=substate))

    return problems


@overload
def _check_entries(*, statechart: statechart_pb2.Statechart) -> list[str]:
    ...


@overload
def _check_entries(*, state: statechart_pb2.Statechart.State) -> list[str]:
    ...


def _check_entries(
    *,
    statechart: Optional[statechart_pb2.Statechart] = None,
    state: Optional[statechart_pb2.Statechart.State] = None,
) -> list[str]:
    """Returns every problem with the entries of `statechart`, or of
    `state`, and of every state within it: each entry is a `call`, an
    `inject`, a `schedule` or a `timer`."""
    # `subject` is what a message calls the statechart or the state.
    if statechart is not None:
        subject = "the statechart"
        entries = statechart.entry
        substates = statechart.states
    else:
        assert state is not None
        subject = f"state '{state.name}'"
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
        problems.extend(_check_entries(state=substate))

    return problems


@overload
def _check_exits(*, statechart: statechart_pb2.Statechart) -> list[str]:
    ...


@overload
def _check_exits(*, state: statechart_pb2.Statechart.State) -> list[str]:
    ...


def _check_exits(
    *,
    statechart: Optional[statechart_pb2.Statechart] = None,
    state: Optional[statechart_pb2.Statechart.State] = None,
) -> list[str]:
    """Returns every problem with the exits of `statechart`, or of
    `state`, and of every state within it: each exit is a `call` or an
    `inject`."""
    # `subject` is what a message calls the statechart or the state.
    if statechart is not None:
        subject = "the statechart"
        exits = statechart.exit
        substates = statechart.states
    else:
        assert state is not None
        subject = f"state '{state.name}'"
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
        problems.extend(_check_exits(state=substate))

    return problems


def _check_final(state: statechart_pb2.Statechart.State) -> list[str]:
    """Returns every problem with `state`, and with every state within
    it, being final: a final state has no `schedule`, no `timer`, no
    transitions and no substates."""
    problems: list[str] = []

    if state.final:
        if any(
            entry.WhichOneof("entry") in ("schedule", "timer")
            for entry in state.entry
        ):
            problems.append(
                f"state '{state.name}' is final and cannot have a "
                "`schedule` or a `timer`"
            )
        if len(state.transitions) > 0:
            problems.append(
                f"state '{state.name}' is final and cannot have transitions"
            )
        if len(state.states) > 0:
            problems.append(
                f"state '{state.name}' is final and cannot have states"
            )

    for substate in state.states:
        problems.extend(_check_final(substate))

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
    problems.extend(_check_transitions(statechart=statechart))
    for state in statechart.states:
        problems.extend(_check_final(state))

    return problems
