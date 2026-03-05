import sys
from google.protobuf.compiler import plugin_pb2 as plugin
from google.protobuf.descriptor_pb2 import FileDescriptorProto
from google.protobuf.descriptor_pool import DescriptorPool


class ProtocPlugin(object):

    @classmethod
    def execute(cls, *args, **kwargs):
        plugin = cls(*args, **kwargs)
        plugin.setup()
        plugin.run()
        plugin.finalize()

    def setup(self) -> None:
        self.request = plugin.CodeGeneratorRequest.FromString(
            sys.stdin.buffer.read()
        )

        self.response = plugin.CodeGeneratorResponse(
            # Since `pyprotoc_plugin` was introduced after proto3 added the
            # `optional` keyword, we assume that all plugins built using this
            # library are compatible with `optional` fields.
            supported_features=plugin.CodeGeneratorResponse.
            FEATURE_PROTO3_OPTIONAL
        )

        self.pool = DescriptorPool()
        for proto_file in self.request.proto_file:
            self.pool.Add(proto_file)

    def finalize(self) -> None:
        sys.stdout.buffer.write(self.response.SerializeToString())

    def run(self) -> None:
        for proto_file in self.request.proto_file:
            self.process_file(proto_file)

    def process_file(self, proto_file: FileDescriptorProto) -> None:
        raise NotImplementedError
