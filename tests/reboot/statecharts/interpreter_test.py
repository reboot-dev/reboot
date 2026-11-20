import unittest
from google.protobuf import text_format
from rbt.v1alpha1.statecharts import statechart_pb2
from reboot.statecharts import interpreter
from reboot.statecharts.events import status_event_from_message
from tests.reboot.statecharts import order_pb2
from typing import Optional

# The statechart that the tests run. Its guard, its condition and each
# of its calls is a method of `Servicer` below.
#
# It starts in `OPEN/UNPAID`. There, a `Paid` of at least what is owed
# records the payment and closes the order, and so does the order
# being cancelled. Leaving `UNPAID` injects a `Settled`, and recording
# a payment of more than is owed injects a `Refunded` of the rest.
# `CLOSED` handles each event with a call and stays where it is.
STATECHART = text_format.Parse(
    """
    events: "tests.reboot.statecharts.Paid"
    events: "tests.reboot.statecharts.Refunded"
    events: "tests.reboot.statecharts.Settled"
    initial: "OPEN"
    entry { call { description: "Open" inline { method: "open" } } }
    states {
      name: "OPEN"
      initial: "UNPAID"
      entry { call { description: "Enter" inline { method: "enter_open" } } }
      exit { call { description: "Exit" inline { method: "exit_open" } } }
      states {
        name: "UNPAID"
        entry {
          call { description: "Enter" inline { method: "enter_unpaid" } }
        }
        exit {
          call { description: "Exit" inline { method: "exit_unpaid" } }
        }
        exit { inject { event: "tests.reboot.statecharts.Settled" } }
        transitions {
          on {
            event: "tests.reboot.statecharts.Paid"
            guard { inline { method: "is_enough" } }
            actions {
              call {
                description: "Record"
                inline {
                  method: "record"
                  injects: "tests.reboot.statecharts.Refunded"
                }
              }
            }
            to: "CLOSED"
          }
        }
        transitions {
          when {
            description: "Cancelled"
            condition { inline { method: "is_cancelled" } }
            actions {
              call { description: "Void" inline { method: "void" } }
            }
            to: "CLOSED"
          }
        }
      }
    }
    states {
      name: "CLOSED"
      entry {
        call { description: "Enter" inline { method: "enter_closed" } }
      }
      transitions {
        on {
          event: "tests.reboot.statecharts.Paid"
          actions {
            call { description: "Late" inline { method: "pay_late" } }
          }
        }
      }
      transitions {
        on {
          event: "tests.reboot.statecharts.Refunded"
          actions {
            call { description: "Refund" inline { method: "refund" } }
          }
        }
      }
      transitions {
        on {
          event: "tests.reboot.statecharts.Settled"
          actions {
            call { description: "Settle" inline { method: "settle" } }
          }
        }
      }
    }
    """,
    statechart_pb2.Statechart(),
)


class Servicer:
    """Has each method that `STATECHART` names. Each call adds what it
    is, and the event that it was given if it was given one, to
    `called`. The guard and the condition add what they were asked to
    `asked`."""

    def __init__(self) -> None:
        self.called: list[tuple] = []
        self.asked: list[tuple] = []

    def is_enough(
        self,
        state: order_pb2.Order,
        event: order_pb2.Paid,
    ) -> bool:
        self.asked.append(("is_enough", event))
        return event.cents >= state.owed_cents

    def is_cancelled(self, state: order_pb2.Order) -> bool:
        self.asked.append(("is_cancelled",))
        return state.cancelled

    def record(
        self,
        state: order_pb2.Order,
        event: order_pb2.Paid,
    ) -> Optional[order_pb2.Refunded]:
        self.called.append(("record", event))
        overpaid_cents = event.cents - state.owed_cents
        state.owed_cents = 0
        if overpaid_cents > 0:
            return order_pb2.Refunded(cents=overpaid_cents)
        return None

    def open(self, state: order_pb2.Order) -> None:
        self.called.append(("open",))

    def enter_open(self, state: order_pb2.Order) -> None:
        self.called.append(("enter_open",))

    def exit_open(self, state: order_pb2.Order) -> None:
        self.called.append(("exit_open",))

    def enter_unpaid(self, state: order_pb2.Order) -> None:
        self.called.append(("enter_unpaid",))

    def exit_unpaid(self, state: order_pb2.Order) -> None:
        self.called.append(("exit_unpaid",))

    def enter_closed(self, state: order_pb2.Order) -> None:
        self.called.append(("enter_closed",))

    def void(self, state: order_pb2.Order) -> None:
        self.called.append(("void",))

    def pay_late(self, state: order_pb2.Order, event: order_pb2.Paid) -> None:
        self.called.append(("pay_late", event))

    def refund(
        self,
        state: order_pb2.Order,
        event: order_pb2.Refunded,
    ) -> None:
        self.called.append(("refund", event))

    def settle(
        self,
        state: order_pb2.Order,
        event: order_pb2.Settled,
    ) -> None:
        self.called.append(("settle", event))


