import pydantic
import unittest
from rbt.v1alpha1.tasks_pb2 import TaskId
from reboot.aio.applications import Application
from reboot.aio.tests import Reboot
from reboot.aio.types import StateRef
from tests.reboot.pydantic.protobuf_fields.servicer import ReportServicer
from tests.reboot.pydantic.protobuf_fields.servicer_api import TaskIdsResponse
from tests.reboot.pydantic.protobuf_fields.servicer_api_rbt import Report
from typing import Any


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

    async def test_json(self) -> None:
        # A model with a protobuf message field round trips through
        # JSON in the message's JSON form, which is what a MCP tool's
        # caller sends and gets back.
        response = TaskIdsResponse(
            run_task_id=TaskId(
                state_type='Report',
                state_ref='report-1',
                task_uuid=b'\x01\x02',
            ),
        )
        self.assertEqual(
            response.model_dump(mode='json')['run_task_id'],
            {
                'stateType': 'Report',
                'stateRef': 'report-1',
                'taskUuid': 'AQI=',
            },
        )
        self.assertEqual(
            TaskIdsResponse.model_validate_json(response.model_dump_json()),
            response,
        )
        self.assertEqual(
            TaskIdsResponse.model_json_schema()['properties']['run_task_id']
            ['anyOf'][0]['type'],
            'object',
        )

        # Anything else is rejected.
        not_a_task_id: Any = 'not a task id'
        with self.assertRaises(pydantic.ValidationError):
            TaskIdsResponse(run_task_id=not_a_task_id)


if __name__ == '__main__':
    unittest.main()
