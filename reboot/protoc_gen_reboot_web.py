#!/usr/bin/env python3
import os
import rebootdev.aio.tracing
from dataclasses import dataclass
from reboot.cli import terminal
from reboot.protoc_gen_reboot_typescript import TypescriptRebootProtocPlugin
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
from rebootdev.settings import ENVVAR_REBOOT_WEB_EXTENSIONS
from typing import Sequence

ReactType = str
WebType = str


@dataclass
class WebMethodOptions(BaseMethodOptions):
    errors: dict[ProtoType, ReactType]


@dataclass
class WebMethod(BaseMethod):
    options: WebMethodOptions
    input_type: WebType
    output_type: WebType


@dataclass
class WebService(BaseService):
    methods: Sequence[WebMethod]


@dataclass
class WebState(BaseState):
    services: Sequence[WebService]


@dataclass
class WebClient(BaseClient):
    services: Sequence[WebService]


@dataclass
class WebFile(BaseFile):
    # Dictionary where the key is the relative path to the
    # file and the value is the unique name of the file.
    imports: dict[str, str]
    # The name of the ES module, which contains the generated protobuf
    # messages ("*_pb.js").
    pb_name: str
    # Set of messages that are used in the file and should be imported from
    # '@bufbuild/protobuf'.
    google_protobuf_used_messages: set[str]
    # Whether or not to emit .js extensions.
    web_extensions: bool
    # List of mutation methods.
    mutation_methods: list[WebMethod]


class WebRebootProtocPlugin(TypescriptRebootProtocPlugin):

    @staticmethod
    def plugin_specific_data() -> PluginSpecificData:
        return PluginSpecificData(
            template_filename="reboot_web.ts.j2",
            output_filename_suffix="_rbt_web.ts",
            supported_features=[
                "reader",
                "writer",
                "transaction",
                "error",
                "streaming",
                "workflow",
            ],
        )

    def _web_services(
        self,
        file: BaseFile,
        services: Sequence[BaseService],
        google_protobuf_used_messages: set[str],
        pb_name: str,
    ) -> list[WebService]:
        state_names = [state.proto.name for state in file.states]
        return [
            WebService(
                proto=service.proto,
                options=service.options,
                methods=[
                    WebMethod(
                        proto=method.proto,
                        options=WebMethodOptions(
                            proto=method.options.proto,
                            errors=self._analyze_errors(
                                method.proto._descriptor,
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
                            messages_and_enums=file.proto.messages_and_enums,
                            google_protobuf_used_messages=
                            google_protobuf_used_messages,
                            pb_name=pb_name,
                        ),
                        output_type=self.
                        typescript_type_with_package_from_proto_type(
                            message=method.proto._descriptor.output_type,
                            file=file.proto._descriptor,
                            state_names=state_names,
                            messages_and_enums=file.proto.messages_and_enums,
                            google_protobuf_used_messages=
                            google_protobuf_used_messages,
                            pb_name=pb_name,
                        ),
                    ) for method in service.methods
                ],
            ) for service in services
        ]

    def _web_states(
        self,
        file: BaseFile,
        states: Sequence[BaseState],
        google_protobuf_used_messages: set[str],
        pb_name: str,
    ) -> list[WebState]:
        return [
            WebState(
                proto=state.proto,
                services=self._web_services(
                    file,
                    state.services,
                    google_protobuf_used_messages,
                    pb_name,
                ),
            ) for state in states
        ]

    def _web_clients(
        self,
        file: BaseFile,
        clients: Sequence[BaseClient],
        google_protobuf_used_messages: set[str],
        pb_name: str,
    ) -> list[WebClient]:
        return [
            WebClient(
                proto=client.proto,
                services=self._web_services(
                    file,
                    client.services,
                    google_protobuf_used_messages,
                    pb_name,
                ),
                state=client.state,
            ) for client in clients
        ]

    def _web_mutation_methods(
        self,
        file: BaseFile,
        clients: Sequence[BaseClient],
        google_protobuf_used_messages: set[str],
        pb_name: str,
    ) -> list[WebMethod]:
        state_names = [state.proto.name for state in file.states]

        mutations: list[BaseMethod] = []
        for client in clients:
            for service in client.services:
                for method in service.methods:
                    if method.options.proto.kind in ["writer", "transaction"]:
                        if method.proto.full_name not in [
                            mutation.proto.full_name for mutation in mutations
                        ]:
                            mutations.append(method)

        return [
            WebMethod(
                proto=mutation.proto,
                options=WebMethodOptions(
                    proto=mutation.options.proto,
                    errors=self._analyze_errors(
                        mutation.proto._descriptor,
                        state_names=state_names,
                        google_protobuf_used_messages=
                        google_protobuf_used_messages,
                        pb_name=pb_name,
                    ),
                ),
                input_type=self.typescript_type_with_package_from_proto_type(
                    message=mutation.proto._descriptor.input_type,
                    file=file.proto._descriptor,
                    state_names=state_names,
                    messages_and_enums=file.proto.messages_and_enums,
                    google_protobuf_used_messages=google_protobuf_used_messages,
                    pb_name=pb_name,
                ),
                output_type=self.typescript_type_with_package_from_proto_type(
                    message=mutation.proto._descriptor.output_type,
                    file=file.proto._descriptor,
                    state_names=state_names,
                    messages_and_enums=file.proto.messages_and_enums,
                    google_protobuf_used_messages=google_protobuf_used_messages,
                    pb_name=pb_name,
                ),
            ) for mutation in mutations
        ]

    def add_language_dependent_data(self, file: BaseFile) -> BaseFile:
        google_protobuf_used_messages = self._google_protobuf_messages(
            file.proto._descriptor
        )

        pb_name = self._pb_file_name(file.proto._descriptor)

        web_file: BaseFile = WebFile(
            proto=file.proto,
            options=file.options,
            legacy_grpc_services=file.legacy_grpc_services,
            states=self._web_states(
                file,
                file.states,
                google_protobuf_used_messages,
                pb_name,
            ),
            clients=self._web_clients(
                file,
                file.clients,
                google_protobuf_used_messages,
                pb_name,
            ),
            mutation_methods=self._web_mutation_methods(
                file,
                file.clients,
                google_protobuf_used_messages,
                pb_name,
            ),
            reboot_version=file.reboot_version,
            imports=self._analyze_imports(file.proto._descriptor),
            pb_name=pb_name,
            google_protobuf_used_messages=google_protobuf_used_messages,
            web_extensions=os.environ.get(
                ENVVAR_REBOOT_WEB_EXTENSIONS, "false"
            ).lower() == "true",
        )

        return web_file


# This is a separate function (rather than just being in `__main__`) so that we
# can refer to it as a `script` in our `pyproject.rbt.toml` file.
@rebootdev.aio.tracing.main_span("protoc_gen_reboot_web")
def main():
    try:
        WebRebootProtocPlugin.execute()
    except UserProtoError as error:
        terminal.fail(str(error))


if __name__ == '__main__':
    main()