class RunTest(unittest.TestCase):
    """Tests `run` with `STATECHART` and a `Servicer`."""

    def test_statechart_that_has_not_started_starts(self) -> None:
        servicer = Servicer()
        status = statechart_pb2.Status()

        status_after = interpreter.run(
            STATECHART,
            servicer=servicer,
            state=order_pb2.Order(owed_cents=500),
            status=status,
        )

        self.assertEqual(
            statechart_pb2.Status(active="OPEN/UNPAID"),
            status_after,
        )
        # The status that `run` was given is left as it was.
        self.assertEqual(statechart_pb2.Status(), status)
        # The `entry` of the statechart, and then that of each state
        # that is entered, outermost first.
        self.assertEqual(
            [("open",), ("enter_open",), ("enter_unpaid",)],
            servicer.called,
        )

    def test_statechart_without_states_does_nothing(self) -> None:
        statechart = text_format.Parse(
            """
            events: "tests.reboot.statecharts.Paid"
            transitions { on { event: "tests.reboot.statecharts.Paid" } }
            """,
            statechart_pb2.Statechart(),
        )
        status = statechart_pb2.Status(
            queue=[status_event_from_message(order_pb2.Paid(cents=500))],
        )

        status_after = interpreter.run(
            statechart,
            servicer=Servicer(),
            state=order_pb2.Order(),
            status=status,
        )

        self.assertIsNone(status_after)

    def test_statechart_with_nothing_to_do_is_left_as_it_is(self) -> None:
        servicer = Servicer()
        status = statechart_pb2.Status(active="OPEN/UNPAID")

        status_after = interpreter.run(
            STATECHART,
            servicer=servicer,
            state=order_pb2.Order(owed_cents=500),
            status=status,
        )

        self.assertIsNone(status_after)
        self.assertEqual([], servicer.called)
        # Whether the `when` transition fires was looked at.
        self.assertEqual([("is_cancelled",)], servicer.asked)

    def test_event_is_handled_by_transition_that_fires_for_it(self) -> None:
        servicer = Servicer()
        state = order_pb2.Order(owed_cents=500)
        paid = order_pb2.Paid(cents=500)
        status = statechart_pb2.Status(
            active="OPEN/UNPAID",
            queue=[status_event_from_message(paid)],
        )

        status_after = interpreter.run(
            STATECHART,
            servicer=servicer,
            state=state,
            status=status,
        )

        # Each `exit` of each state that is exited, innermost first, the
        # action of the transition, which is given the event, and each
        # `entry` of each state that is entered. Then the `Settled`
        # that the `exit` of `UNPAID` injects is handled in `CLOSED`.
        self.assertEqual(
            [
                ("exit_unpaid",),
                ("exit_open",),
                ("record", paid),
                ("enter_closed",),
                ("settle", order_pb2.Settled()),
            ],
            servicer.called,
        )
        # The condition is given the state, and the guard the state
        # and the event. `CLOSED` has no `when` transition to look at.
        self.assertEqual(
            [("is_cancelled",), ("is_enough", paid)],
            servicer.asked,
        )
        self.assertEqual(0, state.owed_cents)
        # `OPEN` was last in `OPEN/UNPAID`.
        self.assertEqual(
            statechart_pb2.Status(
                active="CLOSED",
                history={"OPEN": "OPEN/UNPAID"},
            ),
            status_after,
        )

    def test_event_whose_guard_does_not_hold_is_dropped(self) -> None:
        servicer = Servicer()
        state = order_pb2.Order(owed_cents=500)
        status = statechart_pb2.Status(
            active="OPEN/UNPAID",
            queue=[status_event_from_message(order_pb2.Paid(cents=100))],
        )

        status_after = interpreter.run(
            STATECHART,
            servicer=servicer,
            state=state,
            status=status,
        )

        # The event was taken from the queue.
        self.assertEqual(
            statechart_pb2.Status(active="OPEN/UNPAID"),
            status_after,
        )
        self.assertEqual([], servicer.called)
        self.assertEqual(500, state.owed_cents)

    def test_event_that_state_has_no_transition_for_is_dropped(self) -> None:
        servicer = Servicer()
        status = statechart_pb2.Status(
            active="OPEN/UNPAID",
            queue=[status_event_from_message(order_pb2.Refunded(cents=1))],
        )

        status_after = interpreter.run(
            STATECHART,
            servicer=servicer,
            state=order_pb2.Order(owed_cents=500),
            status=status,
        )

        self.assertEqual(
            statechart_pb2.Status(active="OPEN/UNPAID"),
            status_after,
        )
        self.assertEqual([], servicer.called)

    def test_injected_events_are_handled_before_waiting_events(self) -> None:
        servicer = Servicer()
        first_paid = order_pb2.Paid(cents=500)
        second_paid = order_pb2.Paid(cents=1)
        status = statechart_pb2.Status(
            active="OPEN/UNPAID",
            queue=[
                status_event_from_message(first_paid),
                status_event_from_message(second_paid),
            ],
        )

        status_after = interpreter.run(
            STATECHART,
            servicer=servicer,
            # Less is owed than the first `Paid` is of, so `record`
            # returns a `Refunded` of the rest.
            state=order_pb2.Order(owed_cents=300),
            status=status,
        )

        # After the first `Paid`: the `Settled` that the `exit` of
        # `UNPAID` injects and the `Refunded` that `record` returns,
        # in the order they were injected, and only then the `Paid`
        # that was waiting.
        self.assertEqual(
            [
                ("exit_unpaid",),
                ("exit_open",),
                ("record", first_paid),
                ("enter_closed",),
                ("settle", order_pb2.Settled()),
                ("refund", order_pb2.Refunded(cents=200)),
                ("pay_late", second_paid),
            ],
            servicer.called,
        )
        assert status_after is not None
        self.assertEqual(0, len(status_after.queue))

    def test_when_transition_fires_without_event(self) -> None:
        servicer = Servicer()
        status = statechart_pb2.Status(active="OPEN/UNPAID")

        status_after = interpreter.run(
            STATECHART,
            servicer=servicer,
            state=order_pb2.Order(owed_cents=500, cancelled=True),
            status=status,
        )

        # The action of a `when` transition is given no event.
        self.assertEqual(
            [
                ("exit_unpaid",),
                ("exit_open",),
                ("void",),
                ("enter_closed",),
                ("settle", order_pb2.Settled()),
            ],
            servicer.called,
        )
        assert status_after is not None
        self.assertEqual("CLOSED", status_after.active)

    def test_when_transition_fires_once_statechart_has_started(self) -> None:
        servicer = Servicer()
        status = statechart_pb2.Status()

        status_after = interpreter.run(
            STATECHART,
            servicer=servicer,
            state=order_pb2.Order(owed_cents=500, cancelled=True),
            status=status,
        )

        self.assertEqual(
            [
                ("open",),
                ("enter_open",),
                ("enter_unpaid",),
                ("exit_unpaid",),
                ("exit_open",),
                ("void",),
                ("enter_closed",),
                ("settle", order_pb2.Settled()),
            ],
            servicer.called,
        )
        assert status_after is not None
        self.assertEqual("CLOSED", status_after.active)

    def test_fixed_event_that_is_injected_has_its_value(self) -> None:
        statechart = text_format.Parse(
            """
            events: "tests.reboot.statecharts.Paid"
            initial: "OPEN"
            states {
              name: "OPEN"
              entry {
                inject {
                  event: "tests.reboot.statecharts.Paid"
                  value {
                    fields {
                      key: "cents"
                      value { number_value: 500 }
                    }
                  }
                }
              }
              transitions {
                on {
                  event: "tests.reboot.statecharts.Paid"
                  actions {
                    call { description: "Late" inline { method: "pay_late" } }
                  }
                }
              }
            }
            """,
            statechart_pb2.Statechart(),
        )
        servicer = Servicer()

        status_after = interpreter.run(
            statechart,
            servicer=servicer,
            state=order_pb2.Order(),
            status=statechart_pb2.Status(),
        )

        self.assertEqual(
            [("pay_late", order_pb2.Paid(cents=500))],
            servicer.called,
        )
        self.assertEqual(statechart_pb2.Status(active="OPEN"), status_after)

    def test_transition_that_only_changes_state_leaves_status(self) -> None:
        # The `when` transition goes nowhere and its action injects
        # nothing, so taking it changes only the order.
        statechart = text_format.Parse(
            """
            initial: "OPEN"
            states {
              name: "OPEN"
              transitions {
                when {
                  description: "Cancelled"
                  condition { inline { method: "is_cancelled" } }
                  actions {
                    call { description: "Void" inline { method: "void" } }
                  }
                }
              }
            }
            """,
            statechart_pb2.Statechart(),
        )

        class UncancellingServicer(Servicer):

            def void(self, state: order_pb2.Order) -> None:
                super().void(state)
                state.cancelled = False

        servicer = UncancellingServicer()
        state = order_pb2.Order(cancelled=True)

        status_after = interpreter.run(
            statechart,
            servicer=servicer,
            state=state,
            status=statechart_pb2.Status(active="OPEN"),
        )

        self.assertIsNone(status_after)
        self.assertEqual([("void",)], servicer.called)
        self.assertFalse(state.cancelled)

    def test_statechart_that_does_not_come_to_rest_is_stopped(self) -> None:
        # The `when` transition goes nowhere and its condition holds
        # for as long as the order is cancelled, which nothing changes.
        statechart = text_format.Parse(
            """
            initial: "OPEN"
            states {
              name: "OPEN"
              transitions {
                when {
                  description: "Cancelled"
                  condition { inline { method: "is_cancelled" } }
                }
              }
            }
            """,
            statechart_pb2.Statechart(),
        )

        with self.assertRaises(RuntimeError) as raised:
            interpreter.run(
                statechart,
                servicer=Servicer(),
                state=order_pb2.Order(cancelled=True),
                status=statechart_pb2.Status(active="OPEN"),
            )

        self.assertEqual(
            "A statechart has taken more than 1000 transitions without "
            "coming to rest; does it have a `when` transition whose "
            "condition keeps holding, or events that keep being injected?",
            str(raised.exception),
        )


