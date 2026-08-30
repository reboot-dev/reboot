#!/usr/bin/env python3

import aiofiles
import importlib
import os
import typing
from rbt.v1alpha1.pydantic import api_pb2, schema_pb2
from reboot.api import API, UserPydanticError, to_pascal_case, to_snake_case
from reboot.fail import fail
from reboot.pydantic_api import api_digest, api_of
from reboot.pydantic_schema import Schemas
from types import MappingProxyType
from typing import List, Optional

# Proto `AutoConstruct` enum value name for per-user
# auto-construction. Must match the enum in
# `rbt/v1alpha1/options.proto`.
_PER_USER_ID = "PER_USER_ID"


def _escape_string_for_proto(string: str) -> str:
    """Escape a string for embedding as a proto string literal."""
    return string.replace("\\", "\\\\").replace('"', '\\"')


def _pydantic_field_type_string_from_type(field_type: schema_pb2.Type) -> str:
    kind = field_type.WhichOneof('type')

    if kind == 'scalar':
        # `Any` (e.g. a `dict[str, Any]` value) renders as
        # `typing.Any`; on the wire it becomes a
        # `google.protobuf.Value`. We import `typing` as
        # `IMPORT_typing` to avoid name conflicts in generated code.
        # Primitive types do not need a module prefix.
        return {
            schema_pb2.STRING: 'str',
            schema_pb2.INTEGER: 'int',
            schema_pb2.FLOAT: 'float',
            schema_pb2.BOOLEAN: 'bool',
            schema_pb2.ANY: 'IMPORT_typing.Any',
        }[field_type.scalar]
    elif kind == 'optional':
        # To avoid name conflicts in the generated code, we import the
        # 'typing' module as 'IMPORT_typing'.
        # Recursively get the type string for the inner type.
        # It is crucial at least for inner `Literal` types, since
        # they should be represented as `IMPORT_typing.Literal[...]`
        # and the whole type string should be
        # `IMPORT_typing.Optional[IMPORT_typing.Literal[...]]`.
        return f'IMPORT_typing.Optional[{_pydantic_field_type_string_from_type(field_type.optional.inner)}]'
    elif kind == 'discriminated_union':
        # To avoid name conflicts in the generated code, we import the
        # 'typing' module as 'IMPORT_typing'.
        return f'IMPORT_typing.Union[{", ".join([variant.reference.name for variant in field_type.discriminated_union.variants])}]'
    elif kind == 'literals':
        # To avoid name conflicts in the generated code, we import the
        # 'typing' module as 'IMPORT_typing'.
        values = ", ".join(repr(value) for value in field_type.literals.values)
        return f'IMPORT_typing.Literal[{values}]'
    elif kind == 'reference':
        # A reference's name is the model's module and class.
        return field_type.reference.name
    elif kind == 'array':
        # Recurse into the item since an inner type must be
        # rendered using `IMPORT_typing` prefix, while a `Model`
        # must keep its exact module path.
        item_string = _pydantic_field_type_string_from_type(
            field_type.array.item
        )
        return f'list[{item_string}]'
    elif kind == 'map':
        # See the 'list' case above.
        value_string = _pydantic_field_type_string_from_type(
            field_type.map.value
        )
        return f'dict[str, {value_string}]'
    else:
        raise AssertionError(
            f"Invariant broken: `schema_of` produced a type '{field_type}' "
            "the grammar has no spelling for."
        )


async def _write_field_maybe_with_type_string_annotation(
    proto,
    proto_field_name: str,
    proto_field_type_string: str,
    tag: int,
    required: bool,
    field_type_string: Optional[str] = None,
):
    await proto.write(
        f"  optional {proto_field_type_string} {proto_field_name} = {tag}"
    )
    annotations = []
    if field_type_string is not None:
        annotations.append(
            f'(rbt.v1alpha1.field).pydantic_type = "{field_type_string}"'
        )
    required_string = "true" if required else "false"
    annotations.append(f'(rbt.v1alpha1.field).required = {required_string}')
    await proto.write(f' [{", ".join(annotations)}]')
    await proto.write(";\n")


