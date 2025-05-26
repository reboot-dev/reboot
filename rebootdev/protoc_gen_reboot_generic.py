#!/usr/bin/env python3
import copy
import os
import re
import sys
from collections.abc import Iterable
from dataclasses import dataclass, is_dataclass
from google.api import annotations_pb2
from google.protobuf.descriptor import (
    Descriptor,
    FieldDescriptor,
    FileDescriptor,
    MethodDescriptor,
    ServiceDescriptor,
)
from google.protobuf.descriptor_pb2 import FileDescriptorProto
# TODO: Dependency not recognized in git-submodule for some reason.
from pyprotoc_plugin.helpers import (  # type: ignore[import]
    add_template_path,
    load_template,
)
from pyprotoc_plugin.plugins import ProtocPlugin  # type: ignore[import]
from rbt.v1alpha1 import options_pb2
from rebootdev.options import (
    get_method_options,
    get_service_options,
    get_state_options,
    has_method_options,
    has_service_options,
    is_reboot_state,
)
from rebootdev.version import REBOOT_VERSION
from typing import Any, Literal, Optional, Sequence

# NOTE: we need to add the template path so we can test
# `RebootProtocPlugin` even when we're not '__main__'.
add_template_path(os.path.join(__file__, '../templates/'))

Feature = Literal[
    'reader',
    'writer',
    'transaction',
    'error',
    'streaming',
    'workflow',
]


class UserProtoError(Exception):
    """Exception raised in case of a malformed user-provided proto file."""
    pass


@dataclass(kw_only=True)
class PluginSpecificData:
    template_filename: str
    output_filename_suffix: str
    supported_features: list[Feature]
    only_generates_with_reboot_services: bool = True
    exclude_google_and_reboot_system_generation: bool = True


ProtoType = str


def asdict_omit_private_fields(name: str, obj: Any) -> Any:
    if obj is None:
        return None

    if isinstance(obj, dict):
        return {
            asdict_omit_private_fields(name=f"{name}.keys[?]", obj=k):
                asdict_omit_private_fields(name=f"{name}.values[?]", obj=v)
            for k, v in obj.items()
        }

    if isinstance(obj, Iterable) and not isinstance(obj, str):
        return [
            asdict_omit_private_fields(name=f"{name}[?]", obj=v) for v in obj
        ]

    if not is_dataclass(obj):
        # Following the semantics of `dataclasses.as_dict`:
        # we won't recurse into this field but will deep-copy it instead.
        #
        # We expect this object to be something a template might use; i.e. a
        # primitive. Yell loudly if it isn't!
        if not isinstance(obj, int) and not isinstance(obj, str):
            raise AssertionError(
                f"Unexpected template data field type: '{name}' is a "
                f"'{type(obj)}'"
            )
        return copy.deepcopy(obj)

    return {
        k: asdict_omit_private_fields(name=f"{name}.{k}", obj=v)
        for k, v in obj.__dict__.items()
        if not k.startswith("_")
    }


@dataclass
class ProtoMethodOptions:
    kind: str
    constructor: bool
    state_streaming: bool
    has_errors: bool


@dataclass
class BaseMethodOptions:
    proto: ProtoMethodOptions


@dataclass
class ProtoMethod:
    name: str
    full_name: str
    client_streaming: bool
    server_streaming: bool

    # Private fields are used only within the plugin, they are not passed to the
    # template.
    _descriptor: MethodDescriptor


@dataclass
class BaseMethod:
    proto: ProtoMethod
    options: BaseMethodOptions


@dataclass
class ProtoServiceOptions:
    state_name: str
    state_full_name: str


@dataclass
class BaseServiceOptions:
    proto: ProtoServiceOptions


@dataclass
class ProtoService:
    name: str
    full_name: str
    has_constructor: bool
    requires_constructor: bool

    # Private fields are used only within the plugin, they are not passed to the
    # template.
    _descriptor: ServiceDescriptor


@dataclass
class BaseService:
    proto: ProtoService
    # The following is a Sequence, not list, to make it covariant:
    #   https://mypy.readthedocs.io/en/stable/common_issues.html#variance
    methods: Sequence[BaseMethod]
    options: BaseServiceOptions


