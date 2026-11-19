"""Reads a pydantic model into its schema, the grammar of
`rbt/v1alpha1/api/schema.proto`.

Read off the models' annotations, into the closed set of forms Reboot
knows: a scalar, an array, a map, a literal, a reference to another
model, an optional of any of those, or a discriminated union of
models. Whatever `rbt generate` can express is here, and nothing
else: a type outside the set fails here, with the message the
developer sees. The proto writer prints this; the dashboard describes
it.
"""
import inspect
import json
import types
import typing
from google.protobuf import message_factory
from google.protobuf.descriptor import FieldDescriptor
from google.protobuf.message import Message
from pydantic_core import PydanticUndefined, to_jsonable_python
from rbt.v1alpha1.api import schema_pb2
from rbt.v1alpha1.api.schema_pb2 import (
    ANY,
    BOOLEAN,
    FLOAT,
    INTEGER,
    STRING,
    Array,
    Constraints,
    DiscriminatedUnion,
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


def _class_name(class_: typing.Union[type[Model], type[Message]]) -> str:
    """Returns the class name of a model or of a protobuf message. A
    nested protobuf message is returned with its parents, e.g.
    "Outer.Inner": its class reports only "Inner", so the name is
    taken from its descriptor."""
    if issubclass(class_, Message):
        descriptor = class_.DESCRIPTOR
        return descriptor.full_name.removeprefix(f'{descriptor.file.package}.')
    return class_.__name__


def reference_name(
    class_: typing.Union[type[Model], type[Message]],
) -> str:
    """Returns the name that identifies a model or a protobuf message:
    its module, then its class name, e.g. "shop.v1.shop.Item" or
    "rbt.v1alpha1.tasks_pb2.TaskId". A `Reference` holds this name,
    and `schemas` is keyed by it."""
    return f'{class_.__module__}.{_class_name(class_)}'


def _property(
    name: str,
    tag: int,
    type_: Type,
    required: bool,
    optional: bool,
    *,
    description: Optional[str],
    default: Optional[str],
    constraints: Optional[Constraints],
    deprecated: bool,
) -> Property:
    """One property, its type wrapped as `Optional` when the property
    was declared `Optional[...]`."""
    if optional:
        type_ = Type(optional=schema_pb2.Optional(inner=type_))
    property_ = Property(
        name=name,
        tag=tag,
        type=type_,
        required=required,
        deprecated=deprecated,
    )
    if description is not None:
        property_.description = description
    if default is not None:
        property_.default = default
    if constraints is not None:
        property_.constraints.CopyFrom(constraints)
    return property_


# Each constraint `Field(...)` can declare, by the name pydantic keeps
# it under in `FieldInfo.metadata` (an `annotated_types` object such
# as `Ge(ge=0)`, or pydantic's own metadata for `pattern`), and the
# `Constraints` field it is recorded in.
_CONSTRAINTS = (
    ('gt', 'greater_than'),
    ('ge', 'greater_than_or_equal'),
    ('lt', 'less_than'),
    ('le', 'less_than_or_equal'),
    ('multiple_of', 'multiple_of'),
    ('min_length', 'min_length'),
    ('max_length', 'max_length'),
    ('pattern', 'pattern'),
)

# The `Scalar` closest to each kind of protobuf field that is neither
# a message nor an enum, keyed by the field's `cpp_type`. A `bytes`
# field has the `cpp_type` of a string, and is a string in the JSON
# form of its message.
_SCALAR_BY_PROTOBUF_CPP_TYPE = {
    FieldDescriptor.CPPTYPE_STRING: schema_pb2.STRING,
    FieldDescriptor.CPPTYPE_BOOL: schema_pb2.BOOLEAN,
    FieldDescriptor.CPPTYPE_INT32: schema_pb2.INTEGER,
    FieldDescriptor.CPPTYPE_INT64: schema_pb2.INTEGER,
    FieldDescriptor.CPPTYPE_UINT32: schema_pb2.INTEGER,
    FieldDescriptor.CPPTYPE_UINT64: schema_pb2.INTEGER,
    FieldDescriptor.CPPTYPE_FLOAT: schema_pb2.FLOAT,
    FieldDescriptor.CPPTYPE_DOUBLE: schema_pb2.FLOAT,
}


def _schema_of_protobuf_field(
    field: FieldDescriptor,
    path: str,
    *,
    schemas: Schemas,
) -> tuple[Type, Schemas]:
    """Reads a protobuf field into its type, which has two parts.

    The type of one value: a message is read into a `Reference`, with
    its `Schema` filed in the returned `schemas`; an enum into the
    `Literals` of its value names; anything else into its closest
    `Scalar`.

    How the field holds values of that type: a `repeated` field is an
    `Array` of it, a `map` field is a `Map` of it, and a field that
    can be unset is an `Optional` of it. A field can be unset when it
    is declared `optional` or when it holds a single message.

        string name = 1;               a `Scalar`
        optional string name = 2;      an `Optional` of a `Scalar`
        TaskId id = 3;                 an `Optional` of a `Reference`
        repeated TaskId ids = 4;       an `Array` of a `Reference`
        map<string, TaskId> ids = 5;   a `Map` of a `Reference`
    """
    # A `map` field is declared as a repeated entry message, whose
    # `value` field says what the map's values are. Its `key` field is
    # left unread: the keys of a `Map` are always strings, as the keys
    # of a protobuf map are in JSON.
    is_map = (
        field.message_type is not None and
        field.message_type.GetOptions().map_entry
    )
    value_field = (
        field.message_type.fields_by_name['value'] if is_map else field
    )

    if value_field.message_type is not None:
        value, schemas = _schema_of(
            message_factory.GetMessageClass(value_field.message_type),
            path,
            schemas=schemas,
        )
    elif value_field.enum_type is not None:
        value = Type(
            literals=Literals(
                values=[
                    enum_value.name
                    for enum_value in value_field.enum_type.values
                ]
            )
        )
    else:
        assert value_field.cpp_type in _SCALAR_BY_PROTOBUF_CPP_TYPE, (
            f"Field `{value_field.full_name}` at '{path}' has a protobuf "
            f"type ({value_field.cpp_type}) that no `Scalar` stands for"
        )
        value = Type(scalar=_SCALAR_BY_PROTOBUF_CPP_TYPE[value_field.cpp_type])

    if is_map:
        return Type(map=Map(value=value)), schemas
    if field.label == FieldDescriptor.LABEL_REPEATED:
        return Type(array=Array(item=value)), schemas
    if field.has_presence:
        return Type(optional=schema_pb2.Optional(inner=value)), schemas
    return value, schemas


def _constraints(field_info: Any) -> Optional[Constraints]:
    """What `Field(...)` declared a value must satisfy beyond its
    type, and `None` when it declared nothing."""
    constraints = Constraints()
    for metadata in field_info.metadata:
        for attribute, field in _CONSTRAINTS:
            value = getattr(metadata, attribute, None)
            if value is not None:
                setattr(constraints, field, value)
    return constraints if constraints.ListFields() else None


def _schema_of(
    annotation: typing.Union[
        typing.Type[Model],
        typing.Type[Message],
        typing.Type[dict],
        typing.Type[list],
    ],
    path: str,
    # Discriminator field name for discriminated unions, if any.
    # We pass it down from the parent call, since the discriminator
    # is defined as a field option in the Pydantic model, not
    # in the `Union` type itself.
    discriminator: Optional[str] = None,
    # Every schema reached so far, by reference name.
    schemas: Schemas = MappingProxyType({}),
) -> tuple[Type, Schemas]:
    """Reads `annotation` into its type: a model or a protobuf message
    into a `Reference`, with its `Schema` filed in the returned
    `schemas`; a `list` or `dict` into an `Array` or `Map`; a
    discriminated `Union` into a `DiscriminatedUnion`."""
    origin = get_origin(annotation)
    args = get_args(annotation)

    if origin is None and issubclass(annotation, (Model, Message)):
        name = reference_name(annotation)
        if name in schemas:
            # A model reached again, through another property or through
            # itself, is read once.
            return Type(reference=Reference(name=name)), schemas
        schema = Schema(
            name=_class_name(annotation), module=annotation.__module__
        )
        if annotation.__doc__ is not None:
            schema.description = inspect.cleandoc(annotation.__doc__)
        # Filed before its properties are read, so that a model referring
        # to itself is reached once.
        schemas = MappingProxyType({**schemas, name: schema})

        if issubclass(annotation, Message):
            # A protobuf message has a property per field, tagged with
            # the field's number. `_schema_of` reads a Python type
            # annotation, and a protobuf field has none: it is
            # described by a `FieldDescriptor`, which is what
            # `_schema_of_protobuf_field` reads.
            for field in annotation.DESCRIPTOR.fields:
                type_, schemas = _schema_of_protobuf_field(
                    field, f"{path}.{field.name}", schemas=schemas
                )
                schema.properties.append(
                    Property(name=field.name, tag=field.number, type=type_)
                )
            return Type(reference=Reference(name=name)), schemas

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

            description = field_info.description

            constraints = _constraints(field_info)

            # `deprecated` is `True`, a message, or a
            # `warnings.deprecated`; each means the property is.
            deprecated = bool(field_info.deprecated)

            # A default a factory makes is not known without calling
            # it, so only a literal one is recorded, as pydantic does
            # for JSON Schema.
            default = (
                None
                if field_info.default is PydanticUndefined else json.dumps(
                    to_jsonable_python(
                        field_info.default, serialize_unknown=True
                    )
                )
            )

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
                        field_name,
                        tag,
                        type_,
                        required,
                        type(None) in field_args,
                        description=description,
                        default=default,
                        constraints=constraints,
                        deprecated=deprecated,
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
                        optional, description=description, default=default,
                        constraints=constraints, deprecated=deprecated
                    )
                )
            elif inner_type == int:
                assert inner_origin is None
                schema.properties.append(
                    _property(
                        field_name, tag, Type(scalar=INTEGER), required,
                        optional, description=description, default=default,
                        constraints=constraints, deprecated=deprecated
                    )
                )
            elif inner_type == float:
                assert inner_origin is None
                schema.properties.append(
                    _property(
                        field_name, tag, Type(scalar=FLOAT), required,
                        optional, description=description, default=default,
                        constraints=constraints, deprecated=deprecated
                    )
                )
            elif inner_type == bool:
                assert inner_origin is None
                schema.properties.append(
                    _property(
                        field_name, tag, Type(scalar=BOOLEAN), required,
                        optional, description=description, default=default,
                        constraints=constraints, deprecated=deprecated
                    )
                )
            elif inner_type is Any:
                # A bare `Any` field carries an arbitrary JSON value,
                # just like a `dict[str, Any]` value; both lower to a
                # `google.protobuf.Value`. `struct.proto` is imported
                # by every generated file.
                schema.properties.append(
                    _property(
                        field_name, tag, Type(scalar=ANY), required, optional,
                        description=description, default=default,
                        constraints=constraints, deprecated=deprecated
                    )
                )
            elif inner_origin in (list, List):
                type_, schemas = _schema_of(
                    inner_type,
                    f"{path}.{field_name}",
                    schemas=schemas,
                )

                schema.properties.append(
                    _property(
                        field_name, tag, type_, required, optional,
                        description=description, default=default,
                        constraints=constraints, deprecated=deprecated
                    )
                )
            elif inner_origin in (dict, Dict):
                type_, schemas = _schema_of(
                    inner_type,
                    f"{path}.{field_name}",
                    schemas=schemas,
                )
                schema.properties.append(
                    _property(
                        field_name, tag, type_, required, optional,
                        description=description, default=default,
                        constraints=constraints, deprecated=deprecated
                    )
                )
            elif inner_origin is Literal:
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
                        field_name, tag,
                        Type(literals=Literals(values=literal_args)), required,
                        optional, description=description, default=default,
                        constraints=constraints, deprecated=deprecated
                    )
                )
            elif isinstance(inner_type, type
                           ) and issubclass(inner_type, (Model, Message)):
                type_, schemas = _schema_of(
                    inner_type,
                    f"{path}.{field_name}",
                    schemas=schemas,
                )
                schema.properties.append(
                    _property(
                        field_name, tag, type_, required, optional,
                        description=description, default=default,
                        constraints=constraints, deprecated=deprecated
                    )
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
            elif isinstance(value_type, type
                           ) and issubclass(value_type, (Model, Message)):
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
                item = Type(scalar=BOOLEAN)
            elif item_type is Any:
                # A `list[Any]` carries arbitrary JSON values, just
                # like a `dict[str, Any]` value.
                item = Type(scalar=ANY)
            elif item_origin in (list, List):
                item, schemas = _schema_of(
                    item_type, f"{path}.[item]", schemas=schemas
                )
            elif item_origin in (dict, Dict):
                item, schemas = _schema_of(
                    item_type, f"{path}.[item]", schemas=schemas
                )
            elif isinstance(item_type,
                            type) and issubclass(item_type, (Model, Message)):
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

                item = Type(literals=Literals(values=literal_args))
            # NOTE: Discriminated unions are not supported inside `list` items
            # because Pydantic only allows discriminators on direct model fields.
            # `Union` types here would only be `Optional[T]`, which is not supported
            # inside collections.
            else:
                fail(
                    f"List at '{path}' has item type '{item_type}' which is not "
                    f"(yet) supported"
                )

            return Type(array=Array(item=item)), schemas
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
        variants: list[Variant] = []

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
            reference, schemas = _schema_of(
                option,
                f"{path}.{{ {discriminator}: \"{literal}\", ... }}",
                schemas=schemas,
            )
            variants.append(
                Variant(literal=literal, reference=reference.reference)
            )

        return (
            Type(
                discriminated_union=DiscriminatedUnion(
                    discriminator=discriminator, variants=variants
                )
            ),
            schemas,
        )
    else:
        fail(f"Unexpected type '{annotation}' at '{path}'")


def schema_of(
    model: type[Model],
    *,
    path: str,
    schemas: Schemas = MappingProxyType({}),
) -> tuple[Schema, Schemas]:
    """Returns a model's schema, its properties in declaration order
    each typed in the grammar, and `schemas` with it and every schema
    it reaches filed by reference name. `path` names the model in a
    failure, e.g. `api.Shop.state` or `api.Shop.methods.look.request`.
    A model already in `schemas` is not read again."""
    reference, schemas = _schema_of(model, path, schemas=schemas)
    return schemas[reference.reference.name], schemas
