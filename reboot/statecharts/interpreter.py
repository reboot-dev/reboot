"""Runs a statechart: starts it, and then, for as long as there is a
transition that fires, takes it, by calling the methods of the
servicer that the statechart names and changing the state and the
status."""
from google.protobuf.message import Message
from rbt.v1alpha1.statecharts import statechart_pb2
from reboot.statecharts.events import (
    message_from_status_event,
    status_event_from_message,
)
from reboot.statecharts.validation import (
    hierarchical_state_name_and_superstate_names,
    make_hierarchical_state_name,
    states_by_hierarchical_state_name,
)
from typing import Any, Iterable, Mapping, Optional

# How many transitions a statechart may take in one `run`. A statechart
# that takes more has a transition that keeps firing, or events that
# keep being injected, and would never come to rest.
TRANSITION_LIMIT = 1000


def _transitions(
    statechart: statechart_pb2.Statechart,
    *,
    hierarchical_state_name: str,
) -> list[statechart_pb2.Statechart.Transition]:
    """Returns each transition that the state of `statechart` that has
    `hierarchical_state_name` has or inherits, in the order that they
    are looked at to find the one that fires.

    A state has its own transitions and inherits those of each state
    it is within and of the statechart, so that is the order,
    innermost state first, each in the order written. A final state
    has none and inherits none."""
    states = states_by_hierarchical_state_name(statechart)

    if states[hierarchical_state_name].final:
        return []

    transitions: list[statechart_pb2.Statechart.Transition] = []
    for active_hierarchical_state_name in (
        hierarchical_state_name_and_superstate_names(hierarchical_state_name)
    ):
        transitions.extend(states[active_hierarchical_state_name].transitions)
    transitions.extend(statechart.transitions)

    return transitions


def maybe_when_transition(
    statechart: statechart_pb2.Statechart,
    *,
    hierarchical_state_name: str,
    servicer: Any,
    state: Any,
) -> Optional[statechart_pb2.Statechart.When]:
    """Returns the `when` transition of `statechart` that fires, or
    `None` if none does: the first whose `condition` holds, of those
    that the innermost active state, which has
    `hierarchical_state_name`, has or inherits. `statechart` has no
    problems.

    A `condition` is a method of `servicer` that is called with
    `state`, and only if what it returns decides whether a transition
    fires."""
    for transition in _transitions(
        statechart,
        hierarchical_state_name=hierarchical_state_name,
    ):
        if not transition.HasField("when"):
            continue
        condition = getattr(servicer, transition.when.condition.inline.method)
        if condition(state):
            return transition.when

    return None


def maybe_on_transition(
    statechart: statechart_pb2.Statechart,
    *,
    hierarchical_state_name: str,
    event: Message,
    servicer: Any,
    state: Any,
) -> Optional[statechart_pb2.Statechart.On]:
    """Returns the `on` transition of `statechart` that fires for
    `event`, or `None` if none does: the first for that event that has
    no `guard`, or whose `guard` holds, of those that the innermost
    active state, which has `hierarchical_state_name`, has or
    inherits. `statechart` has no problems.

    A `guard` is a method of `servicer` that is called with `state`
    and `event`, and only if what it returns decides whether a
    transition fires."""
    for transition in _transitions(
        statechart,
        hierarchical_state_name=hierarchical_state_name,
    ):
        if (
            not transition.HasField("on") or
            transition.on.event != event.DESCRIPTOR.full_name
        ):
            continue
        if not transition.on.HasField("guard"):
            return transition.on
        guard = getattr(servicer, transition.on.guard.inline.method)
        if guard(state, event):
            return transition.on

    return None


def _entered_substates(
    statechart: statechart_pb2.Statechart,
    hierarchical_state_name: str,
    *,
    resume: bool,
    history: Mapping[str, str],
) -> list[str]:
    """Returns the hierarchical state name of each state within the
    one that has `hierarchical_state_name` that is entered when it is,
    outermost first.

    A state that has states within it is entered at its `initial`, or,
    with `resume`, at the substate that `history` has for its
    hierarchical state name, if it has one."""
    states = states_by_hierarchical_state_name(statechart)

    entered: list[str] = []
    state = states[hierarchical_state_name]
    while len(state.states) > 0:
        substate = make_hierarchical_state_name(
            state.initial,
            hierarchical_superstate_name=hierarchical_state_name,
        )
        if resume:
            substate = history.get(hierarchical_state_name, substate)
        entered.append(substate)
        hierarchical_state_name = substate
        state = states[hierarchical_state_name]

    return entered


