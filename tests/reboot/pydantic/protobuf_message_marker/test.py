import pydantic
import unittest
from google.protobuf.timestamp_pb2 import Timestamp
from rbt.v1alpha1.tasks_pb2 import TaskId
from reboot.api import Field, Model, ProtobufMessage, UserPydanticError
from typing import Annotated, Any, Optional


class Scheduled(Model):
    task_id: Optional[Annotated[TaskId, ProtobufMessage]] = Field(
        tag=1,
        default=None,
    )
    at: Optional[Annotated[Timestamp, ProtobufMessage]] = Field(
        tag=2,
        default=None,
    )


class ProtobufMessageMarkerTestCase(unittest.TestCase):
    """A protobuf message class annotated with `ProtobufMessage` is a
    field type of a `Model`."""

    def test_json_form(self) -> None:
        # A model with a protobuf message field round trips through
        # JSON in the message's JSON form, which is what a MCP tool's
        # caller sends and gets back.
        scheduled = Scheduled(
            task_id=TaskId(
                state_type='Report',
                state_ref='report-1',
                task_uuid=b'\x01\x02',
            ),
        )
        self.assertEqual(
            scheduled.model_dump(mode='json')['task_id'],
            {
                'stateType': 'Report',
                'stateRef': 'report-1',
                'taskUuid': 'AQI=',
            },
        )
        self.assertEqual(
            Scheduled.model_validate_json(scheduled.model_dump_json()),
            scheduled,
        )
        self.assertEqual(
            Scheduled.model_json_schema()['properties']['task_id']['anyOf'][0]
            ['type'],
            'object',
        )

        # Anything else is rejected.
        not_a_task_id: Any = 'not a task id'
        with self.assertRaises(pydantic.ValidationError):
            Scheduled(task_id=not_a_task_id)

    def test_well_known_type_json_form(self) -> None:
        # A `Timestamp` is a string in JSON, and its JSON Schema says
        # so.
        scheduled = Scheduled(at=Timestamp(seconds=1))
        self.assertEqual(
            scheduled.model_dump(mode='json')['at'],
            '1970-01-01T00:00:01Z',
        )
        self.assertEqual(
            Scheduled.model_validate_json(scheduled.model_dump_json()),
            scheduled,
        )
        self.assertEqual(
            Scheduled.model_json_schema()['properties']['at']['anyOf'][0]
            ['type'],
            'string',
        )

    def test_marker_on_non_message(self) -> None:
        with self.assertRaises(UserPydanticError) as raised:
            pydantic.create_model(
                'NotAMessage',
                __base__=Model,
                name=(Annotated[str, ProtobufMessage], Field(tag=1)),
            )
        self.assertIn(
            'not a protobuf message class',
            str(raised.exception),
        )


if __name__ == '__main__':
    unittest.main()
