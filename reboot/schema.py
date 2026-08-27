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
from rbt.v1alpha1 import schema_pb2
from rbt.v1alpha1.schema_pb2 import (
    ANY,
    BOOLEAN,
    FLOAT,
    INTEGER,
    STRING,
    Literals,
    Map,
    Property,
    Reference,
    Schema,
    Type,
    Variant,
)
from reboot.api import Model, get_field_tag
from reboot.fail import fail
from types import MappingProxyType
from typing import (
    Any,
    Dict,
    List,
    Literal,
    Mapping,
    Optional,
    Union,
    get_args,
    get_origin,
)

# Every schema reached so far, by the name a `Reference` uses: the
# model's module and class name. Immutable: reaching one more means
# holding the mapping a function below returned.
Schemas = Mapping[str, Schema]


def reference_name(model: type[Model]) -> str:
    """The name a model's schema is filed under, and a `Reference` to
    it carries."""
    return f'{model.__module__}.{model.__name__}'


def _property(
    name: str,
    tag: int,
    type_: Type,
    required: bool,
    optional: bool,
) -> Property:
    """One property, its type wrapped as `Optional` when the property
    was declared `Optional[...]`."""
    if optional:
        type_ = Type(optional=schema_pb2.Optional(inner=type_))
    return Property(name=name, tag=tag, type=type_, required=required)


