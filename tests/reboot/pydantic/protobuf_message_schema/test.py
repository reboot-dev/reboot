import unittest
from google.protobuf.struct_pb2 import Struct
from rbt.v1alpha1.api import schema_pb2
from rbt.v1alpha1.api.schema_pb2 import Array, Literals, Map, Reference, Type
from rbt.v1alpha1.tasks_pb2 import TaskInfo
from reboot.api import Field, Model
from reboot.pydantic_schema import schema_of
from typing import Optional


class Tracked(Model):
    info: Optional[TaskInfo] = Field(tag=1, default=None)
    history: list[TaskInfo] = Field(tag=2, default_factory=list)
    details: dict[str, Struct] = Field(tag=3, default_factory=dict)


def _optional(type_: Type) -> Type:
    return Type(optional=schema_pb2.Optional(inner=type_))


def _reference(name: str) -> Type:
    return Type(reference=Reference(name=name))


class ProtobufMessageSchemaTestCase(unittest.TestCase):
    """A protobuf message a `Model` uses as a type is a `Reference` to
    a `Schema` read from the message."""

    def test_message_is_filed_as_a_schema(self) -> None:
        tracked, schemas = schema_of(Tracked, path='api.Tracked')

        # The model refers to the message wherever it uses it.
        task_info = _reference('rbt.v1alpha1.tasks_pb2.TaskInfo')
        self.assertEqual(
            [property_.type for property_ in tracked.properties],
            [
                _optional(task_info),
                Type(array=Array(item=task_info)),
                Type(
                    map=Map(
                        value=_reference('google.protobuf.struct_pb2.Struct')
                    )
                ),
            ],
        )

        # The message's schema is named by the message's generated
        # class, and has a property per field, tagged with the field's
        # number.
        schema = schemas['rbt.v1alpha1.tasks_pb2.TaskInfo']
        self.assertEqual(schema.name, 'TaskInfo')
        self.assertEqual(schema.module, 'rbt.v1alpha1.tasks_pb2')
        types_by_name_and_tag = {
            (property_.name, property_.tag): property_.type
            for property_ in schema.properties
        }
        self.assertEqual(
            types_by_name_and_tag,
            {
                # An enum is the names of its values.
                ('status', 1):
                    Type(
                        literals=Literals(
                            values=[
                                'UNKNOWN',
                                'STARTED',
                                'SCHEDULED',
                                'SCHEDULED_RETRY',
                                'SCHEDULED_ITERATION',
                                'CANCELLED',
                                'ABORTED',
                                'COMPLETED',
                            ]
                        )
                    ),
                # A message field is set or not, and refers to the
                # schema of its own message.
                ('task_id', 2):
                    _optional(_reference('rbt.v1alpha1.tasks_pb2.TaskId')),
                ('method', 3):
                    Type(scalar=schema_pb2.STRING),
                ('occurred_at', 4):
                    _optional(
                        _reference('google.protobuf.timestamp_pb2.Timestamp')
                    ),
                ('scheduled_at', 5):
                    _optional(
                        _reference('google.protobuf.timestamp_pb2.Timestamp')
                    ),
                ('iterations', 6):
                    Type(scalar=schema_pb2.INTEGER),
                ('num_runs_failed_recently', 7):
                    Type(scalar=schema_pb2.INTEGER),
            },
        )

        # A `bytes` field is a string.
        task_id = schemas['rbt.v1alpha1.tasks_pb2.TaskId']
        self.assertEqual(
            {
                property_.name: property_.type
                for property_ in task_id.properties
            }['task_uuid'],
            Type(scalar=schema_pb2.STRING),
        )

        # A `map` field is a `Map` and a `repeated` one an `Array`,
        # and messages that refer to each other are each read once.
        value = _reference('google.protobuf.struct_pb2.Value')
        [fields] = schemas['google.protobuf.struct_pb2.Struct'].properties
        self.assertEqual(fields.type, Type(map=Map(value=value)))
        [values] = schemas['google.protobuf.struct_pb2.ListValue'].properties
        self.assertEqual(values.type, Type(array=Array(item=value)))


if __name__ == '__main__':
    unittest.main()