# A statechart with activities. `PACKING` has the schedule `pack`,
# the schedule `label`, which is the one that is cancellable, and a
# timer of five minutes, and the statechart itself has the schedule
# `audit`. A `Paid` and the order being cancelled each take `PACKING`
# to `DONE`, and a `Refunded` is handled with a call where the
# statechart is.
STATECHART_WITH_ACTIVITIES = text_format.Parse(
    """
    events: "tests.reboot.statecharts.Paid"
    events: "tests.reboot.statecharts.Refunded"
    initial: "PACKING"
    entry { schedule { inline { method: "audit" } cancellable: false } }
    states {
      name: "PACKING"
      entry { schedule { inline { method: "pack" } cancellable: false } }
      entry {
        timer {
          minutes: 5
          enqueue { event: "tests.reboot.statecharts.Refunded" }
        }
      }
      entry { schedule { inline { method: "label" } cancellable: true } }
      transitions {
        on { event: "tests.reboot.statecharts.Paid" to: "DONE" }
      }
      transitions {
        on {
          event: "tests.reboot.statecharts.Refunded"
          actions {
            call { description: "Refund" inline { method: "refund" } }
          }
        }
      }
      transitions {
        when {
          description: "Cancelled"
          condition { inline { method: "is_cancelled" } }
          to: "DONE"
        }
      }
    }
    states { name: "DONE" }
    """,
    statechart_pb2.Statechart(),
)

