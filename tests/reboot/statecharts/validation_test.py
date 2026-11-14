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
            initial: "OPEN"
            states {
              name: "OPEN"
              initial: "PENDING"
              states { name: "PENDING" }
              states { name: "SHIPPING" }
            }
            states { name: "SHIPPED" }
            """
        )
        self.assertEqual(check_statechart(statechart), [])

    def test_a_statechart_with_states_has_an_initial(self) -> None:
        statechart = make_statechart(
            """
            states { name: "PENDING" }
            states { name: "SHIPPED" }
            """
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
            """
        )
        self.assertEqual(
            check_statechart(statechart),
            ["state 'OPEN' has states but no `initial`"],
        )

    def test_an_initial_is_one_of_the_states(self) -> None:
        statechart = make_statechart(
            """
            initial: "PENDNG"
            states { name: "PENDING" }
            states { name: "SHIPPED" }
            """
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
            """
        )
        self.assertEqual(
            check_statechart(statechart),
            [
                "`initial: \"SHIPPED\"` of state 'OPEN' is not one of its "
                "states"
            ],
        )

    def test_a_state_without_states_has_no_initial(self) -> None:
        statechart = make_statechart(
            """
            initial: "PENDING"
            states { name: "PENDING" initial: "NEW" }
            """
        )
        self.assertEqual(
            check_statechart(statechart),
            ['state \'PENDING\' has `initial: "NEW"` but no states'],
        )

    def test_a_state_has_a_name(self) -> None:
        statechart = make_statechart(
            """
            initial: "PENDING"
            states { name: "PENDING" }
            states {}
            """
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
            """
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
            """
        )
        self.assertEqual(
            check_statechart(statechart),
            ["state 'OPEN' has more than one state named 'PENDING'"],
        )

    def test_states_that_are_not_siblings_can_share_a_name(self) -> None:
        statechart = make_statechart(
            """
            initial: "OPEN"
            states {
              name: "OPEN"
              initial: "WAITING"
              states { name: "WAITING" }
            }
            states {
              name: "CLOSED"
              initial: "WAITING"
              states { name: "WAITING" }
            }
            """
        )
        self.assertEqual(check_statechart(statechart), [])

    def test_transitions_that_are_an_on_or_a_when_have_no_problems(
        self
    ) -> None:
        statechart = make_statechart(
            """
            events: "shop.v1.Paid"
            initial: "PENDING"
            transitions {
              when {
                description: "Cancelled"
                condition { inline { method: "IsCancelled" } }
                to: "CANCELLED"
              }
            }
            states {
              name: "PENDING"
              transitions { on { event: "shop.v1.Paid" to: "SHIPPED" } }
            }
            states { name: "SHIPPED" }
            states { name: "CANCELLED" }
            """
        )
        self.assertEqual(check_statechart(statechart), [])

    def test_a_transition_of_a_statechart_is_an_on_or_a_when(self) -> None:
        statechart = make_statechart(
            """
            initial: "PENDING"
            transitions {}
            states { name: "PENDING" }
            """
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
            """
        )
        self.assertEqual(
            check_statechart(statechart),
            [
                "a transition of state 'PENDING' is neither an `on` nor a "
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
            """
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
            """
        )
        self.assertEqual(
            check_statechart(statechart),
            ["an `on` transition of state 'PENDING' has no `event`"],
        )

    def test_a_when_of_a_statechart_has_a_description(self) -> None:
        statechart = make_statechart(
            """
            initial: "PENDING"
            transitions {
              when {
                condition { inline { method: "IsCancelled" } }
                to: "CANCELLED"
              }
            }
            states { name: "PENDING" }
            states { name: "CANCELLED" }
            """
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
                  condition { inline { method: "IsPaid" } }
                  to: "SHIPPED"
                }
              }
            }
            states { name: "SHIPPED" }
            """
        )
        self.assertEqual(
            check_statechart(statechart),
            ["a `when` transition of state 'PENDING' has no `description`"],
        )

    def test_a_when_of_a_statechart_has_a_condition(self) -> None:
        statechart = make_statechart(
            """
            initial: "PENDING"
            transitions { when { description: "Cancelled" to: "CANCELLED" } }
            states { name: "PENDING" }
            states { name: "CANCELLED" }
            """
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
            """
        )
        self.assertEqual(
            check_statechart(statechart),
            ["a `when` transition of state 'PENDING' has no `condition`"],
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
            """
        )
        self.assertEqual(
            check_statechart(statechart),
            [
                "the `condition` of a `when` transition of state 'PENDING' "
                "has no `method`"
            ],
        )

    def test_an_on_with_a_guard_that_has_a_method_has_no_problems(
        self
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
                  guard { inline { method: "PaidInFull" } }
                  to: "SHIPPED"
                }
              }
            }
            states { name: "SHIPPED" }
            """
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
            """
        )
        self.assertEqual(
            check_statechart(statechart),
            [
                "the `guard` of an `on` transition of state 'PENDING' has no "
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
            """
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
            entry {
              call { description: "Open" inline { method: "Open" } }
            }
            states {
              name: "PENDING"
              entry { inject { event: "shop.v1.Opened" } }
              entry {
                timer { minutes: 30 enqueue { event: "shop.v1.TimedOut" } }
              }
              entry { schedule { inline { method: "Remind" } } }
            }
            """
        )
        self.assertEqual(check_statechart(statechart), [])

    def test_an_entry_of_a_statechart_says_what_it_does(self) -> None:
        statechart = make_statechart(
            """
            initial: "PENDING"
            entry {}
            states { name: "PENDING" }
            """
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
            """
        )
        self.assertEqual(
            check_statechart(statechart),
            [
                "an `entry` of state 'PENDING' is neither a `call`, an "
                "`inject`, a `schedule` nor a `timer`"
            ],
        )

    def test_exits_that_say_what_they_do_have_no_problems(self) -> None:
        statechart = make_statechart(
            """
            events: "shop.v1.Left"
            initial: "PENDING"
            exit {
              call { description: "Close" inline { method: "Close" } }
            }
            states {
              name: "PENDING"
              exit { inject { event: "shop.v1.Left" } }
            }
            """
        )
        self.assertEqual(check_statechart(statechart), [])

    def test_an_exit_of_a_statechart_says_what_it_does(self) -> None:
        statechart = make_statechart(
            """
            initial: "PENDING"
            exit {}
            states { name: "PENDING" }
            """
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
            """
        )
        self.assertEqual(
            check_statechart(statechart),
            [
                "an `exit` of state 'PENDING' is neither a `call` nor an "
                "`inject`"
            ],
        )

    def test_actions_that_say_what_they_do_have_no_problems(self) -> None:
        statechart = make_statechart(
            """
            events: "shop.v1.Refunded"
            events: "shop.v1.Paid"
            initial: "PENDING"
            transitions {
              when {
                description: "Cancelled"
                condition { inline { method: "IsCancelled" } }
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
                      inline { method: "RecordPayment" }
                    }
                  }
                }
              }
            }
            states { name: "CANCELLED" }
            """
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
            """
        )
        self.assertEqual(
            check_statechart(statechart),
            [
                "an action of an `on` transition of state 'PENDING' is "
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
                condition { inline { method: "IsCancelled" } }
                to: "CANCELLED"
                actions {}
              }
            }
            states { name: "PENDING" }
            states { name: "CANCELLED" }
            """
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
              entry { call { inline { method: "Open" } } }
            }
            """
        )
        self.assertEqual(
            check_statechart(statechart),
            [
                "in an `entry` of state 'PENDING': the `call` has no "
                "`description`"
            ],
        )

    def test_a_call_in_an_exit_has_a_description(self) -> None:
        statechart = make_statechart(
            """
            initial: "PENDING"
            exit { call { description: " " inline { method: "Close" } } }
            states { name: "PENDING" }
            """
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
                  actions { call { inline { method: "RecordPayment" } } }
                }
              }
            }
            states { name: "SHIPPED" }
            """
        )
        self.assertEqual(
            check_statechart(statechart),
            [
                "in an `on` transition of state 'PENDING': the `call` has no "
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
                condition { inline { method: "IsCancelled" } }
                to: "CANCELLED"
                actions { call { inline { method: "Refund" } } }
              }
            }
            states { name: "PENDING" }
            states { name: "CANCELLED" }
            """
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
            """
        )
        self.assertEqual(
            check_statechart(statechart),
            ["in an `entry` of state 'PENDING': the `call` has no `method`"],
        )

    def test_a_call_that_says_nothing_of_how_has_no_method(self) -> None:
        statechart = make_statechart(
            """
            initial: "PENDING"
            exit { call { description: "Close" } }
            states { name: "PENDING" }
            """
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
            """
        )
        self.assertEqual(
            check_statechart(statechart),
            ["in an `entry` of state 'PENDING': the `inject` has no `event`"],
        )

    def test_an_inject_in_an_exit_has_an_event(self) -> None:
        statechart = make_statechart(
            """
            initial: "PENDING"
            exit { inject {} }
            states { name: "PENDING" }
            """
        )
        self.assertEqual(
            check_statechart(statechart),
            ["in an `exit` of the statechart: the `inject` has no `event`"],
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
            """
        )
        self.assertEqual(
            check_statechart(statechart),
            [
                "in an `on` transition of state 'PENDING': the `inject` has "
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
                condition { inline { method: "IsCancelled" } }
                to: "CANCELLED"
                actions { inject {} }
              }
            }
            states { name: "PENDING" }
            states { name: "CANCELLED" }
            """
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
              entry { schedule { inline {} } }
            }
            """
        )
        self.assertEqual(
            check_statechart(statechart),
            [
                "in an `entry` of state 'SHIPPING': the `schedule` has no "
                "`method`"
            ],
        )

    def test_a_schedule_that_says_nothing_of_how_has_no_method(self) -> None:
        statechart = make_statechart(
            """
            initial: "SHIPPING"
            entry { schedule {} }
            states { name: "SHIPPING" }
            """
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
            """
        )
        self.assertEqual(
            check_statechart(statechart),
            [
                "in an `entry` of state 'PENDING': the `timer` has no event "
                "to `enqueue`"
            ],
        )

    def test_an_enqueue_without_an_event_is_no_event(self) -> None:
        statechart = make_statechart(
            """
            initial: "PENDING"
            entry { timer { minutes: 30 enqueue {} } }
            states { name: "PENDING" }
            """
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
            states {
              name: "PENDING"
              entry { timer { enqueue { event: "shop.v1.TimedOut" } } }
            }
            """
        )
        self.assertEqual(
            check_statechart(statechart),
            [
                "in an `entry` of state 'PENDING': the `timer` has no delay: "
                "its `seconds`, `minutes`, `hours` and `days` must add up to "
                "more than zero"
            ],
        )

    def test_the_delay_of_a_timer_is_a_sum(self) -> None:
        statechart = make_statechart(
            """
            events: "shop.v1.TimedOut"
            initial: "PENDING"
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
            """
        )
        self.assertEqual(check_statechart(statechart), [])

    def test_a_delay_of_zero_is_no_delay(self) -> None:
        statechart = make_statechart(
            """
            events: "shop.v1.TimedOut"
            initial: "PENDING"
            states {
              name: "PENDING"
              entry {
                timer { seconds: 0 enqueue { event: "shop.v1.TimedOut" } }
              }
            }
            """
        )
        self.assertEqual(
            check_statechart(statechart),
            [
                "in an `entry` of state 'PENDING': the `timer` has no delay: "
                "its `seconds`, `minutes`, `hours` and `days` must add up to "
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
                call { description: "Thank" inline { method: "Thank" } }
              }
            }
            """
        )
        self.assertEqual(check_statechart(statechart), [])

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
            """
        )
        self.assertEqual(
            check_statechart(statechart),
            ["state 'CANCELLED' is final and cannot have transitions"],
        )

    def test_a_final_state_has_no_schedule_or_timer(self) -> None:
        statechart = make_statechart(
            """
            events: "shop.v1.TimedOut"
            initial: "CANCELLED"
            states {
              name: "CANCELLED"
              final: true
              entry {
                timer { days: 1 enqueue { event: "shop.v1.TimedOut" } }
              }
            }
            """
        )
        self.assertEqual(
            check_statechart(statechart),
            [
                "state 'CANCELLED' is final and cannot have a `schedule` or "
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
            """
        )
        self.assertEqual(
            check_statechart(statechart),
            ["state 'CLOSED' is final and cannot have states"],
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
            """
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
            states {
              name: "PENDING"
              exit { inject { event: "shop.v1.Left" } }
            }
            """
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
            states {
              name: "PENDING"
              entry {
                timer { minutes: 30 enqueue { event: "shop.v1.TimedOut" } }
              }
            }
            """
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
            states {
              name: "PENDING"
              transitions {
                on {
                  event: "shop.v1.Paid"
                  actions {
                    call {
                      description: "Record the payment"
                      inline {
                        method: "RecordPayment"
                        injects: "shop.v1.PaidInFull"
                      }
                    }
                  }
                }
              }
            }
            """
        )
        self.assertEqual(
            check_statechart(statechart),
            [
                "the statechart mentions the event `shop.v1.PaidInFull`, "
                "which is not one of its `events`"
            ],
        )

    def test_an_event_a_schedule_may_enqueue_is_one_of_the_events(
        self
    ) -> None:
        statechart = make_statechart(
            """
            initial: "SHIPPING"
            states {
              name: "SHIPPING"
              entry {
                schedule {
                  inline { method: "Ship" enqueues: "shop.v1.Shipped" }
                }
              }
            }
            """
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
            """
        )
        self.assertEqual(
            check_statechart(statechart),
            [
                "the statechart mentions the event `shop.v1.Cancelled`, "
                "which is not one of its `events`"
            ],
        )

    def test_every_problem_is_returned(self) -> None:
        statechart = make_statechart(
            """
            states {
              name: "OPEN"
              states { name: "PENDING" }
            }
            """
        )
        self.assertEqual(
            check_statechart(statechart),
            [
                "the statechart has states but no `initial`",
                "state 'OPEN' has states but no `initial`",
            ],
        )


if __name__ == "__main__":
    unittest.main()
