import asyncio
import unittest
from google.protobuf.struct_pb2 import Struct
from rbt.v1alpha1.tasks_pb2 import TaskInfo
from reboot.api import API, Field, Methods, Model, Reader, Type
from reboot.pydantic_api import api_of
from reboot.pydantic_schema_to_proto import generate_from_api
from typing import Optional


class Tracked(Model):
    info: Optional[TaskInfo] = Field(tag=1, default=None)
    history: list[TaskInfo] = Field(tag=2, default_factory=list)
    details: dict[str, Struct] = Field(tag=3, default_factory=dict)


class ProtobufMessageGeneratedProtoTestCase(unittest.TestCase):
    """A protobuf message a `Model` uses as a type is imported by the
    generated proto."""

    def test_message_is_imported(self) -> None:
        # The generated proto imports the file that declares a message
        # a model uses, names the message in full, and declares
        # neither it nor the messages its fields use.
        class Written:

            def __init__(self) -> None:
                self.parts: list[str] = []

            async def write(self, part: str) -> None:
                self.parts.append(part)

        written = Written()
        asyncio.run(
            generate_from_api(
                written,
                api_of(
                    API(
                        Tracker=Type(
                            state=Tracked,
                            methods=Methods(
                                get=Reader(
                                    request=None,
                                    response=Tracked,
                                    mcp=None,
                                ),
                            ),
                        ),
                    ),
                    filename='tracker/v1/tracker.py',
                ),
            )
        )
        proto = ''.join(written.parts)

        self.assertIn('import "rbt/v1alpha1/tasks.proto";\n', proto)
        self.assertIn('import "google/protobuf/struct.proto";\n', proto)
        self.assertNotIn('import "google/protobuf/timestamp.proto";\n', proto)
        self.assertIn('optional .rbt.v1alpha1.TaskInfo info = 1', proto)
        self.assertIn('repeated .rbt.v1alpha1.TaskInfo', proto)
        self.assertIn('map<string, .google.protobuf.Struct>', proto)
        for message in ('TaskInfo', 'TaskId', 'Struct'):
            self.assertNotIn(f'message {message} {{', proto)


if __name__ == '__main__':
    unittest.main()