# The activities of `STATECHART_WITH_ACTIVITIES` as they are once
# their tasks have been made.
AUDIT = statechart_pb2.Status.Activity(
    schedule=STATECHART_WITH_ACTIVITIES.entry[0].schedule,
    task_uuid=b"audit",
)
PACK = statechart_pb2.Status.Activity(
    state="PACKING",
    schedule=STATECHART_WITH_ACTIVITIES.states[0].entry[0].schedule,
    task_uuid=b"pack",
)
REMIND = statechart_pb2.Status.Activity(
    state="PACKING",
    timer=STATECHART_WITH_ACTIVITIES.states[0].entry[1].timer,
    task_uuid=b"remind",
)
LABEL = statechart_pb2.Status.Activity(
    state="PACKING",
    schedule=STATECHART_WITH_ACTIVITIES.states[0].entry[2].schedule,
    task_uuid=b"label",
)
# `REMIND` once it is being cancelled.
REMIND_CANCELLING = statechart_pb2.Status.Activity(
    state="PACKING",
    timer=REMIND.timer,
    task_uuid=b"remind",
    cancelling=True,
)
# `LABEL` once it is being cancelled.
LABEL_CANCELLING = statechart_pb2.Status.Activity(
    state="PACKING",
    schedule=LABEL.schedule,
    task_uuid=b"label",
    cancelling=True,
)


