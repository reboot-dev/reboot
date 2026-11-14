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


def check_statechart(statechart: statechart_pb2.Statechart) -> list[str]:
    """Returns every problem with `statechart`, each as a message for
    the statechart's author. A statechart without problems returns
    none."""
    problems: list[str] = []

    problems.extend(_check_initial(statechart=statechart))

    return problems