@dataclass
class ProtoLegacyGrpcService:
    name: str  # Relative name as written in proto, e.g. "GreeterMethods".

    # Private methods are used only within the plugin, they are not passed to
    # the template.
    _descriptor: ServiceDescriptor


@dataclass
class BaseLegacyGrpcService:
    proto: ProtoLegacyGrpcService


### States
# A state is a proto `message` annotated as being a Reboot state. They may or
# may not be present in the `.proto` file being compile. When they are, we
# generate the server-side ("servicer") API.


@dataclass
class ProtoState:
    name: str  # Relative name as written in proto, e.g. "Greeter"
    full_name: str  # Name including package.
    implements: list[str]  # Full names of services.


@dataclass
class BaseState:
    proto: ProtoState
    services: Sequence[BaseService]


### Clients
# A client represents a set of methods that can be called on some state. Clients
# are generated based on `service`s in the `.proto` file; the `message` defining
# the state may or may not be known.
#
# If only the `service`s are known, we generate a client without server-side API
# features (e.g. `MyClientName.Servicer` for Python). If both the `service`s and
# the state `message` are known we'll generate both the client-side API and the
# server-side API.


@dataclass
class ProtoClient:
    state_name: str  # Relative; e.g. "Greeter".
    state_full_name: str  # Including package name; e.g. "foo.v1.Greeter".


@dataclass
class BaseClient:
    proto: ProtoClient
    services: Sequence[BaseService]
    state: Optional[BaseState]


@dataclass
class ProtoFile:
    package_name: str
    file_name: str
    # List of all messages and enums in the proto file.
    messages_and_enums: list[str]

    # Private fields are used only within the plugin, they are not passed to the
    # template.
    _descriptor: FileDescriptor
    _proto_descriptor: FileDescriptorProto


@dataclass
class BaseFile:
    proto: ProtoFile
    # The following is a Sequence, not list, to make it covariant:
    #   https://mypy.readthedocs.io/en/stable/common_issues.html#variance
    legacy_grpc_services: Sequence[BaseLegacyGrpcService]
    states: Sequence[BaseState]
    clients: Sequence[BaseClient]
    reboot_version: str


@dataclass
class CheckedServices:
    reboot: list[ServiceDescriptor]
    legacy_grpc: list[ServiceDescriptor]


METHODS_SUFFIX = "Methods"


