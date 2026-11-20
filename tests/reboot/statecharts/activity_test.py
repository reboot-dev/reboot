import asyncio
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
from tests.reboot.statecharts import shipment_pb2
from tests.reboot.statecharts.shipment_rbt import Shipment
from typing import Optional


class ShipmentServicer(Shipment.Servicer):
    """A shipment whose statechart, which is in `shipment.proto`,
    starts in `PACKING`. That state has two schedules: `pack`, which
    ends in a `Packed`, on which the shipment is `SHIPPED`, and
    `label`, which ends in no event. A `Cancelled` makes a shipment
    that is `PACKING` `CANCELLED`.

    `SHIPPED` has a timer of one second, after which the shipment is
    `DELIVERED`, unless a `Returned` has made it `RETURNED`. That
    state has a timer of one and a half seconds, after which the
    shipment is `REIMBURSED`."""

    # Set by a test to let `pack` finish.
    packed: asyncio.Event

    # How many more times `label` is to fail before it finishes, which
    # a test sets, and how many times it has been called.
    label_failures: int
    label_calls: int

    def authorizer(self):
        return allow()

    async def create(
        self,
        context: WriterContext,
        request: Empty,
    ) -> Empty:
        return Empty()

    async def cancel(
        self,
        context: WriterContext,
        request: Empty,
    ) -> Empty:
        await self.statechart(context).enqueue(shipment_pb2.Cancelled())
        return Empty()

    async def send_back(
        self,
        context: WriterContext,
        request: Empty,
    ) -> Empty:
        await self.statechart(context).enqueue(shipment_pb2.Returned())
        return Empty()

    async def send_back_in_transaction(
        self,
        context: TransactionContext,
        request: Empty,
    ) -> Empty:
        await self.statechart(context).enqueue(shipment_pb2.Returned())
        return Empty()

    async def status(
        self,
        context: ReaderContext,
        request: Empty,
    ) -> statechart_pb2.Status:
        return self.statechart(context).status()

    @classmethod
    async def pack(
        cls,
        context: WorkflowContext,
    ) -> Optional[shipment_pb2.Packed | shipment_pb2.Cancelled]:
        await ShipmentServicer.packed.wait()
        return shipment_pb2.Packed()

    @classmethod
    async def label(cls, context: WorkflowContext) -> None:
        ShipmentServicer.label_calls += 1
        if ShipmentServicer.label_failures > 0:
            ShipmentServicer.label_failures -= 1
            raise RuntimeError("Failed to label")


def running_schedules(status: statechart_pb2.Status) -> list[str]:
    """Returns the method of each schedule that is running, as `status`
    says."""
    return [
        activity.schedule.inline.method
        for activity in status.activities
        if activity.HasField("schedule")
    ]


def running_timers(status: statechart_pb2.Status) -> list[tuple[str, str]]:
    """Returns the state and the event of each timer that is running,
    as `status` says."""
    return [
        (activity.state, activity.timer.enqueue.event)
        for activity in status.activities
        if activity.HasField("timer")
    ]