async def generate_from_schema(
    proto,
    schema: typing.Union[schema_pb2.Schema, schema_pb2.Type],
    name: Optional[str] = None,
    state: bool = False,
    # Currently we need to add Pydantic type string annotation for every
    # top level 'request' model, since we need them to get the actual
    # Pydantic types for 'input_type_fields' in the Jinja template while
    # generating the Python code.
    add_type_string_annotation_to_proto: bool = False,
    # Discriminator field name for discriminated unions, if any.
    # We pass it down from the parent call, since the discriminator
    # is defined as a field option in the Pydantic model, not
    # in the `Union` type itself.
    # The second scenario when discriminator is passed is when generating
    # the individual option of the discriminated union - in that case
    # we need to skip the discriminator field generation, since it
    # is represented as a `oneof` in the parent message.
    discriminator: Optional[str] = None,
    # UIs associated with this state type.
    uis: Optional[List] = None,
    # Auto-construct enum value name for this state type,
    # or None for non-auto-constructed types.
    auto_construct: Optional[str] = None,
    # What the state type does, in the author's own words.
    description: Optional[str] = None,
    # Every schema `schema` may refer to, by reference name.
    schemas: Schemas = MappingProxyType({}),
):
    if isinstance(schema, schema_pb2.Schema):
        assert name is not None

        await proto.write(f"message {name} {{\n")

        if state:
            if uis or auto_construct or description is not None:
                # Generate state option with UIs, a description
                # and/or auto-construct annotation. Proto text
                # format uses repeated field names, not
                # array syntax.
                await proto.write("  option (rbt.v1alpha1.state) = {\n")
                if description is not None:
                    # The description can contain `\` character, so we
                    # need to escape it for proto string literal.
                    await proto.write(
                        "    description: "
                        f'"{_escape_string_for_proto(description)}"\n'
                    )
                if auto_construct is not None:
                    await proto.write(
                        f"    auto_construct: "
                        f"{auto_construct}\n"
                    )
                for ui in (uis or []):
                    ui_fields = [
                        f'name: "{ui["name"]}"',
                        f'title: "{ui["title"]}"',
                        f'path: "{ui["path"]}"',
                    ]
                    if ui.get("request_message"):
                        ui_fields.append(
                            "request_message: "
                            f'"{ui["request_message"]}"'
                        )
                    if ui.get("description"):
                        ui_fields.append(
                            "description: "
                            f'"{ui["description"]}"'
                        )
                    if ui.get("artifact_path"):
                        ui_fields.append(
                            f'artifact_path: '
                            f'"{ui["artifact_path"]}"'
                        )
                    await proto.write(
                        f"    uis: "
                        f"{{ {', '.join(ui_fields)} }}\n"
                    )
                await proto.write("  };\n")
            else:
                await proto.write("  option (rbt.v1alpha1.state) = {};\n")

        for property_ in schema.properties:
            field_name = property_.name
            tag = property_.tag
            required = property_.required
            type_ = property_.type

            field_type_string: Optional[str] = None
            if add_type_string_annotation_to_proto:
                field_type_string = _pydantic_field_type_string_from_type(
                    type_
                )

            proto_field_name = field_name

            inner_type = type_

            # Get inner type for 'Optional[T]' if possible.
            if type_.WhichOneof('type') == 'optional':
                inner_type = type_.optional.inner

            if inner_type.WhichOneof('type') == 'discriminated_union':
                type_name = to_pascal_case(field_name)
                await generate_from_schema(
                    proto,
                    inner_type,
                    name=type_name,
                    discriminator=inner_type.discriminated_union.discriminator,
                    schemas=schemas,
                )

                await _write_field_maybe_with_type_string_annotation(
                    proto,
                    proto_field_name,
                    type_name,
                    tag,
                    required,
                    field_type_string,
                )
                continue

            if inner_type.scalar == schema_pb2.STRING:
                await _write_field_maybe_with_type_string_annotation(
                    proto,
                    proto_field_name,
                    "string",
                    tag,
                    required,
                    field_type_string,
                )
            elif inner_type.scalar == schema_pb2.INTEGER:
                await _write_field_maybe_with_type_string_annotation(
                    proto,
                    proto_field_name,
                    "double",
                    tag,
                    required,
                    field_type_string,
                )
            elif inner_type.scalar == schema_pb2.FLOAT:
                await _write_field_maybe_with_type_string_annotation(
                    proto,
                    proto_field_name,
                    "double",
                    tag,
                    required,
                    field_type_string,
                )
            elif inner_type.scalar == schema_pb2.BOOLEAN:
                await _write_field_maybe_with_type_string_annotation(
                    proto,
                    proto_field_name,
                    "bool",
                    tag,
                    required,
                    field_type_string,
                )
            elif inner_type.scalar == schema_pb2.ANY:
                # A bare `Any` field carries an arbitrary JSON value,
                # just like a `dict[str, Any]` value; both lower to a
                # `google.protobuf.Value`. `struct.proto` is imported
                # by every generated file.
                await _write_field_maybe_with_type_string_annotation(
                    proto,
                    proto_field_name,
                    "google.protobuf.Value",
                    tag,
                    required,
                    field_type_string,
                )
            elif inner_type.WhichOneof('type') == 'array':
                type_name = to_pascal_case(field_name) + "Array"
                await proto.write(f"  message {type_name} {{\n")
                await generate_from_schema(
                    proto,
                    inner_type,
                    schemas=schemas,
                )
                await proto.write("  }\n")

                await _write_field_maybe_with_type_string_annotation(
                    proto,
                    proto_field_name,
                    type_name,
                    tag,
                    required,
                    field_type_string,
                )
            elif inner_type.WhichOneof('type') == 'map':
                type_name = to_pascal_case(field_name) + "Record"
                await proto.write(f"  message {type_name} {{\n")
                await generate_from_schema(
                    proto,
                    inner_type,
                    schemas=schemas,
                )
                await proto.write("  }\n")
                await _write_field_maybe_with_type_string_annotation(
                    proto,
                    proto_field_name,
                    type_name,
                    tag,
                    required,
                    field_type_string,
                )
            elif inner_type.WhichOneof('type') == 'literals':
                if field_name == discriminator:
                    # Skip the discriminator field - the `oneof` of the
                    # discriminated union stands in for it.
                    continue
                type_name = to_pascal_case(field_name)
                literals_type = inner_type

                await proto.write(f"  enum {type_name} {{\n")
                for i, literal_value in enumerate(
                    literals_type.literals.values
                ):
                    # According to Protobuf `enum` rules:
                    # `enum` values use C++ scoping rules, meaning that
                    # `enum` values are siblings of their type, not
                    # children of it.
                    # That means we need to prefix the `enum` values
                    # with the `enum` type name to avoid name conflicts.
                    # It is safe here, since we preserve the original
                    # order of the literals and during the conversion
                    # from Pydantic model to Protobuf and back we
                    # operate with the indexes of the literals, not
                    # their names.
                    await proto.write(
                        f"    {type_name}_{literal_value} = {i};\n"
                    )
                await proto.write("  }\n")

                await _write_field_maybe_with_type_string_annotation(
                    proto,
                    proto_field_name,
                    type_name,
                    tag,
                    required,
                    field_type_string,
                )
            elif inner_type.WhichOneof('type') == 'reference':
                type_name = to_pascal_case(field_name)
                await generate_from_schema(
                    proto,
                    schemas[inner_type.reference.name],
                    name=type_name,
                    schemas=schemas,
                )
                await _write_field_maybe_with_type_string_annotation(
                    proto,
                    proto_field_name,
                    type_name,
                    tag,
                    required,
                    field_type_string,
                )
            else:
                raise AssertionError(
                    "Unexpected schema with a property "
                    f"'{field_name}' of type '{inner_type}'"
                )

        await proto.write("}\n")
    elif isinstance(schema,
                    schema_pb2.Type) and schema.WhichOneof('type') == 'map':
        value_type = schema.map.value

        if value_type.scalar == schema_pb2.STRING:
            type_name = "string"
        elif value_type.scalar == schema_pb2.INTEGER:
            type_name = "double"
        elif value_type.scalar == schema_pb2.FLOAT:
            type_name = "double"
        elif value_type.scalar == schema_pb2.BOOLEAN:
            type_name = "bool"
        elif value_type.scalar == schema_pb2.ANY:
            # `dict[str, Any]` carries arbitrary JSON values, which
            # a `google.protobuf.Value` represents; `struct.proto`
            # is already imported by every generated file.
            type_name = "google.protobuf.Value"
        elif value_type.WhichOneof('type') == 'array':
            type_name = "Value"
            await proto.write("  message Value {\n")
            await generate_from_schema(proto, value_type, schemas=schemas)
            await proto.write("  }\n")
        elif value_type.WhichOneof('type') == 'map':
            type_name = "Value"
            await proto.write("  message Value {\n")
            await generate_from_schema(proto, value_type, schemas=schemas)
            await proto.write("  }\n")
        elif value_type.WhichOneof('type') == 'reference':
            type_name = schemas[value_type.reference.name].name
            await generate_from_schema(
                proto,
                schemas[value_type.reference.name],
                name=type_name,
                schemas=schemas,
            )
        elif value_type.WhichOneof('type') == 'literals':
            type_name = "Value"
            literals_type = value_type

            # Same as the field-level `Literal` handling above: a
            # nested `enum` whose values are prefixed with the type
            # name, since Protobuf `enum` values use C++ scoping.
            await proto.write(f"  enum {type_name} {{\n")
            for i, literal_value in enumerate(literals_type.literals.values):
                await proto.write(f"    {type_name}_{literal_value} = {i};\n")
            await proto.write("  }\n")
        else:
            raise AssertionError(
                "Unexpected schema with `dict` value type "
                f"'{value_type}'"
            )

        await proto.write(f"    map<string, {type_name}> record = 1;\n")
    elif isinstance(schema,
                    schema_pb2.Type) and schema.WhichOneof('type') == 'array':
        item_type = schema.array.item

        if item_type.scalar == schema_pb2.STRING:
            type_name = "string"
        elif item_type.scalar == schema_pb2.INTEGER:
            type_name = "double"
        elif item_type.scalar == schema_pb2.FLOAT:
            type_name = "double"
        elif item_type.scalar == schema_pb2.BOOLEAN:
            type_name = "bool"
        elif item_type.scalar == schema_pb2.ANY:
            # A `list[Any]` carries arbitrary JSON values; each
            # element becomes a `google.protobuf.Value`, just like
            # a `dict[str, Any]` value.
            type_name = "google.protobuf.Value"
        elif item_type.WhichOneof('type') == 'array':
            type_name = "Item"
            await proto.write("  message Item {\n")
            await generate_from_schema(proto, item_type, schemas=schemas)
            await proto.write("  }\n")
        elif item_type.WhichOneof('type') == 'map':
            type_name = "Item"
            await proto.write("  message Item {\n")
            await generate_from_schema(proto, item_type, schemas=schemas)
            await proto.write("  }\n")
        elif item_type.WhichOneof('type') == 'reference':
            type_name = schemas[item_type.reference.name].name
            await generate_from_schema(
                proto,
                schemas[item_type.reference.name],
                name=type_name,
                schemas=schemas,
            )
        elif item_type.WhichOneof('type') == 'literals':
            type_name = "Item"
            literals_type = item_type

            # Same as the field-level `Literal` handling above: a
            # nested `enum` whose values are prefixed with the type
            # name, since Protobuf `enum` values use C++ scoping.
            await proto.write(f"  enum {type_name} {{\n")
            for i, literal_value in enumerate(literals_type.literals.values):
                await proto.write(f"    {type_name}_{literal_value} = {i};\n")
            await proto.write("  }\n")
        else:
            raise AssertionError(
                "Unexpected schema with `list` item type "
                f"'{item_type}'"
            )

        await proto.write(f"    repeated {type_name} items = 1;\n")
    elif isinstance(schema, schema_pb2.Type
                   ) and schema.WhichOneof('type') == 'discriminated_union':
        assert name is not None
        assert discriminator is not None

        await proto.write(f"message {name} {{\n")

        # List of (tag, snake_case_literal, PascalCase type name) - using list
        # to preserve order and assign sequential tags.
        options_info: list[tuple[int, str, str]] = []
        # Sequential tag for oneof entries.
        oneof_tag = 1

        for variant in schema.discriminated_union.variants:
            literal = variant.literal

            type_name = to_pascal_case(literal)
            snake_literal = to_snake_case(literal)
            options_info.append((oneof_tag, snake_literal, type_name))
            oneof_tag += 1

            # Generate the option message by recursively calling generate.
            # The discriminator field will be skipped because we pass it through.
            await generate_from_schema(
                proto,
                schemas[variant.reference.name],
                name=type_name,
                # Pass the discriminator to skip its generation in the
                # option Protobuf message.
                discriminator=discriminator,
                schemas=schemas,
            )

        # Generate the single oneof block with all variants.
        await proto.write(f"\n  oneof {discriminator} {{\n")
        for tag, snake_literal, type_name in options_info:
            await proto.write(f"    {type_name} {snake_literal} = {tag};\n")
        await proto.write("  }\n")
        await proto.write("}\n")
    else:
        raise AssertionError(
            f"Unexpected schema '{schema}', which is "
            "neither a `Schema` nor a type"
        )


