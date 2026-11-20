import unittest
from google.protobuf.empty_pb2 import Empty
from rbt.v1alpha1.statecharts import statechart_pb2
from reboot.aio.applications import Application
from reboot.aio.auth.authorizers import allow
from reboot.aio.contexts import (
    ReaderContext,
    TransactionContext,
    WorkflowContext,
    WriterContext,
)
from reboot.aio.tests import Reboot
from reboot.statecharts.events import status_event_from_message
from tests.reboot.statecharts import order_pb2
from tests.reboot.statecharts.order_rbt import Order
from typing import Optional


class ChargeFailed(Exception):
    """What the inline writer of `ChargeThenFail` fails with."""


class OrderServicer(Order.Servicer):
    """An order that owes 500 cents when it is created.

    Its statechart, which is in `order.proto`, starts in `OPEN`. There,
    a `Paid` or a `Refunded` of at least what is owed closes the order,
    as does a `Settled`, and as does the order being cancelled; a
    `Paid` of less is taken off what is owed. `CLOSED` has no
    transitions. Each call of the statechart adds its name to the
    `calls` of the order.
    """

    def authorizer(self):
        return allow()

    async def create(
        self,
        context: WriterContext,
        request: Empty,
    ) -> Empty:
        self.state.owed_cents = 500
        return Empty()

    async def pay(
        self,
        context: WriterContext,
        request: order_pb2.Paid,
    ) -> Empty:
        await self.statechart(context).enqueue(request)
        return Empty()

    async def refund(
        self,
        context: TransactionContext,
        request: order_pb2.Refunded,
    ) -> Empty:
        await self.statechart(context).enqueue(request)
        return Empty()

    async def settle(
        self,
        context: WriterContext,
        request: Empty,
    ) -> Empty:
        await self.statechart(context).enqueue(order_pb2.Settled())
        return Empty()

    async def pay_then_refund(
        self,
        context: WriterContext,
        request: Empty,
    ) -> Empty:
        await self.statechart(context).enqueue(order_pb2.Paid(cents=200))
        await self.statechart(context).enqueue(order_pb2.Refunded(cents=300))
        return Empty()

    async def pay_then_fail(
        self,
        context: WriterContext,
        request: Empty,
    ) -> Empty:
        await self.statechart(context).enqueue(order_pb2.Paid(cents=500))
        raise RuntimeError("Failed after enqueueing")

    async def pay_then_status(
        self,
        context: WriterContext,
        request: Empty,
    ) -> statechart_pb2.Status:
        await self.statechart(context).enqueue(order_pb2.Paid(cents=200))
        return self.statechart(context).status()

    async def cancel(
        self,
        context: WriterContext,
        request: Empty,
    ) -> Empty:
        self.state.cancelled = True
        return Empty()

    @classmethod
    async def charge(
        cls,
        context: WorkflowContext,
        request: Empty,
    ) -> Empty:

        async def record_charge(
            state: Order.State,
            statechart: Order.Statechart,
        ) -> None:
            await statechart.enqueue(order_pb2.Paid(cents=500))

        await Order.ref().write(context, record_charge)
        return Empty()

    @classmethod
    async def charge_then_fail(
        cls,
        context: WorkflowContext,
        request: Empty,
    ) -> Empty:

        async def record_charge_then_fail(
            state: Order.State,
            statechart: Order.Statechart,
        ) -> None:
            await statechart.enqueue(order_pb2.Paid(cents=500))
            raise ChargeFailed()

        try:
            await Order.ref().write(context, record_charge_then_fail)
        except ChargeFailed:
            pass

        return Empty()

    @classmethod
    async def status_from_workflow(
        cls,
        context: WorkflowContext,
        request: Empty,
    ) -> statechart_pb2.Status:
        state, statechart = await Order.ref().read(context)
        return statechart.status()

    async def get(
        self,
        context: ReaderContext,
        request: Empty,
    ) -> Order.State:
        return self.state

    async def status_from_reader(
        self,
        context: ReaderContext,
        request: Empty,
    ) -> statechart_pb2.Status:
        return self.statechart(context).status()

    async def status_from_writer(
        self,
        context: WriterContext,
        request: Empty,
    ) -> statechart_pb2.Status:
        return self.statechart(context).status()

    async def status_from_transaction(
        self,
        context: TransactionContext,
        request: Empty,
    ) -> statechart_pb2.Status:
        return self.statechart(context).status()

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
        state.calls.append("record_payment")
        state.owed_cents -= event.cents
        return None

    def void(self, state: Order.State) -> None:
        state.calls.append("void")
        state.owed_cents = 0

    def send_receipt(self, state: Order.State) -> None:
        state.calls.append("send_receipt")
        state.receipt_sent = True

    def stop_reminders(self, state: Order.State) -> None:
        state.calls.append("stop_reminders")


