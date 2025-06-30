#!/usr/bin/env python3
import os
import re
import rebootdev.aio.tracing
import sys
from dataclasses import dataclass
from google.protobuf.descriptor import (
    Descriptor,
    FieldDescriptor,
    FileDescriptor,
    MethodDescriptor,
)
from google.protobuf.descriptor_pool import DescriptorPool
from rebootdev.options import get_method_options
from rebootdev.protoc_gen_reboot_generic import (
    BaseClient,
    BaseFile,
    BaseLegacyGrpcService,
    BaseMethod,
    BaseMethodOptions,
    BaseService,
    BaseState,
    PluginSpecificData,
    ProtoType,
    RebootProtocPlugin,
    UserProtoError,
)
from typing import Optional, Sequence

PythonType = str


@dataclass
class PythonMethodOptions(BaseMethodOptions):
    errors: dict[ProtoType, PythonType]


@dataclass
class PythonMethod(BaseMethod):
    options: PythonMethodOptions
    input_type: PythonType
    input_type_name: PythonType
    output_type: PythonType
    output_type_name: PythonType
    input_type_fields: dict[str, str]


@dataclass
class PythonLegacyGrpcService(BaseLegacyGrpcService):
    # The name of the Python protoc generated '*_pb2_grpc.py' file.
    pb2_grpc_name: str


@dataclass
class PythonService(BaseService):
    methods: Sequence[PythonMethod]
    # The name of the Python protoc generated '*_pb2_grpc.py' file.
    pb2_grpc_name: str


@dataclass
class PythonState(BaseState):
    services: Sequence[PythonService]
    pb2_name: str


@dataclass
class PythonClient(BaseClient):
    services: Sequence[PythonService]
    state: Optional[PythonState]


@dataclass
class PythonFile(BaseFile):
    # The following is a Sequence, not list, to make it covariant:
    #   https://mypy.readthedocs.io/en/stable/common_issues.html#variance
    states: Sequence[PythonState]
    clients: Sequence[PythonClient]
    imports: set[str]
    # The name of the Python protoc generated '*_pb2.py' file.
    pb2_name: str


