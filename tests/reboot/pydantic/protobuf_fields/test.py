import unittest
from rbt.v1alpha1.tasks_pb2 import TaskId
from reboot.aio.applications import Application
from reboot.aio.tests import Reboot
from reboot.aio.types import StateRef
from tests.reboot.pydantic.protobuf_fields.receipt_pb2 import Receipt
from tests.reboot.pydantic.protobuf_fields.servicer import ReportServicer
from tests.reboot.pydantic.protobuf_fields.servicer_api_rbt import Report


class ProtobufFieldsTestCase(unittest.IsolatedAsyncioTestCase):
    """A protobuf message, here the `TaskId` that `schedule()` returns,
    is a field type of a pydantic `Model`: in a state, a request and a
    response, on its own, in a `list` and in a `dict`."""

    async def asyncSetUp(self) -> None:
        self.rbt = Reboot()
        await self.rbt.start()
        await self.rbt.up(Application(servicers=[ReportServicer]))

    async def asyncTearDown(self) -> None:
        await self.rbt.stop()

    async def test_store_and_retrieve(self) -> None:
        context = self.rbt.create_external_context(name=self.id())

        report, response = await Report.start(context, 'report-1')

        # The scheduled task's id is the protobuf `TaskId` that the
        # writer stored in its state and returned in its response.
        task_id = response.task_id
        self.assertIsInstance(task_id, TaskId)
        assert task_id is not None
        self.assertEqual(StateRef(task_id.state_ref).id, 'report-1')

        # A request carries one too.
        await report.remember(context, task_id=task_id)

        task_ids = await report.task_ids(context)
        self.assertEqual(task_ids.run_task_id, task_id)
        self.assertEqual(task_ids.remembered_task_ids, [task_id])
        self.assertEqual(
            task_ids.remembered_task_ids_by_state_id,
            {'report-1': task_id},
        )

        # The id retrieves the task, whose response can be awaited.
        task = Report.RunTask.retrieve(context, task_id=task_id)
        self.assertEqual(task.task_id, task_id)
        self.assertEqual((await task).state_id, 'report-1')

    async def test_message_declared_by_the_application(self) -> None:
        context = self.rbt.create_external_context(name=self.id())

        report, _ = await Report.start(context, 'report-1')

        # A message from the application's own `.proto` is carried
        # like one of Reboot's.
        receipt = Receipt(note='received')
        await report.receive(context, receipt=receipt)
        self.assertEqual((await report.receipt(context)).receipt, receipt)


if __name__ == '__main__':
    unittest.main()
