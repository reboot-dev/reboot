import os
import rebootdev.aio.tracing
import sys
from dataclasses import dataclass
from google.protobuf.descriptor import FileDescriptor
from rebootdev.protoc_gen_reboot_generic import (
    BaseFile,
    PluginSpecificData,
    UserProtoError,
)
from rebootdev.protoc_gen_reboot_python import (
    PythonFile,
    PythonRebootProtocPlugin,
)


@dataclass
class PythonBoilerplateFile(PythonFile):
    # The `..._rbt` module name of the Reboot generated Python code for this
    # proto file.
    rbt_name: str
    has_reader_method: bool
    has_writer_method: bool
    has_transaction_method: bool
    has_workflow_method: bool
    has_streaming_method: bool


class PythonRebootBoilerplateProtocPlugin(PythonRebootProtocPlugin):

    @staticmethod
    def plugin_specific_data() -> PluginSpecificData:
        return PluginSpecificData(
            template_filename="servicer_boilerplate.py.j2",
            output_filename_suffix="_servicer.py",
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
        python_file = super().add_language_dependent_data(file)

        assert isinstance(python_file, PythonFile)

        python_boilerplate_file = PythonBoilerplateFile(
            proto=python_file.proto,
            options=file.options,
            legacy_grpc_services=python_file.legacy_grpc_services,
            states=python_file.states,
            clients=python_file.clients,
            reboot_version=python_file.reboot_version,
            imports=python_file.imports,
            pb2_name=python_file.pb2_name,
            rbt_name=self.rbt_module_name(file.proto._descriptor),
            has_reader_method=False,
            has_writer_method=False,
            has_transaction_method=False,
            has_workflow_method=False,
            has_streaming_method=False,
        )

        for service in [
            service for client in python_boilerplate_file.clients
            for service in client.services
        ]:
            for method in service.methods:
                if method.options.proto.kind == "reader":
                    python_boilerplate_file.has_reader_method = True
                elif method.options.proto.kind == "writer":
                    python_boilerplate_file.has_writer_method = True
                elif method.options.proto.kind == "transaction":
                    python_boilerplate_file.has_transaction_method = True
                elif method.options.proto.kind == "workflow":
                    python_boilerplate_file.has_workflow_method = True

                if method.proto.client_streaming or method.proto.server_streaming or method.options.proto.state_streaming:
                    python_boilerplate_file.has_streaming_method = True
                # We are doing re-export from the generated "*_rbt.py" file for
                # the messages described in the same proto file. So we can
                # remove the package prefix from the input and output types and
                # use the short name directly.
                if python_boilerplate_file.pb2_name in method.input_type:
                    method.input_type = method.input_type.replace(
                        python_boilerplate_file.pb2_name + ".",
                        "",
                    )
                if python_boilerplate_file.pb2_name in method.output_type:
                    method.output_type = method.output_type.replace(
                        python_boilerplate_file.pb2_name + ".",
                        "",
                    )

        return python_boilerplate_file

    @classmethod
    def rbt_module_name(cls, file: FileDescriptor) -> str:
        """Get Reboot Python generated module name from file descriptor name
        and package.
        """
        file_name = os.path.basename(file.name).removesuffix('.proto')
        return file.package + '.' + file_name + '_rbt'


# This is a separate function (rather than just being in `__main__`) so that we
# can refer to it as a `script` in our `pip_package` BUILD targets.
@rebootdev.aio.tracing.main_span("protoc_gen_reboot_python_boilerplate")
def main():
    try:
        PythonRebootBoilerplateProtocPlugin.execute()
    except UserProtoError as error:
        print(f"{error}", file=sys.stderr)
        sys.exit(1)


if __name__ == '__main__':
    main()
