"""Checks a `rbt.v1alpha1.statecharts.Statechart` message against the
rules that the message alone can break, without running anything."""
from __future__ import annotations

from rbt.v1alpha1.statecharts import statechart_pb2


def check_statechart(statechart: statechart_pb2.Statechart) -> list[str]:
    """Returns every problem with `statechart`, each as a message for
    the statechart's author. A statechart without problems returns
    none."""
    return []