def _schema_of(
    annotation: typing.Union[
        typing.Type[Model],
        typing.Type[dict],
        typing.Type[list],
    ],
    path: str,
    # Discriminator field name for discriminated unions, if any.
    # We pass it down from the parent call, since the discriminator
    # is defined as a field option in the Pydantic model, not
    # in the `Union` type itself.
    # The second scenario when discriminator is passed is when generating
    # the individual option of the discriminated union - in that case
    # we need to skip the discriminator field generation, since it
    # is represented as a `oneof` in the parent message.
    discriminator: Optional[str] = None,
    # Every schema reached so far, by reference name.
    schemas: Schemas = MappingProxyType({}),
) -> tuple[Type, Schemas]:
    """Reads `annotation` into its type: a model into a `Reference`,
    with its `Schema` filed in the returned `schemas`; a `list` or
    `dict` into an `Array` or `Map`; a discriminated `Union` into a
    `DiscriminatedUnion`."""
    origin = get_origin(annotation)
    args = get_args(annotation)

    if origin is None and issubclass(annotation, Model):
        name = reference_name(annotation)
        if name in schemas:
            # A model reached again, through another property or through
            # itself, is read once.
            return Type(reference=Reference(name=name)), schemas
        schema = Schema(name=annotation.__name__, module=annotation.__module__)
        # Filed before its properties are read, so that a model referring
        # to itself is reached once.
        schemas = MappingProxyType({**schemas, name: schema})

        tags: Dict[int, str] = {}

        # Type assertion to help Pylance understand annotation is a 'Model'
        # and do not complain.
        model: typing.Type[Model] = annotation
        for field_name, field_info in model.model_fields.items():
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

                type_, schemas = _schema_of(
                    inner_type,
                    f"{path}.{field_name}",
                    # It is the only place where user can read a discriminator
                    # from a discriminated union.
                    discriminator=field_discriminator,
                    schemas=schemas,
                )

                schema.properties.append(
                    _property(
                        field_name, tag, type_, required,
                        type(None) in field_args
                    )
                )
                continue

            # The 'inner_type' represents the actual type, i.e. 'list[list[...]]]',
            # '<class 'str'>', '<class 'int'>', etc. So we need to get
            # the real type to handle for complex structures. For primitive
            # types the 'inner_origin' will be 'None'.
            inner_origin = get_origin(inner_type)
            # Whether the property was declared `Optional[...]`.
            optional = inner_type is not field_type

            if inner_type == str:
                assert inner_origin is None
                schema.properties.append(
                    _property(
                        field_name, tag, Type(scalar=STRING), required,
                        optional
                    )
                )
            elif inner_type == int:
                assert inner_origin is None
                schema.properties.append(
                    _property(
                        field_name, tag, Type(scalar=INTEGER), required,
                        optional
                    )
                )
            elif inner_type == float:
                assert inner_origin is None
                schema.properties.append(
                    _property(
                        field_name, tag, Type(scalar=FLOAT), required, optional
                    )
                )
            elif inner_type == bool:
                assert inner_origin is None
                schema.properties.append(
                    _property(
                        field_name, tag, Type(scalar=BOOLEAN), required,
                        optional
                    )
                )
            elif inner_type is Any:
                # A bare `Any` field carries an arbitrary JSON value,
                # just like a `dict[str, Any]` value; both lower to a
                # `google.protobuf.Value`. `struct.proto` is imported
                # by every generated file.
                schema.properties.append(
                    _property(
                        field_name, tag, Type(scalar=ANY), required, optional
                    )
                )
            elif inner_origin in (list, List):
                type_, schemas = _schema_of(
                    inner_type,
                    f"{path}.{field_name}",
                    schemas=schemas,
                )

                schema.properties.append(
                    _property(field_name, tag, type_, required, optional)
                )
            elif inner_origin in (dict, Dict):
                type_, schemas = _schema_of(
                    inner_type,
                    f"{path}.{field_name}",
                    schemas=schemas,
                )
                schema.properties.append(
                    _property(field_name, tag, type_, required, optional)
                )
            elif inner_origin is Literal:
                if discriminator is not None:
                    # Skip discriminator fields - they are handled specially
                    # in the discriminated union generation.
                    continue
                literal_args = get_args(inner_type)

                # Verify all literal values are strings.
                for literal_value in literal_args:
                    if not isinstance(literal_value, str):
                        fail(
                            f"Unexpected literal `{literal_value}` for property "
                            f"`{field_name}`; only string literals are "
                            f"currently supported"
                        )

                schema.properties.append(
                    _property(
                        field_name,
                        tag,
                        Type(literals=Literals(values=literal_args)),
                        required,
                        optional,
                    )
                )
            elif isinstance(inner_type,
                            type) and issubclass(inner_type, Model):
                type_, schemas = _schema_of(
                    inner_type,
                    f"{path}.{field_name}",
                    schemas=schemas,
                )
                schema.properties.append(
                    _property(field_name, tag, type_, required, optional)
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

        return Type(reference=Reference(name=name)), schemas
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
                value = Type(scalar=STRING)
            elif value_type == int:
                value = Type(scalar=INTEGER)
            elif value_type == float:
                value = Type(scalar=FLOAT)
            elif value_type == bool:
                value = Type(scalar=BOOLEAN)
            elif value_type is Any:
                # `dict[str, Any]` carries arbitrary JSON values.
                value = Type(scalar=ANY)
            elif value_origin in (list, List):
                value, schemas = _schema_of(
                    value_type, f"{path}.[value]", schemas=schemas
                )
            elif value_origin in (dict, Dict):
                value, schemas = _schema_of(
                    value_type, f"{path}.[value]", schemas=schemas
                )
            elif isinstance(value_type,
                            type) and issubclass(value_type, Model):
                value, schemas = _schema_of(
                    value_type,
                    f"{path}.[value]",
                    schemas=schemas,
                )
            elif value_origin is Literal:
                literal_args = get_args(value_type)

                # Verify all literal values are strings.
                for literal_value in literal_args:
                    if not isinstance(literal_value, str):
                        fail(
                            f"Unexpected literal `{literal_value}` for the "
                            f"'dict' at '{path}'; only string literals are "
                            "currently supported"
                        )

                value = Type(literals=Literals(values=literal_args))
            # NOTE: Discriminated unions are not supported inside `dict` values
            # because Pydantic only allows discriminators on direct model fields.
            # `Union` types here would only be `Optional[T]`, which is not supported
            # inside collections.
            else:
                fail(
                    f"Dictionary at '{path}' has value type '{value_type}' which is not "
                    f"(yet) supported"
                )

            return Type(map=Map(value=value)), schemas
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
                item = Type(scalar=STRING)
            elif item_type == int:
                item = Type(scalar=INTEGER)
            elif item_type == float:
                item = Type(scalar=FLOAT)
            elif item_type == bool:
                raise NotImplementedError("a `bool` item")
            elif item_type is Any:
                # A `list[Any]` carries arbitrary JSON values, just
                # like a `dict[str, Any]` value.
                raise NotImplementedError("an `Any` item")
            elif item_origin in (list, List):
                item, schemas = _schema_of(
                    item_type, f"{path}.[item]", schemas=schemas
                )
            elif item_origin in (dict, Dict):
                item, schemas = _schema_of(
                    item_type, f"{path}.[item]", schemas=schemas
                )
            elif isinstance(item_type, type) and issubclass(item_type, Model):
                item, schemas = _schema_of(
                    item_type, f"{path}.[item]", schemas=schemas
                )
            elif item_origin is Literal:
                literal_args = get_args(item_type)

                # Verify all literal values are strings.
                for literal_value in literal_args:
                    if not isinstance(literal_value, str):
                        fail(
                            f"Unexpected literal `{literal_value}` for the "
                            f"list at '{path}'; only string literals are "
                            "currently supported"
                        )

                raise NotImplementedError("a `Literal` item")
            # NOTE: Discriminated unions are not supported inside `list` items
            # because Pydantic only allows discriminators on direct model fields.
            # `Union` types here would only be `Optional[T]`, which is not supported
            # inside collections.
            else:
                fail(
                    f"List at '{path}' has item type '{item_type}' which is not "
                    f"(yet) supported"
                )

            raise NotImplementedError("the `list`'s type")
        else:
            fail(
                f"List type at '{path}' must have an item type, e.g., list[str]"
            )
    elif origin is Union or origin is types.UnionType:
        assert discriminator is not None

        # Filter out `None` for `Optional[Union[A, B]]`.
        options = [
            opt for opt in get_args(annotation) if opt is not type(None)
        ]

        literals: set[str] = set()
        variants: list[Variant] = []  # noqa: F841

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

            # Read the option model by recursively calling `_schema_of`.
            # The discriminator field will be skipped because we pass it through.
            reference, schemas = _schema_of(
                option,
                f"{path}.{{ {discriminator}: \"{literal}\", ... }}",
                # Pass the discriminator to skip its generation in the
                # option's schema.
                discriminator=discriminator,
                schemas=schemas,
            )
            raise NotImplementedError("a variant")

        raise NotImplementedError("the union's type")
    else:
        fail(f"Unexpected type '{annotation}' at '{path}'")