def states_exited_and_entered_from_transition(
    statechart: statechart_pb2.Statechart,
    *,
    hierarchical_state_name: str,
    transition: (
        statechart_pb2.Statechart.On | statechart_pb2.Statechart.When
    ),
    history: Mapping[str, str],
) -> tuple[list[str], list[str]]:
    """Returns the hierarchical state name of each state that taking
    `transition` exits, innermost first, and of each state that it
    enters, outermost first. `hierarchical_state_name` is that of the
    innermost active state. `statechart` has no problems.

    A transition without a `to` exits and enters nothing. One with a
    `to` keeps the states that both the innermost active state and
    the `to` are within, exits the rest, and enters down to the `to`
    and on into the states within it. The `to` itself is always
    entered, and exited first if it is active.

    `history` has, by the hierarchical state name of a state, that of
    the substate it was last in. A transition that has `resume` enters
    a state from its history in place of at its `initial`."""
    if not transition.HasField("to"):
        return ([], [])

    # Innermost first.
    active = hierarchical_state_name_and_superstate_names(
        hierarchical_state_name,
    )
    to_and_superstates = hierarchical_state_name_and_superstate_names(
        transition.to,
    )

    # The states that both the innermost active state and the `to` are
    # within. The `to` itself is never one of them.
    kept = [
        hierarchical_superstate_name
        for hierarchical_superstate_name in to_and_superstates[1:]
        if hierarchical_superstate_name in active
    ]

    exited = [
        active_hierarchical_state_name
        for active_hierarchical_state_name in active
        if active_hierarchical_state_name not in kept
    ]

    entered = [
        entered_hierarchical_state_name
        for entered_hierarchical_state_name in reversed(to_and_superstates)
        if entered_hierarchical_state_name not in kept
    ] + _entered_substates(
        statechart,
        transition.to,
        resume=transition.resume,
        history=history,
    )

    return (exited, entered)


def _run_call(
    call: statechart_pb2.Statechart.Call,
    *,
    servicer: Any,
    state: Any,
    event: Optional[Message],
) -> Optional[statechart_pb2.Status.Event]:
    """Calls the method of `servicer` that `call` names with `state`,
    and with `event` if the call is given one. Returns the event that
    the method injects by returning it, if it returns one."""
    method = getattr(servicer, call.inline.method)

    if event is None:
        injected_event = method(state)
    else:
        injected_event = method(state, event)

    if injected_event is None:
        return None

    return status_event_from_message(injected_event)


def _run_inject(
    inject: statechart_pb2.Statechart.Inject,
) -> statechart_pb2.Status.Event:
    """Returns the event that `inject` injects."""
    injected_event = statechart_pb2.Status.Event(event=inject.event)

    if inject.HasField("value"):
        injected_event.value.CopyFrom(inject.value)

    return injected_event


def _run_action(
    action: (
        statechart_pb2.Statechart.Entry | statechart_pb2.Statechart.Exit |
        statechart_pb2.Statechart.Action
    ),
    *,
    servicer: Any,
    state: Any,
    event: Optional[Message],
) -> Optional[statechart_pb2.Status.Event]:
    """Runs `action`, which is a `call` or an `inject`: an `entry` or
    an `exit` of a state that is one, or an action of a transition. A
    `call` is given `event` if there is one. Returns the event that
    was injected, if one was."""
    if action.HasField("call"):
        return _run_call(
            action.call,
            servicer=servicer,
            state=state,
            event=event,
        )

    assert action.HasField("inject")

    return _run_inject(action.inject)


def _run_actions(
    actions: Iterable[statechart_pb2.Statechart.Exit |
                      statechart_pb2.Statechart.Action],
    *,
    servicer: Any,
    state: Any,
    event: Optional[Message],
) -> list[statechart_pb2.Status.Event]:
    """Runs each of `actions`, in order. Returns each event that was
    injected."""
    injected_events: list[statechart_pb2.Status.Event] = []

    for action in actions:
        injected_event = _run_action(
            action,
            servicer=servicer,
            state=state,
            event=event,
        )
        if injected_event is not None:
            injected_events.append(injected_event)

    return injected_events


