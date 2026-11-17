import unittest
from reboot.aio.applications import Application
from reboot.aio.tests import Reboot
from reboot.api import TaskId
from tests.reboot.pydantic.task_id.servicer import ReportServicer
from tests.reboot.pydantic.task_id.servicer_api_rbt import Report


class TaskIdTestCase(unittest.IsolatedAsyncioTestCase):
    """A pydantic API's task ids are `reboot.api.TaskId`s: returned by
    `schedule()`, storable in state and responses, and taken by
    `retrieve()`."""

    async def asyncSetUp(self) -> None:
        self.rbt = Reboot()
        await self.rbt.start()
        await self.rbt.up(Application(servicers=[ReportServicer]))

    async def asyncTearDown(self) -> None:
        await self.rbt.stop()

    async def test_schedule_store_and_retrieve(self) -> None:
        context = self.rbt.create_external_context(name=self.id())

        report, response = await Report.start(context, 'report-1')

        # The scheduled task's id is a `TaskId` that the writer could
        # store in its state and return in its response.
        task_id = response.task_id
        self.assertIsInstance(task_id, TaskId)
        self.assertEqual(task_id.state_id, 'report-1')
        self.assertEqual(
            (await report.run_task_id(context)).task_id,
            task_id,
        )

        # A handle retrieved with that id refers to the task, and
        # `await`ing it yields the task's response.
        task = Report.RunTask.retrieve(context, task_id=task_id)
        self.assertEqual(task.task_id, task_id)
        self.assertEqual((await task).state_id, 'report-1')

    async def test_spawned_task_id(self) -> None:
        context = self.rbt.create_external_context(name=self.id())

        report, _ = await Report.start(context, 'report-2')

        # Spawning yields a handle whose `task_id` is also a `TaskId`.
        task = await report.spawn().run(context)
        self.assertIsInstance(task.task_id, TaskId)
        self.assertEqual(task.task_id.state_id, 'report-2')

        # Round trip through `retrieve()`.
        retrieved = Report.RunTask.retrieve(context, task_id=task.task_id)
        self.assertEqual(retrieved.task_id, task.task_id)
        self.assertEqual((await retrieved).state_id, 'report-2')


if __name__ == '__main__':
    unittest.main()
