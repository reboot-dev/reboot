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
from reboot.aio.state_managers import SidecarStateManager
from reboot.aio.tests import Reboot
from reboot.aio.types import StateRef
from tests.reboot.statecharts import order_pb2
from tests.reboot.statecharts.order_rbt import Order
from typing import Optional


class OrderServicer(Order.Servicer):
    # The state manager that has the orders, for a test to give an
    # order a statechart status with.
    state_manager: Optional[SidecarStateManager] = None

    def authorizer(self):
        return allow()

    async def create(
        self,
        context: WriterContext,
        request: Empty,
    ) -> Empty:
        assert self._middleware is not None
        state_manager = self._middleware._state_manager
        assert isinstance(state_manager, SidecarStateManager)
        OrderServicer.state_manager = state_manager
        return Empty()

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


class StatusTest(unittest.IsolatedAsyncioTestCase):
    """Tests `status()` of the statechart of a servicer, with the `Order` of
    `order.proto`: each of `StatusFromReader`, `StatusFromWriter` and
    `StatusFromTransaction` returns what it gives a method of that
    kind."""

    async def asyncSetUp(self) -> None:
        self.rbt = Reboot()
        await self.rbt.start()

    async def asyncTearDown(self) -> None:
        await self.rbt.stop()

    async def test_status_is_empty_before_statechart_has_started(
        self,
    ) -> None:
        await self.rbt.up(Application(servicers=[OrderServicer]))

        context = self.rbt.create_external_context(name=self.id())

        order, _ = await Order.Create(context, "order")

        self.assertEqual(
            statechart_pb2.Status(),
            await order.StatusFromReader(context),
        )
        self.assertEqual(
            statechart_pb2.Status(),
            await order.StatusFromWriter(context),
        )
        self.assertEqual(
            statechart_pb2.Status(),
            await order.StatusFromTransaction(context),
        )

    async def test_status_is_where_statechart_is(self) -> None:
        await self.rbt.up(Application(servicers=[OrderServicer]))

        context = self.rbt.create_external_context(name=self.id())

        order, _ = await Order.Create(context, "order")

        status = statechart_pb2.Status(
            active="OPEN",
            queue=[
                statechart_pb2.Status.Event(
                    event="tests.reboot.statecharts.Paid",
                ),
            ],
        )

        # Nothing sets a statechart status yet, so we give the order
        # one where the state manager keeps it.
        state_manager = OrderServicer.state_manager
        assert state_manager is not None
        state_type = OrderServicer.__state_type_name__
        state_manager._statechart_statuses[state_type][StateRef.from_id(
            state_type,
            "order",
        )] = status

        self.assertEqual(status, await order.StatusFromReader(context))
        self.assertEqual(status, await order.StatusFromWriter(context))
        self.assertEqual(
            status,
            await order.StatusFromTransaction(context),
        )


if __name__ == "__main__":
    unittest.main()
