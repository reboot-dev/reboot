"""Checks a `rbt.v1alpha1.statecharts.Statechart` message against the
rules that the message alone can break, without running anything."""
from __future__ import annotations

from rbt.v1alpha1.statecharts import statechart_pb2
from typing import Optional, overload


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
                    if action.WhichOneof("action") is None:
                        problems.append(
                            f"an action of an `on` transition of {subject} "
                            "is neither a `call` nor an `inject`"
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
                    if action.WhichOneof("action") is None:
                        problems.append(
                            f"an action of a `when` transition of {subject} "
                            "is neither a `call` nor an `inject`"
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
        if entry.WhichOneof("entry") is None:
            problems.append(
                f"an `entry` of {subject} is neither a `call`, an `inject`, "
                "a `schedule` nor a `timer`"
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
        if exit.WhichOneof("exit") is None:
            problems.append(
                f"an `exit` of {subject} is neither a `call` nor an `inject`"
            )

    for substate in substates:
        problems.extend(_check_exits(state=substate))

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

    return problems
