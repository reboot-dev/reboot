#!/usr/bin/env python3
import os
import re
from google.protobuf.descriptor import (
    Descriptor,
    FileDescriptor,
    MethodDescriptor,
)
from rebootdev.options import get_method_options
from rebootdev.protoc_gen_reboot_generic import RebootProtocPlugin
from typing import Optional


class TypescriptRebootProtocPlugin(RebootProtocPlugin):
    """Helper class for the Reboot Protoc plugin. Used as based class
    for the NodeJS and React plugins."""

    @classmethod
    def _pb_file_name(cls, file: FileDescriptor) -> str:
        """Get gRPC Typescript module name from file descriptor name and package.
        """
        file_name = os.path.basename(file.name).removesuffix('.proto')

        # Generated "*_rbt_react" and "*_pb" files will always be in the same
        # directory.
        return file_name + '_pb'

    @classmethod
    def _typescript_type_from_proto_type(
        cls,
        message: Descriptor,
        file: FileDescriptor,
        state_names: list[str],
        messages_and_enums: Optional[list[str]] = None,
    ) -> str:
        """Get full name of generated gRPC message from message descriptor.
        'unique_name.MessageName' for NodeJS and React plugins.

        Takes a set of `state_names`, which we will have shadowed with a
        stub in the generated code, and which must be suffixed with `Proto`
        at import time, since we are generating a new name `${message}` in the
        generated code.

        Takes `messages_and_enums`, where we will append all the types that we
        can 'generate' in the current method. It is necessary for nested types,
        since in JS the names are 'Foo_Bar_Baz' instead of 'Foo.Bar.Baz'.
        """

        def append_message_and_enums(message_or_enum: str):
            if messages_and_enums is not None:
                if message_or_enum not in messages_and_enums:
                    messages_and_enums.append(message_or_enum)

        message_name = message.name
        requires_unique_name = True
        is_state_name = False

        if message.file.name == file.name or cls._is_google_or_reboot_package(
            message.file.package
        ):
            requires_unique_name = False
            # Means that the proto type is described in the same file
            # and we can import it by a name or it is a non user defined type,
            # that comes from google or rbt.v1alpha1 package.
            if message.name in state_names:
                is_state_name = True
                message_name = f'{message.name}Proto'
            else:
                message_name = message.name

        unique_name = None
        if requires_unique_name:
            unique_name = cls._unique_name_from_proto(message.file.name)

        if message.containing_type is None:
            return message_name if unique_name is None else f"{unique_name}.{message_name}"

        full_message_name = cls._typescript_type_from_proto_type(
            message.containing_type,
            file,
            state_names,
        ) + '_' + message_name

        if not is_state_name:
            append_message_and_enums(full_message_name)

        return full_message_name if unique_name is None else f"{unique_name}.{full_message_name}"

    @classmethod
    def typescript_type_with_package_from_proto_type(
        cls,
        message: Descriptor,
        file: FileDescriptor,
        state_names: list[str],
        google_protobuf_used_messages: set[str],
        pb_name: str,
        messages_and_enums: Optional[list[str]] = None,
    ) -> str:
        """Since we are using Zod, we do not import protobuf messages in the generated
        file explicitly, and in that case we will use them as 'pb_name.Message', so we need
        to adjust the full name of the message to include the package name"""

        full_name = cls._typescript_type_from_proto_type(
            message=message,
            file=file,
            state_names=state_names,
            messages_and_enums=messages_and_enums,
        )

        for state_name in state_names:
            # If the 'input_type' or 'output_type' is a state name, we will
            # import it as 'StateNameProto' in the generated code from the
            # corresponding 'pb_name' file, so no need to add the
            # 'pb_name' prefix.
            if full_name == f'{state_name}Proto':
                return full_name

        if '.' not in full_name and full_name not in google_protobuf_used_messages:
            # If the full name is not qualified, we will import it from the
            # 'pb_name' file, so we will return 'pb_name.full_name'.
            return f'{pb_name}.{full_name}'

        return full_name

    @classmethod
    def _is_google_or_reboot_package(cls, package_name: str) -> bool:
        return package_name.startswith(
            'google.'
        ) or package_name == 'rbt.v1alpha1'

    @classmethod
    def _unique_name_from_proto(cls, proto_name: str) -> str:
        # We can't import types with their full names in ts, so we will use
        # the following structure:
        #       import * as <unique_name> from '<relative_path>'
        # To generate unique_name we will replace all '/' with '_' (since the '/'
        # is not allowed in the import statement) and all '_' symbols in the
        # source name with '__', to avoid conflicts with the '/' to '_' replacement.
        proto_name = proto_name.replace('.proto', '')
        proto_name = proto_name.replace('_', '__')
        proto_name = proto_name.replace(os.path.sep, '_')
        return proto_name

    @classmethod
    def _unique_import_aliases(cls, file: FileDescriptor) -> dict[str, str]:
        unique_ids: dict[str, str] = {}

        # Also include each 'import' in the .proto file.
        for dependency in file.dependencies:
            if cls._is_google_or_reboot_package(dependency.package):
                # We shouldn't import google.* and rbt.v1alpha1 packages, since
                # we ship them with the plugin, so they are already available.
                continue

            folder = os.path.dirname(dependency.name)
            relative_path = os.path.relpath(folder, os.path.dirname(file.name))
            # This regex substitutes everything _not_ alphanumeric with ''.
            unique_id = re.sub(
                '[^a-zA-Z0-9]', '',
                str(
                    os.path.join(
                        relative_path,
                        os.path.basename(dependency.name
                                        ).replace('.proto', '')
                    )
                )
            )

            # For TypeScript to resolve relative imports they _must_ start with
            # "./".
            if not relative_path.startswith("."):
                relative_path = os.path.join(".", relative_path)
            unique_ids[unique_id] = os.path.join(
                relative_path,
                os.path.basename(dependency.name).replace('.proto', '_rbt')
            )

        return unique_ids

    @classmethod
    def _analyze_imports(cls, file: FileDescriptor) -> dict[str, str]:
        # We need to import all the dependencies of the file, so we can use
        # the types from them. We will import them by their unique names.
        # 'imports' is a dictionary where the key is the relative path to the
        # file and the value is the unique name of the file.
        imports: dict[str, str] = {}

        # Also include each 'import' in the .proto file.
        for dependency in file.dependencies:
            if cls._is_google_or_reboot_package(dependency.package):
                # We shouldn't import google.* and rbt.v1alpha1 packages, since
                # we ship them with the plugin, so they are already available.
                continue

            unique_name = cls._unique_name_from_proto(dependency.name)
            folder = os.path.dirname(dependency.name)
            relative_path = os.path.relpath(folder, os.path.dirname(file.name))

            # For TypeScript to resolve relative imports they _must_ start with
            # "./".
            if not relative_path.startswith("."):
                relative_path = os.path.join(".", relative_path)

            imports[os.path.join(
                relative_path,
                os.path.basename(dependency.name).replace('.proto', '_pb')
            )] = unique_name

        return imports

    def _analyze_errors(
        self,
        method: MethodDescriptor,
        state_names: list[str],
        google_protobuf_used_messages: set[str],
        pb_name: str,
    ) -> dict[str, str]:
        method_options = get_method_options(method)
        # From error name, e.g., 'product.api.ErrorName' to type depending on
        # language, e.g., { 'product.api.ErrorName':
        # 'product.api.file_pb2.ErrorName' }.
        errors: dict[str, str] = {}

        for error_name in method_options.errors:
            error_message = self.find_error_message(error_name, method)
            file = error_message.file
            errors[
                f"{file.package}.{error_message.name}"
            ] = self.typescript_type_with_package_from_proto_type(
                message=error_message,
                file=method.containing_service.file,
                state_names=state_names,
                google_protobuf_used_messages=google_protobuf_used_messages,
                pb_name=pb_name,
            )

        return errors

    @classmethod
    def _google_protobuf_messages(cls, file: FileDescriptor) -> set[str]:
        """Returns a set of message type names from the google.protobuf package.
        """
        google_protobuf_deps = []
        for dep in file.dependencies:
            if dep.package.startswith('google.protobuf'):
                google_protobuf_deps += list(dep.message_types_by_name.keys())

        return set(google_protobuf_deps)

    @classmethod
    def _analyze_has_non_none_response(
        cls,
        message: Descriptor,
        from_zod: bool,
    ) -> bool:
        if not from_zod:
            # There is no way to have `z.void()` response outside
            # of Zod API.
            return True

        # We use `google.protobuf.Empty` to represent `None` request or
        # response.
        return message.full_name != 'google.protobuf.Empty'
