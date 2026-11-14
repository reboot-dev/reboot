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
