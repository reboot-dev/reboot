import inspect
import unittest
from tests.reboot.statecharts import order_pb2
from tests.reboot.statecharts.order_rbt import Order


class ServicerTest(unittest.TestCase):
    """Tests the methods that a servicer has for the statechart of its
    state. The statechart is that of `Order` in `order.proto`: the
    guard `is_settled` is on a transition on `Paid` and on one on
    `Refunded`, and `is_cancelled` is a condition."""

    def test_servicer_implements_guard_and_condition(self) -> None:

        class OrderServicer(Order.Servicer):

            def is_settled(
                self,
                state: Order.State,
                event: order_pb2.Paid | order_pb2.Refunded,
            ) -> bool:
                return event.cents >= state.owed_cents

            def is_cancelled(self, state: Order.State) -> bool:
                return state.cancelled

        servicer = OrderServicer()

        self.assertTrue(
            servicer.is_settled(
                Order.State(owed_cents=500),
                order_pb2.Paid(cents=500),
            ),
        )
        self.assertFalse(
            servicer.is_settled(
                Order.State(owed_cents=500),
                order_pb2.Refunded(cents=200),
            ),
        )
        self.assertTrue(servicer.is_cancelled(Order.State(cancelled=True)))
        self.assertFalse(servicer.is_cancelled(Order.State()))

    def test_guard_takes_state_and_each_event_it_is_for(self) -> None:
        # The generated code defers the evaluation of its annotations,
        # so each is the string that was generated.
        parameters = inspect.signature(Order.Servicer.is_settled).parameters

        self.assertEqual(["self", "state", "event"], list(parameters))
        self.assertEqual("Order.State", parameters["state"].annotation)
        self.assertEqual(
            "tests.reboot.statecharts.order_pb2.Paid | "
            "tests.reboot.statecharts.order_pb2.Refunded",
            parameters["event"].annotation,
        )

    def test_condition_takes_state(self) -> None:
        parameters = inspect.signature(
            Order.Servicer.is_cancelled,
        ).parameters

        self.assertEqual(["self", "state"], list(parameters))
        self.assertEqual("Order.State", parameters["state"].annotation)

    def test_servicer_without_guard_is_not_instantiated(self) -> None:

        class OrderServicer(Order.Servicer):

            def is_cancelled(self, state: Order.State) -> bool:
                return state.cancelled

        with self.assertRaises(TypeError) as raised:
            OrderServicer()  # type: ignore[abstract]

        self.assertIn("is_settled", str(raised.exception))

    def test_servicer_without_condition_is_not_instantiated(self) -> None:

        class OrderServicer(Order.Servicer):

            def is_settled(
                self,
                state: Order.State,
                event: order_pb2.Paid | order_pb2.Refunded,
            ) -> bool:
                return event.cents >= state.owed_cents

        with self.assertRaises(TypeError) as raised:
            OrderServicer()  # type: ignore[abstract]

        self.assertIn("is_cancelled", str(raised.exception))


if __name__ == "__main__":
    unittest.main()