class RebootProtocPlugin(ProtocPlugin):

    @staticmethod
    def is_reboot_service(service: ServiceDescriptor) -> bool:
        return (
            has_service_options(service) or
            any(has_method_options(method) for method in service.methods)
        )

    @staticmethod
    def state_name_from_service_name(service_name: str) -> Optional[str]:
        if not service_name.endswith(METHODS_SUFFIX):
            return None
        state_name = service_name[:-len(METHODS_SUFFIX)]
        state_name = state_name[state_name.rfind('.') + 1:]

        return state_name

    @staticmethod
    def default_service_name_from_state_name(state_name: str) -> str:
        return f"{state_name}{METHODS_SUFFIX}"

    def _check_services(self, file: FileDescriptor) -> CheckedServices:
        reboot_services: list[ServiceDescriptor] = []
        legacy_grpc_services: list[ServiceDescriptor] = []

        def _check_reboot_requirements(service: ServiceDescriptor) -> None:
            # A Reboot service name must end in the "Methods" suffix.
            if not service.name.endswith(METHODS_SUFFIX):
                raise UserProtoError(
                    f"Reboot service '{service.full_name}' has illegal name: "
                    "all Reboot service names must end in 'Methods', since "
                    "(unlike basic gRPC) they provide methods to Reboot states"
                )

            # A Reboot service, if it knows the `message` for its state, must be
            # linked to a `message` that's _annotated_ as a Reboot state.
            service_options = RebootProtocPlugin._proto_service_options(
                service
            )
            try:
                state = self.pool.FindMessageTypeByName(
                    service_options.state_full_name
                )
                if not is_reboot_state(state):
                    raise UserProtoError(
                        f"Reboot service '{service.full_name}' is linked to "
                        f"state message '{state.full_name}', but that message "
                        "is not annotated as a Reboot state; all Reboot states "
                        "must have the 'rbt.v1alpha1.state' annotation."
                    )
            except KeyError:
                # That's OK; not all services are compiled with their state
                # included. Skip this optional check.
                pass

            for method in service.methods:
                # All methods in a Reboot service must have a Reboot annotation.
                if not has_method_options(method):
                    raise UserProtoError(
                        "Missing Reboot method annotation for "
                        f"'{service.full_name}/{method.name}'"
                    )

                # Reboot method names must start with an uppercase letter, to
                # avoid name clashes with Python modules in the Reboot generated
                # code (e.g. `rpc reboot` would shadow the `reboot` module).
                if method.name[0].islower():
                    raise UserProtoError(
                        f"Reboot method '{service.full_name}/{method.name}' "
                        "has illegal name: all Reboot RPC method names must "
                        "start with an uppercase letter."
                    )

                # Reboot methods don't support HTTP annotations (yet).
                #
                # TODO(rjh): consider what it would take to allow Reboot
                #            services to have their own `google.api.http`
                #            annotations; at least singletons.
                if method.GetOptions().HasExtension(annotations_pb2.http):
                    raise UserProtoError(
                        f"Service '{service.name}' method '{method.name}' "
                        "has a 'google.api.http' annotation. This is only "
                        "supported for legacy gRPC services, not for Reboot "
                        "methods. Let the maintainers know about your use case "
                        "if you feel this is a limitation!"
                    )

        for service in file.services_by_name.values():
            if RebootProtocPlugin.is_reboot_service(service):
                _check_reboot_requirements(service)
                reboot_services.append(service)
            else:
                legacy_grpc_services.append(service)

        return CheckedServices(
            reboot=reboot_services,
            legacy_grpc=legacy_grpc_services,
        )

    def _check_states(
        self, proto_file: ProtoFile, proto_states: list[ProtoState]
    ):
        for proto_state in proto_states:
            for service_full_name in proto_state.implements:
                try:
                    service = self.pool.FindServiceByName(service_full_name)
                    service_options = RebootProtocPlugin._proto_service_options(
                        service
                    )
                    if service_options.state_full_name != proto_state.full_name:
                        raise UserProtoError(
                            f"Reboot state message '{proto_state.full_name}' "
                            "is expecting to get methods from service "
                            f"'{service_full_name}', but that service is "
                            f"providing methods for a state message named "
                            f"'{service_options.state_full_name}' instead."
                        )
                except KeyError:
                    raise UserProtoError(
                        "Missing Reboot service named "
                        f"'{service_full_name}'; expected by state message "
                        f"'{proto_state.full_name}' defined in "
                        f"'{proto_file.file_name}'."
                    )

    @staticmethod
    def plugin_specific_data() -> PluginSpecificData:
        """Returns the plugin-specific data for the plugin."""
        raise NotImplementedError

    @staticmethod
    def _reboot_states(file: FileDescriptor) -> list[Descriptor]:
        """Gets all messages that are annotated as being Reboot states
        """
        return [
            descriptor for descriptor in file.message_types_by_name.values()
            if is_reboot_state(descriptor)
        ]

    @classmethod
    def _is_message_in_file(
        self,
        message_name: Optional[str],
        file: FileDescriptor,
    ) -> bool:
        if message_name is None:
            return False
        return message_name in file.message_types_by_name

    @classmethod
    def _proto_message_and_enum_names(
        self,
        file: FileDescriptor,
    ) -> list[str]:
        """
        Helper to extract name of all messages and enums from file descriptor,
        excepting Reboot states (which are not your typical message).

        Includes only top-level messages and enums. Accessing nested structures
        is supported through the parent message, which will be included.
        """
        messages_and_enums: list[str] = []

        # `message_types_by_name` is undefined if no messages are present.
        if hasattr(file, "message_types_by_name"):
            for name, message in file.message_types_by_name.items():
                if is_reboot_state(message):
                    # Exclude Reboot states. They are not your typical message,
                    # and (unlike all other messages) we don't want to e.g.
                    # reexport them in the `_rbt` file.
                    continue
                messages_and_enums.append(name)

        # `enum_types_by_name` is undefined if no enums are present.
        if hasattr(file, "enum_types_by_name"):
            messages_and_enums.extend(file.enum_types_by_name.keys())

        return messages_and_enums

    def template_data(
        self,
        file_proto: FileDescriptorProto,
    ) -> BaseFile:

        def check_legal_proto_directory(directory):
            pattern = r"^[A-Za-z0-9_]*$"
            parts = directory.split(os.path.sep)

            for part in parts:
                if not re.match(pattern, part):
                    raise UserProtoError(
                        f"Proto file '{file_proto.name}' is located in a directory "
                        f"'{directory}' that is not a legal 'proto3' package name "
                        "component. Legal characters are letters, numbers, and "
                        "underscore. Reboot requires that the directory structure "
                        "matches the proto file's package name. Please rename your "
                        "directory."
                    )

        file = self.pool.FindFileByName(file_proto.name)
        if file.package == '':
            raise UserProtoError(
                f"Proto file '{file.name}' is missing a (currently) required "
                "'package' statement"
            )

        directory = os.path.dirname(file.name)

        check_legal_proto_directory(directory)

        package_directory = file.package.replace('.', os.path.sep)
        if package_directory != directory:
            raise UserProtoError(
                f"Proto file '{file.name}' has package '{file.package}', but "
                "based on the file's path the expected package was "
                f"'{directory.replace(os.path.sep, '.')}'. 'rbt protoc' "
                "expects the package to match the directory structure. Check "
                "that the API base directory is correct, and if so, adjust "
                "either the proto file's location or its package."
            )

        # First compute all language-independent information.
        base_file = self._base_data(file, file_proto)

        # Then ask the language-specific logic to add any further information
        # that this specific language needs.
        full_file = self.add_language_dependent_data(base_file)

        # If the `file_proto` does not contain Reboot states or clients, i.e.
        # there's only dependencies, return early so it can be passed to
        # non-Reboot templates that might need it.
        if len(full_file.states) == 0 and len(full_file.clients) == 0:
            return full_file

        self._validate_features(full_file)

        for service in [
            service for client in full_file.clients
            for service in client.services
        ]:
            for method in service.methods:
                if method.proto.client_streaming and method.options.proto.kind != 'reader':
                    raise UserProtoError(
                        'Client streaming only supported for readers'
                    )
                if method.proto.server_streaming and method.options.proto.kind != 'reader':
                    raise UserProtoError(
                        'Server streaming only supported for readers'
                    )

        return full_file

    def _proto_file(
        self, file: FileDescriptor, file_proto: FileDescriptorProto
    ) -> ProtoFile:
        return ProtoFile(
            package_name=file.package,
            file_name=file.name,
            messages_and_enums=self._proto_message_and_enum_names(file),
            _descriptor=file,
            _proto_descriptor=file_proto,
        )

    def _proto_state(self, state: Descriptor) -> ProtoState:
        implements = get_state_options(state).implements
        if len(implements) == 0:
            # The user didn't say explicitly, so assume the default.
            implements = [
                RebootProtocPlugin.default_service_name_from_state_name(
                    state.name
                )
            ]

        def make_full_name(service_name: str):
            if "." in service_name:
                # Already a full name.
                return service_name
            return f"{state.file.package}.{service_name}"

        implements = [
            make_full_name(service_name) for service_name in implements
        ]

        return ProtoState(
            name=state.name,
            full_name=state.full_name,
            implements=implements,
        )

    @staticmethod
    def _proto_service_options(
        service: ServiceDescriptor
    ) -> ProtoServiceOptions:

        # By default we use a naming convention to link services to their state.
        state_name = RebootProtocPlugin.state_name_from_service_name(
            service.full_name
        )

        # The user may however set an explicit state name.
        options = get_service_options(service)
        if options.state:
            state_name = options.state
        assert state_name is not None, service.full_name

        state_full_name: Optional[str] = None
        if "." in state_name:
            # Already a full name (i.e. including package).
            state_full_name = state_name
            state_name = state_name.rsplit(".", maxsplit=1)[1]
        else:
            state_full_name = f"{service.file.package}.{state_name}"

        assert state_full_name is not None

        return ProtoServiceOptions(
            state_name=state_name,
            state_full_name=state_full_name,
        )

    def _is_default_constructible(self, service: ServiceDescriptor) -> bool:
        service_options = get_service_options(service)
        return service_options.default_constructible

    def _is_method_constructor(self, method: MethodDescriptor) -> bool:
        method_options = get_method_options(method)
        kind: Optional[str] = method_options.WhichOneof('kind')
        if kind is None:
            raise UserProtoError(
                f"'{method.name}' is missing the required Reboot annotation 'kind'"
            )

        return kind in [
            'writer', 'transaction'
        ] and getattr(method_options, kind).HasField('constructor')

    @classmethod
    def _is_map_field(
        cls, message: Descriptor, field: FieldDescriptor
    ) -> bool:
        # Protobuf encodes its `map` type as a repeated message type name
        # `{${Field}Entry}`, which is an inner type of the message with the
        # same name as the field.
        field_camelcase_name = ''.join(
            component.capitalize() for component in field.name.split('_')
        )
        return (
            field.type == FieldDescriptor.TYPE_MESSAGE and
            field.label == FieldDescriptor.LABEL_REPEATED and
            field.message_type.containing_type == message and
            field.message_type.name == f'{field_camelcase_name}Entry'
        )

    def _proto_service(
        self,
        service_descriptor: ServiceDescriptor,
    ) -> ProtoService:
        has_constructor = False
        requires_constructor = False

        if not self._is_default_constructible(service_descriptor):
            for method in service_descriptor.methods:
                if self._is_method_constructor(method):
                    has_constructor = True
                    requires_constructor = True
                    break

        return ProtoService(
            name=service_descriptor.name,
            full_name=service_descriptor.full_name,
            has_constructor=has_constructor,
            requires_constructor=requires_constructor,
            _descriptor=service_descriptor,
        )

    def _proto_legacy_grpc_service(
        self,
        service: ServiceDescriptor,
    ) -> ProtoLegacyGrpcService:
        return ProtoLegacyGrpcService(
            name=service.name,
            _descriptor=service,
        )

    def _proto_method(self, method: MethodDescriptor) -> ProtoMethod:
        return ProtoMethod(
            name=method.name,
            full_name=method.full_name,
            client_streaming=method.client_streaming,
            server_streaming=method.server_streaming,
            _descriptor=method,
        )

    def _proto_method_options(
        self,
        method: MethodDescriptor,
    ) -> ProtoMethodOptions:
        method_options = get_method_options(method)
        kind: Optional[str] = method_options.WhichOneof('kind')
        state_streaming = method.client_streaming or method.server_streaming

        if kind is None:
            raise UserProtoError(
                f"'{method.name}' is missing the required Reboot annotation 'kind'"
            )

        if kind == 'reader':
            if (
                method_options.reader.state ==
                options_pb2.ReaderMethodOptions.State.STREAMING
            ):
                state_streaming = True
            elif (
                method_options.reader.state ==
                options_pb2.ReaderMethodOptions.State.UNARY
            ):
                state_streaming = False

        return ProtoMethodOptions(
            kind=kind,
            constructor=self._is_method_constructor(method),
            state_streaming=state_streaming,
            has_errors=len(method_options.errors) > 0,
        )

    def _base_service(self, service: ServiceDescriptor) -> BaseService:
        return BaseService(
            proto=self._proto_service(service),
            methods=[
                BaseMethod(
                    proto=self._proto_method(method),
                    options=BaseMethodOptions(
                        proto=self._proto_method_options(method),
                    ),
                ) for method in service.methods
            ],
            options=BaseServiceOptions(
                proto=RebootProtocPlugin._proto_service_options(service),
            ),
        )

    def _base_services_for_state(
        self, proto_file: ProtoFile, proto_state: ProtoState
    ) -> list[BaseService]:
        base_services: list[BaseService] = []
        for service_full_name in proto_state.implements:
            try:
                service = self.pool.FindServiceByName(service_full_name)
                service_options = RebootProtocPlugin._proto_service_options(
                    service
                )
                if service_options.state_full_name != proto_state.full_name:
                    raise UserProtoError(
                        f"Reboot state message '{proto_state.full_name}' "
                        "is expecting to get methods from service "
                        f"'{service_full_name}', but that service is "
                        f"providing methods for a state message named "
                        f"'{service_options.state_full_name}' instead."
                    )
                base_services.append(self._base_service(service))
            except KeyError:
                raise UserProtoError(
                    "Missing Reboot service named "
                    f"'{service_full_name}'; expected by state message "
                    f"'{proto_state.full_name}' defined in "
                    f"'{proto_file.file_name}'."
                )

            # Note: duplicate methods between services are checked for during
            #       client generation.

        return base_services

    @staticmethod
    def _check_no_duplicate_methods(
        state_full_name: str,
        base_services: list[BaseService],
    ):
        seen_methods_by_name: dict[str, BaseMethod] = {}
        for base_service in base_services:
            for base_method in base_service.methods:
                method_name = base_method.proto.name
                previous_method = seen_methods_by_name.get(method_name)
                if previous_method is None:
                    seen_methods_by_name[method_name] = base_method
                    continue
                raise UserProtoError(
                    f"Reboot state '{state_full_name}' has conflicting "
                    f"methods named '{method_name}': one from "
                    f"'{previous_method.proto.full_name}', another from "
                    f"'{base_method.proto.full_name}'. Each method name may "
                    "only be used once per state type."
                )

    @staticmethod
    def _base_clients(services: list[BaseService],
                      states: list[BaseState]) -> list[BaseClient]:
        state_by_full_name = {state.proto.full_name: state for state in states}
        services_by_state_full_name: dict[str, list[BaseService]] = {}
        state: Optional[BaseState] = None  # For typing.

        # For those states for which we have the message, we know all of the
        # services it implements (even those from other files and packages).
        for state in states:
            services_by_state_full_name[state.proto.full_name
                                       ] = list(state.services)

        # However, there may be some states for which we don't have the
        # 'message', and whose existence we can only deduce from the existence
        # of services that refer to them. Accumulate the services for these.
        for service in services:
            # If we have the state message for this service, then we can do a
            # sanity check that the state indeed implements this service. If we
            # don't, we'll just have to trust the developer didn't make a
            # mistake.
            state_full_name = service.options.proto.state_full_name
            state = state_by_full_name.get(state_full_name)
            if state is not None:
                if service not in state.services:
                    raise UserProtoError(
                        f"Service '{service.proto.full_name}' supplies methods to "
                        f"state message '{service.options.proto.state_full_name}', "
                        f"but that state does not implement those methods - it "
                        f"only implements methods from the following services: "
                        f"{state.proto.implements}"
                    )
                # We've already accumulated all of the services for this state,
                # so we don't need to do it again.
                continue

            # Since we didn't have the state message for this service, we must
            # accumulate the service now.
            if state_full_name not in services_by_state_full_name:
                services_by_state_full_name[state_full_name] = []
            services_by_state_full_name[state_full_name].append(service)

        # For each state, known or deduced, we generate a client.
        clients: list[BaseClient] = []
        for state_full_name, services in services_by_state_full_name.items():
            RebootProtocPlugin._check_no_duplicate_methods(
                state_full_name, services
            )

            state = state_by_full_name.get(state_full_name)
            state_name = state_full_name.rsplit(".", maxsplit=1)[1]
            clients.append(
                BaseClient(
                    proto=ProtoClient(
                        state_name=state_name,
                        state_full_name=state_full_name,
                    ),
                    services=services,
                    state=state,
                )
            )
        return clients

    def _base_data(
        self,
        file: FileDescriptor,
        file_proto: FileDescriptorProto,
    ) -> BaseFile:
        checked_services = self._check_services(file)

        proto_file = self._proto_file(file, file_proto)

        states = [
            BaseState(
                proto=proto_state,
                services=self._base_services_for_state(
                    proto_file,
                    proto_state,
                ),
            ) for proto_state in [
                self._proto_state(state)
                for state in RebootProtocPlugin._reboot_states(file)
            ]
        ]

        services = [
            self._base_service(service) for service in checked_services.reboot
        ]

        clients = self._base_clients(services, states)

        return BaseFile(
            proto=proto_file,
            legacy_grpc_services=[
                BaseLegacyGrpcService(
                    proto=self._proto_legacy_grpc_service(service),
                ) for service in checked_services.legacy_grpc
            ],
            states=states,
            clients=clients,
            reboot_version=REBOOT_VERSION,
        )

    def process_file(self, file_proto: FileDescriptorProto) -> None:
        try:
            if (
                file_proto.syntax != "proto3"
                # Special case: the `descriptor.proto` doesn't report a syntax,
                #               but we know we can handle it.
                and file_proto.name != "google/protobuf/descriptor.proto"
            ):
                raise UserProtoError(
                    f"Unsupported: not a proto3 file. "
                    "Reboot only supports proto files that set "
                    "'syntax=\"proto3\";', but got "
                    f"'syntax=\"{file_proto.syntax}\";'"
                )

            template_data = self.template_data(file_proto)

            # Check if file has any Reboot states or clients and only generate
            # if the plugin wants to and the services are user-defined.
            if (
                len(template_data.states) == 0 and
                len(template_data.clients) == 0
            ):
                if self.plugin_specific_data(
                ).only_generates_with_reboot_services:
                    # This proto file contains no Reboot services or states, and
                    # the plugin has indicated that that means we should skip it.
                    return None

                if self._is_google_or_reboot_package(
                    file_proto.package
                ) and self.plugin_specific_data(
                ).exclude_google_and_reboot_system_generation:
                    return None

                # No Reboot services but plugin still wants to generate code.
                output_file = self.response.file.add()
                output_file.name = template_data.proto.file_name.replace(
                    '.proto',
                    self.plugin_specific_data().output_filename_suffix,
                )
                output_file.content = self.template_render(template_data)
                return output_file

            for service in [
                service for client in template_data.clients
                for service in client.services
            ]:
                if len(service.methods) == 0:
                    raise UserProtoError(
                        f"Service '{service.proto.name}' has no rpc methods specified. "
                        "Complete your proto file."
                    )

            content = self.template_render(template_data)
            output_file = self.response.file.add()
            output_file.name = template_data.proto.file_name.replace(
                '.proto',
                self.plugin_specific_data().output_filename_suffix,
            )
            output_file.content = content

        except (UserProtoError, ValueError) as error:
            # NOTE: we catch `ValueError` here because we're using methods from
            # `options.py` that might raise `ValueError` in response to
            # malformed input.
            # We re-raise any error as a `UserProtoError`
            # but with additional information in the error message.
            raise UserProtoError(
                f"Error processing '{file_proto.name}': {error}"
            ) from error

    def add_language_dependent_data(self, file: BaseFile) -> BaseFile:
        raise NotImplementedError

    def _validate_features(self, template_data: BaseFile) -> None:
        """Raises an error if not all user-requested features are implemented.
        """
        feature_set_in_template_data = set()

        for service in [
            service for client in template_data.clients
            for service in client.services
        ]:
            for method in service.methods:
                feature_set_in_template_data.add(method.options.proto.kind)
                if method.options.proto.has_errors is True:
                    feature_set_in_template_data.add('error')
                if method.options.proto.state_streaming or method.proto.client_streaming or method.proto.server_streaming:
                    feature_set_in_template_data.add('streaming')

        supported_feature_set = set(
            self.plugin_specific_data().supported_features
        )

        if not feature_set_in_template_data.issubset(supported_feature_set):
            print(
                'You are attempting to use Reboot features in your .proto '
                'file that are not yet supported.\n'
                '\n'
                f'Unsupported features: {feature_set_in_template_data - supported_feature_set}',
                file=sys.stderr,
            )
            sys.exit(1)

    def find_error_message(
        self, error_name: str, used_by_method: MethodDescriptor
    ) -> Descriptor:
        if "." not in error_name:
            # Make a full name by assuming that the message is in the same
            # package as the method that uses it.
            error_name = f"{used_by_method.containing_service.file.package}.{error_name}"

        try:
            file = self.pool.FindFileContainingSymbol(error_name)
            return file.message_types_by_name[
                error_name.rsplit(".", maxsplit=1)[1]]
        except KeyError:
            raise UserProtoError(
                f"Could not find message type '{error_name}', used as an error "
                f"type by method '{used_by_method.full_name}' defined in "
                f"'{used_by_method.containing_service.file.name}'."
            )

    def template_render(
        self,
        template_data: BaseFile,
    ) -> str:
        template = load_template(
            self.plugin_specific_data().template_filename,
            trim_blocks=True,
            lstrip_blocks=True,
            keep_trailing_newline=True,
            extensions=['jinja2_strcase.StrcaseExtension'],
        )

        return template.render(
            asdict_omit_private_fields(
                name='template_data',
                obj=template_data,
            )
        )
