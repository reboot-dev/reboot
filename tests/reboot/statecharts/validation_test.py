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
