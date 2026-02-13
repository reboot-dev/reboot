#!/usr/bin/env python3
import base64
import gzip
import os
import rebootdev.aio.tracing
import sys
import tempfile
from dataclasses import dataclass
from google.protobuf.descriptor import Descriptor, FileDescriptor
from google.protobuf.descriptor_pb2 import (
    FileDescriptorProto,
    FileDescriptorSet,
)
from grpc_tools import protoc as grpc_tools_protoc
from importlib import resources
from reboot.protoc_gen_reboot_typescript import TypescriptRebootProtocPlugin
from rebootdev.aio.directories import chdir
from rebootdev.protoc_gen_reboot_generic import (
    BaseClient,
    BaseFile,
    BaseMethod,
    BaseMethodOptions,
    BaseService,
    BaseState,
    PluginSpecificData,
    ProtoType,
    UserProtoError,
)
from rebootdev.protoc_gen_reboot_python import (
    PythonRebootProtocPlugin,
    PythonType,
)
from rebootdev.settings import ENVVAR_REBOOT_NODEJS_EXTENSIONS
from typing import Sequence


def protoc(file: FileDescriptor) -> tuple[str, str]:
    """Helper for generating *_pb2.py and *_pb2_grpc.py files that we
    embed within the *_rbt.ts generated files.
    """
    protoc_args: list[str] = ["grpc_tool.protoc"]

    # We want to find the Python `site-packages`/`dist-packages` directories
    # that contain a 'rbt/v1alpha1' directory, which is where we'll find our
    # protos. We can look for the 'rbt' folder via the `resources` module; the
    # resulting path is a `MultiplexedPath`, since there may be multiple. Such a
    # path doesn't contain a `parent` attribute, since there isn't one answer.
    # Instead we use `iterdir()` to get all of the children of all 'rbt'
    # folders, and then deduplicate the parents-of-the-parents-of-those-children
    # (via the `set`), which gives us the 'rbt' folders' parents' paths.
    reboot_parent_paths: set[str] = set()
    for resource in resources.files('rbt').iterdir():
        with resources.as_file(resource) as path:
            reboot_parent_paths.add(str(path.parent.parent))

    if len(reboot_parent_paths) == 0:
        raise FileNotFoundError(
            "Failed to find 'rbt' resource path. "
            "Please report this bug to the maintainers."
        )

    # Now add these to '--proto_path', so that users don't need to provide
    # their own Reboot protos.
    for reboot_parent_path in reboot_parent_paths:
        protoc_args.append(f"--proto_path={reboot_parent_path}")

    # User protos may rely on `google.protobuf.*` protos. We
    # conveniently have those files packaged in our Python
    # package; make them available to users, so that users don't
    # need to provide them.
    protoc_args.append(
        f"--proto_path={resources.files('grpc_tools').joinpath('_proto')}"
    )

    with tempfile.TemporaryDirectory() as directory:
        with chdir(directory):
            protoc_args.append('--python_out=.')
            protoc_args.append('--grpc_python_out=.')

            # Create a `FileDescriptorSet` that we can use as input to
            # calling `protoc`.
            file_descriptor_set = FileDescriptorSet()

            def add_file_descriptor(file_descriptor: FileDescriptor):
                file_descriptor_proto = FileDescriptorProto()
                file_descriptor.CopyToProto(file_descriptor_proto)

                if file_descriptor_proto in file_descriptor_set.file:
                    return

                for dependency in file_descriptor.dependencies:
                    add_file_descriptor(dependency)

                file_descriptor_set.file.append(file_descriptor_proto)

            add_file_descriptor(file)

            with open('file_descriptor_set', 'wb') as file_descriptor_set_file:
                file_descriptor_set_file.write(
                    file_descriptor_set.SerializeToString()
                )
                file_descriptor_set_file.close()

            protoc_args.append('--descriptor_set_in=file_descriptor_set')

            protoc_args.append(f'{file.name}')

            returncode = grpc_tools_protoc.main(protoc_args)

            if returncode != 0:
                print(
                    'Failed to generate protobuf and gRPC code for Python adaptor',
                    file=sys.stderr,
                )
                sys.exit(-1)

            with open(
                f"{file.name.replace('.proto', '_pb2.py')}",
                "r",
            ) as pb2_py, open(
                f"{file.name.replace('.proto', '_pb2_grpc.py')}",
                "r",
            ) as pb2_grpc_py:
                return (pb2_py.read(), pb2_grpc_py.read())


NodejsType = str


@dataclass
class NodejsMethodOptions(BaseMethodOptions):
    errors: dict[ProtoType, NodejsType]


