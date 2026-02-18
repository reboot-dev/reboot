import os
import unittest
from google.api import annotations_pb2
from google.protobuf.compiler import plugin_pb2
from google.protobuf.descriptor_pb2 import FileDescriptorSet
from google.protobuf.descriptor_pool import DescriptorPool
from reboot.protoc_gen_reboot_generic import (
    BaseFile,
    ProtocPlugin,
    UserProtoError,
)
from reboot.protoc_gen_reboot_python import (
    PythonFile,
    PythonRebootProtocPlugin,
)


def test_plugin(
    plugin: ProtocPlugin, proto_file_descriptor_set: FileDescriptorSet
) -> None:
    """Test the plugin using injected descriptor set instead of stdin.
    """
    # TODO: Move this logic to protoc plugin.
    plugin.request = None
    plugin.response = plugin_pb2.CodeGeneratorResponse()

    plugin.pool = DescriptorPool()
    for proto_file in proto_file_descriptor_set.file:
        plugin.pool.Add(proto_file)

    for proto_file in proto_file_descriptor_set.file:
        plugin.process_file(proto_file)


class ModifiedRebootProtocPlugin(PythonRebootProtocPlugin):
    """Modify the protoc plugin to allow us to test it.
    """
    # Mapping of protobuf file name to template data.
    proto_to_template_data: dict[str, PythonFile]

    def __init__(self, *args, **kwargs):
        self.proto_to_template_data = {}
        super().__init__(*args, **kwargs)

    def add_language_dependent_data(self, file: BaseFile) -> BaseFile:
        """We override this method so that we can save its result for assertions
        in tests.
        """
        result = super().add_language_dependent_data(file)
        assert isinstance(result, PythonFile)
        self.proto_to_template_data[file.proto.file_name] = result
        return result


class GeneratorTest(unittest.TestCase):
    """Test that the protoc plugin processes the file descriptor set correctly.

    Note, this tests code generation from `.proto` to internal representation in the
    plugin; the internal representation being the input to the template that generates
    the actual code. This does not test the template nor the generated output. The
    generated output is tested via golden files.
    """

    def setUp(self) -> None:
        with open(args.descriptor_set_file, 'rb') as file:
            self.descriptor_set = FileDescriptorSet.FromString(file.read())

        self.plugin = ModifiedRebootProtocPlugin()

    def test_normal_run(self) -> None:
        test_plugin(self.plugin, self.descriptor_set)

    def test_that_NotARebootService_is_not_in_output(self) -> None:
        # Non-Reboot services shouldn't make it to the output.
        test_plugin(self.plugin, self.descriptor_set)

        template_data = self.plugin.proto_to_template_data[
            'tests/reboot/greeter.proto']

        self.assertEqual(1, len(template_data.clients))
        self.assertEqual(1, len(template_data.clients[0].services))
        self.assertIn(
            'Greeter', template_data.clients[0].services[0].proto.name
        )

    def test_that_methods_without_annotations_fail(self) -> None:
        # We currently do not support methods without annotation for a reboot
        # service. In case the user do not specify the type, code gen should
        # fail.
        # Note: We would like to support default values in the future (e.g., as
        # pure if no annotation is given) but as we are currently debating how
        # to deal with pure methods we currently do not support unannotated
        # methods on a reboot service.
        file = self.descriptor_set.file[-1]
        self.assertEqual(file.name, 'tests/reboot/greeter.proto')

        service = file.service[0]
        self.assertEqual(service.name, 'GreeterMethods')

        # Any method will do.
        method = service.method[0]

        # Remove required method annotation(s).
        method.options.Clear()

        # See that generation result in error as the state message can not be
        # resolved.
        with self.assertRaises(UserProtoError) as e:
            test_plugin(self.plugin, self.descriptor_set)
        self.assertEqual(
            str(e.exception),
            "Error processing 'tests/reboot/greeter.proto': Missing Reboot "
            "method annotation for 'tests.reboot.GreeterMethods/Create'"
        )

    def test_forbid_http_annotations(self) -> None:
        # Reboot services don't support (custom) HTTP annotations.
        #
        # Modify the descriptor set to form the basis for the test. In this
        # case, add an HTTP annotation to the `Greeter.Create()` method.
        file = self.descriptor_set.file[-1]
        self.assertEqual(file.name, 'tests/reboot/greeter.proto')

        service = file.service[0]
        self.assertEqual(service.name, 'GreeterMethods')
        method = service.method[0]
        self.assertEqual(method.name, 'Create')

        method.options.Extensions[annotations_pb2.http
                                 ].post = '/greeter/create'

        # See that generation result in error as the state message can not be
        # resolved.
        with self.assertRaises(UserProtoError) as e:
            test_plugin(self.plugin, self.descriptor_set)
        self.assertEqual(
            "Error processing 'tests/reboot/greeter.proto': "
            "Service 'GreeterMethods' method 'Create' has a 'google.api.http' "
            "annotation. This is only supported for legacy gRPC services, "
            "not for Reboot methods. Let the maintainers know about your "
            "use case if you feel this is a limitation!",
            str(e.exception),
        )

    def test_proto3_only(self) -> None:
        file = self.descriptor_set.file[-1]
        self.assertEqual(file.name, 'tests/reboot/greeter.proto')

        # Change the syntax to proto2; this is currently unsupported.
        file.syntax = 'proto2'

        with self.assertRaises(UserProtoError) as e:
            test_plugin(self.plugin, self.descriptor_set)
        self.assertEqual(
            str(e.exception),
            "Error processing 'tests/reboot/greeter.proto': Unsupported: not "
            "a proto3 file. Reboot only supports proto files that set "
            "'syntax=\"proto3\";', but got 'syntax=\"proto2\";'"
        )

    def test_map_type(self) -> None:
        file = self.descriptor_set.file[-1]
        self.assertEqual(file.name, 'tests/reboot/greeter.proto')
        pool = DescriptorPool()
        for proto_file in self.descriptor_set.file:
            pool.Add(proto_file)
        file_descriptor = pool.FindFileByName(file.name)

        fields = PythonRebootProtocPlugin._analyze_message_fields(
            file_descriptor.message_types_by_name['GreetRequest']
        )
        map_field_type = fields['metadata']
        self.assertEqual(map_field_type, "dict[str, str]")


if __name__ == '__main__':
    import argparse
    import sys

    parser = argparse.ArgumentParser()
    parser.add_argument(
        'descriptor_set_file', help='path to the local descriptor set.'
    )
    # This, and the overload of sys.argv below, is the normal way of dealing
    # with args in python unittest.
    parser.add_argument('unittest_args', nargs='*')

    args = parser.parse_args()
    path = args.descriptor_set_file
    if not os.path.exists(path):
        raise UserProtoError(
            f'Given descriptor file path {path} does not exist'
        )

    sys.argv[1:] = args.unittest_args
    unittest.main()
