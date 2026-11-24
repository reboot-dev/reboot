import pydantic
import unittest
from google.protobuf.timestamp_pb2 import Timestamp
from rbt.v1alpha1.tasks_pb2 import TaskId
from reboot.api import Field, Model
from typing import Annotated, Any, Optional


class Scheduled(Model):
    task_id: Optional[TaskId] = Field(
        tag=1,
        default=None,
    )
    at: Optional[Timestamp] = Field(
        tag=2,
        default=None,
    )


class ProtobufMessageInModelTestCase(unittest.TestCase):
    """A protobuf message class is a field type of a `Model`."""

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

    def test_every_position(self) -> None:
        # A message class is a field's type on its own, and inside
        # `Optional[...]`, `list[...]` and `dict[str, ...]`.
        for annotation, value in (
            (TaskId, TaskId(state_type='Report')),
            (Optional[TaskId], TaskId(state_type='Report')),
            (list[TaskId], [TaskId(state_type='Report')]),
            (dict[str, TaskId], {
                'first': TaskId(state_type='Report')
            }),
        ):
            with self.subTest(annotation=annotation):
                model = pydantic.create_model(
                    'Holder',
                    __base__=Model,
                    held=(annotation, Field(tag=1)),
                )
                # The field says the type it was declared with.
                self.assertEqual(
                    model.model_fields['held'].annotation,
                    annotation,
                )
                self.assertEqual(
                    model.model_validate_json(
                        model.model_validate({
                            'held': value
                        }).model_dump_json()
                    ).model_dump()['held'],
                    value,
                )

    def test_other_annotation_of_message(self) -> None:
        # Whatever else annotates a message class applies on top of
        # the message's own validation: a validator is handed the
        # message, also when the value came in its JSON form.
        validated: list[Any] = []

        def remember(value: Any) -> Any:
            validated.append(value)
            return value

        class Remembered(Model):
            task_id: Annotated[
                TaskId,
                pydantic.AfterValidator(remember),
            ] = Field(tag=1)

        Remembered.model_validate({'task_id': {'stateType': 'Report'}})
        self.assertEqual(validated, [TaskId(state_type='Report')])


if __name__ == '__main__':
    unittest.main()
