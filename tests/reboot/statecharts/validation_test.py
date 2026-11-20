"""The rules that a `Statechart` message can break on its own."""
import unittest
from google.protobuf import text_format
from rbt.v1alpha1.statecharts import statechart_pb2
from reboot.statecharts.validation import check_statechart


def make_statechart(text: str) -> statechart_pb2.Statechart:
    """Returns the statechart written in `text`, in the protobuf text
    format."""
    return text_format.Parse(text, statechart_pb2.Statechart())


class ValidationTest(unittest.TestCase):

    def test_a_statechart_without_states_has_no_problems(self) -> None:
        self.assertEqual(check_statechart(statechart_pb2.Statechart()), [])

    def test_states_that_each_have_an_initial_have_no_problems(self) -> None:
        statechart = make_statechart(
            """
            events: "shop.v1.Paid"
            events: "shop.v1.Shipped"
            initial: "OPEN"
            states {
              name: "OPEN"
              initial: "PENDING"
              states {
                name: "PENDING"
                transitions {
                  on { event: "shop.v1.Paid" to: "OPEN/SHIPPING" }
                }
              }
              states { name: "SHIPPING" }
              transitions { on { event: "shop.v1.Shipped" to: "SHIPPED" } }
            }
            states { name: "SHIPPED" }
            """,
        )
        self.assertEqual(check_statechart(statechart), [])

    def test_a_statechart_with_states_has_an_initial(self) -> None:
        statechart = make_statechart(
            """
            states { name: "PENDING" }
            states { name: "SHIPPED" }
            """,
        )
        self.assertEqual(
            check_statechart(statechart),
            ["the statechart has states but no `initial`"],
        )

    def test_a_state_with_states_has_an_initial(self) -> None:
        statechart = make_statechart(
            """
            initial: "OPEN"
            states {
              name: "OPEN"
              states { name: "PENDING" }
              states { name: "SHIPPING" }
            }
            """,
        )
        self.assertEqual(
            check_statechart(statechart),
            ["state `OPEN` has states but no `initial`"],
        )

    def test_an_initial_is_one_of_the_states(self) -> None:
        statechart = make_statechart(
            """
            initial: "PENDNG"
            states { name: "PENDING" }
            states { name: "SHIPPED" }
            """,
        )
        self.assertEqual(
            check_statechart(statechart),
            ['`initial: "PENDNG"` of the statechart is not one of its states'],
        )

    def test_an_initial_is_one_of_a_states_own_states(self) -> None:
        # `SHIPPED` is a state, but of the statechart and not of
        # `OPEN`.
        statechart = make_statechart(
            """
            initial: "OPEN"
            states {
              name: "OPEN"
              initial: "SHIPPED"
              states { name: "PENDING" }
            }
            states { name: "SHIPPED" }
            """,
        )
        self.assertEqual(
            check_statechart(statechart),
            [
                "`initial: \"SHIPPED\"` of state `OPEN` is not one of its "
                "states"
            ],
        )

    def test_a_state_without_states_has_no_initial(self) -> None:
        statechart = make_statechart(
            """
            initial: "PENDING"
            states { name: "PENDING" initial: "NEW" }
            """,
        )
        self.assertEqual(
            check_statechart(statechart),
            ['state `PENDING` has `initial: "NEW"` but no states'],
        )

    def test_a_state_has_a_name(self) -> None:
        statechart = make_statechart(
            """
            initial: "PENDING"
            states { name: "PENDING" }
            states {}
            """,
        )
        self.assertEqual(
            check_statechart(statechart),
            ["the statechart has a state without a `name`"],
        )

    def test_the_states_of_a_statechart_have_different_names(self) -> None:
        statechart = make_statechart(
            """
            initial: "PENDING"
            states { name: "PENDING" }
            states { name: "PENDING" }
            states { name: "SHIPPED" }
            """,
        )
        self.assertEqual(
            check_statechart(statechart),
            ["the statechart has more than one state named 'PENDING'"],
        )

    def test_the_substates_of_a_state_have_different_names(self) -> None:
        statechart = make_statechart(
            """
            initial: "OPEN"
            states {
              name: "OPEN"
              initial: "PENDING"
              states { name: "PENDING" }
              states { name: "PENDING" }
            }
            """,
        )
        self.assertEqual(
            check_statechart(statechart),
            ["state `OPEN` has more than one state named 'PENDING'"],
        )

    def test_states_that_are_not_siblings_can_share_a_name(self) -> None:
        statechart = make_statechart(
            """
            events: "shop.v1.Closed"
            initial: "OPEN"
            states {
              name: "OPEN"
              initial: "WAITING"
              states { name: "WAITING" }
              transitions { on { event: "shop.v1.Closed" to: "CLOSED" } }
            }
            states {
              name: "CLOSED"
              initial: "WAITING"
              states { name: "WAITING" }
            }
            """,
        )
        self.assertEqual(check_statechart(statechart), [])

    def test_transitions_that_are_an_on_or_a_when_have_no_problems(
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
              transitions { on { event: "shop.v1.Paid" to: "SHIPPED" } }
            }
            states { name: "SHIPPED" }
            states { name: "CANCELLED" }
            """,
        )
        self.assertEqual(check_statechart(statechart), [])

    def test_a_transition_of_a_statechart_is_an_on_or_a_when(self) -> None:
        statechart = make_statechart(
            """
            initial: "PENDING"
            transitions {}
            states { name: "PENDING" }
            """,
        )
        self.assertEqual(
            check_statechart(statechart),
            [
                "a transition of the statechart is neither an `on` nor a "
                "`when`"
            ],
        )

    def test_a_transition_of_a_state_is_an_on_or_a_when(self) -> None:
        statechart = make_statechart(
            """
            events: "shop.v1.Paid"
            initial: "PENDING"
            states {
              name: "PENDING"
              transitions { on { event: "shop.v1.Paid" to: "SHIPPED" } }
              transitions {}
            }
            states { name: "SHIPPED" }
            """,
        )
        self.assertEqual(
            check_statechart(statechart),
            [
                "a transition of state `PENDING` is neither an `on` nor a "
                "`when`"
            ],
        )

    def test_an_on_of_a_statechart_has_an_event(self) -> None:
        statechart = make_statechart(
            """
            initial: "PENDING"
            transitions { on { to: "CANCELLED" } }
            states { name: "PENDING" }
            states { name: "CANCELLED" }
            """,
        )
        self.assertEqual(
            check_statechart(statechart),
            ["an `on` transition of the statechart has no `event`"],
        )

    def test_an_on_of_a_state_has_an_event(self) -> None:
        statechart = make_statechart(
            """
            initial: "PENDING"
            states {
              name: "PENDING"
              transitions { on { to: "SHIPPED" } }
            }
            states { name: "SHIPPED" }
            """,
        )
        self.assertEqual(
            check_statechart(statechart),
            ["an `on` transition of state `PENDING` has no `event`"],
        )

    def test_a_when_of_a_statechart_has_a_description(self) -> None:
        statechart = make_statechart(
            """
            initial: "PENDING"
            transitions {
              when {
                condition { inline { method: "is_cancelled" } }
                to: "CANCELLED"
              }
            }
            states { name: "PENDING" }
            states { name: "CANCELLED" }
            """,
        )
        self.assertEqual(
            check_statechart(statechart),
            ["a `when` transition of the statechart has no `description`"],
        )

    def test_a_when_of_a_state_has_a_description(self) -> None:
        statechart = make_statechart(
            """
            initial: "PENDING"
            states {
              name: "PENDING"
              transitions {
                when {
                  description: "  "
                  condition { inline { method: "is_paid" } }
                  to: "SHIPPED"
                }
              }
            }
            states { name: "SHIPPED" }
            """,
        )
        self.assertEqual(
            check_statechart(statechart),
            ["a `when` transition of state `PENDING` has no `description`"],
        )

    def test_a_when_of_a_statechart_has_a_condition(self) -> None:
        statechart = make_statechart(
            """
            initial: "PENDING"
            transitions { when { description: "Cancelled" to: "CANCELLED" } }
            states { name: "PENDING" }
            states { name: "CANCELLED" }
            """,
        )
        self.assertEqual(
            check_statechart(statechart),
            ["a `when` transition of the statechart has no `condition`"],
        )

    def test_a_when_of_a_state_has_a_condition(self) -> None:
        # A `condition` that does not say how it is evaluated is no
        # condition.
        statechart = make_statechart(
            """
            initial: "PENDING"
            states {
              name: "PENDING"
              transitions {
                when { description: "Paid" condition {} to: "SHIPPED" }
              }
            }
            states { name: "SHIPPED" }
            """,
        )
        self.assertEqual(
            check_statechart(statechart),
            ["a `when` transition of state `PENDING` has no `condition`"],
        )

    def test_the_condition_of_a_when_has_a_method(self) -> None:
        statechart = make_statechart(
            """
            initial: "PENDING"
            states {
              name: "PENDING"
              transitions {
                when {
                  description: "Paid"
                  condition { inline {} }
                  to: "SHIPPED"
                }
              }
            }
            states { name: "SHIPPED" }
            """,
        )
        self.assertEqual(
            check_statechart(statechart),
            [
                "the `condition` of a `when` transition of state `PENDING` "
                "has no `method`"
            ],
        )

    def test_an_on_with_a_guard_that_has_a_method_has_no_problems(
        self,
    ) -> None:
        statechart = make_statechart(
            """
            events: "shop.v1.Paid"
            initial: "PENDING"
            states {
              name: "PENDING"
              transitions {
                on {
                  event: "shop.v1.Paid"
                  guard { inline { method: "paid_in_full" } }
                  to: "SHIPPED"
                }
              }
            }
            states { name: "SHIPPED" }
            """,
        )
        self.assertEqual(check_statechart(statechart), [])

    def test_the_guard_of_an_on_has_a_method(self) -> None:
        statechart = make_statechart(
            """
            events: "shop.v1.Paid"
            initial: "PENDING"
            states {
              name: "PENDING"
              transitions {
                on {
                  event: "shop.v1.Paid"
                  guard { inline {} }
                  to: "SHIPPED"
                }
              }
            }
            states { name: "SHIPPED" }
            """,
        )
        self.assertEqual(
            check_statechart(statechart),
            [
                "the `guard` of an `on` transition of state `PENDING` has no "
                "`method`"
            ],
        )

    def test_a_guard_that_is_empty_has_no_method(self) -> None:
        statechart = make_statechart(
            """
            events: "shop.v1.Cancelled"
            initial: "PENDING"
            transitions {
              on { event: "shop.v1.Cancelled" guard {} to: "CANCELLED" }
            }
            states { name: "PENDING" }
            states { name: "CANCELLED" }
            """,
        )
        self.assertEqual(
            check_statechart(statechart),
            [
                "the `guard` of an `on` transition of the statechart has no "
                "`method`"
            ],
        )

    def test_entries_that_say_what_they_do_have_no_problems(self) -> None:
        statechart = make_statechart(
            """
            events: "shop.v1.Opened"
            events: "shop.v1.TimedOut"
            initial: "PENDING"
            transitions { on { event: "shop.v1.Opened" } }
            transitions { on { event: "shop.v1.TimedOut" } }
            entry {
              call { description: "Open" inline { method: "open" } }
            }
            states {
              name: "PENDING"
              entry { inject { event: "shop.v1.Opened" } }
              entry {
                timer { minutes: 30 enqueue { event: "shop.v1.TimedOut" } }
              }
              entry {
                schedule {
                  inline { method: "remind" }
                  cancellable: false
                }
              }
            }
            """,
        )
        self.assertEqual(check_statechart(statechart), [])

    def test_an_entry_of_a_statechart_says_what_it_does(self) -> None:
        statechart = make_statechart(
            """
            initial: "PENDING"
            entry {}
            states { name: "PENDING" }
            """,
        )
        self.assertEqual(
            check_statechart(statechart),
            [
                "an `entry` of the statechart is neither a `call`, an "
                "`inject`, a `schedule` nor a `timer`"
            ],
        )

    def test_an_entry_of_a_state_says_what_it_does(self) -> None:
        statechart = make_statechart(
            """
            initial: "PENDING"
            states {
              name: "PENDING"
              entry {}
            }
            """,
        )
        self.assertEqual(
            check_statechart(statechart),
            [
                "an `entry` of state `PENDING` is neither a `call`, an "
                "`inject`, a `schedule` nor a `timer`"
            ],
        )

    def test_exits_that_say_what_they_do_have_no_problems(self) -> None:
        statechart = make_statechart(
            """
            events: "shop.v1.Left"
            initial: "PENDING"
            transitions { on { event: "shop.v1.Left" } }
            exit {
              call { description: "Close" inline { method: "close" } }
            }
            states {
              name: "PENDING"
              exit { inject { event: "shop.v1.Left" } }
            }
            """,
        )
        self.assertEqual(check_statechart(statechart), [])

    def test_an_exit_of_a_statechart_says_what_it_does(self) -> None:
        statechart = make_statechart(
            """
            initial: "PENDING"
            exit {}
            states { name: "PENDING" }
            """,
        )
        self.assertEqual(
            check_statechart(statechart),
            [
                "an `exit` of the statechart is neither a `call` nor an "
                "`inject`"
            ],
        )

    def test_an_exit_of_a_state_says_what_it_does(self) -> None:
        statechart = make_statechart(
            """
            initial: "PENDING"
            states {
              name: "PENDING"
              exit {}
            }
            """,
        )
        self.assertEqual(
            check_statechart(statechart),
            [
                "an `exit` of state `PENDING` is neither a `call` nor an "
                "`inject`"
            ],
        )

    def test_actions_that_say_what_they_do_have_no_problems(self) -> None:
        statechart = make_statechart(
            """
            events: "shop.v1.Refunded"
            events: "shop.v1.Paid"
            initial: "PENDING"
            transitions { on { event: "shop.v1.Refunded" } }
            transitions {
              when {
                description: "Cancelled"
                condition { inline { method: "is_cancelled" } }
                to: "CANCELLED"
                actions { inject { event: "shop.v1.Refunded" } }
              }
            }
            states {
              name: "PENDING"
              transitions {
                on {
                  event: "shop.v1.Paid"
                  to: "CANCELLED"
                  actions {
                    call {
                      description: "Record the payment"
                      inline { method: "record_payment" }
                    }
                  }
                }
              }
            }
            states { name: "CANCELLED" }
            """,
        )
        self.assertEqual(check_statechart(statechart), [])

    def test_an_action_of_an_on_says_what_it_does(self) -> None:
        statechart = make_statechart(
            """
            events: "shop.v1.Paid"
            initial: "PENDING"
            states {
              name: "PENDING"
              transitions {
                on { event: "shop.v1.Paid" to: "SHIPPED" actions {} }
              }
            }
            states { name: "SHIPPED" }
            """,
        )
        self.assertEqual(
            check_statechart(statechart),
            [
                "an action of an `on` transition of state `PENDING` is "
                "neither a `call` nor an `inject`"
            ],
        )

    def test_an_action_of_a_when_says_what_it_does(self) -> None:
        statechart = make_statechart(
            """
            initial: "PENDING"
            transitions {
              when {
                description: "Cancelled"
                condition { inline { method: "is_cancelled" } }
                to: "CANCELLED"
                actions {}
              }
            }
            states { name: "PENDING" }
            states { name: "CANCELLED" }
            """,
        )
        self.assertEqual(
            check_statechart(statechart),
            [
                "an action of a `when` transition of the statechart is "
                "neither a `call` nor an `inject`"
            ],
        )

    def test_a_call_in_an_entry_has_a_description(self) -> None:
        statechart = make_statechart(
            """
            initial: "PENDING"
            states {
              name: "PENDING"
              entry { call { inline { method: "open" } } }
            }
            """,
        )
        self.assertEqual(
            check_statechart(statechart),
            [
                "in an `entry` of state `PENDING`: the `call` has no "
                "`description`"
            ],
        )

    def test_a_call_in_an_exit_has_a_description(self) -> None:
        statechart = make_statechart(
            """
            initial: "PENDING"
            exit { call { description: " " inline { method: "close" } } }
            states { name: "PENDING" }
            """,
        )
        self.assertEqual(
            check_statechart(statechart),
            [
                "in an `exit` of the statechart: the `call` has no "
                "`description`"
            ],
        )

    def test_a_call_in_an_on_has_a_description(self) -> None:
        statechart = make_statechart(
            """
            events: "shop.v1.Paid"
            initial: "PENDING"
            states {
              name: "PENDING"
              transitions {
                on {
                  event: "shop.v1.Paid"
                  to: "SHIPPED"
                  actions { call { inline { method: "record_payment" } } }
                }
              }
            }
            states { name: "SHIPPED" }
            """,
        )
        self.assertEqual(
            check_statechart(statechart),
            [
                "in an `on` transition of state `PENDING`: the `call` has no "
                "`description`"
            ],
        )

    def test_a_call_in_a_when_has_a_description(self) -> None:
        statechart = make_statechart(
            """
            initial: "PENDING"
            transitions {
              when {
                description: "Cancelled"
                condition { inline { method: "is_cancelled" } }
                to: "CANCELLED"
                actions { call { inline { method: "refund" } } }
              }
            }
            states { name: "PENDING" }
            states { name: "CANCELLED" }
            """,
        )
        self.assertEqual(
            check_statechart(statechart),
            [
                "in a `when` transition of the statechart: the `call` has no "
                "`description`"
            ],
        )

    def test_a_call_has_a_method(self) -> None:
        statechart = make_statechart(
            """
            initial: "PENDING"
            states {
              name: "PENDING"
              entry { call { description: "Open" inline {} } }
            }
            """,
        )
        self.assertEqual(
            check_statechart(statechart),
            ["in an `entry` of state `PENDING`: the `call` has no `method`"],
        )

    def test_a_call_that_says_nothing_of_how_has_no_method(self) -> None:
        statechart = make_statechart(
            """
            initial: "PENDING"
            exit { call { description: "Close" } }
            states { name: "PENDING" }
            """,
        )
        self.assertEqual(
            check_statechart(statechart),
            ["in an `exit` of the statechart: the `call` has no `method`"],
        )

    def test_an_inject_in_an_entry_has_an_event(self) -> None:
        statechart = make_statechart(
            """
            initial: "PENDING"
            states {
              name: "PENDING"
              entry { inject {} }
            }
            """,
        )
        self.assertEqual(
            check_statechart(statechart),
            ["in an `entry` of state `PENDING`: the `inject` has no `event`"],
        )

    def test_an_inject_in_an_exit_has_an_event(self) -> None:
        statechart = make_statechart(
            """
            initial: "PENDING"
            states {
              name: "PENDING"
              exit { inject {} }
            }
            """,
        )
        self.assertEqual(
            check_statechart(statechart),
            ["in an `exit` of state `PENDING`: the `inject` has no `event`"],
        )

    def test_an_inject_in_an_on_has_an_event(self) -> None:
        statechart = make_statechart(
            """
            events: "shop.v1.Paid"
            initial: "PENDING"
            states {
              name: "PENDING"
              transitions {
                on {
                  event: "shop.v1.Paid"
                  to: "SHIPPED"
                  actions { inject {} }
                }
              }
            }
            states { name: "SHIPPED" }
            """,
        )
        self.assertEqual(
            check_statechart(statechart),
            [
                "in an `on` transition of state `PENDING`: the `inject` has "
                "no `event`"
            ],
        )

    def test_an_inject_in_a_when_has_an_event(self) -> None:
        statechart = make_statechart(
            """
            initial: "PENDING"
            transitions {
              when {
                description: "Cancelled"
                condition { inline { method: "is_cancelled" } }
                to: "CANCELLED"
                actions { inject {} }
              }
            }
            states { name: "PENDING" }
            states { name: "CANCELLED" }
            """,
        )
        self.assertEqual(
            check_statechart(statechart),
            [
                "in a `when` transition of the statechart: the `inject` has "
                "no `event`"
            ],
        )

    def test_a_schedule_has_a_method(self) -> None:
        statechart = make_statechart(
            """
            initial: "SHIPPING"
            states {
              name: "SHIPPING"
              entry { schedule { inline {} cancellable: false } }
            }
            """,
        )
        self.assertEqual(
            check_statechart(statechart),
            [
                "in an `entry` of state `SHIPPING`: the `schedule` has no "
                "`method`"
            ],
        )

    def test_a_schedule_says_whether_it_is_cancellable(self) -> None:
        statechart = make_statechart(
            """
            initial: "SHIPPING"
            states {
              name: "SHIPPING"
              entry { schedule { inline { method: "ship" } } }
            }
            """,
        )
        self.assertEqual(
            check_statechart(statechart),
            [
                "in an `entry` of state `SHIPPING`: the `schedule` does not "
                "say whether it is `cancellable`"
            ],
        )

    def test_a_schedule_that_says_nothing_of_how_has_no_method(self) -> None:
        statechart = make_statechart(
            """
            initial: "SHIPPING"
            entry { schedule { cancellable: false } }
            states { name: "SHIPPING" }
            """,
        )
        self.assertEqual(
            check_statechart(statechart),
            [
                "in an `entry` of the statechart: the `schedule` has no "
                "`method`"
            ],
        )

    def test_a_timer_has_an_event_to_enqueue(self) -> None:
        statechart = make_statechart(
            """
            initial: "PENDING"
            states {
              name: "PENDING"
              entry { timer { minutes: 30 } }
            }
            """,
        )
        self.assertEqual(
            check_statechart(statechart),
            [
                "in an `entry` of state `PENDING`: the `timer` has no event "
                "to `enqueue`"
            ],
        )

    def test_an_enqueue_without_an_event_is_no_event(self) -> None:
        statechart = make_statechart(
            """
            initial: "PENDING"
            entry { timer { minutes: 30 enqueue {} } }
            states { name: "PENDING" }
            """,
        )
        self.assertEqual(
            check_statechart(statechart),
            [
                "in an `entry` of the statechart: the `timer` has no event "
                "to `enqueue`"
            ],
        )

    def test_a_timer_has_a_delay(self) -> None:
        statechart = make_statechart(
            """
            events: "shop.v1.TimedOut"
            initial: "PENDING"
            transitions { on { event: "shop.v1.TimedOut" } }
            states {
              name: "PENDING"
              entry { timer { enqueue { event: "shop.v1.TimedOut" } } }
            }
            """,
        )
        self.assertEqual(
            check_statechart(statechart),
            [
                "in an `entry` of state `PENDING`: the `timer` has no delay: "
                "one of its `seconds`, `minutes`, `hours` and `days` must be "
                "more than zero"
            ],
        )

    def test_a_field_of_a_timer_is_not_negative(self) -> None:
        statechart = make_statechart(
            """
            events: "shop.v1.TimedOut"
            initial: "PENDING"
            transitions { on { event: "shop.v1.TimedOut" } }
            states {
              name: "PENDING"
              entry {
                timer {
                  minutes: -30
                  enqueue { event: "shop.v1.TimedOut" }
                }
              }
            }
            """,
        )
        self.assertEqual(
            check_statechart(statechart),
            [
                "in an `entry` of state `PENDING`: the `timer` has "
                "`minutes: -30`, but a delay cannot be negative",
            ],
        )

    def test_each_negative_field_of_a_timer_is_a_problem(self) -> None:
        statechart = make_statechart(
            """
            events: "shop.v1.TimedOut"
            initial: "PENDING"
            transitions { on { event: "shop.v1.TimedOut" } }
            states {
              name: "PENDING"
              entry {
                timer {
                  hours: -1
                  minutes: -0.5
                  enqueue { event: "shop.v1.TimedOut" }
                }
              }
            }
            """,
        )
        self.assertEqual(
            check_statechart(statechart),
            [
                "in an `entry` of state `PENDING`: the `timer` has "
                "`minutes: -0.5`, but a delay cannot be negative",
                "in an `entry` of state `PENDING`: the `timer` has "
                "`hours: -1`, but a delay cannot be negative",
            ],
        )

    def test_a_negative_field_is_a_problem_whatever_the_sum(self) -> None:
        statechart = make_statechart(
            """
            events: "shop.v1.TimedOut"
            initial: "PENDING"
            transitions { on { event: "shop.v1.TimedOut" } }
            states {
              name: "PENDING"
              entry {
                timer {
                  hours: 1
                  minutes: -30
                  enqueue { event: "shop.v1.TimedOut" }
                }
              }
            }
            """,
        )
        self.assertEqual(
            check_statechart(statechart),
            [
                "in an `entry` of state `PENDING`: the `timer` has "
                "`minutes: -30`, but a delay cannot be negative",
            ],
        )

    def test_a_timer_with_a_negative_field_has_no_other_delay_problem(
        self,
    ) -> None:
        statechart = make_statechart(
            """
            events: "shop.v1.TimedOut"
            initial: "PENDING"
            transitions { on { event: "shop.v1.TimedOut" } }
            states {
              name: "PENDING"
              entry {
                timer {
                  seconds: -5
                  enqueue { event: "shop.v1.TimedOut" }
                }
              }
            }
            """,
        )
        self.assertEqual(
            check_statechart(statechart),
            [
                "in an `entry` of state `PENDING`: the `timer` has "
                "`seconds: -5`, but a delay cannot be negative",
            ],
        )

    def test_the_delay_of_a_timer_is_a_sum(self) -> None:
        statechart = make_statechart(
            """
            events: "shop.v1.TimedOut"
            initial: "PENDING"
            transitions { on { event: "shop.v1.TimedOut" } }
            states {
              name: "PENDING"
              entry {
                timer {
                  hours: 1
                  minutes: 30
                  enqueue { event: "shop.v1.TimedOut" }
                }
              }
            }
            """,
        )
        self.assertEqual(check_statechart(statechart), [])

    def test_a_delay_of_zero_is_no_delay(self) -> None:
        statechart = make_statechart(
            """
            events: "shop.v1.TimedOut"
            initial: "PENDING"
            transitions { on { event: "shop.v1.TimedOut" } }
            states {
              name: "PENDING"
              entry {
                timer { seconds: 0 enqueue { event: "shop.v1.TimedOut" } }
              }
            }
            """,
        )
        self.assertEqual(
            check_statechart(statechart),
            [
                "in an `entry` of state `PENDING`: the `timer` has no delay: "
                "one of its `seconds`, `minutes`, `hours` and `days` must be "
                "more than zero"
            ],
        )

    def test_a_final_state_that_only_acts_has_no_problems(self) -> None:
        statechart = make_statechart(
            """
            initial: "SHIPPED"
            states {
              name: "SHIPPED"
              final: true
              entry {
                call { description: "Thank" inline { method: "thank" } }
              }
            }
            """,
        )
        self.assertEqual(check_statechart(statechart), [])

    def test_a_final_state_has_no_inject(self) -> None:
        statechart = make_statechart(
            """
            events: "shop.v1.Refunded"
            initial: "CANCELLED"
            transitions { on { event: "shop.v1.Refunded" } }
            states {
              name: "CANCELLED"
              final: true
              entry { inject { event: "shop.v1.Refunded" } }
            }
            """,
        )
        self.assertEqual(
            check_statechart(statechart),
            ["state `CANCELLED` is final and cannot inject an event"],
        )

    def test_a_final_state_has_no_call_that_may_inject(self) -> None:
        statechart = make_statechart(
            """
            events: "shop.v1.Refunded"
            initial: "CANCELLED"
            transitions { on { event: "shop.v1.Refunded" } }
            states {
              name: "CANCELLED"
              final: true
              entry {
                call {
                  description: "Refund"
                  inline { method: "refund" injects: "shop.v1.Refunded" }
                }
              }
            }
            """,
        )
        self.assertEqual(
            check_statechart(statechart),
            ["state `CANCELLED` is final and cannot inject an event"],
        )

    def test_a_final_state_that_injects_twice_is_a_problem_once(self) -> None:
        statechart = make_statechart(
            """
            events: "shop.v1.Refunded"
            initial: "CANCELLED"
            transitions { on { event: "shop.v1.Refunded" } }
            states {
              name: "CANCELLED"
              final: true
              entry { inject { event: "shop.v1.Refunded" } }
              entry {
                call {
                  description: "Refund"
                  inline { method: "refund" injects: "shop.v1.Refunded" }
                }
              }
            }
            """,
        )
        self.assertEqual(
            check_statechart(statechart),
            ["state `CANCELLED` is final and cannot inject an event"],
        )

    def test_the_statechart_has_no_exit_that_injects(self) -> None:
        statechart = make_statechart(
            """
            events: "shop.v1.Refunded"
            initial: "CANCELLED"
            transitions { on { event: "shop.v1.Refunded" } }
            exit { inject { event: "shop.v1.Refunded" } }
            states { name: "CANCELLED" }
            """,
        )
        self.assertEqual(
            check_statechart(statechart),
            [
                "the statechart cannot inject an event in an `exit`: it is in "
                "a final state by then, so no transition fires for the event"
            ],
        )

    def test_the_statechart_has_no_exit_with_call_that_may_inject(
        self,
    ) -> None:
        statechart = make_statechart(
            """
            events: "shop.v1.Refunded"
            initial: "CANCELLED"
            transitions { on { event: "shop.v1.Refunded" } }
            exit {
              call {
                description: "Refund"
                inline { method: "refund" injects: "shop.v1.Refunded" }
              }
            }
            states { name: "CANCELLED" }
            """,
        )
        self.assertEqual(
            check_statechart(statechart),
            [
                "the statechart cannot inject an event in an `exit`: it is in "
                "a final state by then, so no transition fires for the event"
            ],
        )

    def test_a_final_state_has_no_exit(self) -> None:
        statechart = make_statechart(
            """
            initial: "CANCELLED"
            states {
              name: "CANCELLED"
              final: true
              exit {
                call {
                  description: "Release stock"
                  inline { method: "release_stock" }
                }
              }
            }
            """,
        )
        self.assertEqual(
            check_statechart(statechart),
            ["state `CANCELLED` is final and cannot have an `exit`"],
        )

    def test_a_final_state_with_two_exits_is_a_problem_once(self) -> None:
        statechart = make_statechart(
            """
            events: "shop.v1.Left"
            initial: "CANCELLED"
            transitions { on { event: "shop.v1.Left" } }
            states {
              name: "CANCELLED"
              final: true
              exit {
                call {
                  description: "Release stock"
                  inline { method: "release_stock" }
                }
              }
              exit { inject { event: "shop.v1.Left" } }
            }
            """,
        )
        self.assertEqual(
            check_statechart(statechart),
            ["state `CANCELLED` is final and cannot have an `exit`"],
        )

    def test_a_final_state_has_no_transitions(self) -> None:
        statechart = make_statechart(
            """
            events: "shop.v1.Reopened"
            initial: "PENDING"
            states { name: "PENDING" }
            states {
              name: "CANCELLED"
              final: true
              transitions { on { event: "shop.v1.Reopened" to: "PENDING" } }
            }
            """,
        )
        self.assertEqual(
            check_statechart(statechart),
            ["state `CANCELLED` is final and cannot have transitions"],
        )

    def test_a_final_state_has_no_schedule_or_timer(self) -> None:
        statechart = make_statechart(
            """
            events: "shop.v1.TimedOut"
            initial: "CANCELLED"
            transitions { on { event: "shop.v1.TimedOut" } }
            states {
              name: "CANCELLED"
              final: true
              entry {
                timer { days: 1 enqueue { event: "shop.v1.TimedOut" } }
              }
            }
            """,
        )
        self.assertEqual(
            check_statechart(statechart),
            [
                "state `CANCELLED` is final and cannot have a `schedule` or "
                "a `timer`"
            ],
        )

    def test_a_final_state_has_no_states(self) -> None:
        statechart = make_statechart(
            """
            initial: "OPEN"
            states {
              name: "OPEN"
              initial: "CLOSED"
              states {
                name: "CLOSED"
                final: true
                initial: "GONE"
                states { name: "GONE" }
              }
            }
            """,
        )
        self.assertEqual(
            check_statechart(statechart),
            ["state `OPEN/CLOSED` is final and cannot have states"],
        )

    def test_an_event_of_an_on_is_one_of_the_events(self) -> None:
        statechart = make_statechart(
            """
            events: "shop.v1.Shipped"
            initial: "PENDING"
            states {
              name: "PENDING"
              transitions { on { event: "shop.v1.Paid" to: "SHIPPED" } }
            }
            states { name: "SHIPPED" }
            """,
        )
        self.assertEqual(
            check_statechart(statechart),
            [
                "the statechart mentions the event `shop.v1.Paid`, which is "
                "not one of its `events`"
            ],
        )

    def test_an_event_of_an_inject_is_one_of_the_events(self) -> None:
        statechart = make_statechart(
            """
            initial: "PENDING"
            transitions { on { event: "shop.v1.Left" } }
            states {
              name: "PENDING"
              exit { inject { event: "shop.v1.Left" } }
            }
            """,
        )
        self.assertEqual(
            check_statechart(statechart),
            [
                "the statechart mentions the event `shop.v1.Left`, which is "
                "not one of its `events`"
            ],
        )

    def test_an_event_of_a_timer_is_one_of_the_events(self) -> None:
        statechart = make_statechart(
            """
            initial: "PENDING"
            transitions { on { event: "shop.v1.TimedOut" } }
            states {
              name: "PENDING"
              entry {
                timer { minutes: 30 enqueue { event: "shop.v1.TimedOut" } }
              }
            }
            """,
        )
        self.assertEqual(
            check_statechart(statechart),
            [
                "the statechart mentions the event `shop.v1.TimedOut`, which "
                "is not one of its `events`"
            ],
        )

    def test_an_event_a_call_may_inject_is_one_of_the_events(self) -> None:
        statechart = make_statechart(
            """
            events: "shop.v1.Paid"
            initial: "PENDING"
            transitions { on { event: "shop.v1.PaidInFull" } }
            states {
              name: "PENDING"
              transitions {
                on {
                  event: "shop.v1.Paid"
                  actions {
                    call {
                      description: "Record the payment"
                      inline {
                        method: "record_payment"
                        injects: "shop.v1.PaidInFull"
                      }
                    }
                  }
                }
              }
            }
            """,
        )
        self.assertEqual(
            check_statechart(statechart),
            [
                "the statechart mentions the event `shop.v1.PaidInFull`, "
                "which is not one of its `events`"
            ],
        )

    def test_an_event_a_schedule_may_enqueue_is_one_of_the_events(
        self,
    ) -> None:
        statechart = make_statechart(
            """
            initial: "SHIPPING"
            transitions { on { event: "shop.v1.Shipped" } }
            states {
              name: "SHIPPING"
              entry {
                schedule {
                  inline { method: "ship" enqueues: "shop.v1.Shipped" }
                  cancellable: false
                }
              }
            }
            """,
        )
        self.assertEqual(
            check_statechart(statechart),
            [
                "the statechart mentions the event `shop.v1.Shipped`, which "
                "is not one of its `events`"
            ],
        )

    def test_an_event_that_is_not_listed_is_a_problem_once(self) -> None:
        statechart = make_statechart(
            """
            initial: "PENDING"
            transitions { on { event: "shop.v1.Cancelled" to: "CANCELLED" } }
            states {
              name: "PENDING"
              transitions { on { event: "shop.v1.Cancelled" to: "CANCELLED" } }
            }
            states { name: "CANCELLED" }
            """,
        )
        self.assertEqual(
            check_statechart(statechart),
            [
                "the statechart mentions the event `shop.v1.Cancelled`, "
                "which is not one of its `events`"
            ],
        )

    def test_a_state_is_called_by_its_hierarchical_state_name(self) -> None:
        # Two states are named `WAITING`. The one with the problem is
        # the one within `FOO`.
        statechart = make_statechart(
            """
            initial: "FOO"
            states {
              name: "FOO"
              initial: "CREATING"
              states { name: "CREATING" }
              states {
                name: "WAITING"
                states { name: "PATIENTLY" }
              }
            }
            states {
              name: "BAR"
              initial: "WAITING"
              states { name: "WAITING" }
            }
            """,
        )
        self.assertEqual(
            check_statechart(statechart),
            ["state `FOO/WAITING` has states but no `initial`"],
        )

    def test_the_name_of_a_state_of_a_statechart_has_no_separator(
        self,
    ) -> None:
        statechart = make_statechart(
            """
            initial: "FOO/WAITING"
            states { name: "FOO/WAITING" }
            """,
        )
        self.assertEqual(
            check_statechart(statechart),
            [
                "the statechart has a state named 'FOO/WAITING', but a "
                "state's name cannot contain `/`"
            ],
        )

    def test_the_name_of_a_substate_has_no_separator(self) -> None:
        statechart = make_statechart(
            """
            initial: "FOO"
            states {
              name: "FOO"
              initial: "NOT/YET"
              states { name: "NOT/YET" }
            }
            """,
        )
        self.assertEqual(
            check_statechart(statechart),
            [
                "state `FOO` has a state named 'NOT/YET', but a state's name "
                "cannot contain `/`"
            ],
        )

    def test_states_without_a_name_are_one_problem(self) -> None:
        statechart = make_statechart(
            """
            initial: "PENDING"
            states { name: "PENDING" }
            states {}
            states {}
            """,
        )
        self.assertEqual(
            check_statechart(statechart),
            ["the statechart has a state without a `name`"],
        )

    def test_a_to_that_is_a_hierarchical_state_name_has_no_problems(
        self,
    ) -> None:
        statechart = make_statechart(
            """
            events: "shop.v1.Created"
            events: "shop.v1.Finished"
            initial: "FOO"
            states {
              name: "FOO"
              initial: "CREATING"
              states {
                name: "CREATING"
                transitions {
                  on { event: "shop.v1.Created" to: "FOO/WAITING" }
                }
              }
              states {
                name: "WAITING"
                transitions { on { event: "shop.v1.Finished" to: "BAR" } }
              }
            }
            states { name: "BAR" }
            """,
        )
        self.assertEqual(check_statechart(statechart), [])

    def test_a_to_is_not_just_the_name_of_a_substate(self) -> None:
        # `WAITING` is within `FOO`, so it is `FOO/WAITING`, also for a
        # transition of another state within `FOO`.
        statechart = make_statechart(
            """
            events: "shop.v1.Created"
            initial: "FOO"
            states {
              name: "FOO"
              initial: "CREATING"
              states {
                name: "CREATING"
                transitions { on { event: "shop.v1.Created" to: "WAITING" } }
              }
              states { name: "WAITING" }
            }
            """,
        )
        self.assertEqual(
            check_statechart(statechart),
            [
                "`to: \"WAITING\"` of an `on` transition of state "
                "`FOO/CREATING` is not the hierarchical state name of a state"
            ],
        )

    def test_a_to_of_an_on_is_a_state(self) -> None:
        statechart = make_statechart(
            """
            events: "shop.v1.Paid"
            initial: "PENDING"
            states {
              name: "PENDING"
              transitions { on { event: "shop.v1.Paid" to: "SHIPING" } }
            }
            states { name: "SHIPPING" }
            """,
        )
        self.assertEqual(
            check_statechart(statechart),
            [
                "`to: \"SHIPING\"` of an `on` transition of state `PENDING` "
                "is not the hierarchical state name of a state"
            ],
        )

    def test_a_to_of_a_when_is_a_state(self) -> None:
        statechart = make_statechart(
            """
            initial: "PENDING"
            transitions {
              when {
                description: "Cancelled"
                condition { inline { method: "is_cancelled" } }
                to: "CANCELED"
              }
            }
            states { name: "PENDING" }
            states { name: "CANCELLED" }
            """,
        )
        self.assertEqual(
            check_statechart(statechart),
            [
                "`to: \"CANCELED\"` of a `when` transition of the "
                "statechart is not the hierarchical state name of a state"
            ],
        )

    def test_a_transition_without_a_to_has_no_problems(self) -> None:
        statechart = make_statechart(
            """
            events: "shop.v1.Paid"
            initial: "PENDING"
            states {
              name: "PENDING"
              transitions { on { event: "shop.v1.Paid" } }
            }
            """,
        )
        self.assertEqual(check_statechart(statechart), [])

    def test_an_injected_event_has_an_on(self) -> None:
        statechart = make_statechart(
            """
            events: "shop.v1.Left"
            initial: "PENDING"
            states {
              name: "PENDING"
              exit { inject { event: "shop.v1.Left" } }
            }
            """,
        )
        self.assertEqual(
            check_statechart(statechart),
            [
                "the statechart injects or enqueues the event "
                "`shop.v1.Left`, but has no `on` transition for it"
            ],
        )

    def test_an_event_a_timer_enqueues_has_an_on(self) -> None:
        statechart = make_statechart(
            """
            events: "shop.v1.TimedOut"
            initial: "PENDING"
            states {
              name: "PENDING"
              entry {
                timer { minutes: 30 enqueue { event: "shop.v1.TimedOut" } }
              }
            }
            """,
        )
        self.assertEqual(
            check_statechart(statechart),
            [
                "the statechart injects or enqueues the event "
                "`shop.v1.TimedOut`, but has no `on` transition for it"
            ],
        )

    def test_an_event_a_call_may_inject_has_an_on(self) -> None:
        statechart = make_statechart(
            """
            events: "shop.v1.Paid"
            events: "shop.v1.PaidInFull"
            initial: "PENDING"
            states {
              name: "PENDING"
              transitions {
                on {
                  event: "shop.v1.Paid"
                  actions {
                    call {
                      description: "Record the payment"
                      inline {
                        method: "record_payment"
                        injects: "shop.v1.PaidInFull"
                      }
                    }
                  }
                }
              }
            }
            """,
        )
        self.assertEqual(
            check_statechart(statechart),
            [
                "the statechart injects or enqueues the event "
                "`shop.v1.PaidInFull`, but has no `on` transition for it"
            ],
        )

    def test_an_event_a_schedule_may_enqueue_has_an_on(self) -> None:
        statechart = make_statechart(
            """
            events: "shop.v1.Shipped"
            initial: "SHIPPING"
            states {
              name: "SHIPPING"
              entry {
                schedule {
                  inline { method: "ship" enqueues: "shop.v1.Shipped" }
                  cancellable: false
                }
              }
            }
            """,
        )
        self.assertEqual(
            check_statechart(statechart),
            [
                "the statechart injects or enqueues the event "
                "`shop.v1.Shipped`, but has no `on` transition for it"
            ],
        )

    def test_an_on_of_any_state_is_an_on_for_an_event(self) -> None:
        # `PENDING` enqueues `shop.v1.TimedOut` and `EXPIRING`, a state
        # within another state, has the `on` transition for it.
        statechart = make_statechart(
            """
            events: "shop.v1.TimedOut"
            events: "shop.v1.Closed"
            initial: "PENDING"
            states {
              name: "PENDING"
              entry {
                timer { minutes: 30 enqueue { event: "shop.v1.TimedOut" } }
              }
              transitions { on { event: "shop.v1.Closed" to: "CLOSING" } }
            }
            states {
              name: "CLOSING"
              initial: "EXPIRING"
              states {
                name: "EXPIRING"
                transitions { on { event: "shop.v1.TimedOut" } }
              }
            }
            """,
        )
        self.assertEqual(check_statechart(statechart), [])

    def test_an_event_without_an_on_is_a_problem_once(self) -> None:
        statechart = make_statechart(
            """
            events: "shop.v1.Left"
            initial: "PENDING"
            states {
              name: "PENDING"
              exit { inject { event: "shop.v1.Left" } }
            }
            states {
              name: "SHIPPING"
              exit { inject { event: "shop.v1.Left" } }
            }
            """,
        )
        self.assertEqual(
            check_statechart(statechart),
            [
                "the statechart injects or enqueues the event "
                "`shop.v1.Left`, but has no `on` transition for it"
            ],
        )

    def test_a_method_is_not_both_a_guard_and_a_call(self) -> None:
        statechart = make_statechart(
            """
            events: "shop.v1.Paid"
            initial: "PENDING"
            states {
              name: "PENDING"
              transitions {
                on {
                  event: "shop.v1.Paid"
                  guard { inline { method: "pay" } }
                  actions {
                    call {
                      description: "Record the payment"
                      inline { method: "pay" }
                    }
                  }
                }
              }
            }
            """,
        )
        self.assertEqual(
            check_statechart(statechart),
            ["the method `pay` is both a `guard` and a `call`"],
        )

    def test_a_call_is_not_both_given_the_event_and_given_no_event(
        self,
    ) -> None:
        # `record` is an action of an `on`, which is given the event,
        # and an `entry`, which is given no event. `close` is an
        # `entry`, an `exit` and an action of a `when`, none of which
        # is given an event.
        statechart = make_statechart(
            """
            events: "shop.v1.Paid"
            initial: "PENDING"
            states {
              name: "PENDING"
              exit {
                call { description: "Close" inline { method: "close" } }
              }
              transitions {
                on {
                  event: "shop.v1.Paid"
                  actions {
                    call {
                      description: "Record the payment"
                      inline { method: "record" }
                    }
                  }
                  to: "PAID"
                }
              }
              transitions {
                when {
                  description: "Cancelled"
                  condition { inline { method: "is_cancelled" } }
                  actions {
                    call { description: "Close" inline { method: "close" } }
                  }
                  to: "PAID"
                }
              }
            }
            states {
              name: "PAID"
              entry {
                call { description: "Record" inline { method: "record" } }
              }
              entry {
                call { description: "Close" inline { method: "close" } }
              }
            }
            """,
        )
        self.assertEqual(
            check_statechart(statechart),
            [
                "the method `record` is a `call` of an `on` transition, "
                "which is given the event, and a `call` of an `entry`, an "
                "`exit` or a `when` transition, which is given no event",
            ],
        )

    def test_a_method_is_not_both_a_condition_and_a_schedule(self) -> None:
        # The `condition` is of the statechart and the `schedule` is of
        # a state within a state.
        statechart = make_statechart(
            """
            initial: "OPEN"
            transitions {
              when {
                description: "Shipped"
                condition { inline { method: "ship" } }
              }
            }
            states {
              name: "OPEN"
              initial: "SHIPPING"
              states {
                name: "SHIPPING"
                entry {
                  schedule {
                    inline { method: "ship" }
                    cancellable: false
                  }
                }
              }
            }
            """,
        )
        self.assertEqual(
            check_statechart(statechart),
            ["the method `ship` is both a `condition` and a `schedule`"],
        )

    def test_a_method_named_in_three_ways_is_a_problem_for_each_two(
        self,
    ) -> None:
        statechart = make_statechart(
            """
            events: "shop.v1.Paid"
            initial: "PENDING"
            states {
              name: "PENDING"
              entry { call { description: "Check" inline { method: "check" } } }
              exit { call { description: "Check" inline { method: "check" } } }
              transitions {
                on {
                  event: "shop.v1.Paid"
                  guard { inline { method: "check" } }
                }
              }
              transitions {
                when {
                  description: "Checked"
                  condition { inline { method: "check" } }
                }
              }
            }
            """,
        )
        self.assertEqual(
            check_statechart(statechart),
            [
                "the method `check` is both a `condition` and a `guard`",
                "the method `check` is both a `condition` and a `call`",
                "the method `check` is both a `guard` and a `call`",
            ],
        )

    def test_a_method_named_by_two_calls_has_no_problems(self) -> None:
        statechart = make_statechart(
            """
            initial: "PENDING"
            states {
              name: "PENDING"
              entry {
                call { description: "Notify" inline { method: "notify" } }
              }
              exit {
                call { description: "Notify" inline { method: "notify" } }
              }
            }
            """,
        )
        self.assertEqual(check_statechart(statechart), [])

    def test_a_method_named_by_two_guards_has_no_problems(self) -> None:
        statechart = make_statechart(
            """
            events: "shop.v1.Paid"
            events: "shop.v1.Refunded"
            initial: "PENDING"
            states {
              name: "PENDING"
              transitions {
                on {
                  event: "shop.v1.Paid"
                  guard { inline { method: "is_open" } }
                }
              }
              transitions {
                on {
                  event: "shop.v1.Refunded"
                  guard { inline { method: "is_open" } }
                }
              }
            }
            """,
        )
        self.assertEqual(check_statechart(statechart), [])

    def test_a_state_that_nothing_leads_to_is_unreachable(self) -> None:
        statechart = make_statechart(
            """
            events: "shop.v1.Paid"
            events: "shop.v1.Packed"
            initial: "PENDING"
            states {
              name: "PENDING"
              transitions { on { event: "shop.v1.Paid" to: "SHIPPED" } }
            }
            states {
              name: "PACKING"
              transitions { on { event: "shop.v1.Packed" to: "SHIPPED" } }
            }
            states { name: "SHIPPED" final: true }
            """,
        )
        self.assertEqual(
            check_statechart(statechart),
            [
                "state `PACKING` is unreachable: no `initial` and no "
                "transition that can fire leads to it",
            ],
        )

    def test_a_state_is_reachable_through_each_initial(self) -> None:
        # `OPEN` is the `initial` of the statechart, `OPEN/PAYING` that
        # of `OPEN`, and `OPEN/PAYING/WAITING` that of `OPEN/PAYING`.
        statechart = make_statechart(
            """
            initial: "OPEN"
            states {
              name: "OPEN"
              initial: "PAYING"
              states {
                name: "PAYING"
                initial: "WAITING"
                states { name: "WAITING" }
              }
            }
            """,
        )
        self.assertEqual(check_statechart(statechart), [])

    def test_going_to_a_state_reaches_those_it_is_within(self) -> None:
        # Going to `CLOSED/REFUNDING` reaches `CLOSED`, but never
        # `CLOSED/ARCHIVING`, the `initial` of `CLOSED`.
        statechart = make_statechart(
            """
            events: "shop.v1.Cancelled"
            initial: "PENDING"
            states {
              name: "PENDING"
              transitions {
                on { event: "shop.v1.Cancelled" to: "CLOSED/REFUNDING" }
              }
            }
            states {
              name: "CLOSED"
              initial: "ARCHIVING"
              states { name: "ARCHIVING" }
              states { name: "REFUNDING" }
            }
            """,
        )
        self.assertEqual(
            check_statechart(statechart),
            [
                "state `CLOSED/ARCHIVING` is unreachable: no `initial` and no "
                "transition that can fire leads to it",
            ],
        )

    def test_a_transition_of_an_unreachable_state_leads_nowhere(
        self,
    ) -> None:
        # Only `PACKING` goes to `SHIPPED`, and nothing leads to
        # `PACKING`.
        statechart = make_statechart(
            """
            events: "shop.v1.Packed"
            initial: "PENDING"
            states { name: "PENDING" }
            states {
              name: "PACKING"
              transitions { on { event: "shop.v1.Packed" to: "SHIPPED" } }
            }
            states { name: "SHIPPED" }
            """,
        )
        self.assertEqual(
            check_statechart(statechart),
            [
                "state `PACKING` is unreachable: no `initial` and no "
                "transition that can fire leads to it",
                "state `SHIPPED` is unreachable: no `initial` and no "
                "transition that can fire leads to it",
            ],
        )

    def test_a_state_within_an_unreachable_state_is_unreachable(
        self,
    ) -> None:
        statechart = make_statechart(
            """
            initial: "PENDING"
            states { name: "PENDING" }
            states {
              name: "CLOSED"
              initial: "ARCHIVING"
              states { name: "ARCHIVING" }
            }
            """,
        )
        self.assertEqual(
            check_statechart(statechart),
            [
                "state `CLOSED` is unreachable: no `initial` and no "
                "transition that can fire leads to it",
                "state `CLOSED/ARCHIVING` is unreachable: no `initial` and "
                "no transition that can fire leads to it",
            ],
        )

    def test_a_transition_of_the_statechart_leads_to_a_state(self) -> None:
        statechart = make_statechart(
            """
            initial: "PENDING"
            transitions {
              when {
                description: "Cancelled"
                condition { inline { method: "is_cancelled" } }
                to: "CANCELLED"
              }
            }
            states { name: "PENDING" }
            states { name: "CANCELLED" final: true }
            """,
        )
        self.assertEqual(check_statechart(statechart), [])

    def test_a_final_state_inherits_no_transition_of_the_statechart(
        self,
    ) -> None:
        # The statechart is only ever in `DONE`, which is final, so its
        # `when` transition never fires.
        statechart = make_statechart(
            """
            initial: "DONE"
            transitions {
              when {
                description: "Cancelled"
                condition { inline { method: "is_cancelled" } }
                to: "CANCELLED"
              }
            }
            states { name: "DONE" final: true }
            states { name: "CANCELLED" final: true }
            """,
        )
        self.assertEqual(
            check_statechart(statechart),
            [
                "state `CANCELLED` is unreachable: no `initial` and no "
                "transition that can fire leads to it",
            ],
        )

    def test_a_final_state_inherits_no_transition_of_a_state(self) -> None:
        # `CLOSED` is only ever in `CLOSED/ARCHIVED`, which is final,
        # so the `on` transition of `CLOSED` never fires.
        statechart = make_statechart(
            """
            events: "shop.v1.Reopened"
            initial: "CLOSED"
            states {
              name: "CLOSED"
              initial: "ARCHIVED"
              states { name: "ARCHIVED" final: true }
              transitions { on { event: "shop.v1.Reopened" to: "OPEN" } }
            }
            states { name: "OPEN" }
            """,
        )
        self.assertEqual(
            check_statechart(statechart),
            [
                "state `OPEN` is unreachable: no `initial` and no "
                "transition that can fire leads to it",
            ],
        )

    def test_the_method_of_a_guard_is_in_snake_case(self) -> None:
        statechart = make_statechart(
            """
            events: "shop.v1.Paid"
            initial: "PENDING"
            states {
              name: "PENDING"
              transitions {
                on {
                  event: "shop.v1.Paid"
                  guard { inline { method: "IsPaidInFull" } }
                }
              }
            }
            """,
        )
        self.assertEqual(
            check_statechart(statechart),
            [
                "the `guard` of an `on` transition of state `PENDING` has "
                "the method `IsPaidInFull`, which is not in snake case, as "
                "`is_paid_in_full` is",
            ],
        )

    def test_the_method_of_a_condition_is_in_snake_case(self) -> None:
        statechart = make_statechart(
            """
            initial: "PENDING"
            transitions {
              when {
                description: "Cancelled"
                condition { inline { method: "isCancelled" } }
              }
            }
            states { name: "PENDING" }
            """,
        )
        self.assertEqual(
            check_statechart(statechart),
            [
                "the `condition` of a `when` transition of the statechart "
                "has the method `isCancelled`, which is not in snake case, "
                "as `is_paid_in_full` is",
            ],
        )

    def test_the_method_of_a_call_is_in_snake_case(self) -> None:
        # A name in snake case starts with a letter.
        statechart = make_statechart(
            """
            initial: "PENDING"
            states {
              name: "PENDING"
              entry {
                call { description: "Open" inline { method: "2nd_open" } }
              }
            }
            """,
        )
        self.assertEqual(
            check_statechart(statechart),
            [
                "in an `entry` of state `PENDING`: the `call` has the "
                "method `2nd_open`, which is not in snake case, as "
                "`is_paid_in_full` is",
            ],
        )

    def test_the_method_of_a_schedule_is_in_snake_case(self) -> None:
        statechart = make_statechart(
            """
            initial: "SHIPPING"
            states {
              name: "SHIPPING"
              entry {
                schedule {
                  inline { method: "ship__order" }
                  cancellable: false
                }
              }
            }
            """,
        )
        self.assertEqual(
            check_statechart(statechart),
            [
                "in an `entry` of state `SHIPPING`: the `schedule` has the "
                "method `ship__order`, which is not in snake case, as "
                "`is_paid_in_full` is",
            ],
        )

    def test_a_method_is_not_a_python_keyword(self) -> None:
        statechart = make_statechart(
            """
            initial: "PENDING"
            states {
              name: "PENDING"
              entry { call { description: "Pass" inline { method: "pass" } } }
            }
            """,
        )
        self.assertEqual(
            check_statechart(statechart),
            [
                "in an `entry` of state `PENDING`: the `call` has the "
                "method `pass`, which is a Python keyword",
            ],
        )

    def test_methods_in_snake_case_have_no_problems(self) -> None:
        statechart = make_statechart(
            """
            events: "shop.v1.Paid"
            initial: "PENDING"
            transitions {
              when {
                description: "Cancelled"
                condition { inline { method: "is_cancelled" } }
              }
            }
            states {
              name: "PENDING"
              entry {
                schedule {
                  inline { method: "remind_after_2_days" }
                  cancellable: false
                }
              }
              transitions {
                on {
                  event: "shop.v1.Paid"
                  guard { inline { method: "is_paid_in_full" } }
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
        self.assertEqual(check_statechart(statechart), [])

    def test_every_problem_is_returned(self) -> None:
        statechart = make_statechart(
            """
            states {
              name: "OPEN"
              states { name: "PENDING" }
            }
            """,
        )
        self.assertEqual(
            check_statechart(statechart),
            [
                "the statechart has states but no `initial`",
                "state `OPEN` has states but no `initial`",
            ],
        )


if __name__ == "__main__":
    unittest.main()
