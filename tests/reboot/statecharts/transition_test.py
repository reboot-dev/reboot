"""Which transition of a statechart fires, and which states taking it
exits and enters."""
import unittest
from google.protobuf import text_format
from google.protobuf.message import Message
from rbt.v1alpha1.statecharts import statechart_pb2
from reboot.statecharts.interpreter import (
    maybe_on_transition,
    maybe_when_transition,
    states_exited_and_entered_from_transition,
)
from tests.reboot.statecharts import shop_pb2


class Servicer:
    """Has the guard and the condition that the statecharts of the
    tests name. Each returns what the test says that it does."""

    def __init__(
        self,
        *,
        is_paid_in_full: bool = False,
        is_cancelled: bool = False,
    ) -> None:
        self._is_paid_in_full = is_paid_in_full
        self._is_cancelled = is_cancelled

    def is_paid_in_full(self, state: None, event: Message) -> bool:
        return self._is_paid_in_full

    def is_cancelled(self, state: None) -> bool:
        return self._is_cancelled


def make_statechart(text: str) -> statechart_pb2.Statechart:
    """Returns the statechart written in `text`, in the protobuf text
    format."""
    return text_format.Parse(text, statechart_pb2.Statechart())


class TransitionTest(unittest.TestCase):

    def test_an_on_of_the_active_state_fires(self) -> None:
        # `OPEN/PAYING` and `OPEN/SHIPPING` are both within `OPEN`, which
        # is kept.
        statechart = make_statechart(
            """
            events: "shop.v1.Paid"
            events: "shop.v1.Cancelled"
            initial: "OPEN"
            transitions { on { event: "shop.v1.Cancelled" to: "CANCELLED" } }
            states {
              name: "OPEN"
              initial: "PAYING"
              states {
                name: "PAYING"
                transitions {
                  on { event: "shop.v1.Paid" to: "OPEN/SHIPPING" }
                }
              }
              states { name: "SHIPPING" }
            }
            states { name: "CANCELLED" final: true }
            """,
        )
        transition = maybe_on_transition(
            statechart,
            hierarchical_state_name="OPEN/PAYING",
            event=shop_pb2.Paid(),
            servicer=Servicer(),
            state=None,
        )
        assert transition is not None
        exited, entered = states_exited_and_entered_from_transition(
            statechart,
            hierarchical_state_name="OPEN/PAYING",
            transition=transition,
            history={},
        )
        assert isinstance(transition, statechart_pb2.Statechart.On)
        self.assertEqual(transition.to, "OPEN/SHIPPING")
        self.assertEqual(exited, ["OPEN/PAYING"])
        self.assertEqual(entered, ["OPEN/SHIPPING"])

    def test_an_event_that_no_on_is_for_fires_no_transition(self) -> None:
        statechart = make_statechart(
            """
            events: "shop.v1.Paid"
            events: "shop.v1.Cancelled"
            initial: "OPEN"
            transitions { on { event: "shop.v1.Cancelled" to: "CANCELLED" } }
            states {
              name: "OPEN"
              initial: "PAYING"
              states {
                name: "PAYING"
                transitions {
                  on { event: "shop.v1.Paid" to: "OPEN/SHIPPING" }
                }
              }
              states { name: "SHIPPING" }
            }
            states { name: "CANCELLED" final: true }
            """,
        )
        transition = maybe_on_transition(
            statechart,
            hierarchical_state_name="OPEN/SHIPPING",
            event=shop_pb2.Paid(),
            servicer=Servicer(),
            state=None,
        )
        self.assertIsNone(transition)

    def test_a_state_inherits_the_transitions_of_the_statechart(self) -> None:
        statechart = make_statechart(
            """
            events: "shop.v1.Paid"
            events: "shop.v1.Cancelled"
            initial: "OPEN"
            transitions { on { event: "shop.v1.Cancelled" to: "CANCELLED" } }
            states {
              name: "OPEN"
              initial: "PAYING"
              states {
                name: "PAYING"
                transitions {
                  on { event: "shop.v1.Paid" to: "OPEN/SHIPPING" }
                }
              }
              states { name: "SHIPPING" }
            }
            states { name: "CANCELLED" final: true }
            """,
        )
        transition = maybe_on_transition(
            statechart,
            hierarchical_state_name="OPEN/SHIPPING",
            event=shop_pb2.Cancelled(),
            servicer=Servicer(),
            state=None,
        )
        assert transition is not None
        exited, entered = states_exited_and_entered_from_transition(
            statechart,
            hierarchical_state_name="OPEN/SHIPPING",
            transition=transition,
            history={},
        )
        assert isinstance(transition, statechart_pb2.Statechart.On)
        self.assertEqual(transition.to, "CANCELLED")
        self.assertEqual(exited, ["OPEN/SHIPPING", "OPEN"])
        self.assertEqual(entered, ["CANCELLED"])

    def test_a_final_state_inherits_no_transition(self) -> None:
        statechart = make_statechart(
            """
            events: "shop.v1.Paid"
            events: "shop.v1.Cancelled"
            initial: "OPEN"
            transitions { on { event: "shop.v1.Cancelled" to: "CANCELLED" } }
            states {
              name: "OPEN"
              initial: "PAYING"
              states {
                name: "PAYING"
                transitions {
                  on { event: "shop.v1.Paid" to: "OPEN/SHIPPING" }
                }
              }
              states { name: "SHIPPING" }
            }
            states { name: "CANCELLED" final: true }
            """,
        )
        transition = maybe_on_transition(
            statechart,
            hierarchical_state_name="CANCELLED",
            event=shop_pb2.Cancelled(),
            servicer=Servicer(),
            state=None,
        )
        self.assertIsNone(transition)

    def test_an_on_whose_guard_holds_fires(self) -> None:
        statechart = make_statechart(
            """
            events: "shop.v1.Paid"
            initial: "PENDING"
            states {
              name: "PENDING"
              transitions {
                on {
                  event: "shop.v1.Paid"
                  guard { inline { method: "is_paid_in_full" } }
                  to: "SHIPPING"
                }
              }
              transitions { on { event: "shop.v1.Paid" to: "PARTLY_PAID" } }
              transitions { on { event: "shop.v1.Paid" to: "REFUNDING" } }
            }
            states { name: "SHIPPING" }
            states { name: "PARTLY_PAID" }
            states { name: "REFUNDING" }
            """,
        )
        transition = maybe_on_transition(
            statechart,
            hierarchical_state_name="PENDING",
            event=shop_pb2.Paid(),
            servicer=Servicer(is_paid_in_full=True),
            state=None,
        )
        assert transition is not None
        exited, entered = states_exited_and_entered_from_transition(
            statechart,
            hierarchical_state_name="PENDING",
            transition=transition,
            history={},
        )
        self.assertEqual(exited, ["PENDING"])
        self.assertEqual(entered, ["SHIPPING"])

    def test_an_on_whose_guard_does_not_hold_leaves_it_to_the_next(
        self,
    ) -> None:
        # The second `on` for the event has no `guard`, so it fires, and
        # the third never does.
        statechart = make_statechart(
            """
            events: "shop.v1.Paid"
            initial: "PENDING"
            states {
              name: "PENDING"
              transitions {
                on {
                  event: "shop.v1.Paid"
                  guard { inline { method: "is_paid_in_full" } }
                  to: "SHIPPING"
                }
              }
              transitions { on { event: "shop.v1.Paid" to: "PARTLY_PAID" } }
              transitions { on { event: "shop.v1.Paid" to: "REFUNDING" } }
            }
            states { name: "SHIPPING" }
            states { name: "PARTLY_PAID" }
            states { name: "REFUNDING" }
            """,
        )
        transition = maybe_on_transition(
            statechart,
            hierarchical_state_name="PENDING",
            event=shop_pb2.Paid(),
            servicer=Servicer(is_paid_in_full=False),
            state=None,
        )
        assert transition is not None
        exited, entered = states_exited_and_entered_from_transition(
            statechart,
            hierarchical_state_name="PENDING",
            transition=transition,
            history={},
        )
        self.assertEqual(exited, ["PENDING"])
        self.assertEqual(entered, ["PARTLY_PAID"])

    def test_no_on_whose_guard_holds_fires_no_transition(self) -> None:
        statechart = make_statechart(
            """
            events: "shop.v1.Paid"
            initial: "PENDING"
            states {
              name: "PENDING"
              transitions {
                on {
                  event: "shop.v1.Paid"
                  guard { inline { method: "is_paid_in_full" } }
                  to: "SHIPPING"
                }
              }
            }
            states { name: "SHIPPING" }
            """,
        )
        transition = maybe_on_transition(
            statechart,
            hierarchical_state_name="PENDING",
            event=shop_pb2.Paid(),
            servicer=Servicer(is_paid_in_full=False),
            state=None,
        )
        self.assertIsNone(transition)

    def test_the_on_of_the_innermost_state_fires_first(self) -> None:
        statechart = make_statechart(
            """
            events: "shop.v1.Cancelled"
            events: "shop.v1.Paid"
            initial: "OPEN"
            transitions { on { event: "shop.v1.Cancelled" to: "CANCELLED" } }
            states {
              name: "OPEN"
              initial: "PAYING"
              transitions { on { event: "shop.v1.Cancelled" to: "CLOSED" } }
              states {
                name: "PAYING"
                transitions {
                  on { event: "shop.v1.Cancelled" to: "REFUNDING" }
                }
                transitions {
                  on { event: "shop.v1.Paid" to: "OPEN/SHIPPING" }
                }
              }
              states { name: "SHIPPING" }
            }
            states { name: "REFUNDING" }
            states { name: "CLOSED" }
            states { name: "CANCELLED" final: true }
            """,
        )
        transition = maybe_on_transition(
            statechart,
            hierarchical_state_name="OPEN/PAYING",
            event=shop_pb2.Cancelled(),
            servicer=Servicer(),
            state=None,
        )
        assert transition is not None
        exited, entered = states_exited_and_entered_from_transition(
            statechart,
            hierarchical_state_name="OPEN/PAYING",
            transition=transition,
            history={},
        )
        self.assertEqual(exited, ["OPEN/PAYING", "OPEN"])
        self.assertEqual(entered, ["REFUNDING"])

    def test_the_on_of_a_state_fires_before_that_of_the_statechart(
        self,
    ) -> None:
        statechart = make_statechart(
            """
            events: "shop.v1.Cancelled"
            events: "shop.v1.Paid"
            initial: "OPEN"
            transitions { on { event: "shop.v1.Cancelled" to: "CANCELLED" } }
            states {
              name: "OPEN"
              initial: "PAYING"
              transitions { on { event: "shop.v1.Cancelled" to: "CLOSED" } }
              states {
                name: "PAYING"
                transitions {
                  on { event: "shop.v1.Cancelled" to: "REFUNDING" }
                }
                transitions {
                  on { event: "shop.v1.Paid" to: "OPEN/SHIPPING" }
                }
              }
              states { name: "SHIPPING" }
            }
            states { name: "REFUNDING" }
            states { name: "CLOSED" }
            states { name: "CANCELLED" final: true }
            """,
        )
        transition = maybe_on_transition(
            statechart,
            hierarchical_state_name="OPEN/SHIPPING",
            event=shop_pb2.Cancelled(),
            servicer=Servicer(),
            state=None,
        )
        assert transition is not None
        exited, entered = states_exited_and_entered_from_transition(
            statechart,
            hierarchical_state_name="OPEN/SHIPPING",
            transition=transition,
            history={},
        )
        self.assertEqual(exited, ["OPEN/SHIPPING", "OPEN"])
        self.assertEqual(entered, ["CLOSED"])

    def test_a_transition_without_a_to_exits_and_enters_nothing(self) -> None:
        statechart = make_statechart(
            """
            events: "shop.v1.Paid"
            initial: "PENDING"
            states {
              name: "PENDING"
              transitions {
                on {
                  event: "shop.v1.Paid"
                  actions {
                    call {
                      description: "Record the payment"
                      inline { method: "record_payment" }
                    }
                  }
                }
              }
            }
            """,
        )
        transition = maybe_on_transition(
            statechart,
            hierarchical_state_name="PENDING",
            event=shop_pb2.Paid(),
            servicer=Servicer(),
            state=None,
        )
        assert transition is not None
        exited, entered = states_exited_and_entered_from_transition(
            statechart,
            hierarchical_state_name="PENDING",
            transition=transition,
            history={},
        )
        assert isinstance(transition, statechart_pb2.Statechart.On)
        self.assertEqual(
            transition.actions[0].call.inline.method,
            "record_payment",
        )
        self.assertEqual(exited, [])
        self.assertEqual(entered, [])

    def test_a_state_that_has_states_is_entered_at_each_initial(self) -> None:
        statechart = make_statechart(
            """
            events: "shop.v1.Reopened"
            events: "shop.v1.Restarted"
            events: "shop.v1.Retried"
            events: "shop.v1.Charging"
            initial: "CLOSED"
            states {
              name: "CLOSED"
              transitions { on { event: "shop.v1.Reopened" to: "OPEN" } }
            }
            states {
              name: "OPEN"
              initial: "PAYING"
              transitions { on { event: "shop.v1.Restarted" to: "OPEN" } }
              states {
                name: "PAYING"
                initial: "WAITING"
                transitions {
                  on { event: "shop.v1.Retried" to: "OPEN/PAYING/WAITING" }
                }
                states {
                  name: "WAITING"
                  transitions {
                    on {
                      event: "shop.v1.Charging"
                      to: "OPEN/PAYING/CHARGING"
                    }
                  }
                }
                states { name: "CHARGING" }
              }
            }
            """,
        )
        transition = maybe_on_transition(
            statechart,
            hierarchical_state_name="CLOSED",
            event=shop_pb2.Reopened(),
            servicer=Servicer(),
            state=None,
        )
        assert transition is not None
        exited, entered = states_exited_and_entered_from_transition(
            statechart,
            hierarchical_state_name="CLOSED",
            transition=transition,
            history={},
        )
        self.assertEqual(exited, ["CLOSED"])
        self.assertEqual(
            entered,
            ["OPEN", "OPEN/PAYING", "OPEN/PAYING/WAITING"],
        )

    def test_a_to_that_is_the_active_state_exits_and_enters_it(self) -> None:
        # `OPEN` and `OPEN/PAYING` are kept.
        statechart = make_statechart(
            """
            events: "shop.v1.Reopened"
            events: "shop.v1.Restarted"
            events: "shop.v1.Retried"
            events: "shop.v1.Charging"
            initial: "CLOSED"
            states {
              name: "CLOSED"
              transitions { on { event: "shop.v1.Reopened" to: "OPEN" } }
            }
            states {
              name: "OPEN"
              initial: "PAYING"
              transitions { on { event: "shop.v1.Restarted" to: "OPEN" } }
              states {
                name: "PAYING"
                initial: "WAITING"
                transitions {
                  on { event: "shop.v1.Retried" to: "OPEN/PAYING/WAITING" }
                }
                states {
                  name: "WAITING"
                  transitions {
                    on {
                      event: "shop.v1.Charging"
                      to: "OPEN/PAYING/CHARGING"
                    }
                  }
                }
                states { name: "CHARGING" }
              }
            }
            """,
        )
        transition = maybe_on_transition(
            statechart,
            hierarchical_state_name="OPEN/PAYING/WAITING",
            event=shop_pb2.Retried(),
            servicer=Servicer(),
            state=None,
        )
        assert transition is not None
        exited, entered = states_exited_and_entered_from_transition(
            statechart,
            hierarchical_state_name="OPEN/PAYING/WAITING",
            transition=transition,
            history={},
        )
        self.assertEqual(exited, ["OPEN/PAYING/WAITING"])
        self.assertEqual(entered, ["OPEN/PAYING/WAITING"])

    def test_a_to_that_the_active_state_is_within_exits_and_enters_it(
        self,
    ) -> None:
        # `OPEN` is the `to`, so it is exited and entered at its
        # `initial`.
        statechart = make_statechart(
            """
            events: "shop.v1.Reopened"
            events: "shop.v1.Restarted"
            events: "shop.v1.Retried"
            events: "shop.v1.Charging"
            initial: "CLOSED"
            states {
              name: "CLOSED"
              transitions { on { event: "shop.v1.Reopened" to: "OPEN" } }
            }
            states {
              name: "OPEN"
              initial: "PAYING"
              transitions { on { event: "shop.v1.Restarted" to: "OPEN" } }
              states {
                name: "PAYING"
                initial: "WAITING"
                transitions {
                  on { event: "shop.v1.Retried" to: "OPEN/PAYING/WAITING" }
                }
                states {
                  name: "WAITING"
                  transitions {
                    on {
                      event: "shop.v1.Charging"
                      to: "OPEN/PAYING/CHARGING"
                    }
                  }
                }
                states { name: "CHARGING" }
              }
            }
            """,
        )
        transition = maybe_on_transition(
            statechart,
            hierarchical_state_name="OPEN/PAYING/CHARGING",
            event=shop_pb2.Restarted(),
            servicer=Servicer(),
            state=None,
        )
        assert transition is not None
        exited, entered = states_exited_and_entered_from_transition(
            statechart,
            hierarchical_state_name="OPEN/PAYING/CHARGING",
            transition=transition,
            history={},
        )
        self.assertEqual(
            exited,
            ["OPEN/PAYING/CHARGING", "OPEN/PAYING", "OPEN"],
        )
        self.assertEqual(
            entered,
            ["OPEN", "OPEN/PAYING", "OPEN/PAYING/WAITING"],
        )

    def test_a_when_whose_condition_holds_fires_without_an_event(self) -> None:
        statechart = make_statechart(
            """
            events: "shop.v1.Paid"
            initial: "PENDING"
            transitions {
              when {
                description: "Cancelled"
                condition { inline { method: "is_cancelled" } }
                to: "CANCELLED"
              }
            }
            states {
              name: "PENDING"
              transitions { on { event: "shop.v1.Paid" to: "SHIPPING" } }
            }
            states { name: "SHIPPING" }
            states { name: "CANCELLED" final: true }
            """,
        )
        transition = maybe_when_transition(
            statechart,
            hierarchical_state_name="PENDING",
            servicer=Servicer(is_cancelled=True),
            state=None,
        )
        assert transition is not None
        exited, entered = states_exited_and_entered_from_transition(
            statechart,
            hierarchical_state_name="PENDING",
            transition=transition,
            history={},
        )
        assert isinstance(transition, statechart_pb2.Statechart.When)
        self.assertEqual(transition.description, "Cancelled")
        self.assertEqual(exited, ["PENDING"])
        self.assertEqual(entered, ["CANCELLED"])

    def test_a_when_whose_condition_does_not_hold_fires_no_transition(
        self,
    ) -> None:
        statechart = make_statechart(
            """
            events: "shop.v1.Paid"
            initial: "PENDING"
            transitions {
              when {
                description: "Cancelled"
                condition { inline { method: "is_cancelled" } }
                to: "CANCELLED"
              }
            }
            states {
              name: "PENDING"
              transitions { on { event: "shop.v1.Paid" to: "SHIPPING" } }
            }
            states { name: "SHIPPING" }
            states { name: "CANCELLED" final: true }
            """,
        )
        transition = maybe_when_transition(
            statechart,
            hierarchical_state_name="PENDING",
            servicer=Servicer(is_cancelled=False),
            state=None,
        )
        self.assertIsNone(transition)

    def test_a_when_is_passed_over_for_an_event(self) -> None:
        # The `when` transition of the statechart is not one that an
        # event fires, whatever its `condition`.
        statechart = make_statechart(
            """
            events: "shop.v1.Paid"
            initial: "PENDING"
            transitions {
              when {
                description: "Cancelled"
                condition { inline { method: "is_cancelled" } }
                to: "CANCELLED"
              }
            }
            states {
              name: "PENDING"
              transitions { on { event: "shop.v1.Paid" to: "SHIPPING" } }
            }
            states { name: "SHIPPING" }
            states { name: "CANCELLED" final: true }
            """,
        )
        transition = maybe_on_transition(
            statechart,
            hierarchical_state_name="PENDING",
            event=shop_pb2.Paid(),
            servicer=Servicer(),
            state=None,
        )
        assert transition is not None
        exited, entered = states_exited_and_entered_from_transition(
            statechart,
            hierarchical_state_name="PENDING",
            transition=transition,
            history={},
        )
        self.assertEqual(exited, ["PENDING"])
        self.assertEqual(entered, ["SHIPPING"])

    def test_an_on_is_passed_over_without_an_event(self) -> None:
        statechart = make_statechart(
            """
            events: "shop.v1.Paid"
            initial: "PENDING"
            states {
              name: "PENDING"
              transitions { on { event: "shop.v1.Paid" to: "SHIPPING" } }
            }
            states { name: "SHIPPING" }
            """,
        )
        transition = maybe_when_transition(
            statechart,
            hierarchical_state_name="PENDING",
            servicer=Servicer(),
            state=None,
        )
        self.assertIsNone(transition)

    def test_a_transition_that_has_resume_enters_each_last_substate(
        self,
    ) -> None:
        statechart = make_statechart(
            """
            events: "shop.v1.Resumed"
            events: "shop.v1.Charging"
            events: "shop.v1.Paid"
            events: "shop.v1.Packed"
            initial: "PAUSED"
            states {
              name: "PAUSED"
              transitions {
                on { event: "shop.v1.Resumed" to: "OPEN" resume: true }
              }
            }
            states {
              name: "OPEN"
              initial: "PAYING"
              states {
                name: "PAYING"
                initial: "WAITING"
                transitions {
                  on { event: "shop.v1.Paid" to: "OPEN/SHIPPING" }
                }
                states {
                  name: "WAITING"
                  transitions {
                    on {
                      event: "shop.v1.Charging"
                      to: "OPEN/PAYING/CHARGING"
                    }
                  }
                }
                states { name: "CHARGING" }
              }
              states {
                name: "SHIPPING"
                initial: "PACKING"
                states {
                  name: "PACKING"
                  transitions {
                    on {
                      event: "shop.v1.Packed"
                      to: "OPEN/SHIPPING/LABELLING"
                    }
                  }
                }
                states { name: "LABELLING" }
              }
            }
            """,
        )
        transition = maybe_on_transition(
            statechart,
            hierarchical_state_name="PAUSED",
            event=shop_pb2.Resumed(),
            servicer=Servicer(),
            state=None,
        )
        assert transition is not None
        exited, entered = states_exited_and_entered_from_transition(
            statechart,
            hierarchical_state_name="PAUSED",
            transition=transition,
            history={
                "OPEN": "OPEN/SHIPPING",
                "OPEN/SHIPPING": "OPEN/SHIPPING/LABELLING",
            },
        )
        self.assertEqual(exited, ["PAUSED"])
        self.assertEqual(
            entered,
            ["OPEN", "OPEN/SHIPPING", "OPEN/SHIPPING/LABELLING"],
        )

    def test_resume_enters_the_initial_of_a_state_without_a_last_substate(
        self,
    ) -> None:
        statechart = make_statechart(
            """
            events: "shop.v1.Resumed"
            events: "shop.v1.Charging"
            events: "shop.v1.Paid"
            events: "shop.v1.Packed"
            initial: "PAUSED"
            states {
              name: "PAUSED"
              transitions {
                on { event: "shop.v1.Resumed" to: "OPEN" resume: true }
              }
            }
            states {
              name: "OPEN"
              initial: "PAYING"
              states {
                name: "PAYING"
                initial: "WAITING"
                transitions {
                  on { event: "shop.v1.Paid" to: "OPEN/SHIPPING" }
                }
                states {
                  name: "WAITING"
                  transitions {
                    on {
                      event: "shop.v1.Charging"
                      to: "OPEN/PAYING/CHARGING"
                    }
                  }
                }
                states { name: "CHARGING" }
              }
              states {
                name: "SHIPPING"
                initial: "PACKING"
                states {
                  name: "PACKING"
                  transitions {
                    on {
                      event: "shop.v1.Packed"
                      to: "OPEN/SHIPPING/LABELLING"
                    }
                  }
                }
                states { name: "LABELLING" }
              }
            }
            """,
        )
        transition = maybe_on_transition(
            statechart,
            hierarchical_state_name="PAUSED",
            event=shop_pb2.Resumed(),
            servicer=Servicer(),
            state=None,
        )
        assert transition is not None
        exited, entered = states_exited_and_entered_from_transition(
            statechart,
            hierarchical_state_name="PAUSED",
            transition=transition,
            history={"OPEN": "OPEN/SHIPPING"},
        )
        self.assertEqual(exited, ["PAUSED"])
        self.assertEqual(
            entered,
            ["OPEN", "OPEN/SHIPPING", "OPEN/SHIPPING/PACKING"],
        )

    def test_a_transition_without_resume_enters_each_initial(self) -> None:
        statechart = make_statechart(
            """
            events: "shop.v1.Resumed"
            events: "shop.v1.Charging"
            events: "shop.v1.Paid"
            events: "shop.v1.Packed"
            initial: "PAUSED"
            states {
              name: "PAUSED"
              transitions {
                on { event: "shop.v1.Resumed" to: "OPEN" }
              }
            }
            states {
              name: "OPEN"
              initial: "PAYING"
              states {
                name: "PAYING"
                initial: "WAITING"
                transitions {
                  on { event: "shop.v1.Paid" to: "OPEN/SHIPPING" }
                }
                states {
                  name: "WAITING"
                  transitions {
                    on {
                      event: "shop.v1.Charging"
                      to: "OPEN/PAYING/CHARGING"
                    }
                  }
                }
                states { name: "CHARGING" }
              }
              states {
                name: "SHIPPING"
                initial: "PACKING"
                states {
                  name: "PACKING"
                  transitions {
                    on {
                      event: "shop.v1.Packed"
                      to: "OPEN/SHIPPING/LABELLING"
                    }
                  }
                }
                states { name: "LABELLING" }
              }
            }
            """,
        )
        transition = maybe_on_transition(
            statechart,
            hierarchical_state_name="PAUSED",
            event=shop_pb2.Resumed(),
            servicer=Servicer(),
            state=None,
        )
        assert transition is not None
        exited, entered = states_exited_and_entered_from_transition(
            statechart,
            hierarchical_state_name="PAUSED",
            transition=transition,
            history={
                "OPEN": "OPEN/SHIPPING",
                "OPEN/SHIPPING": "OPEN/SHIPPING/LABELLING",
            },
        )
        self.assertEqual(exited, ["PAUSED"])
        self.assertEqual(
            entered,
            ["OPEN", "OPEN/PAYING", "OPEN/PAYING/WAITING"],
        )


if __name__ == "__main__":
    unittest.main()
