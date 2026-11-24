import unittest
from rbt.v1alpha1.tasks_pb2 import TaskId
from reboot.api import Field, Model, UserPydanticError


class ProtobufMessageDefaultTestCase(unittest.TestCase):
    """A protobuf message field of a `Model` has a default under the
    rules of a nested `Model`."""

    def test_default_on_required_message(self) -> None:
        # Like a nested `Model`, a message field has a default only as
        # `Optional[...]` with `default=None`.
        with self.assertRaises(UserPydanticError) as raised:

            class Defaulted(Model):
                task_id: TaskId = Field(tag=1, default=TaskId())

        self.assertIn(
            'is a non-optional protobuf message type and cannot have a '
            '`default` value',
            str(raised.exception),
        )


if __name__ == '__main__':
    unittest.main()