class RunActivitiesTest(unittest.TestCase):
    """Tests `run` with `STATECHART_WITH_ACTIVITIES` and a
    `Servicer`."""

    def test_schedule_and_timer_of_state_that_is_entered_are_to_schedule(
        self,
    ) -> None:
        status_after = interpreter.run(
            STATECHART_WITH_ACTIVITIES,
            servicer=Servicer(),
            state=order_pb2.Order(),
            status=statechart_pb2.Status(),
        )

        # That of the statechart, and then those of the state. None
        # has a task yet.
        self.assertEqual(
            statechart_pb2.Status(
                active="PACKING",
                activities=[
                    statechart_pb2.Status.Activity(schedule=AUDIT.schedule),
                    statechart_pb2.Status.Activity(
                        state="PACKING",
                        schedule=PACK.schedule,
                    ),
                    statechart_pb2.Status.Activity(
                        state="PACKING",
                        timer=REMIND.timer,
                    ),
                    statechart_pb2.Status.Activity(
                        state="PACKING",
                        schedule=LABEL.schedule,
                    ),
                ],
            ),
            status_after,
        )

    def test_event_waits_for_schedule_of_state_its_transition_exits(
        self,
    ) -> None:
        status = statechart_pb2.Status(
            active="PACKING",
            queue=[
                status_event_from_message(order_pb2.Paid(cents=500)),
                status_event_from_message(order_pb2.Refunded(cents=1)),
            ],
            activities=[AUDIT, PACK],
        )
        servicer = Servicer()

        status_after = interpreter.run(
            STATECHART_WITH_ACTIVITIES,
            servicer=servicer,
            state=order_pb2.Order(),
            status=status,
        )

        # The `Paid` stays at the head of the queue, and the `Refunded`
        # behind it is not looked at.
        self.assertIsNone(status_after)
        self.assertEqual([], servicer.called)

    def test_when_transition_waits_for_schedule_of_state_it_exits(
        self,
    ) -> None:
        status_after = interpreter.run(
            STATECHART_WITH_ACTIVITIES,
            servicer=Servicer(),
            state=order_pb2.Order(cancelled=True),
            status=statechart_pb2.Status(
                active="PACKING",
                activities=[AUDIT, PACK],
            ),
        )

        self.assertIsNone(status_after)

    def test_event_cancels_cancellable_schedule_of_state_its_transition_exits(
        self,
    ) -> None:
        paid = status_event_from_message(order_pb2.Paid(cents=500))

        status_after = interpreter.run(
            STATECHART_WITH_ACTIVITIES,
            servicer=Servicer(),
            state=order_pb2.Order(),
            status=statechart_pb2.Status(
                active="PACKING",
                queue=[paid],
                activities=[AUDIT, PACK, LABEL],
            ),
        )

        # The `Paid` waits, and `label` is being cancelled. `pack`,
        # which is of `PACKING` as well, is not cancellable, and
        # `audit` is of no state that the transition exits.
        self.assertEqual(
            statechart_pb2.Status(
                active="PACKING",
                queue=[paid],
                activities=[AUDIT, PACK, LABEL_CANCELLING],
            ),
            status_after,
        )

    def test_when_transition_cancels_cancellable_schedule_of_state_it_exits(
        self,
    ) -> None:
        status_after = interpreter.run(
            STATECHART_WITH_ACTIVITIES,
            servicer=Servicer(),
            state=order_pb2.Order(cancelled=True),
            status=statechart_pb2.Status(
                active="PACKING",
                activities=[AUDIT, LABEL],
            ),
        )

        self.assertEqual(
            statechart_pb2.Status(
                active="PACKING",
                activities=[AUDIT, LABEL_CANCELLING],
            ),
            status_after,
        )

    def test_transition_that_waits_cancels_timer_of_state_it_exits(
        self,
    ) -> None:
        paid = status_event_from_message(order_pb2.Paid(cents=500))

        status_after = interpreter.run(
            STATECHART_WITH_ACTIVITIES,
            servicer=Servicer(),
            state=order_pb2.Order(),
            status=statechart_pb2.Status(
                active="PACKING",
                queue=[paid],
                activities=[AUDIT, PACK, REMIND],
            ),
        )

        # The `Paid` waits for `pack`, which is not cancellable, and
        # the timer of `PACKING` is being cancelled from now on.
        self.assertEqual(
            statechart_pb2.Status(
                active="PACKING",
                queue=[paid],
                activities=[AUDIT, PACK, REMIND_CANCELLING],
            ),
            status_after,
        )

    def test_schedule_that_is_being_cancelled_is_still_waited_for(
        self,
    ) -> None:
        status_after = interpreter.run(
            STATECHART_WITH_ACTIVITIES,
            servicer=Servicer(),
            state=order_pb2.Order(),
            status=statechart_pb2.Status(
                active="PACKING",
                queue=[status_event_from_message(order_pb2.Paid(cents=500))],
                activities=[AUDIT, LABEL_CANCELLING],
            ),
        )

        self.assertIsNone(status_after)

    def test_transition_that_exits_no_state_cancels_no_schedule(self) -> None:
        refunded = order_pb2.Refunded(cents=1)

        status_after = interpreter.run(
            STATECHART_WITH_ACTIVITIES,
            servicer=Servicer(),
            state=order_pb2.Order(),
            status=statechart_pb2.Status(
                active="PACKING",
                queue=[status_event_from_message(refunded)],
                activities=[AUDIT, LABEL],
            ),
        )

        self.assertEqual(
            statechart_pb2.Status(
                active="PACKING",
                activities=[AUDIT, LABEL],
            ),
            status_after,
        )

    def test_transition_that_exits_no_state_is_taken_during_schedule(
        self,
    ) -> None:
        refunded = order_pb2.Refunded(cents=1)
        servicer = Servicer()

        status_after = interpreter.run(
            STATECHART_WITH_ACTIVITIES,
            servicer=servicer,
            state=order_pb2.Order(),
            status=statechart_pb2.Status(
                active="PACKING",
                queue=[status_event_from_message(refunded)],
                activities=[AUDIT, PACK],
            ),
        )

        self.assertEqual([("refund", refunded)], servicer.called)
        self.assertEqual(
            statechart_pb2.Status(
                active="PACKING",
                activities=[AUDIT, PACK],
            ),
            status_after,
        )

    def test_event_is_handled_once_schedule_has_finished(self) -> None:
        status_after = interpreter.run(
            STATECHART_WITH_ACTIVITIES,
            servicer=Servicer(),
            state=order_pb2.Order(),
            # `pack` has finished. The schedule of the statechart
            # itself is of no state, so no transition waits for it,
            # and no transition waits for a timer.
            status=statechart_pb2.Status(
                active="PACKING",
                queue=[status_event_from_message(order_pb2.Paid(cents=500))],
                activities=[AUDIT, REMIND],
            ),
        )

        # The timer of `PACKING`, which was exited, is being
        # cancelled.
        self.assertEqual(
            statechart_pb2.Status(
                active="DONE",
                activities=[
                    AUDIT,
                    REMIND_CANCELLING,
                ],
            ),
            status_after,
        )


if __name__ == "__main__":
    unittest.main()