class ActivityTest(unittest.IsolatedAsyncioTestCase):
    """Tests the activities of a statechart in an application, which
    are its schedules and its timers, with the shipment of
    `ShipmentServicer`."""

    async def asyncSetUp(self) -> None:
        ShipmentServicer.packed = asyncio.Event()
        ShipmentServicer.label_failures = 0
        ShipmentServicer.label_calls = 0

        self.rbt = Reboot()
        await self.rbt.start()
        await self.rbt.up(Application(servicers=[ShipmentServicer]))
        self.context = self.rbt.create_external_context(name=self.id())

    async def create_shipment(self) -> None:
        """Creates the shipment, which starts its statechart and with
        it the activities of `PACKING`."""
        self.shipment, _ = await Shipment.Create(self.context, "shipment")

    async def asyncTearDown(self) -> None:
        # Let `pack` finish, so that its task is not left running.
        ShipmentServicer.packed.set()
        await self.rbt.stop()

    async def status_once(self, holds) -> statechart_pb2.Status:
        """Returns the status of the shipment once `holds` returns
        true for it."""
        async for status, _ in self.shipment.reactively().Status(
            self.context,
        ):
            if holds(status):
                return status
        raise AssertionError("Unreachable")

    async def test_schedule_runs_while_its_state_is_active(self) -> None:
        await self.create_shipment()

        # `label` finishes by itself, and `pack` runs until the test
        # lets it finish.
        status = await self.status_once(
            lambda status: running_schedules(status) == ["pack"],
        )

        self.assertEqual("PACKING", status.active)
        self.assertEqual("PACKING", status.activities[0].state)

    async def test_event_that_schedule_returns_is_enqueued(self) -> None:
        await self.create_shipment()

        ShipmentServicer.packed.set()

        # The `Packed` that `pack` returns is handled, and no schedule
        # is running any more.
        status = await self.status_once(
            lambda status: status.active == "SHIPPED",
        )

        self.assertEqual([], running_schedules(status))

    async def test_transition_waits_for_schedule_of_state_it_exits(
        self,
    ) -> None:
        await self.create_shipment()

        await self.status_once(
            lambda status: running_schedules(status) == ["pack"],
        )

        await self.shipment.Cancel(self.context)

        # The transition for the `Cancelled` would exit `PACKING`,
        # which `pack` is still running in, so the event waits.
        status = await self.shipment.Status(self.context)
        self.assertEqual("PACKING", status.active)
        self.assertEqual(
            [status_event_from_message(shipment_pb2.Cancelled())],
            list(status.queue),
        )

        ShipmentServicer.packed.set()

        # Once `pack` has finished the transition is taken. The
        # `Packed` that `pack` returned was enqueued behind the
        # `Cancelled`, and no transition of `CANCELLED` fires for it.
        status = await self.status_once(
            lambda status: status.active == "CANCELLED",
        )

        self.assertEqual(statechart_pb2.Status(active="CANCELLED"), status)

    async def test_schedule_that_fails_is_run_again(self) -> None:
        ShipmentServicer.label_failures = 1

        await self.create_shipment()

        # `label` is running until it has finished without failing.
        await self.status_once(
            lambda status: running_schedules(status) == ["pack"],
        )

        self.assertEqual(0, ShipmentServicer.label_failures)
        self.assertGreater(ShipmentServicer.label_calls, 1)

    async def test_timer_enqueues_its_event_after_its_delay(self) -> None:
        await self.create_shipment()

        ShipmentServicer.packed.set()

        # `SHIPPED` has the timer while it is active.
        status = await self.status_once(
            lambda status: status.active == "SHIPPED",
        )

        self.assertEqual(
            [("SHIPPED", "tests.reboot.statecharts.Delivered")],
            running_timers(status),
        )

        # After its second, the timer enqueues its `Delivered`.
        status = await self.status_once(
            lambda status: status.active == "DELIVERED",
        )

        self.assertEqual(statechart_pb2.Status(active="DELIVERED"), status)

    async def test_timer_of_state_that_is_exited_enqueues_nothing(
        self,
    ) -> None:
        await self.create_shipment()

        ShipmentServicer.packed.set()

        await self.status_once(lambda status: status.active == "SHIPPED")

        # The shipment is sent back before the second of the timer of
        # `SHIPPED` is over.
        await self.shipment.SendBack(self.context)

        # The transition did not wait for the timer, and the timer of
        # `SHIPPED` is no longer running: that of `RETURNED` is.
        status = await self.shipment.Status(self.context)

        self.assertEqual("RETURNED", status.active)
        self.assertEqual(
            [("RETURNED", "tests.reboot.statecharts.Reimbursed")],
            running_timers(status),
        )

        # The timer of `RETURNED` is over after that of `SHIPPED`
        # would have been. Had the timer of `SHIPPED` enqueued its
        # `Delivered`, the shipment would be `DELIVERED` and never
        # `REIMBURSED`.
        status = await self.status_once(
            lambda status: status.active == "REIMBURSED",
        )

        self.assertEqual(statechart_pb2.Status(active="REIMBURSED"), status)

    async def test_activity_that_transaction_schedules_runs(self) -> None:
        await self.create_shipment()

        ShipmentServicer.packed.set()

        await self.status_once(lambda status: status.active == "SHIPPED")

        # The transaction makes the shipment `RETURNED`, which
        # schedules the timer of that state.
        await self.shipment.SendBackInTransaction(self.context)

        self.assertEqual(
            "RETURNED",
            (await self.shipment.Status(self.context)).active,
        )

        # The timer ran, so its task was dispatched once the
        # transaction had committed.
        status = await self.status_once(
            lambda status: status.active == "REIMBURSED",
        )

        self.assertEqual(statechart_pb2.Status(active="REIMBURSED"), status)


if __name__ == "__main__":
    unittest.main()