@dataclass
class NodejsMethod(BaseMethod):
    options: NodejsMethodOptions
    input_type: NodejsType
    output_type: NodejsType
    # Nested messages have different types in Python and JS, since we are doing
    # pybind under the covers, we need the Python type to call the correct
    # instance.
    python_input_type: PythonType
    # We pass the request message to Python adaptor, so if the message is
    # described not in the same proto file (for example google.protobuf.* or any
    # other user specified), we want to import the message from the correct
    # Python module.
    python_request_message_module: str
    # True if a response is not `z.void()`.
    has_non_none_response: bool


@dataclass
class NodejsService(BaseService):
    methods: Sequence[NodejsMethod]


@dataclass
class NodejsState(BaseState):
    services: Sequence[NodejsService]


@dataclass
class NodejsClient(BaseClient):
    services: Sequence[NodejsService]


@dataclass
class NodejsFile(BaseFile):
    # Dictionary where the key is the relative path to the
    # file and the value is the unique name of the file.
    imports: dict[str, str]
    # A dict of:
    # key: a unique id including the full file path
    # value: the full file path, with .proto swapped for _rbt
    import_ids: dict[str, str]
    # The name of the ES module, which contains the generated protobuf
    # messages ("*_pb.js").
    pb_name: str
    # The name of the Reboot Python generated module ("*_rbt.py").
    rbt_name: str
    # Set of messages that are used in the file and should be imported from
    # '@bufbuild/protobuf'.
    google_protobuf_used_messages: set[str]
    # We embed the `*_pb2.py`, `*_pb2_grpc.py`, and `*_rbt.py` "files"
    # as encoded strings in the generated `*_rbt.ts` file so that they
    # can be imported into Python when at runtime.
    base64_gzip_pb2_py: str
    base64_gzip_pb2_grpc_py: str
    base64_gzip_rbt_py: str
    # The name of the Python file generated by the Python Reboot protoc
    # plugin, we need that as we embed the Python file in the NodeJS file.
    pb2_name: str
    pb2_grpc_name: str
    # Whether or not to emit .js extensions.
    nodejs_extensions: bool


