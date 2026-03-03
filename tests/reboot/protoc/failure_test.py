import argparse
import os
import sys
import unittest
from google.protobuf.compiler import plugin_pb2
from google.protobuf.descriptor_pb2 import FileDescriptorSet
from google.protobuf.descriptor_pool import DescriptorPool
from reboot.protoc_gen_reboot_generic import ProtocPlugin, UserProtoError
from reboot.protoc_gen_reboot_python import PythonRebootProtocPlugin


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


class FailureTest(unittest.TestCase):
    """
    Test that the protoc plugin fails to process the file descriptor set with
    the expected error.
    """

    def setUp(self) -> None:
        with open(args.descriptor_set_file, 'rb') as file:
            self.descriptor_set = FileDescriptorSet.FromString(file.read())

        self.plugin = PythonRebootProtocPlugin()

        # Don't limit the length of our diffs, for easier debugging.
        self.maxDiff = None

    def test_failure(self) -> None:

        def ignore_newlines(text: str) -> str:
            return " ".join(
                [
                    line.lstrip()
                    for line in text.splitlines()
                    if line.lstrip() != ""
                ]
            )

        with self.assertRaises(UserProtoError) as e:
            test_plugin(self.plugin, self.descriptor_set)
        self.assertEqual(
            ignore_newlines(args.expected_error_message),
            ignore_newlines(str(e.exception)),
        )


if __name__ == '__main__':

    parser = argparse.ArgumentParser()
    parser.add_argument(
        "descriptor_set_file", help="path to the local descriptor set."
    )
    parser.add_argument("expected_error_message")
    # This, and the overload of sys.argv below, is the normal way of dealing
    # with args in python unittest.
    parser.add_argument("unittest_args", nargs="*")

    args = parser.parse_args()
    path = args.descriptor_set_file
    if not os.path.exists(path):
        raise AssertionError(
            f"Given descriptor file path '{path}' does not exist relative to "
            f"working directory '{os.getcwd()}'"
        )

    sys.argv[1:] = args.unittest_args
    unittest.main()
