import asyncio
import unittest
from google.protobuf.empty_pb2 import Empty
from google.protobuf.message import Message
from google.rpc import status_pb2
from rbt.v1alpha1 import tasks_pb2
from rbt.v1alpha1.statecharts import statechart_pb2
from reboot.aio.internals.tasks_cache import TasksCache
from reboot.aio.internals.tasks_dispatcher import (
    OnLoopIterationCallable,
    TaskResponseOrStatus,
    TasksDispatcher,
)
from reboot.aio.tasks import TaskEffect
from reboot.aio.types import ApplicationId, StateRef, StateTypeName
from reboot.settings import RUN_STATECHART_ACTIVITY_METHOD
from typing import Optional

STATE_TYPE = StateTypeName("tests.reboot.Shipment")


class TasksDispatcherTestCase(unittest.IsolatedAsyncioTestCase):
    """Tests a `TasksDispatcher` whose tasks never finish by
    themselves."""

    async def asyncSetUp(self) -> None:
        # The tasks that are being run, by their UUID.
        self.running: set[bytes] = set()

        async def dispatch(
            task: TaskEffect,
            *,
            only_validate: bool = False,
            on_loop_iteration: OnLoopIterationCallable = (
                lambda iteration, next_iteration_schedule: None
            ),
        ) -> TaskResponseOrStatus:
            self.running.add(task.task_id.task_uuid)
            try:
                await asyncio.Event().wait()
            finally:
                self.running.remove(task.task_id.task_uuid)
            return (Empty(), None)

        async def complete_task(
            task: TaskEffect,
            response_or_status: tuple[
                Optional[Message],
                Optional[status_pb2.Status],
            ],
        ) -> None:
            pass

        ready = asyncio.Event()
        ready.set()

        self.tasks_dispatcher = TasksDispatcher(
            application_id=ApplicationId("tests"),
            dispatch=dispatch,
            tasks_cache=TasksCache(),
            ready=ready,
            complete_task=complete_task,
            cancel_statechart_activities=lambda status: None,
        )

    async def asyncTearDown(self) -> None:
        await self.tasks_dispatcher.stop()

    async def dispatch(self, method_name: str, request: Message) -> bytes:
        """Dispatches a task that runs the method that has
        `method_name`, and returns its UUID once it is running."""
        task = TaskEffect(
            state_type=STATE_TYPE,
            state_ref=StateRef.from_id(STATE_TYPE, "shipment"),
            method_name=method_name,
            request=request,
        )

        self.tasks_dispatcher.dispatch([task])

        while task.task_id.task_uuid not in self.running:
            await asyncio.sleep(0)

        return task.task_id.task_uuid

    async def test_task_is_cancelled(self) -> None:
        task_uuid = await self.dispatch("Hanging", Empty())

        response = await self.tasks_dispatcher.cancel_task(task_uuid)

        self.assertEqual(
            tasks_pb2.CancelTaskResponse.Status.OK,
            response.status,
        )
        self.assertTrue(self.tasks_dispatcher.is_task_cancelled(task_uuid))

    async def test_cancelling_task_of_statechart_activity_is_ignored(
        self,
    ) -> None:
        task_uuid = await self.dispatch(
            RUN_STATECHART_ACTIVITY_METHOD,
            statechart_pb2.RunActivityRequest(),
        )

        response = await self.tasks_dispatcher.cancel_task(task_uuid)

        self.assertEqual(
            tasks_pb2.CancelTaskResponse.Status.IGNORED,
            response.status,
        )
        self.assertFalse(self.tasks_dispatcher.is_task_cancelled(task_uuid))

        # The task is still running, once whatever would have
        # cancelled it has had its turn.
        await asyncio.sleep(0)

        self.assertIn(task_uuid, self.running)


if __name__ == "__main__":
    unittest.main()
