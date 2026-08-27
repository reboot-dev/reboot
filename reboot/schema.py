"""Reads a pydantic model into its schema, the grammar of
`rbt/v1alpha1/schema.proto`.

Read off the models' annotations, into the closed set of forms Reboot
knows: a scalar, an array, a map, a literal, a reference to another
model, an optional of any of those, or a discriminated union of
models. Whatever `rbt generate` can express is here, and nothing
else: a type outside the set fails here, with the message the
developer sees. The proto writer prints this; the dashboard describes
it.
"""
import types
import typing
from reboot.api import Model, get_field_tag, to_pascal_case, to_snake_case
from reboot.fail import fail
from reboot.pydantic_schema_to_proto import (
    _escape_string_for_proto,
    _pydantic_field_type_string_from_type,
    _write_field_maybe_with_type_string_annotation,
)
from typing import (
    Any,
    Dict,
    List,
    Literal,
    Optional,
    Union,
    get_args,
    get_origin,
)


async def _schema_of(
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
    # UIs associated with this state type.
    uis: Optional[List] = None,
    # Auto-construct enum value name for this state type,
    # or None for non-auto-constructed types.
    auto_construct: Optional[str] = None,
    # What the state type does, in the author's own words.
    description: Optional[str] = None,
):
    origin = get_origin(schema)
    args = get_args(schema)

    if origin is None and issubclass(schema, Model):
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

        tags: Dict[int, str] = {}

        # Type assertion to help Pylance understand schema is a 'Model'
        # and do not complain.
        base_model_schema: typing.Type[Model] = schema
        for field_name, field_info in base_model_schema.model_fields.items():
            field_type = field_info.annotation
            if field_type is None:
                fail(
                    f"Missing type annotation for property '{field_name}' at "
                    f"'{path}'; all properties must have a type annotation"
                )

            # Pydantic declares `annotation` as optional, but a model
            # field is always defined by a type annotation, so it is
            # present for every field we iterate here.
            assert field_type is not None

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

            # In Pydantic if a class has an `Optional` field, that field
            # should be explicitly set to `None`, otherwise it will fail
            # during validation. So the "required" in Pydantic means
            # that the field has `default` or `default_factory` specified.
            required = field_info.is_required()

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
                await _schema_of(
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
                    required,
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
                    required,
                    field_type_string,
                )
            elif inner_type == int:
                assert inner_origin is None
                await _write_field_maybe_with_type_string_annotation(
                    proto,
                    proto_field_name,
                    "double",
                    tag,
                    required,
                    field_type_string,
                )
            elif inner_type == float:
                assert inner_origin is None
                await _write_field_maybe_with_type_string_annotation(
                    proto,
                    proto_field_name,
                    "double",
                    tag,
                    required,
                    field_type_string,
                )
            elif inner_type == bool:
                assert inner_origin is None
                await _write_field_maybe_with_type_string_annotation(
                    proto,
                    proto_field_name,
                    "bool",
                    tag,
                    required,
                    field_type_string,
                )
            elif inner_type is Any:
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
            elif inner_origin in (list, List):
                type_name = to_pascal_case(field_name) + "Array"
                await proto.write(f"  message {type_name} {{\n")
                await _schema_of(
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
                    required,
                    field_type_string,
                )
            elif inner_origin in (dict, Dict):
                type_name = to_pascal_case(field_name) + "Record"
                await proto.write(f"  message {type_name} {{\n")
                await _schema_of(
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
                    required,
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
                    required,
                    field_type_string,
                )
            elif isinstance(inner_type,
                            type) and issubclass(inner_type, Model):
                type_name = to_pascal_case(field_name)
                await _schema_of(
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
                    required,
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
            elif value_type is Any:
                # `dict[str, Any]` carries arbitrary JSON values, which
                # a `google.protobuf.Value` represents; `struct.proto`
                # is already imported by every generated file.
                type_name = "google.protobuf.Value"
            elif value_origin in (list, List):
                type_name = "Value"
                await proto.write("  message Value {\n")
                await _schema_of(proto, value_type, f"{path}.[value]")
                await proto.write("  }\n")
            elif value_origin in (dict, Dict):
                type_name = "Value"
                await proto.write("  message Value {\n")
                await _schema_of(proto, value_type, f"{path}.[value]")
                await proto.write("  }\n")
            elif isinstance(value_type,
                            type) and issubclass(value_type, Model):
                type_name = value_type.__name__
                await _schema_of(
                    proto,
                    value_type,
                    f"{path}.[value]",
                    name=type_name,
                )
            elif value_origin is Literal:
                type_name = "Value"
                literal_args = get_args(value_type)

                # Verify all literal values are strings.
                for literal_value in literal_args:
                    if not isinstance(literal_value, str):
                        fail(
                            f"Unexpected literal `{literal_value}` for the "
                            f"'dict' at '{path}'; only string literals are "
                            "currently supported"
                        )

                # Same as the field-level `Literal` handling above: a
                # nested `enum` whose values are prefixed with the type
                # name, since Protobuf `enum` values use C++ scoping.
                await proto.write(f"  enum {type_name} {{\n")
                for i, literal_value in enumerate(literal_args):
                    await proto.write(
                        f"    {type_name}_{literal_value} = {i};\n"
                    )
                await proto.write("  }\n")
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
            elif item_type is Any:
                # A `list[Any]` carries arbitrary JSON values; each
                # element becomes a `google.protobuf.Value`, just like
                # a `dict[str, Any]` value.
                type_name = "google.protobuf.Value"
            elif item_origin in (list, List):
                type_name = "Item"
                await proto.write("  message Item {\n")
                await _schema_of(proto, item_type, f"{path}.[item]")
                await proto.write("  }\n")
            elif item_origin in (dict, Dict):
                type_name = "Item"
                await proto.write("  message Item {\n")
                await _schema_of(proto, item_type, f"{path}.[item]")
                await proto.write("  }\n")
            elif isinstance(item_type, type) and issubclass(item_type, Model):
                type_name = item_type.__name__
                await _schema_of(
                    proto, item_type, f"{path}.[item]", name=type_name
                )
            elif item_origin is Literal:
                type_name = "Item"
                literal_args = get_args(item_type)

                # Verify all literal values are strings.
                for literal_value in literal_args:
                    if not isinstance(literal_value, str):
                        fail(
                            f"Unexpected literal `{literal_value}` for the "
                            f"list at '{path}'; only string literals are "
                            "currently supported"
                        )

                # Same as the field-level `Literal` handling above: a
                # nested `enum` whose values are prefixed with the type
                # name, since Protobuf `enum` values use C++ scoping.
                await proto.write(f"  enum {type_name} {{\n")
                for i, literal_value in enumerate(literal_args):
                    await proto.write(
                        f"    {type_name}_{literal_value} = {i};\n"
                    )
                await proto.write("  }\n")
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
            await _schema_of(
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