async def generate_proto_file_from_api(
    filename: str,
    output_directory: str,
) -> Optional[str]:
    """Write the generated proto content to a file.
    Return the path to the generated proto file or None if file doesn't
    contain Pydantic API schema."""

    # In the 'rbt generate' we add every directory which contains schema
    # files to the 'sys.path', so we can directly import the file as a
    # module now.
    module_path = filename.rsplit('.py', 1)[0].replace(os.sep, '.')
    try:
        module = importlib.import_module(module_path)
    except ImportError as e:
        fail(f"Failed to import module {module_path}: {e}")
    except UserPydanticError as e:
        fail(str(e))

    if not hasattr(module, 'api'):
        # It could be that the module does not define an API, but has some
        # shared code. In that case, we just skip it, but allow processing
        # further files.
        return None

    api: API = getattr(module, 'api')

    proto_file_name = filename.replace('.py', '.proto')
    proto_file_path = os.path.join(output_directory, proto_file_name)

    os.makedirs(os.path.dirname(proto_file_path), exist_ok=True)

    async with aiofiles.open(proto_file_path, 'w') as proto:
        await generate_from_api(proto, api_of(api, filename=filename))

    return proto_file_name


async def generate_from_api(
    proto,
    api: api_pb2.API,
) -> None:
    """Writes to `proto` the proto that `api`, what an API file
    declares, generates to, and the digest of the declaration: what
    `protoc` is handed."""
    schemas = api.schemas

    generated_errors_names = set()

    await proto.write('syntax = "proto3";\n')
    await proto.write(f'package {api.package};\n')
    await proto.write('import "google/protobuf/empty.proto";\n')
    await proto.write('import "google/protobuf/struct.proto";\n')
    await proto.write('import "rbt/v1alpha1/options.proto";\n')
    await proto.write('import "rbt/v1alpha1/tasks.proto";\n')
    await proto.write(
        f"option (rbt.v1alpha1.file).pydantic = \"{api.module}\";\n"
    )

    await proto.write('\n')

    for state_type in api.state_types:
        type_name = state_type.name

        # Build UIs list from UI methods.
        uis = []
        for ui in state_type.uis:
            uis.append(
                {
                    'name':
                        ui.name,
                    'title':
                        # The title can contain `\` character, so we
                        # need to escape it for proto string literal.
                        _escape_string_for_proto(ui.title)
                        if ui.HasField('title') else
                        ui.name.replace('_', ' ').title(),
                    'description':
                        # The description can contain `\` character,
                        # so we need to escape it for proto string
                        # literal.
                        _escape_string_for_proto(ui.description)
                        if ui.HasField('description') else None,
                    'path':
                        ui.path,
                    'request_message':
                        schemas[ui.request.name].name
                        if ui.HasField('request') else None,
                    'artifact_path':
                        ui.artifact_path
                        if ui.HasField('artifact_path') else None,
                }
            )

        await generate_from_schema(
            proto,
            schemas[state_type.reference.name],
            name=type_name,
            schemas=schemas,
            state=True,
            uis=uis if uis else None,
            auto_construct=_PER_USER_ID if state_type.auto_construct else None,
            description=(
                state_type.description
                if state_type.HasField('description') else None
            ),
        )
        await proto.write('\n')

        # Generate request messages for UI methods that
        # have a request type. UI methods with
        # `request=None` have no input parameters.
        for ui in state_type.uis:
            if ui.HasField('request'):
                await generate_from_schema(
                    proto,
                    schemas[ui.request.name],
                    name=schemas[ui.request.name].name,
                    schemas=schemas,
                    add_type_string_annotation_to_proto=True,
                )
                await proto.write('\n')

        # Generate request/response messages for
        # regular methods.
        for method in state_type.methods:
            method_name = method.name
            if method.HasField('request'):
                request_type_name = f"{type_name}{to_pascal_case(method_name)}Request"

                await generate_from_schema(
                    proto,
                    schemas[method.request.name],
                    name=request_type_name,
                    schemas=schemas,
                    add_type_string_annotation_to_proto=True,
                )
                await proto.write('\n')

            if method.HasField('response'):
                response_type_name = f"{type_name}{to_pascal_case(method_name)}Response"

                await generate_from_schema(
                    proto,
                    schemas[method.response.name],
                    name=response_type_name,
                    schemas=schemas,
                )
                await proto.write('\n')

        for method in state_type.methods:
            method_name = method.name
            if method.errors:
                for error in method.errors:
                    error_type_name = schemas[error.name].name
                    if error_type_name in generated_errors_names:
                        continue
                    generated_errors_names.add(error_type_name)
                    await generate_from_schema(
                        proto,
                        schemas[error.name],
                        name=error_type_name,
                        schemas=schemas,
                    )
                    await proto.write('\n')

                # Match the Zod errors definition by creating a
                # top-level message for the method which has declared errors.
                # That message will have a 'oneof' field with all possible
                # error types.
                await proto.write('\n')
                await proto.write(
                    f'message {type_name}{to_pascal_case(method_name)}Errors {{ oneof type {{\n'
                )

                error_tag = 1
                for error in method.errors:
                    error_type_name = schemas[error.name].name
                    await proto.write(
                        f'  {error_type_name} {to_snake_case(error_type_name)} = {error_tag} '
                        f' [ (rbt.v1alpha1.field).pydantic_type = "{error.name}"];\n'
                    )
                    error_tag += 1
                await proto.write('}}\n\n')

        # Generate RPC service block (regular methods
        # only — UI methods have no RPC).
        await proto.write(f"service {type_name}Methods {{\n")

        for method in state_type.methods:
            method_name = method.name
            if not method.HasField('request'):
                request_type_name = "google.protobuf.Empty"
            else:
                request_type_name = f"{type_name}{to_pascal_case(method_name)}Request"

            if not method.HasField('response'):
                response_type_name = "google.protobuf.Empty"
            else:
                response_type_name = f"{type_name}{to_pascal_case(method_name)}Response"

            await proto.write(
                f"  rpc {to_pascal_case(method_name)}({request_type_name})\n"
            )
            await proto.write(f"      returns ({response_type_name}) {{\n")
            await proto.write("    option (rbt.v1alpha1.method) = {\n")
            # The arm's name is the kind's: `reader`, `writer`,
            # `transaction` or `workflow`.
            await proto.write(f"      {method.WhichOneof('kind')}: {{\n")

            if method.factory:
                await proto.write("        constructor: {},\n")

            await proto.write("      },\n")

            if method.errors:
                await proto.write(
                    f"      errors: [\"{type_name}{to_pascal_case(method_name)}Errors\"],\n"
                )

            # What the author said the method does, written
            # whether or not the method is exposed to MCP.
            if method.HasField('description'):
                # The description can contain `\` character, so we
                # need to escape it for proto string literal.
                await proto.write(
                    "      description: "
                    f'"{_escape_string_for_proto(method.description)}",\n'
                )

            # MCP options for exposing method as tool/resource.
            if method.HasField('mcp'):
                primitive = method.mcp.WhichOneof('primitive')
                mcp = getattr(method.mcp, primitive)
                mcp_fields = [f"{primitive}: true"]
                if mcp.HasField('name'):
                    # The name can contain `\` character, so we need
                    # to escape it for proto string literal.
                    mcp_fields.append(
                        f'name: "{_escape_string_for_proto(mcp.name)}"'
                    )
                if mcp.HasField('title'):
                    # The title can contain `\` character, so we need
                    # to escape it for proto string literal.
                    mcp_fields.append(
                        f'title: "{_escape_string_for_proto(mcp.title)}"'
                    )
                await proto.write(
                    f"      mcp: {{ {', '.join(mcp_fields)} }},\n"
                )

            await proto.write("    };\n")
            await proto.write("  }\n")

        await proto.write("}\n\n")

    await proto.write(
        f'option (rbt.v1alpha1.file).api_digest = "{api_digest(api)}";\n'
    )
