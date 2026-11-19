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

    def authorizer(self):
        return allow()

    async def create(
        self,
        context: WriterContext,
        request: Empty,
    ) -> Empty:
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
        await self.statechart(context).enqueue(order_pb2.Paid(cents=1))
        await self.statechart(context).enqueue(order_pb2.Refunded(cents=2))
        return Empty()

    async def pay_then_fail(
        self,
        context: WriterContext,
        request: Empty,
    ) -> Empty:
        await self.statechart(context).enqueue(order_pb2.Paid(cents=1))
        raise RuntimeError("Failed after enqueueing")

    async def pay_then_status(
        self,
        context: WriterContext,
        request: Empty,
    ) -> statechart_pb2.Status:
        await self.statechart(context).enqueue(order_pb2.Paid(cents=1))
        return self.statechart(context).status()

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
            state.owed_cents = 0
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
        return True

    def is_cancelled(self, state: Order.State) -> bool:
        return False

    def record_payment(
        self,
        state: Order.State,
        event: order_pb2.Paid,
    ) -> Optional[order_pb2.Settled]:
        return None

    def void(self, state: Order.State) -> None:
        pass

    def send_receipt(self, state: Order.State) -> None:
        pass

    def stop_reminders(self, state: Order.State) -> None:
        pass

    @classmethod
    async def send_reminders(cls, context: WorkflowContext) -> None:
        pass

    @classmethod
    async def charge_card(
        cls,
        context: WorkflowContext,
    ) -> Optional[order_pb2.Paid | order_pb2.Refunded]:
        return None


class StatechartTest(unittest.IsolatedAsyncioTestCase):
    """Tests the `statechart` of a servicer, with the `Order` of
    `order.proto`. Each of `StatusFromReader`, `StatusFromWriter` and
    `StatusFromTransaction` returns the `status()` of the statechart
    that a method of that kind gets, and `Pay`, `Refund`, `Settle`,
    `PayThenRefund`, `PayThenFail` and `PayThenStatus` each call
    `enqueue()` of theirs. `Charge` and `ChargeThenFail` are workflows
    that enqueue with an inline writer, and `StatusFromWorkflow` is one
    that returns the `status()` that an inline reader gets."""

    async def asyncSetUp(self) -> None:
        self.rbt = Reboot()
        await self.rbt.start()
        await self.rbt.up(Application(servicers=[OrderServicer]))
        self.context = self.rbt.create_external_context(name=self.id())
        self.order, _ = await Order.Create(self.context, "order")

    async def asyncTearDown(self) -> None:
        await self.rbt.stop()

    async def test_status_is_empty_before_statechart_has_started(
        self,
    ) -> None:
        for status in [
            await self.order.StatusFromReader(self.context),
            await self.order.StatusFromWriter(self.context),
            await self.order.StatusFromTransaction(self.context),
        ]:
            self.assertEqual(statechart_pb2.Status(), status)

    async def test_writer_enqueues_event(self) -> None:
        await self.order.Pay(self.context, cents=500)

        for status in [
            await self.order.StatusFromReader(self.context),
            await self.order.StatusFromWriter(self.context),
            await self.order.StatusFromTransaction(self.context),
        ]:
            self.assertEqual(
                statechart_pb2.Status(
                    queue=[
                        status_event_from_message(order_pb2.Paid(cents=500))
                    ],
                ),
                status,
            )

    async def test_transaction_enqueues_event(self) -> None:
        await self.order.Refund(self.context, cents=200)

        self.assertEqual(
            statechart_pb2.Status(
                queue=[
                    status_event_from_message(order_pb2.Refunded(cents=200))
                ],
            ),
            await self.order.StatusFromReader(self.context),
        )

    async def test_event_without_fields_has_no_value(self) -> None:
        await self.order.Settle(self.context)

        self.assertEqual(
            statechart_pb2.Status(
                queue=[
                    statechart_pb2.Status.Event(
                        event="tests.reboot.statecharts.Settled",
                    ),
                ],
            ),
            await self.order.StatusFromReader(self.context),
        )

    async def test_events_are_enqueued_in_order(self) -> None:
        await self.order.Pay(self.context, cents=500)
        await self.order.PayThenRefund(self.context)
        await self.order.Refund(self.context, cents=200)

        self.assertEqual(
            statechart_pb2.Status(
                queue=[
                    status_event_from_message(order_pb2.Paid(cents=500)),
                    status_event_from_message(order_pb2.Paid(cents=1)),
                    status_event_from_message(order_pb2.Refunded(cents=2)),
                    status_event_from_message(order_pb2.Refunded(cents=200))
                ],
            ),
            await self.order.StatusFromReader(self.context),
        )

    async def test_method_that_fails_enqueues_nothing(self) -> None:
        await self.order.Pay(self.context, cents=500)

        with self.assertRaises(Order.PayThenFailAborted):
            await self.order.PayThenFail(self.context)

        self.assertEqual(
            statechart_pb2.Status(
                queue=[status_event_from_message(order_pb2.Paid(cents=500))]
            ),
            await self.order.StatusFromReader(self.context),
        )

    async def test_status_has_event_that_method_has_enqueued(self) -> None:
        await self.order.Pay(self.context, cents=500)

        self.assertEqual(
            statechart_pb2.Status(
                queue=[
                    status_event_from_message(order_pb2.Paid(cents=500)),
                    status_event_from_message(order_pb2.Paid(cents=1))
                ],
            ),
            await self.order.PayThenStatus(self.context),
        )

    async def test_workflow_enqueues_event_with_inline_writer(self) -> None:
        await (await self.order.spawn().Charge(self.context))

        self.assertEqual(
            statechart_pb2.Status(
                queue=[status_event_from_message(order_pb2.Paid(cents=500))]
            ),
            await self.order.StatusFromReader(self.context),
        )

    async def test_inline_writer_that_fails_enqueues_nothing(self) -> None:
        await self.order.Pay(self.context, cents=500)

        await (await self.order.spawn().ChargeThenFail(self.context))

        self.assertEqual(
            statechart_pb2.Status(
                queue=[status_event_from_message(order_pb2.Paid(cents=500))]
            ),
            await self.order.StatusFromReader(self.context),
        )

    async def test_workflow_reads_status_with_inline_reader(self) -> None:
        self.assertEqual(
            statechart_pb2.Status(),
            await (await self.order.spawn().StatusFromWorkflow(self.context)),
        )

        await self.order.Pay(self.context, cents=500)

        self.assertEqual(
            statechart_pb2.Status(
                queue=[status_event_from_message(order_pb2.Paid(cents=500))]
            ),
            await (await self.order.spawn().StatusFromWorkflow(self.context)),
        )

    async def test_reactive_reader_gets_event_that_is_enqueued(self) -> None:
        statuses = self.order.reactively().StatusFromReader(self.context)

        # The first status is from before anything is enqueued.
        status, _ = await anext(statuses)
        self.assertEqual(statechart_pb2.Status(), status)

        await self.order.Pay(self.context, cents=500)

        async for status, _ in statuses:
            if status == statechart_pb2.Status(
                queue=[status_event_from_message(order_pb2.Paid(cents=500))],
            ):
                break


if __name__ == "__main__":
    unittest.main()