OPEN = statechart_pb2.Status(active="OPEN")
CLOSED = statechart_pb2.Status(active="CLOSED")


class StatechartTest(unittest.IsolatedAsyncioTestCase):
    """Tests the statechart of a state in an application, with the
    order of `OrderServicer`: what a method reads of it, what a method
    enqueues for it, and that it is run when a method that can change
    the order returns."""

    async def asyncSetUp(self) -> None:
        self.rbt = Reboot()
        await self.rbt.start()
        await self.rbt.up(Application(servicers=[OrderServicer]))
        self.context = self.rbt.create_external_context(name=self.id())
        self.order, _ = await Order.Create(self.context, "order")

    async def asyncTearDown(self) -> None:
        await self.rbt.stop()

    async def test_constructing_state_starts_its_statechart(self) -> None:
        self.assertEqual(OPEN, await self.order.StatusFromReader(self.context))

    async def test_reader_writer_and_transaction_read_status(self) -> None:
        for status in [
            await self.order.StatusFromReader(self.context),
            await self.order.StatusFromWriter(self.context),
            await self.order.StatusFromTransaction(self.context),
        ]:
            self.assertEqual(OPEN, status)

    async def test_event_that_writer_enqueues_is_handled(self) -> None:
        await self.order.Pay(self.context, cents=500)

        # The `Paid` is of what is owed, so the order is closed, and
        # the event is no longer in the queue.
        self.assertEqual(
            CLOSED,
            await self.order.StatusFromReader(self.context),
        )

        order = await self.order.Get(self.context)
        # The `exit` of `OPEN`, and then the `entry` of `CLOSED`.
        self.assertEqual(["stop_reminders", "send_receipt"], order.calls)
        self.assertTrue(order.receipt_sent)

    async def test_guard_that_does_not_hold_leaves_next_transition(
        self,
    ) -> None:
        await self.order.Pay(self.context, cents=200)

        # The `Paid` is of less than is owed, so the transition that
        # closes the order does not fire and the one that records the
        # payment does.
        self.assertEqual(OPEN, await self.order.StatusFromReader(self.context))

        order = await self.order.Get(self.context)
        self.assertEqual(["record_payment"], order.calls)
        self.assertEqual(300, order.owed_cents)

    async def test_event_that_transaction_enqueues_is_handled(self) -> None:
        await self.order.Refund(self.context, cents=500)

        self.assertEqual(
            CLOSED,
            await self.order.StatusFromReader(self.context),
        )

    async def test_event_without_fields_is_handled(self) -> None:
        await self.order.Settle(self.context)

        self.assertEqual(
            CLOSED,
            await self.order.StatusFromReader(self.context),
        )

    async def test_event_that_no_transition_fires_for_is_dropped(
        self,
    ) -> None:
        # A `Refunded` of less than is owed, which `OPEN` has no
        # transition that fires for.
        await self.order.Refund(self.context, cents=100)

        self.assertEqual(OPEN, await self.order.StatusFromReader(self.context))
        self.assertEqual([], (await self.order.Get(self.context)).calls)

        await self.order.Pay(self.context, cents=500)

        # And a `Paid` for an order that is closed.
        await self.order.Pay(self.context, cents=1)

        self.assertEqual(
            CLOSED,
            await self.order.StatusFromReader(self.context),
        )
        self.assertEqual(
            ["stop_reminders", "send_receipt"],
            (await self.order.Get(self.context)).calls,
        )

    async def test_events_are_handled_in_order_they_were_enqueued(
        self,
    ) -> None:
        # A `Paid` of 200 cents and then a `Refunded` of 300.
        await self.order.PayThenRefund(self.context)

        # The `Paid` left 300 cents owed, which the `Refunded` is of,
        # so the order is closed. Had the `Refunded` been handled
        # first, 500 cents would have been owed and it would have been
        # dropped.
        self.assertEqual(
            CLOSED,
            await self.order.StatusFromReader(self.context),
        )
        self.assertEqual(
            ["record_payment", "stop_reminders", "send_receipt"],
            (await self.order.Get(self.context)).calls,
        )

    async def test_method_that_fails_leaves_statechart_as_it_was(
        self,
    ) -> None:
        with self.assertRaises(Order.PayThenFailAborted):
            await self.order.PayThenFail(self.context)

        self.assertEqual(OPEN, await self.order.StatusFromReader(self.context))

        order = await self.order.Get(self.context)
        self.assertEqual([], order.calls)
        self.assertEqual(500, order.owed_cents)

    async def test_method_reads_event_that_it_has_enqueued(self) -> None:
        # Within the method the event is waiting, since the statechart
        # is run when the method returns.
        self.assertEqual(
            statechart_pb2.Status(
                active="OPEN",
                queue=[status_event_from_message(order_pb2.Paid(cents=200))],
            ),
            await self.order.PayThenStatus(self.context),
        )

        self.assertEqual(OPEN, await self.order.StatusFromReader(self.context))
        self.assertEqual(300, (await self.order.Get(self.context)).owed_cents)

    async def test_when_transition_fires_for_change_of_method(self) -> None:
        # `Cancel` enqueues nothing. It makes the condition of the
        # `when` transition of `OPEN` hold.
        await self.order.Cancel(self.context)

        self.assertEqual(
            CLOSED,
            await self.order.StatusFromReader(self.context),
        )
        # The `exit` of `OPEN`, the action of the transition, and then
        # the `entry` of `CLOSED`.
        self.assertEqual(
            ["stop_reminders", "void", "send_receipt"],
            (await self.order.Get(self.context)).calls,
        )

    async def test_workflow_enqueues_event_with_inline_writer(self) -> None:
        await (await self.order.spawn().Charge(self.context))

        self.assertEqual(
            CLOSED,
            await self.order.StatusFromReader(self.context),
        )
        # Once, however often the workflow ran.
        self.assertEqual(
            ["stop_reminders", "send_receipt"],
            (await self.order.Get(self.context)).calls,
        )

    async def test_inline_writer_that_fails_leaves_statechart_as_it_was(
        self,
    ) -> None:
        await (await self.order.spawn().ChargeThenFail(self.context))

        self.assertEqual(OPEN, await self.order.StatusFromReader(self.context))
        self.assertEqual([], (await self.order.Get(self.context)).calls)

    async def test_workflow_reads_status_with_inline_reader(self) -> None:
        self.assertEqual(
            OPEN,
            await (await self.order.spawn().StatusFromWorkflow(self.context)),
        )

        await self.order.Pay(self.context, cents=500)

        self.assertEqual(
            CLOSED,
            await (await self.order.spawn().StatusFromWorkflow(self.context)),
        )

    async def test_reactive_reader_gets_what_statechart_does(self) -> None:
        statuses = self.order.reactively().StatusFromReader(self.context)

        status, _ = await anext(statuses)
        self.assertEqual(OPEN, status)

        await self.order.Pay(self.context, cents=500)

        async for status, _ in statuses:
            if status == CLOSED:
                break


if __name__ == "__main__":
    unittest.main()