class NodejsRebootProtocPlugin(TypescriptRebootProtocPlugin):

    @staticmethod
    def plugin_specific_data() -> PluginSpecificData:
        return PluginSpecificData(
            template_filename="reboot.ts.j2",
            output_filename_suffix="_rbt.ts",
            supported_features=[
                "reader", "writer", "transaction", "workflow", "error"
            ],
            only_generates_with_reboot_services=False,
        )

    @classmethod
    def get_python_module(cls, message: Descriptor) -> str:
        return PythonRebootProtocPlugin._pb2_module_name(message.file)

    def _nodejs_services(
        self,
        file: BaseFile,
        services: Sequence[BaseService],
        google_protobuf_used_messages: set[str],
        pb_name: str,
        from_zod: bool,
    ) -> list[NodejsService]:
        result: list[NodejsService] = []

        state_names = [state.proto.name for state in file.states]

        for service in services:
            result.append(
                NodejsService(
                    proto=service.proto,
                    options=service.options,
                    methods=[
                        NodejsMethod(
                            proto=method.proto,
                            options=NodejsMethodOptions(
                                proto=method.options.proto,
                                errors=self._analyze_errors(
                                    method=method.proto._descriptor,
                                    state_names=state_names,
                                    google_protobuf_used_messages=
                                    google_protobuf_used_messages,
                                    pb_name=pb_name,
                                ),
                            ),
                            input_type=self.
                            typescript_type_with_package_from_proto_type(
                                message=method.proto._descriptor.input_type,
                                file=file.proto._descriptor,
                                state_names=state_names,
                                google_protobuf_used_messages=
                                google_protobuf_used_messages,
                                pb_name=pb_name,
                                messages_and_enums=file.proto.
                                messages_and_enums,
                            ),
                            output_type=self.
                            typescript_type_with_package_from_proto_type(
                                message=method.proto._descriptor.output_type,
                                file=file.proto._descriptor,
                                state_names=state_names,
                                google_protobuf_used_messages=
                                google_protobuf_used_messages,
                                pb_name=pb_name,
                                messages_and_enums=file.proto.
                                messages_and_enums,
                            ),
                            python_input_type=PythonRebootProtocPlugin.
                            _py_type_name(method.proto._descriptor.input_type),
                            python_request_message_module=self.
                            get_python_module(
                                message=method.proto._descriptor.input_type,
                            ),
                            has_non_none_response=self.
                            _analyze_has_non_none_response(
                                method.proto._descriptor.output_type,
                                from_zod,
                            ),
                        ) for method in service.methods
                    ],
                )
            )
        return result

    def _nodejs_states(
        self,
        file: BaseFile,
        states: Sequence[BaseState],
        google_protobuf_used_messages: set[str],
        pb_name: str,
    ) -> list[NodejsState]:
        result: list[NodejsState] = []
        for state in states:
            result.append(
                NodejsState(
                    proto=state.proto,
                    services=self._nodejs_services(
                        file,
                        state.services,
                        google_protobuf_used_messages,
                        pb_name,
                        file.options.proto.zod is not None,
                    ),
                )
            )
        return result

    def _nodejs_clients(
        self,
        file: BaseFile,
        clients: Sequence[BaseClient],
        google_protobuf_used_messages: set[str],
        pb_name: str,
    ) -> list[NodejsClient]:
        result: list[NodejsClient] = []
        for client in clients:
            result.append(
                NodejsClient(
                    proto=client.proto,
                    services=self._nodejs_services(
                        file,
                        client.services,
                        google_protobuf_used_messages,
                        pb_name,
                        file.options.proto.zod is not None,
                    ),
                    state=client.state,
                )
            )
        return result

    def add_language_dependent_data(self, file: BaseFile) -> BaseFile:
        base64_gzip_rbt_py = ""

        if len(file.clients) > 0 or len(file.states) > 0:
            # If there are Reboot definitions in the proto file, then '*_rbt.py'
            # file should be generated and embedded in the generated '*_rbt.ts'
            # file.
            #
            # It is tricky to pass the Reboot Python protoc plugin binary to the
            # NodeJS plugin in the context of Bazel tests, so we are just
            # invoking the Reboot Python plugin explicitly here.
            python_reboot_plugin = PythonRebootProtocPlugin(self.pool)

            python_template_data = python_reboot_plugin.template_data(
                file.proto._proto_descriptor,
                generating_python_from_nodejs=True,
            )

            assert python_template_data is not None

            base64_gzip_rbt_py = base64.b64encode(
                gzip.compress(
                    python_reboot_plugin.template_render(python_template_data
                                                        ).encode('utf-8'),
                    # Override timestamp, mtime, so .compress is deterministic.
                    mtime=0
                )
            ).decode('utf-8')

        pb2_py, pb2_grpc_py = protoc(file.proto._descriptor)

        google_protobuf_used_messages = self._google_protobuf_messages(
            file.proto._descriptor
        )

        pb_name = self._pb_file_name(file.proto._descriptor)

        nodejs_file: BaseFile = NodejsFile(
            proto=file.proto,
            options=file.options,
            legacy_grpc_services=file.legacy_grpc_services,
            states=self._nodejs_states(
                file,
                file.states,
                google_protobuf_used_messages,
                pb_name,
            ),
            clients=self._nodejs_clients(
                file,
                file.clients,
                google_protobuf_used_messages,
                pb_name,
            ),
            reboot_version=file.reboot_version,
            imports=self._analyze_imports(file.proto._descriptor),
            import_ids=self._unique_import_aliases(file.proto._descriptor),
            pb_name=pb_name,
            google_protobuf_used_messages=google_protobuf_used_messages,
            rbt_name=self.rbt_module_name(file.proto._descriptor),
            pb2_name=PythonRebootProtocPlugin._pb2_module_name(
                file.proto._descriptor
            ),
            pb2_grpc_name=PythonRebootProtocPlugin._pb2_module_name(
                file.proto._descriptor
            ) + '_grpc',
            base64_gzip_pb2_py=base64.b64encode(
                # Override timestamp, mtime, so .compress is deterministic.
                gzip.compress(pb2_py.encode('utf-8'), mtime=0)
            ).decode('utf-8'),
            base64_gzip_pb2_grpc_py=base64.b64encode(
                # Override timestamp, mtime, so .compress is deterministic.
                gzip.compress(pb2_grpc_py.encode('utf-8'), mtime=0)
            ).decode('utf-8'),
            # Leaving it empty for now, since we can handle a proto file which
            # doesn't contain a Reboot service.
            base64_gzip_rbt_py=base64_gzip_rbt_py,
            nodejs_extensions=os.environ.get(
                ENVVAR_REBOOT_NODEJS_EXTENSIONS, "false"
            ).lower() == "true",
        )

        return nodejs_file

    @classmethod
    def rbt_module_name(cls, file: FileDescriptor) -> str:
        """Get Reboot Python generated module name from file descriptor name
        and package.
        """
        file_name = os.path.basename(file.name).removesuffix('.proto')
        return file.package + '.' + file_name + '_rbt'


# This is a separate function (rather than just being in `__main__`) so that we
# can refer to it as a `script` in our `pyproject.rbt.toml` file.
@rebootdev.aio.tracing.main_span("protoc_gen_reboot_nodejs")
def main():
    try:
        NodejsRebootProtocPlugin.execute()
    except UserProtoError as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)


if __name__ == '__main__':
    main()
