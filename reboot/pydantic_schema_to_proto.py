#!/usr/bin/env python3

import aiofiles
import importlib
import os
import types
import typing
from reboot.api import (
    API,
    Model,
    UserPydanticError,
    get_field_tag,
    to_pascal_case,
    to_snake_case,
)
from reboot.fail import fail
from typing import Dict, List, Literal, Optional, Union, get_args, get_origin


def _pydantic_field_type_string_from_type(
    field_type: typing.Type,
    field_name: str,
    model_name: str,
) -> str:
    origin = get_origin(field_type)

    if origin is Union or origin is types.UnionType:
        non_none_args = [
            arg for arg in get_args(field_type) if arg is not type(None)
        ]
        if len(non_none_args) == 1:
            # When `non_none_args` has only one type, it means
            # it is an `Optional[T]` type, where `T` is not a
            # discriminated union, which we handle separately below.
            assert field_type is not None
            # To avoid name conflicts in the generated code, we import the
            # 'typing' module as 'IMPORT_typing'.
            # Recursively get the type string for the inner type.
            # It is crucial at least for inner `Literal` types, since
            # they should be represented as `IMPORT_typing.Literal[...]`
            # and the whole type string should be
            # `IMPORT_typing.Optional[IMPORT_typing.Literal[...]]`.
            return f'IMPORT_typing.Optional[{_pydantic_field_type_string_from_type(non_none_args[0], field_name, model_name)}]'
        else:
            # To avoid name conflicts in the generated code, we import the
            # 'typing' module as 'IMPORT_typing'.
            union_type_string = f'IMPORT_typing.Union[{", ".join([_pydantic_field_type_string_from_type(arg, field_name, model_name) for arg in non_none_args])}]'
            if type(None) in get_args(field_type):
                return f'IMPORT_typing.Optional[{union_type_string}]'
            return union_type_string
    elif origin is Literal:
        # To avoid name conflicts in the generated code, we import the
        # 'typing' module as 'IMPORT_typing'.
        return f'IMPORT_{field_type}'
    elif origin is None:
        # It can happen if we have a primitive type or another
        # 'Model'.
        assert isinstance(field_type, type)
        # Annotation at that point will be '<class 'int'>',
        # '<class 'AnotherModel'>', etc., so we need to get the actual
        # type string.
        if issubclass(field_type, Model):
            return f'{field_type.__module__}.{field_type.__name__}'
        else:
            # Primitive type does not need module prefix.
            return field_type.__name__
    elif origin is list or origin is dict:
        # 'list' and 'dict' types should just be what was
        # specified in the Pydantic model.
        if str(field_type).startswith('typing.'):
            # If user specified 'typing.List' or 'typing.Dict',
            # we need to replace 'typing' with 'IMPORT_typing'
            # to avoid name conflicts in the generated code.
            return str(field_type).replace('typing.', 'IMPORT_typing.')
        return str(field_type)
    else:
        fail(
            f"Unsupported field type '{field_type}' for field "
            f"'{field_name}' in Pydantic model "
            f"'{model_name}'."
        )


async def _write_field_maybe_with_type_string_annotation(
    proto,
    proto_field_name: str,
    proto_field_type_string: str,
    tag: int,
    field_type_string: Optional[str] = None,
):
    await proto.write(
        f"  optional {proto_field_type_string} {proto_field_name} = {tag}"
    )
    if field_type_string is not None:
        await proto.write(
            f' [ (rbt.v1alpha1.field).pydantic_type = "{field_type_string}"]'
        )
    await proto.write(";\n")


