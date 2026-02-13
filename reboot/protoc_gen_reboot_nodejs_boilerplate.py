import os
import rebootdev.aio.tracing
import sys
from dataclasses import dataclass
from google.protobuf.descriptor import FileDescriptor
from reboot.protoc_gen_reboot_nodejs import (
    NodejsFile,
    NodejsRebootProtocPlugin,
)
from rebootdev.protoc_gen_reboot_generic import (
    BaseFile,
    PluginSpecificData,
    UserProtoError,
)
from rebootdev.settings import ENVVAR_REBOOT_NODEJS_EXTENSIONS


@dataclass
class NodejsBoilerplateFile(NodejsFile):
    # The `..._rbt` module name of the Reboot generated Nodejs code for this
    # proto file.
    nodejs_rbt_name: str
    has_reader_method: bool
    has_writer_method: bool
    has_transaction_method: bool
    has_workflow_method: bool


class NodejsRebootBoilerplateProtocPlugin(NodejsRebootProtocPlugin):

    @staticmethod
    def plugin_specific_data() -> PluginSpecificData:
        return PluginSpecificData(
            template_filename="servicer_boilerplate.ts.j2",
            output_filename_suffix="_servicer.ts",
            supported_features=[
                "reader",
                "writer",
                "transaction",
                "error",
                "streaming",
                "workflow",
            ],
        )

    def add_language_dependent_data(self, file: BaseFile) -> BaseFile:
        file = super().add_language_dependent_data(file)
        assert isinstance(file, NodejsFile)

        nodejs_boilerplate_file = NodejsBoilerplateFile(
            proto=file.proto,
            options=file.options,
            legacy_grpc_services=file.legacy_grpc_services,
            states=file.states,
            clients=file.clients,
            reboot_version=file.reboot_version,
            imports=file.imports,
            import_ids=file.import_ids,
            pb_name=file.pb_name,
            rbt_name=self.rbt_module_name(file.proto._descriptor),
            google_protobuf_used_messages=file.google_protobuf_used_messages,
            base64_gzip_pb2_py=file.base64_gzip_pb2_py,
            base64_gzip_pb2_grpc_py=file.base64_gzip_pb2_grpc_py,
            base64_gzip_rbt_py=file.base64_gzip_rbt_py,
            pb2_name=file.pb2_name,
            pb2_grpc_name=file.pb2_grpc_name,
            nodejs_rbt_name=self.nodejs_rbt_module_name(
                file.proto._descriptor
            ),
            has_reader_method=False,
            has_writer_method=False,
            has_transaction_method=False,
            has_workflow_method=False,
            nodejs_extensions=os.environ.get(
                ENVVAR_REBOOT_NODEJS_EXTENSIONS, "false"
            ).lower() == "true",
        )

        for service in [
            service for client in nodejs_boilerplate_file.clients
            for service in client.services
        ]:
            for method in service.methods:
                if method.options.proto.kind == "reader":
                    nodejs_boilerplate_file.has_reader_method = True
                elif method.options.proto.kind == "writer":
                    nodejs_boilerplate_file.has_writer_method = True
                elif method.options.proto.kind == "transaction":
                    nodejs_boilerplate_file.has_transaction_method = True
                elif method.options.proto.kind == "workflow":
                    nodejs_boilerplate_file.has_workflow_method = True

        return nodejs_boilerplate_file

    @classmethod
    def nodejs_rbt_module_name(cls, file: FileDescriptor) -> str:
        """Get Reboot Nodejs generated module name from file descriptor name
        and package.
        """
        file_name = os.path.basename(file.name).removesuffix('.proto')
        return file_name + '_rbt.js'


# This is a separate function (rather than just being in `__main__`) so that we
# can refer to it as a `script` in our `pip_package` BUILD targets.
@rebootdev.aio.tracing.main_span("protoc_gen_reboot_nodejs_boilerplate")
def main():
    try:
        NodejsRebootBoilerplateProtocPlugin.execute()
    except UserProtoError as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)


if __name__ == '__main__':
    main()