class PythonRebootProtocPlugin(RebootProtocPlugin):

    def __init__(self, pool: Optional[DescriptorPool] = None):
        """Initialize the plugin with a descriptor pool. Used only when NodeJS
        plugin generates Python Reboot code."""
        if pool is not None:
            self.pool = pool

    def _py_service(self, service: BaseService) -> PythonService:
        return PythonService(
            proto=service.proto,
            options=service.options,
            methods=[
                PythonMethod(
                    proto=method.proto,
                    options=PythonMethodOptions(
                        proto=method.options.proto,
                        errors=self._analyze_errors(method.proto._descriptor),
                    ),
                    input_type=self._python_type_from_proto_type(
                        method.proto._descriptor.input_type
                    ),
                    input_type_name=self._py_type_name(
                        method.proto._descriptor.input_type
                    ),
                    output_type=self._python_type_from_proto_type(
                        method.proto._descriptor.output_type
                    ),
                    output_type_name=self._py_type_name(
                        method.proto._descriptor.output_type
                    ),
                    input_type_fields=self._analyze_message_fields(
                        method.proto._descriptor.input_type
                    ),
                ) for method in service.methods
            ],
            pb2_grpc_name=self._pb2_module_name(
                service.proto._descriptor.file
            ) + '_grpc',
        )

    def _py_state(self, file: BaseFile, state: BaseState) -> PythonState:
        return PythonState(
            proto=state.proto,
            services=[self._py_service(service) for service in state.services],
            pb2_name=self._pb2_module_name(file.proto._descriptor),
        )

    def add_language_dependent_data(self, file: BaseFile) -> BaseFile:
        return PythonFile(
            proto=file.proto,
            options=file.options,
            legacy_grpc_services=[
                PythonLegacyGrpcService(
                    proto=legacy_grpc_service.proto,
                    pb2_grpc_name=self._pb2_module_name(
                        legacy_grpc_service.proto._descriptor.file
                    ) + '_grpc',
                ) for legacy_grpc_service in file.legacy_grpc_services
            ],
            states=[self._py_state(file, state) for state in file.states],
            clients=[
                PythonClient(
                    proto=client.proto,
                    services=[
                        self._py_service(service)
                        for service in client.services
                    ],
                    state=self._py_state(file, client.state)
                    if client.state is not None else None,
                )
                for client in file.clients
            ],
            reboot_version=file.reboot_version,
            imports=self._analyze_imports(file.proto._descriptor),
            pb2_name=self._pb2_module_name(file.proto._descriptor),
        )

    @staticmethod
    def plugin_specific_data() -> PluginSpecificData:
        return PluginSpecificData(
            template_filename="reboot.py.j2",
            output_filename_suffix="_rbt.py",
            supported_features=[
                "reader",
                "writer",
                "transaction",
                "error",
                "streaming",
                "workflow",
            ],
            only_generates_with_reboot_services=False,
            exclude_google_and_reboot_system_generation=False,
        )

    @classmethod
    def _is_google_or_reboot_package(cls, package_name: str) -> bool:
        return package_name.startswith('google.') or package_name.startswith(
            'rbt.v1alpha1'
        )

    @classmethod
    def _pb2_module_name(cls, file: FileDescriptor) -> str:
        """Get gRPC Python module name from file descriptor name and package.
        """
        file_name = os.path.basename(file.name).removesuffix('.proto')
        return file.package + '.' + file_name + '_pb2'

    @classmethod
    def _py_type_name(cls, message: Descriptor) -> str:
        """Get type name of the given message type, including any enclosing
        types.
        """
        if message.containing_type is None:
            return message.name
        return f"{cls._py_type_name(message.containing_type)}.{message.name}"

    @classmethod
    def _python_type_from_proto_type(
        cls,
        message: Descriptor,
    ) -> str:
        """Get full name (package and type) of generated gRPC message from
        message descriptor.
        """
        py_type_name = cls._py_type_name(message)
        py_module_name = cls._pb2_module_name(message.file)
        full_py_type_name = f'{py_module_name}.{py_type_name}'
        return full_py_type_name

    @classmethod
    def _python_type_from_map_entry_type(
        cls,
        message: Descriptor,
    ) -> str:
        """Gets a fully qualified `dict[K,V]` type definition for the given `repeated ${Field}Entry`
        message.

        Protobuf encodes its `map` type as a repeated message type name `{${Field}Entry}`, which is
        an inner type of the message with the same name as the field.
        """

        field_types = cls._analyze_message_fields(message)
        if set(field_types.keys()) != {'key', 'value'}:
            raise UserProtoError(
                f"Unexpected content for `map` field type message: {field_types}. "
                "Please report this issue to the maintainers!"
            )

        key_name = field_types['key']
        value_name = field_types['value']

        return f'dict[{key_name}, {value_name}]'

    def _analyze_errors(
        self, method: MethodDescriptor
    ) -> dict[ProtoType, PythonType]:
        method_options = get_method_options(method)
        # From error name, e.g., 'product.api.ErrorName' to Python type, e.g., {
        # 'product.api.ErrorName': 'product.api.file_pb2.ErrorName' }.
        errors: dict[ProtoType, PythonType] = {}

        for error_name in method_options.errors:
            error_message = self.find_error_message(error_name, method)
            file = error_message.file
            errors[f"{file.package}.{error_message.name}"
                  ] = self._python_type_from_proto_type(error_message)

        return errors

    @classmethod
    def _analyze_imports(cls, file: FileDescriptor) -> set[str]:
        """Return set of python imports necessary for our generated code
        based on the file descriptor.
        """
        # Firstly, we need the standard gRPC modules, i.e., `_pb2` and
        # `_pb2_grpc`...
        imports = {
            cls._pb2_module_name(file),
        }
        if len(file.services_by_name) > 0:
            imports.add(cls._pb2_module_name(file) + '_grpc')

        # Also include each 'import' in the .proto file.
        for dependency in file.dependencies:
            imports = imports.union(cls._analyze_imports(dependency))

        return imports

    @classmethod
    def _analyze_message_fields(
        cls,
        message: Descriptor,
    ) -> dict[str, str]:
        """Returns a dict from field name, e.g., 'foo' to type
        depending on language, e.g., { 'foo': 'product.api.file_pb2.Foo' }.
        """

        def is_valid_field_name(name: str) -> bool:
            """Field name should be snake_case, lowercase, and not start with
            more than one underscore..
            """
            if name.startswith('__'):
                return False

            pattern = r"^_?[a-z0-9]+(_[a-z0-9]*)*$"

            return bool(re.match(pattern, name))

        py_types: dict[int, str] = {
            FieldDescriptor.TYPE_DOUBLE: 'float',
            FieldDescriptor.TYPE_FLOAT: 'float',
            FieldDescriptor.TYPE_INT32: 'int',
            FieldDescriptor.TYPE_INT64: 'int',
            FieldDescriptor.TYPE_UINT32: 'int',
            FieldDescriptor.TYPE_UINT64: 'int',
            FieldDescriptor.TYPE_SINT32: 'int',
            FieldDescriptor.TYPE_SINT64: 'int',
            FieldDescriptor.TYPE_FIXED32: 'int',
            FieldDescriptor.TYPE_FIXED64: 'int',
            FieldDescriptor.TYPE_SFIXED32: 'int',
            FieldDescriptor.TYPE_SFIXED64: 'int',
            FieldDescriptor.TYPE_BOOL: 'bool',
            FieldDescriptor.TYPE_STRING: 'str',
            FieldDescriptor.TYPE_BYTES: 'bytes',
            FieldDescriptor.TYPE_ENUM: 'int',
        }

        message_fields: dict[str, str] = {}

        for field in message.fields:

            if not is_valid_field_name(field.name):
                raise UserProtoError(
                    f"Field name '{field.name}' is forbidden. Field names must "
                    "be snake_case and lowercase and not start with more than "
                    "one underscore."
                )
            if cls._is_map_field(message, field):
                message_fields[field.name
                              ] = cls._python_type_from_map_entry_type(
                                  field.message_type
                              )
                continue

            if field.type == FieldDescriptor.TYPE_GROUP:
                raise UserProtoError(
                    "Fields of type 'group' are currently not supported"
                )
            elif field.type == FieldDescriptor.TYPE_MESSAGE:
                message_fields[field.name] = cls._python_type_from_proto_type(
                    field.message_type
                )
            else:
                assert field.type in py_types
                message_fields[field.name] = py_types[field.type]

            if field.label == FieldDescriptor.LABEL_REPEATED:
                # To avoid name conflicts in the generated code, we import the
                # 'typing' module as 'IMPORT_typing'.
                message_fields[
                    field.name
                ] = f"IMPORT_typing.Iterable[{message_fields[field.name]}]"

        return message_fields


# This is a separate function (rather than just being in `__main__`) so that we
# can refer to it as a `script` in our `pip_package` BUILD targets.
@rebootdev.aio.tracing.main_span("protoc_gen_reboot_python")
def main():
    try:
        PythonRebootProtocPlugin.execute()
    except UserProtoError as error:
        print(f"{error}", file=sys.stderr)
        sys.exit(1)


if __name__ == '__main__':
    main()