async def generate(
    proto,
    schema: typing.Union[
        typing.Type[Model],
        typing.Type[dict],
        typing.Type[list],
    ],
    path: str,
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
):
    origin = get_origin(schema)
    args = get_args(schema)

    if origin is None and issubclass(schema, Model):
        assert name is not None

        await proto.write(f"message {name} {{\n")

        if state:
            await proto.write("  option (rbt.v1alpha1.state) = {};\n")

        tags: Dict[int, str] = {}

        # Type assertion to help Pylance understand schema is a 'Model'
        # and do not complain.
        base_model_schema: typing.Type[Model] = schema
        for field_name, field_info in base_model_schema.model_fields.items():
            field_type = field_info.annotation

            # Discriminated union might be defined only as a field option
            # in the Pydantic model, so we need to get it from there.
            # If it was passed from the parent call, we just use that, and
            # it means we are generating one of the options of the
            # discriminated union.
            discriminator = discriminator or getattr(
                field_info,
                'discriminator',
                None,
            )

            tag = get_field_tag(field_info)
            if tag is None:
                fail(
                    f"Missing tag for property '{field_name}' at '{path}'; "
                    f"all properties must be tagged for backwards compatibility"
                )

            if tag in tags:
                fail(
                    f"Trying to use tag '{tag}' with property '{field_name}' "
                    f"already used by '{tags[tag]}' at '{path}'"
                )

            tags[tag] = field_name

            field_type_string: Optional[str] = None
            if add_type_string_annotation_to_proto:
                field_type_string = _pydantic_field_type_string_from_type(
                    field_type,
                    field_name,
                    base_model_schema.__name__,
                )

            proto_field_name = field_name

            inner_type = field_type

            field_origin = get_origin(field_type)
            field_args = get_args(field_type)

            # Get inner type for 'Optional[T]' if possible.
            if (field_origin is Union or field_origin is types.UnionType
               ) and type(None) in field_args and len(field_args) == 2:
                inner_type = next(
                    arg for arg in field_args if arg is not type(None)
                )
            elif field_origin is Union or field_origin is types.UnionType:
                # Get the discriminator for this field's Union type.
                # This must come from the field itself, not from a parent.
                field_discriminator = getattr(
                    field_info,
                    'discriminator',
                    None,
                )
                assert field_discriminator is not None, (
                    f"`Union` field `{field_name}` at `{path}` must have a "
                    f"discriminator defined"
                )

                type_name = to_pascal_case(field_name)
                await generate(
                    proto,
                    inner_type,
                    f"{path}.{field_name}",
                    name=type_name,
                    # It is the only place where user can read a discriminator
                    # from a discriminated union.
                    discriminator=field_discriminator,
                )

                await _write_field_maybe_with_type_string_annotation(
                    proto,
                    proto_field_name,
                    type_name,
                    tag,
                    field_type_string,
                )
                continue

            # The 'inner_type' represents the actual type, i.e. 'list[list[...]]]',
            # '<class 'str'>', '<class 'int'>', etc. So we need to get
            # the real type to handle for complex structures. For primitive
            # types the 'inner_origin' will be 'None'.
            inner_origin = get_origin(inner_type)

            if inner_type == str:
                assert inner_origin is None
                await _write_field_maybe_with_type_string_annotation(
                    proto,
                    proto_field_name,
                    "string",
                    tag,
                    field_type_string,
                )
            elif inner_type == int:
                assert inner_origin is None
                await _write_field_maybe_with_type_string_annotation(
                    proto,
                    proto_field_name,
                    "double",
                    tag,
                    field_type_string,
                )
            elif inner_type == float:
                assert inner_origin is None
                await _write_field_maybe_with_type_string_annotation(
                    proto,
                    proto_field_name,
                    "double",
                    tag,
                    field_type_string,
                )
            elif inner_type == bool:
                assert inner_origin is None
                await _write_field_maybe_with_type_string_annotation(
                    proto,
                    proto_field_name,
                    "bool",
                    tag,
                    field_type_string,
                )
            elif inner_origin in (list, List):
                type_name = to_pascal_case(field_name) + "Array"
                await proto.write(f"  message {type_name} {{\n")
                await generate(
                    proto,
                    inner_type,
                    f"{path}.{field_name}",
                )
                await proto.write("  }\n")

                await _write_field_maybe_with_type_string_annotation(
                    proto,
                    proto_field_name,
                    type_name,
                    tag,
                    field_type_string,
                )
            elif inner_origin in (dict, Dict):
                type_name = to_pascal_case(field_name) + "Record"
                await proto.write(f"  message {type_name} {{\n")
                await generate(
                    proto,
                    inner_type,
                    f"{path}.{field_name}",
                )
                await proto.write("  }\n")
                await _write_field_maybe_with_type_string_annotation(
                    proto,
                    proto_field_name,
                    type_name,
                    tag,
                    field_type_string,
                )
            elif inner_origin is Literal:
                if discriminator is not None:
                    # Skip discriminator fields - they are handled specially
                    # in the discriminated union generation.
                    continue
                type_name = to_pascal_case(field_name)
                literal_args = get_args(inner_type)

                # Verify all literal values are strings.
                for literal_value in literal_args:
                    if not isinstance(literal_value, str):
                        fail(
                            f"Unexpected literal `{literal_value}` for property "
                            f"`{field_name}`; only string literals are "
                            f"currently supported"
                        )

                await proto.write(f"  enum {type_name} {{\n")
                for i, literal_value in enumerate(literal_args):
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
                    field_type_string,
                )
            elif isinstance(inner_type,
                            type) and issubclass(inner_type, Model):
                type_name = to_pascal_case(field_name)
                await generate(
                    proto,
                    inner_type,
                    f"{path}.{field_name}",
                    name=type_name,
                )
                await _write_field_maybe_with_type_string_annotation(
                    proto,
                    proto_field_name,
                    type_name,
                    tag,
                    field_type_string,
                )
            elif not field_args and inner_origin is None:
                # Better error message for unparameterized generics.
                #
                # 'inner_origin' becomes 'None' there, since there is no
                # args specified (i.e. 'list' instead of 'list[str]').
                fail(
                    f"'{path}.{field_name}' has collection type '{inner_type}' "
                    "which doesn't have an item type specified. Please specify "
                    "the item type, e.g., 'list[str]' or 'dict[str, int]'."
                )
            else:
                fail(
                    f"'{path}.{field_name}' has type '{inner_type}' which is not "
                    f"(yet) supported, please reach out to the maintainers!"
                )

        await proto.write("}\n")
    elif origin in (dict, Dict):
        if len(args) >= 2:
            key_type = args[0]
            value_type = args[1]

            if key_type != str:
                fail(
                    f"Unexpected 'dict' key type '{key_type}' at '{path}'; "
                    f"only 'string' key types are currently supported for 'dict's"
                )

            value_origin = get_origin(value_type)

            if value_type == str:
                type_name = "string"
            elif value_type == int:
                type_name = "double"
            elif value_type == float:
                type_name = "double"
            elif value_type == bool:
                type_name = "bool"
            elif value_origin in (list, List):
                type_name = "Value"
                await proto.write("  message Value {\n")
                await generate(proto, value_type, f"{path}.[value]")
                await proto.write("  }\n")
            elif value_origin in (dict, Dict):
                type_name = "Value"
                await proto.write("  message Value {\n")
                await generate(proto, value_type, f"{path}.[value]")
                await proto.write("  }\n")
            elif isinstance(value_type,
                            type) and issubclass(value_type, Model):
                type_name = value_type.__name__
                await generate(
                    proto,
                    value_type,
                    f"{path}.[value]",
                    name=type_name,
                )
            # NOTE: Discriminated unions are not supported inside `dict` values
            # because Pydantic only allows discriminators on direct model fields.
            # `Union` types here would only be `Optional[T]`, which is not supported
            # inside collections.
            else:
                fail(
                    f"Dictionary at '{path}' has value type '{value_type}' which is not "
                    f"(yet) supported"
                )

            await proto.write(f"    map<string, {type_name}> record = 1;\n")
        else:
            fail(
                f"Dictionary type at '{path}' must have key and value types, "
                f"e.g., dict[str, int]"
            )
    elif origin in (list, List):
        if args:
            item_type = args[0]
            item_origin = get_origin(item_type)

            if item_type == str:
                type_name = "string"
            elif item_type == int:
                type_name = "double"
            elif item_type == float:
                type_name = "double"
            elif item_type == bool:
                type_name = "bool"
            elif item_origin in (list, List):
                type_name = "Item"
                await proto.write("  message Item {\n")
                await generate(proto, item_type, f"{path}.[item]")
                await proto.write("  }\n")
            elif item_origin in (dict, Dict):
                type_name = "Item"
                await proto.write("  message Item {\n")
                await generate(proto, item_type, f"{path}.[item]")
                await proto.write("  }\n")
            elif isinstance(item_type, type) and issubclass(item_type, Model):
                type_name = item_type.__name__
                await generate(
                    proto, item_type, f"{path}.[item]", name=type_name
                )
            # NOTE: Discriminated unions are not supported inside `list` items
            # because Pydantic only allows discriminators on direct model fields.
            # `Union` types here would only be `Optional[T]`, which is not supported
            # inside collections.
            else:
                fail(
                    f"List at '{path}' has item type '{item_type}' which is not "
                    f"(yet) supported"
                )

            await proto.write(f"    repeated {type_name} items = 1;\n")
        else:
            fail(
                f"List type at '{path}' must have an item type, e.g., list[str]"
            )
    elif origin is Union or origin is types.UnionType:
        assert name is not None
        assert discriminator is not None

        await proto.write(f"message {name} {{\n")

        # Filter out `None` for `Optional[Union[A, B]]`.
        options = [opt for opt in get_args(schema) if opt is not type(None)]

        literals: set[str] = set()
        # List of (tag, snake_case_literal, PascalCase type name) - using list
        # to preserve order and assign sequential tags.
        options_info: list[tuple[int, str, str]] = []
        # Sequential tag for oneof entries.
        oneof_tag = 1

        for option in options:
            assert issubclass(option, Model)
            assert discriminator in option.__annotations__

            # Get the discriminator literal value.
            literal_type = option.__annotations__[discriminator]
            literal_values = get_args(literal_type)
            assert len(literal_values) == 1
            literal = literal_values[0]

            if literal in literals:
                fail(
                    f"Duplicate literal `{literal}` in discriminated union "
                    f"at `{path}`"
                )
            literals.add(literal)

            type_name = to_pascal_case(literal)
            snake_literal = to_snake_case(literal)
            options_info.append((oneof_tag, snake_literal, type_name))
            oneof_tag += 1

            # Generate the option message by recursively calling generate.
            # The discriminator field will be skipped because we pass it through.
            await generate(
                proto,
                option,
                f"{path}.{{ {discriminator}: \"{literal}\", ... }}",
                name=type_name,
                # Pass the discriminator to skip its generation in the
                # option Protobuf message.
                discriminator=discriminator,
            )

        # Generate the single oneof block with all variants.
        await proto.write(f"\n  oneof {discriminator} {{\n")
        for tag, snake_literal, type_name in options_info:
            await proto.write(f"    {type_name} {snake_literal} = {tag};\n")
        await proto.write("  }\n")
        await proto.write("}\n")
    else:
        fail(f"Unexpected type '{schema}' at '{path}'")


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
    package_name = os.path.dirname(filename).replace(os.sep, '.')

    os.makedirs(os.path.dirname(proto_file_path), exist_ok=True)

    generated_errors_names = set()

    async with aiofiles.open(proto_file_path, 'w') as proto:
        await proto.write('syntax = "proto3";\n')
        await proto.write(f'package {package_name};\n')
        await proto.write('import "google/protobuf/empty.proto";\n')
        await proto.write('import "google/protobuf/struct.proto";\n')
        await proto.write('import "rbt/v1alpha1/options.proto";\n')
        await proto.write('import "rbt/v1alpha1/tasks.proto";\n')
        await proto.write(
            f"option (rbt.v1alpha1.file).pydantic = "
            f"\"{filename.rsplit('.py', 1)[0].replace(os.sep, '.')}\";\n"
        )
        await proto.write('\n')

        for type_name, type_obj in api.get_types().items():
            await generate(
                proto,
                type_obj.state,
                f"api.{type_name}.state",
                name=type_name,
                state=True,
            )
            await proto.write('\n')

            for method_name, method_spec in type_obj.methods.items():
                if method_spec.request is not None:
                    request_type_name = f"{type_name}{to_pascal_case(method_name)}Request"

                    await generate(
                        proto,
                        method_spec.request,
                        f"api.{type_name}.methods.{method_name}.request",
                        name=request_type_name,
                        add_type_string_annotation_to_proto=True,
                    )
                    await proto.write('\n')

                if method_spec.response is not None:
                    response_type_name = f"{type_name}{to_pascal_case(method_name)}Response"

                    await generate(
                        proto,
                        method_spec.response,
                        f"api.{type_name}.methods.{method_name}.response",
                        name=response_type_name,
                    )
                    await proto.write('\n')

            for method_name, method_spec in type_obj.methods.items():
                if method_spec.errors:
                    for error_model in method_spec.errors:
                        error_type_name = error_model.__name__
                        if error_type_name in generated_errors_names:
                            continue
                        generated_errors_names.add(error_type_name)
                        await generate(
                            proto,
                            error_model,
                            f"api.{type_name}.methods.{method_name}.errors.{error_type_name}",
                            name=error_type_name,
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
                    for error_model in method_spec.errors:
                        error_type_name = error_model.__name__
                        await proto.write(
                            f'  {error_type_name} {to_snake_case(error_type_name)} = {error_tag} '
                            f' [ (rbt.v1alpha1.field).pydantic_type = "{error_model.__module__}.{error_type_name}"];\n'
                        )
                        error_tag += 1
                    await proto.write('}}\n\n')

            await proto.write(f"service {type_name}Methods {{\n")

            for method_name, method_spec in type_obj.methods.items():
                if method_spec.request is None:
                    request_type_name = "google.protobuf.Empty"
                else:
                    request_type_name = f"{type_name}{to_pascal_case(method_name)}Request"

                if method_spec.response is None:
                    response_type_name = "google.protobuf.Empty"
                else:
                    response_type_name = f"{type_name}{to_pascal_case(method_name)}Response"

                await proto.write(
                    f"  rpc {to_pascal_case(method_name)}({request_type_name})\n"
                )
                await proto.write(f"      returns ({response_type_name}) {{\n")
                await proto.write("    option (rbt.v1alpha1.method) = {\n")
                await proto.write(f"      {method_spec.kind.value}: {{\n")

                if method_spec.factory:
                    await proto.write("        constructor: {},\n")

                await proto.write("      },\n")

                if method_spec.errors:
                    await proto.write(
                        f"      errors: [\"{type_name}{to_pascal_case(method_name)}Errors\"],\n"
                    )

                await proto.write("    };\n")
                await proto.write("  }\n")

            await proto.write("}\n\n")

    return proto_file_name