def _run_entries(
    entries: Iterable[statechart_pb2.Statechart.Entry],
    *,
    hierarchical_state_name: Optional[str],
    servicer: Any,
    state: Any,
) -> tuple[
    list[statechart_pb2.Status.Event],
    list[statechart_pb2.Status.Activity],
]:
    """Runs each of `entries`, in order, which are those of the state
    that has `hierarchical_state_name`, or of the statechart itself if
    that is `None`. An action is run, and a `schedule` or a `timer` is
    an activity to schedule. Returns each event that was injected, and
    each activity that is to be scheduled."""
    injected_events: list[statechart_pb2.Status.Event] = []
    activities_to_schedule: list[statechart_pb2.Status.Activity] = []

    for entry in entries:
        if entry.HasField("schedule"):
            activities_to_schedule.append(
                statechart_pb2.Status.Activity(
                    state=hierarchical_state_name,
                    schedule=entry.schedule,
                ),
            )
            continue

        if entry.HasField("timer"):
            activities_to_schedule.append(
                statechart_pb2.Status.Activity(
                    state=hierarchical_state_name,
                    timer=entry.timer,
                ),
            )
            continue

        injected_event = _run_action(
            entry,
            servicer=servicer,
            state=state,
            event=None,
        )
        if injected_event is not None:
            injected_events.append(injected_event)

    return (injected_events, activities_to_schedule)


def _enter_state(
    statechart: statechart_pb2.Statechart,
    hierarchical_state_name: str,
    *,
    servicer: Any,
    state: Any,
) -> tuple[
    list[statechart_pb2.Status.Event],
    list[statechart_pb2.Status.Activity],
]:
    """Enters the state of `statechart` that has
    `hierarchical_state_name`: runs each `entry` of it, in order. If
    it is a final state of the statechart itself, the statechart is
    then exited. Returns each event that was injected, and each
    activity that is to be scheduled."""
    injected_events, activities_to_schedule = _run_entries(
        states_by_hierarchical_state_name(statechart)
        [hierarchical_state_name].entry,
        hierarchical_state_name=hierarchical_state_name,
        servicer=servicer,
        state=state,
    )

    if _is_final_state_of_statechart(statechart, hierarchical_state_name):
        # A final state injects no event and has no activities, so
        # there is nothing left for the statechart to do.
        assert len(injected_events) == 0
        assert len(activities_to_schedule) == 0

        # Exit the statechart: run each `exit` of it, in order. None
        # of them injects an event.
        injected_events = _run_actions(
            statechart.exit,
            servicer=servicer,
            state=state,
            event=None,
        )

        assert len(injected_events) == 0

    return (injected_events, activities_to_schedule)


def _exit_state(
    statechart: statechart_pb2.Statechart,
    hierarchical_state_name: str,
    *,
    servicer: Any,
    state: Any,
) -> list[statechart_pb2.Status.Event]:
    """Exits the state of `statechart` that has
    `hierarchical_state_name`: runs each `exit` of it, in order.
    Returns each event that was injected."""
    return _run_actions(
        states_by_hierarchical_state_name(statechart)
        [hierarchical_state_name].exit,
        servicer=servicer,
        state=state,
        event=None,
    )


def _is_final_state_of_statechart(
    statechart: statechart_pb2.Statechart,
    hierarchical_state_name: str,
) -> bool:
    """Returns whether the state that has `hierarchical_state_name` is
    a final state of `statechart` itself, rather than one within
    another state."""
    superstate_names = hierarchical_state_name_and_superstate_names(
        hierarchical_state_name,
    )[1:]

    states = states_by_hierarchical_state_name(statechart)

    return len(superstate_names) == 0 and states[hierarchical_state_name].final


def _start(
    statechart: statechart_pb2.Statechart,
    *,
    servicer: Any,
    state: Any,
    status: statechart_pb2.Status,
) -> statechart_pb2.Status:
    """Starts `statechart`, which has states and, as `status` says, has
    not started: enters the statechart, and then its `initial` and on
    into the states within that, outermost first. A statechart that
    has entered a final state of its own by then is exited.

    Returns the status that the statechart then has: that of
    `status`, with the innermost of the states that were entered as
    the state that is active, each event that was injected ahead of
    every event that is waiting, and each activity that is to be
    scheduled.
    """
    injected_events, activities_to_schedule = _run_entries(
        statechart.entry,
        hierarchical_state_name=None,
        servicer=servicer,
        state=state,
    )

    entered = [statechart.initial] + _entered_substates(
        statechart,
        statechart.initial,
        resume=False,
        history=status.history,
    )

    for hierarchical_state_name in entered:
        (
            injected_events_of_state,
            activities_to_schedule_of_state,
        ) = _enter_state(
            statechart,
            hierarchical_state_name,
            servicer=servicer,
            state=state,
        )
        injected_events.extend(injected_events_of_state)
        activities_to_schedule.extend(activities_to_schedule_of_state)

    return statechart_pb2.Status(
        active=entered[-1],
        history=status.history,
        queue=injected_events + list(status.queue),
        activities=list(status.activities) + activities_to_schedule,
    )


