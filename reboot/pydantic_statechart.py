"""What a statechart that a state type of a Pydantic API declares
needs: an event of it may be a model, which is named as the model is
imported, where a statechart names an event by the full name of a
message."""

import importlib
from rbt.v1alpha1.statecharts import statechart_pb2
from reboot.api import Model
from typing import Callable, Optional


def model_of_event(event: str) -> Optional[type[Model]]:
    """Returns the model that `event` names, as a model is imported,
    e.g. "shop.events.Paid" for the `Paid` of `shop/events.py`, or
    `None` if it names no model, which the full name of a message does
    not."""
    module_name, _, model_name = event.rpartition(".")

    if not module_name:
        return None

    try:
        module = importlib.import_module(module_name)
    except ImportError:
        return None

    model = getattr(module, model_name, None)

    if isinstance(model, type) and issubclass(model, Model):
        return model

    return None


def rename_events(
    statechart: statechart_pb2.Statechart,
    renamed: Callable[[str], str],
) -> statechart_pb2.Statechart:
    """Returns `statechart` with each event `event`, everywhere that
    it is named, as `renamed(event)`. `statechart` is left as it
    is."""

    def rename_call(call: statechart_pb2.Statechart.Call) -> None:
        injects = [renamed(event) for event in call.inline.injects]
        del call.inline.injects[:]
        call.inline.injects.extend(injects)

    def rename_entries_exits_and_transitions(
        state: statechart_pb2.Statechart | statechart_pb2.Statechart.State,
    ) -> None:
        for entry in state.entry:
            if entry.HasField("call"):
                rename_call(entry.call)
            elif entry.HasField("inject"):
                entry.inject.event = renamed(entry.inject.event)
            elif entry.HasField("schedule"):
                enqueues = [
                    renamed(event) for event in entry.schedule.inline.enqueues
                ]
                del entry.schedule.inline.enqueues[:]
                entry.schedule.inline.enqueues.extend(enqueues)
            elif entry.HasField("timer"):
                entry.timer.enqueue.event = renamed(entry.timer.enqueue.event)

        for exit in state.exit:
            if exit.HasField("call"):
                rename_call(exit.call)
            elif exit.HasField("inject"):
                exit.inject.event = renamed(exit.inject.event)

        for transition in state.transitions:
            if transition.HasField("on"):
                transition.on.event = renamed(transition.on.event)
                actions = transition.on.actions
            else:
                actions = transition.when.actions

            for action in actions:
                if action.HasField("call"):
                    rename_call(action.call)
                elif action.HasField("inject"):
                    action.inject.event = renamed(action.inject.event)

        for substate in state.states:
            rename_entries_exits_and_transitions(substate)

    renamed_statechart = statechart_pb2.Statechart()
    renamed_statechart.CopyFrom(statechart)

    events = [renamed(event) for event in renamed_statechart.events]
    del renamed_statechart.events[:]
    renamed_statechart.events.extend(events)

    rename_entries_exits_and_transitions(renamed_statechart)

    return renamed_statechart
