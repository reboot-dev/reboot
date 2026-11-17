import inspect
import unittest
from tests.reboot.statecharts import order_pb2
from tests.reboot.statecharts.order_rbt import Order
from typing import Optional


class OrderServicer(Order.Servicer):

    def is_settled(
        self,
        state: Order.State,
        event: order_pb2.Paid | order_pb2.Refunded,
    ) -> bool:
        return event.cents >= state.owed_cents

    def is_cancelled(self, state: Order.State) -> bool:
        return state.cancelled

    def record_payment(
        self,
        state: Order.State,
        event: order_pb2.Paid,
    ) -> Optional[order_pb2.Settled]:
        state.owed_cents -= event.cents
        if state.owed_cents == 0:
            return order_pb2.Settled()
        return None

    def void(self, state: Order.State) -> None:
        state.owed_cents = 0

    def send_receipt(self, state: Order.State) -> None:
        state.receipt_sent = True

    def stop_reminders(self, state: Order.State) -> None:
        pass


class ServicerTest(unittest.TestCase):
    """Tests the methods that a servicer has for the statechart of its
    state. The statechart is that of `Order` in `order.proto`: the
    guard `is_settled` is on a transition on `Paid` and on one on
    `Refunded`, and `is_cancelled` is a condition. Of its calls,
    `record_payment` is an action of a transition on `Paid` and
    injects `Settled`, `void` is an action of a `when` transition,
    `send_receipt` is an `entry` and `stop_reminders` is an `exit`."""

    def test_servicer_implements_methods_of_statechart(self) -> None:
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

        state = Order.State(owed_cents=500)
        self.assertIsNone(
            servicer.record_payment(state, order_pb2.Paid(cents=200)),
        )
        self.assertEqual(300, state.owed_cents)
        self.assertEqual(
            order_pb2.Settled(),
            servicer.record_payment(state, order_pb2.Paid(cents=300)),
        )
        self.assertEqual(0, state.owed_cents)

        servicer.send_receipt(state)
        self.assertTrue(state.receipt_sent)

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

    def test_call_of_on_transition_takes_state_and_event(self) -> None:
        signature = inspect.signature(Order.Servicer.record_payment)

        self.assertEqual(
            ["self", "state", "event"],
            list(signature.parameters),
        )
        self.assertEqual(
            "tests.reboot.statecharts.order_pb2.Paid",
            signature.parameters["event"].annotation,
        )
        self.assertEqual(
            "IMPORT_typing.Optional[tests.reboot.statecharts.order_pb2."
            "Settled]",
            signature.return_annotation,
        )

    def test_call_that_is_not_of_on_transition_takes_state(self) -> None:
        # An action of a `when` transition, an `entry` and an `exit`.
        for call in [
            Order.Servicer.void,
            Order.Servicer.send_receipt,
            Order.Servicer.stop_reminders,
        ]:
            signature = inspect.signature(call)

            self.assertEqual(["self", "state"], list(signature.parameters))
            self.assertEqual("None", signature.return_annotation)

    def test_servicer_without_a_method_is_not_instantiated(self) -> None:
        for method in [
            "is_settled",
            "is_cancelled",
            "record_payment",
            "void",
            "send_receipt",
            "stop_reminders",
        ]:
            # `OrderServicer` but for `method`, which is as `Order`
            # declares it: abstract.
            servicer_type = type(
                "OrderServicerWithout",
                (OrderServicer,),
                {method: getattr(Order.Servicer, method)},
            )

            with self.assertRaises(TypeError) as raised:
                servicer_type()

            self.assertIn(method, str(raised.exception))


if __name__ == "__main__":
    unittest.main()