def _take_transition(
    statechart: statechart_pb2.Statechart,
    transition: (
        statechart_pb2.Statechart.On | statechart_pb2.Statechart.When
    ),
    *,
    servicer: Any,
    state: Any,
    status: statechart_pb2.Status,
    event: Optional[Message],
) -> statechart_pb2.Status:
    """Takes `transition`, which has fired, for `event` if it is an
    `on` transition: exits each state that it exits, innermost
    first, runs each of its actions, and enters each state that it
    enters, outermost first. Only an action of an `on` transition is
    given `event`. A statechart that has entered a final state of its
    own by then is exited.

    Returns the status that the statechart then has, which is `status`
    itself if the transition left it as it is: that of `status`, with
    the innermost of the states that were entered as the state that is
    active, with each state that was exited as what the state it is
    within was last in, with each event that was injected ahead of
    every event that is waiting, and with each activity that is to be
    scheduled.

    Nothing that the transition exits, which is the statechart
    itself if the transition enters a final state of the statechart,
    has a schedule that is running, and each timer of what it exits is
    being cancelled."""
    exited, entered = states_exited_and_entered_from_transition(
        statechart,
        hierarchical_state_name=status.active,
        transition=transition,
        history=status.history,
    )

    injected_events: list[statechart_pb2.Status.Event] = []

    for hierarchical_state_name in exited:
        injected_events.extend(
            _exit_state(
                statechart,
                hierarchical_state_name,
                servicer=servicer,
                state=state,
            ),
        )

    injected_events.extend(
        _run_actions(
            transition.actions,
            servicer=servicer,
            state=state,
            event=event,
        ),
    )

    activities_to_schedule: list[statechart_pb2.Status.Activity] = []

    for hierarchical_state_name in entered:
        (
            injected_events_of_state,
            activities_to_schedule_of_state,
        ) = _enter_state(
            statechart,
            hierarchical_state_name,
            servicer=servicer,
            state=state,
        )
        injected_events.extend(injected_events_of_state)
        activities_to_schedule.extend(activities_to_schedule_of_state)

    # A transition that exits and enters nothing, and whose actions
    # inject nothing, leaves the status as it is.
    if (len(exited) == 0 and len(entered) == 0 and len(injected_events) == 0):
        return status

    history = dict(status.history)
    for hierarchical_state_name in exited:
        # The state that this one is within, if it is within one, was
        # last in this one.
        superstate_names = hierarchical_state_name_and_superstate_names(
            hierarchical_state_name,
        )[1:]
        if len(superstate_names) > 0:
            history[superstate_names[0]] = hierarchical_state_name

    return statechart_pb2.Status(
        active=entered[-1] if len(entered) > 0 else status.active,
        history=history,
        queue=injected_events + list(status.queue),
        activities=list(status.activities) + activities_to_schedule,
    )


def _try_cancel_running_activities(
    statechart: statechart_pb2.Statechart,
    transition: (
        statechart_pb2.Statechart.On | statechart_pb2.Statechart.When
    ),
    *,
    status: statechart_pb2.Status,
) -> tuple[statechart_pb2.Status, bool]:
    """Cancels what can be cancelled of the activities that are
    running, as `status` says, in what taking `transition` exits: each
    timer, and each schedule that is `cancellable`. A transition exits
    states, and it exits the statechart itself, whose own activities
    are of no state, if it enters a final state of the statechart.

    Returns the status with each of those as one that is being
    cancelled, which is `status` itself if there is none to mark, and
    whether the transition must wait, which it must until every
    schedule that is running in what it exits has finished, whether or
    not the schedule is `cancellable`. It waits for no timer."""
    exited, entered = states_exited_and_entered_from_transition(
        statechart,
        hierarchical_state_name=status.active,
        transition=transition,
        history=status.history,
    )

    enters_final_state_of_statechart = (
        len(entered) > 0 and
        _is_final_state_of_statechart(statechart, entered[-1])
    )

    def is_exited(activity: statechart_pb2.Status.Activity) -> bool:
        if not activity.HasField("state"):
            return enters_final_state_of_statechart
        return activity.state in exited

    def is_to_be_cancelled(activity: statechart_pb2.Status.Activity) -> bool:
        return (
            is_exited(activity) and not activity.cancelling and
            (activity.HasField("timer") or activity.schedule.cancellable)
        )

    must_wait = any(
        is_exited(activity) and activity.HasField("schedule")
        for activity in status.activities
    )

    if not any(is_to_be_cancelled(activity) for activity in status.activities):
        return (status, must_wait)

    activities: list[statechart_pb2.Status.Activity] = []

    for activity in status.activities:
        if is_to_be_cancelled(activity):
            cancelling_activity = statechart_pb2.Status.Activity()
            cancelling_activity.CopyFrom(activity)
            cancelling_activity.cancelling = True
            activities.append(cancelling_activity)
        else:
            activities.append(activity)

    return (
        statechart_pb2.Status(
            active=status.active,
            history=status.history,
            queue=status.queue,
            activities=activities,
        ),
        must_wait,
    )


