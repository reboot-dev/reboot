import unittest
from reboot.aio.contexts import ReaderContext
from reboot.aio.servicers import Serviceable
from reboot.helpers import generate_proto_descriptor_set
from tests.test_reboot_proto_desc_set import greeter_rbt


# This is a fake servicer just to test that we can return a ProtoDescriptorSet
# from it using reflection. Methods need not be implemented.
class FakeGreeterServicer(greeter_rbt.GreeterServicer):

    async def Greet(
        self,
        context: ReaderContext,
        request: greeter_rbt.GreetRequest,
    ) -> greeter_rbt.GreetResponse:
        return NotImplementedError()  # type: ignore[return-value]


class GreeterProtoDescriptorSetTest(unittest.TestCase):

    def setUp(self) -> None:
        self._serviceables: list[Serviceable] = [
            Serviceable.from_servicer_type(FakeGreeterServicer)
        ]

    def test_generate_proto_descriptor_set(self):
        proto_descriptor_set = generate_proto_descriptor_set(
            self._serviceables
        )

        # These field names MUST change if the messages in greeter.proto change.
        field_names_in_greeter_proto = [
            'title', 'name', 'adjective', 'signatures', 'bean', 'test'
        ]

        all_field_names = []
        file_desc_proto = proto_descriptor_set.file[-1]
        self.assertEqual(
            "tests/test_reboot_proto_desc_set/greeter.proto",
            file_desc_proto.name
        )
        for message_type in file_desc_proto.message_type:
            for field in message_type.field:
                all_field_names.append(field.name)

        self.assertEqual(all_field_names, field_names_in_greeter_proto)

    def test_files_are_not_added_twice(self):
        proto_descriptor_set = generate_proto_descriptor_set(
            self._serviceables
        )

        file_names_in_proto_desc_set = [
            'google/protobuf/duration.proto',
            'google/rpc/error_details.proto',
            'rbt/v1alpha1/errors.proto',
            "google/protobuf/descriptor.proto",
            "rbt/v1alpha1/options.proto",
            "tests/test_reboot_proto_desc_set/beans.proto",
            "tests/test_reboot_proto_desc_set/tests.proto",
            "tests/test_reboot_proto_desc_set/greeter.proto",
        ]

        self.assertEqual(
            file_names_in_proto_desc_set,
            [file.name for file in proto_descriptor_set.file]
        )


if __name__ == '__main__':
    unittest.main()