def run(
    statechart: statechart_pb2.Statechart,
    *,
    servicer: Any,
    state: Any,
    status: statechart_pb2.Status,
) -> Optional[statechart_pb2.Status]:
    """Runs `statechart`, which is that of `state` and is where
    `status` says, until it has nothing left to do. Returns the status
    that the statechart then has, or `None` if that is `status`, which
    is left as it is.

    A statechart that has not started starts. Then each event in the
    queue is handled, in order: it is taken from the queue, and the
    `on` transition that fires for it, if any, is taken; an event that
    no transition fires for is dropped. Before the first event and
    after each one, every `when` transition that fires is taken.

    A transition that would exit a state that has a schedule that is
    running is not taken, and the statechart then has nothing left to
    do until the schedule has finished: an event that such a
    transition fires for stays at the head of the queue. Each such
    schedule that is `cancellable` is from then on being cancelled, as
    is each timer of a state that a transition that fires would exit,
    which no transition waits for. A transition that enters a final
    state of the statechart itself exits the statechart as well, so
    the same holds for the activities of the statechart itself.

    `servicer` has the methods that the statechart names, each of
    which is called with `state`, which it may change. `statechart`
    has no problems."""
    # A statechart without states has nothing to start, and nothing
    # that could fire.
    if len(statechart.states) == 0:
        return None

    # The status that we were given, to tell at the end whether the
    # statechart has come to another: nothing changes a status, so the
    # statechart is where it was if and only if `status` is still this
    # one.
    given_status = status

    if not status.HasField("active"):
        status = _start(
            statechart,
            servicer=servicer,
            state=state,
            status=status,
        )

    transitions_taken = 0

    def count_transition_or_fail_if_possible_infinite_loop() -> None:
        nonlocal transitions_taken
        transitions_taken += 1
        if transitions_taken > TRANSITION_LIMIT:
            raise RuntimeError(
                f"A statechart has taken more than {TRANSITION_LIMIT} "
                "transitions without coming to rest; does it have a `when` "
                "transition whose condition keeps holding, or events that "
                "keep being injected?",
            )

    while True:
        while (
            when := maybe_when_transition(
                statechart,
                hierarchical_state_name=status.active,
                servicer=servicer,
                state=state,
            )
        ) is not None:
            # Each activity of a state that the transition would
            # exit is cancelled, if it can be. A transition that
            # would exit a state that has a schedule that is running
            # is not taken, and the statechart then has nothing left
            # to do until the schedule has finished.
            status, must_wait = _try_cancel_running_activities(
                statechart,
                when,
                status=status,
            )
            if must_wait:
                return status if status is not given_status else None

            status = _take_transition(
                statechart,
                when,
                servicer=servicer,
                state=state,
                status=status,
                event=None,
            )
            count_transition_or_fail_if_possible_infinite_loop()

        if len(status.queue) == 0:
            break

        event = message_from_status_event(status.queue[0])

        on = maybe_on_transition(
            statechart,
            hierarchical_state_name=status.active,
            event=event,
            servicer=servicer,
            state=state,
        )

        # Each activity of a state that the transition would exit is
        # cancelled, if it can be. A transition that would exit a
        # state that has a schedule that is running is not taken, and
        # the statechart then has nothing left to do until the
        # schedule has finished. The event that the transition fires
        # for stays at the head of the queue.
        if on is not None:
            status, must_wait = _try_cancel_running_activities(
                statechart,
                on,
                status=status,
            )
            if must_wait:
                break

        # Take the event from the queue.
        status = statechart_pb2.Status(
            active=status.active,
            history=status.history,
            queue=status.queue[1:],
            activities=status.activities,
        )

        if on is not None:
            status = _take_transition(
                statechart,
                on,
                servicer=servicer,
                state=state,
                status=status,
                event=event,
            )
            count_transition_or_fail_if_possible_infinite_loop()

    return status if status is not given_status else None
