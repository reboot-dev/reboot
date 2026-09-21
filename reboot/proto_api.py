"""Reads what a `.proto` declares into the grammar of
`rbt/v1alpha1/api/api.proto`.

Read off the file's descriptor into the closed set of forms a
declaration takes: state types, their methods and UIs, what those
take, return and raise, and the schema of every message and enum the
file declares, in the order it declares them, with what the developer
wrote in the comment above each. What a file mentions from another
file is a `Reference` by qualified name, described in that file's own
`API`. What the dashboard describes a `.proto` API with, and what
`rbt generate` digests, so that whoever has the file in hand can tell
whether generated code came from it.
"""
from google.protobuf import struct_pb2, type_pb2
from google.protobuf.descriptor_pb2 import (
    DescriptorProto,
    EnumDescriptorProto,
    FieldDescriptorProto,
    FileDescriptorProto,
    ServiceDescriptorProto,
    SourceCodeInfo,
)
from rbt.v1alpha1 import options_pb2
from rbt.v1alpha1.api import api_pb2, schema_pb2
from rbt.v1alpha1.api.schema_pb2 import Reference
from typing import Optional

# The suffix of the service that, by default, provides a state's
# methods: `ShopMethods` for a state `Shop`.
_METHODS_SUFFIX = 'Methods'

# Each of protobuf's scalar types as what it is in JSON, whole, with
# what it was declared as beneath it, which the type alone says.
# Templates, copied from and never given out.
_JSON_SCALARS = {
    FieldDescriptorProto.TYPE_DOUBLE:
        schema_pb2.Type(
            scalar=schema_pb2.FLOAT,
            origin=schema_pb2.Origin(
                proto=schema_pb2.Origin.Proto(
                    kind=type_pb2.Field.TYPE_DOUBLE,
                ),
            ),
        ),
    # A number, as a `double` is: JSON has one kind.
    FieldDescriptorProto.TYPE_FLOAT:
        schema_pb2.Type(
            scalar=schema_pb2.FLOAT,
            origin=schema_pb2.Origin(
                proto=schema_pb2.Origin.Proto(
                    kind=type_pb2.Field.TYPE_FLOAT,
                ),
            ),
        ),
    FieldDescriptorProto.TYPE_INT32:
        schema_pb2.Type(
            scalar=schema_pb2.INTEGER,
            origin=schema_pb2.Origin(
                proto=schema_pb2.Origin.Proto(
                    kind=type_pb2.Field.TYPE_INT32,
                ),
            ),
        ),
    # A string: a JSON number is a double, which cannot hold every
    # 64-bit integer, so proto3 ships each of the five as a decimal
    # string.
    FieldDescriptorProto.TYPE_INT64:
        schema_pb2.Type(
            scalar=schema_pb2.STRING,
            origin=schema_pb2.Origin(
                proto=schema_pb2.Origin.Proto(
                    kind=type_pb2.Field.TYPE_INT64,
                ),
            ),
        ),
    FieldDescriptorProto.TYPE_UINT32:
        schema_pb2.Type(
            scalar=schema_pb2.INTEGER,
            origin=schema_pb2.Origin(
                proto=schema_pb2.Origin.Proto(
                    kind=type_pb2.Field.TYPE_UINT32,
                ),
            ),
        ),
    FieldDescriptorProto.TYPE_UINT64:
        schema_pb2.Type(
            scalar=schema_pb2.STRING,
            origin=schema_pb2.Origin(
                proto=schema_pb2.Origin.Proto(
                    kind=type_pb2.Field.TYPE_UINT64,
                ),
            ),
        ),
    FieldDescriptorProto.TYPE_SINT32:
        schema_pb2.Type(
            scalar=schema_pb2.INTEGER,
            origin=schema_pb2.Origin(
                proto=schema_pb2.Origin.Proto(
                    kind=type_pb2.Field.TYPE_SINT32,
                ),
            ),
        ),
    FieldDescriptorProto.TYPE_SINT64:
        schema_pb2.Type(
            scalar=schema_pb2.STRING,
            origin=schema_pb2.Origin(
                proto=schema_pb2.Origin.Proto(
                    kind=type_pb2.Field.TYPE_SINT64,
                ),
            ),
        ),
    FieldDescriptorProto.TYPE_FIXED32:
        schema_pb2.Type(
            scalar=schema_pb2.INTEGER,
            origin=schema_pb2.Origin(
                proto=schema_pb2.Origin.Proto(
                    kind=type_pb2.Field.TYPE_FIXED32,
                ),
            ),
        ),
    FieldDescriptorProto.TYPE_FIXED64:
        schema_pb2.Type(
            scalar=schema_pb2.STRING,
            origin=schema_pb2.Origin(
                proto=schema_pb2.Origin.Proto(
                    kind=type_pb2.Field.TYPE_FIXED64,
                ),
            ),
        ),
    FieldDescriptorProto.TYPE_SFIXED32:
        schema_pb2.Type(
            scalar=schema_pb2.INTEGER,
            origin=schema_pb2.Origin(
                proto=schema_pb2.Origin.Proto(
                    kind=type_pb2.Field.TYPE_SFIXED32,
                ),
            ),
        ),
    FieldDescriptorProto.TYPE_SFIXED64:
        schema_pb2.Type(
            scalar=schema_pb2.STRING,
            origin=schema_pb2.Origin(
                proto=schema_pb2.Origin.Proto(
                    kind=type_pb2.Field.TYPE_SFIXED64,
                ),
            ),
        ),
    FieldDescriptorProto.TYPE_BOOL:
        schema_pb2.Type(
            scalar=schema_pb2.BOOLEAN,
            origin=schema_pb2.Origin(
                proto=schema_pb2.Origin.Proto(
                    kind=type_pb2.Field.TYPE_BOOL,
                ),
            ),
        ),
    FieldDescriptorProto.TYPE_STRING:
        schema_pb2.Type(
            scalar=schema_pb2.STRING,
            origin=schema_pb2.Origin(
                proto=schema_pb2.Origin.Proto(
                    kind=type_pb2.Field.TYPE_STRING,
                ),
            ),
        ),
    # A string of base64.
    FieldDescriptorProto.TYPE_BYTES:
        schema_pb2.Type(
            scalar=schema_pb2.STRING,
            origin=schema_pb2.Origin(
                proto=schema_pb2.Origin.Proto(
                    kind=type_pb2.Field.TYPE_BYTES,
                ),
            ),
        ),
}

# What a method that takes or returns nothing names.
_EMPTY = 'google.protobuf.Empty'

# The messages and enums of `google.protobuf` whose JSON is not that
# of a message, each as what it is in JSON, whole, with what it was
# declared as beneath it, which its name alone says. Templates, copied
# from and never given out.
_JSON_WELL_KNOWN = {
    # Any JSON value at all: that is what a `Value` holds.
    'google.protobuf.Value':
        schema_pb2.Type(
            scalar=schema_pb2.ANY,
            origin=schema_pb2.Origin(
                proto=schema_pb2.Origin.Proto(
                    kind=type_pb2.Field.TYPE_MESSAGE,
                    type_name='google.protobuf.Value',
                ),
            ),
        ),
    # An enum of one value, `NULL_VALUE`, which JSON writes as
    # `null`: a `Literal` of `null`.
    'google.protobuf.NullValue':
        schema_pb2.Type(
            literals=schema_pb2.Literals(
                values=[schema_pb2.Literal(null=struct_pb2.NULL_VALUE)],
            ),
            origin=schema_pb2.Origin(
                proto=schema_pb2.Origin.Proto(
                    kind=type_pb2.Field.TYPE_ENUM,
                    type_name='google.protobuf.NullValue',
                ),
            ),
        ),
    # An object of any JSON values: a `Struct` is a `map<string,
    # Value>`, written as the object itself.
    'google.protobuf.Struct':
        schema_pb2.Type(
            map=schema_pb2.Map(value=schema_pb2.Type(scalar=schema_pb2.ANY)),
            origin=schema_pb2.Origin(
                proto=schema_pb2.Origin.Proto(
                    kind=type_pb2.Field.TYPE_MESSAGE,
                    type_name='google.protobuf.Struct',
                ),
            ),
        ),
    # A list of any JSON values, written as the list itself.
    'google.protobuf.ListValue':
        schema_pb2.Type(
            array=schema_pb2.Array(
                item=schema_pb2.Type(scalar=schema_pb2.ANY),
            ),
            origin=schema_pb2.Origin(
                proto=schema_pb2.Origin.Proto(
                    kind=type_pb2.Field.TYPE_MESSAGE,
                    type_name='google.protobuf.ListValue',
                ),
            ),
        ),
    # An object holding an `@type`, and whatever that type holds.
    'google.protobuf.Any':
        schema_pb2.Type(
            map=schema_pb2.Map(value=schema_pb2.Type(scalar=schema_pb2.ANY)),
            origin=schema_pb2.Origin(
                proto=schema_pb2.Origin.Proto(
                    kind=type_pb2.Field.TYPE_MESSAGE,
                    type_name='google.protobuf.Any',
                ),
            ),
        ),
    # An empty object.
    'google.protobuf.Empty':
        schema_pb2.Type(
            map=schema_pb2.Map(value=schema_pb2.Type(scalar=schema_pb2.ANY)),
            origin=schema_pb2.Origin(
                proto=schema_pb2.Origin.Proto(
                    kind=type_pb2.Field.TYPE_MESSAGE,
                    type_name='google.protobuf.Empty',
                ),
            ),
        ),
    # A string, in RFC 3339, rather than its seconds and nanos.
    'google.protobuf.Timestamp':
        schema_pb2.Type(
            scalar=schema_pb2.STRING,
            origin=schema_pb2.Origin(
                proto=schema_pb2.Origin.Proto(
                    kind=type_pb2.Field.TYPE_MESSAGE,
                    type_name='google.protobuf.Timestamp',
                ),
            ),
        ),
    # A string, of seconds with a fraction and an 's', rather than
    # its seconds and nanos.
    'google.protobuf.Duration':
        schema_pb2.Type(
            scalar=schema_pb2.STRING,
            origin=schema_pb2.Origin(
                proto=schema_pb2.Origin.Proto(
                    kind=type_pb2.Field.TYPE_MESSAGE,
                    type_name='google.protobuf.Duration',
                ),
            ),
        ),
    # A string of the paths, joined by commas, in lowerCamelCase.
    'google.protobuf.FieldMask':
        schema_pb2.Type(
            scalar=schema_pb2.STRING,
            origin=schema_pb2.Origin(
                proto=schema_pb2.Origin.Proto(
                    kind=type_pb2.Field.TYPE_MESSAGE,
                    type_name='google.protobuf.FieldMask',
                ),
            ),
        ),
    # A wrapper is the value it wraps. Not an `Optional`, though a
    # wrapper is nullable, as any message field is: `Optional` records
    # that the developer wrote `optional`, meaning the field may go
    # unset, and a wrapper written as a field's type means the
    # opposite, that a value is wanted.
    'google.protobuf.DoubleValue':
        schema_pb2.Type(
            scalar=schema_pb2.FLOAT,
            origin=schema_pb2.Origin(
                proto=schema_pb2.Origin.Proto(
                    kind=type_pb2.Field.TYPE_MESSAGE,
                    type_name='google.protobuf.DoubleValue',
                ),
            ),
        ),
    'google.protobuf.FloatValue':
        schema_pb2.Type(
            scalar=schema_pb2.FLOAT,
            origin=schema_pb2.Origin(
                proto=schema_pb2.Origin.Proto(
                    kind=type_pb2.Field.TYPE_MESSAGE,
                    type_name='google.protobuf.FloatValue',
                ),
            ),
        ),
    'google.protobuf.Int32Value':
        schema_pb2.Type(
            scalar=schema_pb2.INTEGER,
            origin=schema_pb2.Origin(
                proto=schema_pb2.Origin.Proto(
                    kind=type_pb2.Field.TYPE_MESSAGE,
                    type_name='google.protobuf.Int32Value',
                ),
            ),
        ),
    'google.protobuf.UInt32Value':
        schema_pb2.Type(
            scalar=schema_pb2.INTEGER,
            origin=schema_pb2.Origin(
                proto=schema_pb2.Origin.Proto(
                    kind=type_pb2.Field.TYPE_MESSAGE,
                    type_name='google.protobuf.UInt32Value',
                ),
            ),
        ),
    # A string, as an `int64` is.
    'google.protobuf.Int64Value':
        schema_pb2.Type(
            scalar=schema_pb2.STRING,
            origin=schema_pb2.Origin(
                proto=schema_pb2.Origin.Proto(
                    kind=type_pb2.Field.TYPE_MESSAGE,
                    type_name='google.protobuf.Int64Value',
                ),
            ),
        ),
    # A string, as a `uint64` is.
    'google.protobuf.UInt64Value':
        schema_pb2.Type(
            scalar=schema_pb2.STRING,
            origin=schema_pb2.Origin(
                proto=schema_pb2.Origin.Proto(
                    kind=type_pb2.Field.TYPE_MESSAGE,
                    type_name='google.protobuf.UInt64Value',
                ),
            ),
        ),
    'google.protobuf.BoolValue':
        schema_pb2.Type(
            scalar=schema_pb2.BOOLEAN,
            origin=schema_pb2.Origin(
                proto=schema_pb2.Origin.Proto(
                    kind=type_pb2.Field.TYPE_MESSAGE,
                    type_name='google.protobuf.BoolValue',
                ),
            ),
        ),
    'google.protobuf.StringValue':
        schema_pb2.Type(
            scalar=schema_pb2.STRING,
            origin=schema_pb2.Origin(
                proto=schema_pb2.Origin.Proto(
                    kind=type_pb2.Field.TYPE_MESSAGE,
                    type_name='google.protobuf.StringValue',
                ),
            ),
        ),
    # A string of base64, as `bytes` are.
    'google.protobuf.BytesValue':
        schema_pb2.Type(
            scalar=schema_pb2.STRING,
            origin=schema_pb2.Origin(
                proto=schema_pb2.Origin.Proto(
                    kind=type_pb2.Field.TYPE_MESSAGE,
                    type_name='google.protobuf.BytesValue',
                ),
            ),
        ),
}


class UserProtoError(Exception):
    """A `.proto` a developer wrote declares something Reboot cannot
    take, and why, in words for whoever wrote the file."""


# What the developer wrote above each declaration of a file, by the
# path of the declaration's `SourceCodeInfo.Location`, e.g.
# `(4, 0, 2, 1)` for the second field of a file's first message,
# which is how `protoc` says which declaration a comment is above. A
# tuple, since a key must be hashable and a `path` is not.
_Comments = dict[tuple[int, ...], str]


def _within(
    location: SourceCodeInfo.Location,
    *path: int,
) -> SourceCodeInfo.Location:
    """The location of a declaration within the one at `location`:
    for a message's second field, `(2, 1)` on from the message's."""
    return SourceCodeInfo.Location(path=[*location.path, *path])


def _comment(
    comments: _Comments,
    location: SourceCodeInfo.Location,
) -> Optional[str]:
    """What the developer wrote above the declaration at `location`,
    and `None` for nothing."""
    return comments.get(tuple(location.path))


def _qualified_name(file: FileDescriptorProto, name: str) -> str:
    """A name declared at the top of `file`, by its qualified name."""
    if file.package == '':
        return name
    return f'{file.package}.{name}'


def _name_within_package(
    file: FileDescriptorProto,
    qualified_name: str,
) -> str:
    """A qualified name without its package, e.g. `Servicer.Call`."""
    if file.package == '':
        return qualified_name
    return qualified_name[len(file.package) + 1:]


def _reference(type_name: str) -> Reference:
    """A reference to what a descriptor names, e.g. `.shop.v1.Item`,
    by its qualified name: described in the `API` of whichever file
    declares it, this one or another."""
    return Reference(name=type_name.removeprefix('.'))


def _optional_reference(type_name: str) -> Optional[Reference]:
    """A reference to what a method takes or returns, and `None` for
    a method that takes or returns nothing."""
    if type_name.removeprefix('.') == _EMPTY:
        return None
    return _reference(type_name)


def _type_of(field: FieldDescriptorProto) -> schema_pb2.Type:
    """The type of one value of the field, as what it is in JSON,
    with what it was declared as beneath it."""
    qualified_name = field.type_name.removeprefix('.')

    # The template itself, shared: whatever is constructed with it
    # copies it.
    json_type = _JSON_SCALARS.get(field.type)
    if json_type is None:
        json_type = _JSON_WELL_KNOWN.get(qualified_name)
    if json_type is not None:
        return json_type

    if field.type == FieldDescriptorProto.TYPE_ENUM:
        return schema_pb2.Type(enum=_reference(qualified_name))

    # A message, or a proto2 group, which is a message too.
    return schema_pb2.Type(reference=_reference(qualified_name))


def _visit_enum(
    comments: _Comments,
    *,
    file: FileDescriptorProto,
    location: SourceCodeInfo.Location,
    enum: EnumDescriptorProto,
    qualified_name: str,
) -> api_pb2.API:
    """What the enum declares, as the `API` it contributes: the enum,
    of its values by number."""
    return api_pb2.API(
        enums={
            qualified_name:
                schema_pb2.Enum(
                    name=_name_within_package(file, qualified_name),
                    package=file.package,
                    values=[
                        schema_pb2.Enum.Value(
                            name=value.name,
                            number=value.number,
                            description=_comment(
                                comments,
                                _within(
                                    location,
                                    EnumDescriptorProto.VALUE_FIELD_NUMBER,
                                    index,
                                ),
                            ),
                            deprecated=value.options.deprecated,
                        ) for index, value in enumerate(enum.value)
                    ],
                    description=_comment(comments, location),
                ),
        },
    )


def _visit_message(
    comments: _Comments,
    *,
    file: FileDescriptorProto,
    location: SourceCodeInfo.Location,
    message: DescriptorProto,
    qualified_name: str,
    state: bool,
) -> api_pb2.API:
    """What the message declares, as the `API` it contributes: its
    schema, which a state type refers to when the message is a state
    and a data type otherwise, and then what the messages and enums
    it nests declare, whether or not a field mentions them. Not the
    message `protoc` writes for a `map`, which is no type of the
    developer's."""
    properties: list[schema_pb2.Property] = []
    for index, field in enumerate(message.field):
        # The type the field declares: what it holds, as a list when
        # `repeated`, a dict when a `map`, and an optional when
        # `optional`.
        if field.label == FieldDescriptorProto.LABEL_REPEATED:
            # A `map` is recorded as a repeated message, written for
            # it and nested in the message declaring the `map`, of a
            # `key` and a `value`.
            entry = next(
                (
                    nested for nested in message.nested_type
                    if nested.options.map_entry and
                    field.type_name.endswith('.' + nested.name)
                ),
                None,
            )
            if entry is not None:
                key, value = entry.field
                type_ = schema_pb2.Type(
                    map=schema_pb2.Map(
                        value=_type_of(value),
                        # A string in JSON whatever it was declared
                        # as, which is always a scalar: all a `map`
                        # may be keyed by. Its origin is what the
                        # descriptor says it was declared as, its
                        # `type`, which `google.protobuf.Field.Kind`
                        # names the way a descriptor does.
                        key=schema_pb2.Type(
                            scalar=schema_pb2.STRING,
                            origin=schema_pb2.Origin(
                                proto=schema_pb2.Origin.Proto(
                                    kind=type_pb2.Field.Kind.Value(
                                        FieldDescriptorProto.Type.Name(
                                            key.type,
                                        ),
                                    ),
                                ),
                            ),
                        ),
                    ),
                )
            else:
                type_ = schema_pb2.Type(
                    array=schema_pb2.Array(item=_type_of(field)),
                )
        elif field.proto3_optional:
            type_ = schema_pb2.Type(
                optional=schema_pb2.Optional(inner=_type_of(field)),
            )
        else:
            type_ = _type_of(field)

        properties.append(
            schema_pb2.Property(
                name=field.name,
                tag=field.number,
                type=type_,
                # Nothing a `.proto` declares must be given: a field
                # not given has its type's default.
                required=False,
                description=_comment(
                    comments,
                    _within(
                        location,
                        DescriptorProto.FIELD_FIELD_NUMBER,
                        index,
                    ),
                ),
                deprecated=field.options.deprecated,
            ),
        )

    # A member of a `oneof` is a property like any other, which is
    # what it is in JSON; the `oneof` says which exclude each other.
    one_ofs: list[schema_pb2.OneOf] = []
    for index, oneof in enumerate(message.oneof_decl):
        tags = [
            field.number
            for field in message.field
            # A member of a `oneof` the developer wrote: an
            # `optional` field is recorded as the only member of a
            # `oneof` of its own, which is not one.
            if field.HasField('oneof_index') and not field.proto3_optional and
            field.oneof_index == index
        ]
        # None for the `oneof` an `optional` field is recorded as
        # the only member of.
        if len(tags) > 0:
            one_ofs.append(
                schema_pb2.OneOf(
                    name=oneof.name,
                    tags=tags,
                    description=_comment(
                        comments,
                        _within(
                            location,
                            DescriptorProto.ONEOF_DECL_FIELD_NUMBER,
                            index,
                        ),
                    ),
                ),
            )

    schema = schema_pb2.Schema(
        name=_name_within_package(file, qualified_name),
        package=file.package,
        properties=properties,
        one_ofs=one_ofs,
        description=_comment(comments, location),
    )

    state_type: Optional[api_pb2.StateType] = None
    if state:
        # What a message carrying `(rbt.v1alpha1.state)` declares: its
        # UIs, and the methods of the services it names, or of
        # `<State>Methods` for one naming none, among the services of
        # the same file. A service that does not exist provides
        # nothing, which is the normal case while someone is typing.
        state_options = message.options.Extensions[options_pb2.state]

        names = list(state_options.implements)
        if len(names) == 0:
            names = [f'{message.name}{_METHODS_SUFFIX}']
        methods: list[api_pb2.Method] = []
        for name in names:
            implemented = name if '.' in name else _qualified_name(file, name)
            for service_index, service in enumerate(file.service):
                if _qualified_name(file, service.name) != implemented:
                    continue
                for method_index, method in enumerate(service.method):
                    options = method.options.Extensions[options_pb2.method]

                    kind = options.WhichOneof('kind')
                    if kind is None:
                        raise UserProtoError(
                            f"'{method.name}' is missing the required "
                            "Reboot annotation 'kind'",
                        )

                    # What the method's options say it does, the
                    # deprecated `mcp` description read only when it
                    # is the only one, and the comment above the
                    # `rpc` when neither says.
                    if options.HasField('description'):
                        description = options.description
                    elif (
                        options.HasField('mcp') and
                        options.mcp.HasField('description')
                    ):
                        description = options.mcp.description
                    else:
                        description = _comment(
                            comments,
                            SourceCodeInfo.Location(
                                path=[
                                    FileDescriptorProto.SERVICE_FIELD_NUMBER,
                                    service_index,
                                    ServiceDescriptorProto.METHOD_FIELD_NUMBER,
                                    method_index,
                                ],
                            ),
                        )

                    # A transaction's mode, of the kinds the only one
                    # declaring anything.
                    transaction = None
                    if kind == 'transaction':
                        mode = options.transaction.WhichOneof('mode')
                        transaction = api_pb2.Transaction(
                            exclusive=(
                                api_pb2.Exclusive()
                                if mode == 'exclusive' else None
                            ),
                            shared=(
                                api_pb2.Shared() if mode == 'shared' else None
                            ),
                        )

                    mcp = None
                    if options.HasField('mcp'):
                        mcp_name = (
                            options.mcp.name
                            if options.mcp.HasField('name') else None
                        )
                        title = (
                            options.mcp.title
                            if options.mcp.HasField('title') else None
                        )
                        if options.mcp.tool:
                            mcp = api_pb2.MCP(
                                tool=api_pb2.Tool(name=mcp_name, title=title),
                            )
                        elif options.mcp.resource:
                            mcp = api_pb2.MCP(
                                resource=api_pb2.Resource(
                                    name=mcp_name,
                                    title=title,
                                ),
                            )

                    methods.append(
                        api_pb2.Method(
                            name=method.name,
                            # A kind's message declares nothing yet;
                            # setting it is what selects the arm.
                            reader=api_pb2.Reader()
                            if kind == 'reader' else None,
                            writer=api_pb2.Writer()
                            if kind == 'writer' else None,
                            transaction=transaction,
                            workflow=(
                                api_pb2.Workflow()
                                if kind == 'workflow' else None
                            ),
                            factory=(
                                kind in ('writer', 'transaction') and
                                getattr(options, kind).HasField('constructor')
                            ),
                            request=_optional_reference(method.input_type),
                            response=_optional_reference(method.output_type),
                            # A name without a package is of the
                            # package of the method raising it.
                            # Whether the message exists is for `rbt
                            # generate` to say, which reads every
                            # file.
                            errors=[
                                _reference(
                                    error if '.' in error else
                                    _qualified_name(file, error),
                                ) for error in options.errors
                            ],
                            description=description,
                            mcp=mcp,
                        ),
                    )

        state_type = api_pb2.StateType(
            name=message.name,
            reference=Reference(name=qualified_name),
            description=(
                state_options.description
                if state_options.HasField('description') else None
            ),
            auto_construct=(
                state_options.auto_construct == options_pb2.PER_USER_ID
            ),
            uis=[
                api_pb2.UI(
                    name=ui.name,
                    path=ui.path,
                    request=(
                        _reference(
                            ui.request_message if '.' in ui.request_message
                            else _qualified_name(file, ui.request_message),
                        ) if ui.HasField('request_message') else None
                    ),
                    title=ui.title if ui.title != '' else None,
                    description=(
                        ui.description if ui.HasField('description') else None
                    ),
                    artifact_path=(
                        ui.artifact_path
                        if ui.HasField('artifact_path') else None
                    ),
                ) for ui in state_options.uis
            ],
            methods=methods,
        )

    api = api_pb2.API(
        state_types=[state_type] if state_type is not None else [],
        data_types=(
            [] if state_type is not None else [Reference(name=qualified_name)]
        ),
        schemas={qualified_name: schema},
    )

    for index, nested in enumerate(message.nested_type):
        if nested.options.map_entry:
            continue
        api.MergeFrom(
            _visit_message(
                comments,
                file=file,
                location=_within(
                    location,
                    DescriptorProto.NESTED_TYPE_FIELD_NUMBER,
                    index,
                ),
                message=nested,
                qualified_name=f'{qualified_name}.{nested.name}',
                # Code generation takes a state from the top of the file
                # only.
                state=False,
            ),
        )
    for index, enum in enumerate(message.enum_type):
        api.MergeFrom(
            _visit_enum(
                comments,
                file=file,
                location=_within(
                    location,
                    DescriptorProto.ENUM_TYPE_FIELD_NUMBER,
                    index,
                ),
                enum=enum,
                qualified_name=f'{qualified_name}.{enum.name}',
            ),
        )

    return api


def api_of(
    file: FileDescriptorProto,
    *,
    filename: str,
    external: bool = False,
) -> api_pb2.API:
    """Returns what one `.proto` declares: its state types in
    declaration order, each with its state model, methods and UIs;
    every message and enum it declares, in declaration order, nested
    ones included; and the schema of every one, by qualified name.
    What the file mentions from another file is a `Reference`,
    described in that file's own `API`. A file declaring no state
    declares its messages and enums all the same: the developer wrote
    each, and code is generated for each.

    `file` is the descriptor, with its source information, which is
    where the comments are. `filename` is what the `API` names the
    file by: for the application's own, relative to the API directory,
    as `protoc` was given it. `external` says the file is outside the
    application's API, imported and not the developer's.
    """
    # What the developer wrote above each declaration, by the
    # declaration's path: `protoc` keeps every comment of the file in
    # its source information, saying by path which declaration each
    # is above.
    comments: _Comments = {}
    for location in file.source_code_info.location:
        # A comment as its author would read it back: without the
        # space that follows each `//`, and none for no comment at
        # all.
        lines = [
            line.rstrip() for line in (
                location.leading_comments or location.trailing_comments
            ).split('\n')
        ]
        if all(line == '' or line.startswith(' ') for line in lines):
            lines = [line[1:] for line in lines]
        text = '\n'.join(lines).strip('\n')
        if text != '':
            comments[tuple(location.path)] = text

    api = api_pb2.API(
        filename=filename,
        package=file.package,
        external=external,
        # Declares nothing yet; setting it is what selects the arm.
        proto=api_pb2.API.Proto(),
    )
    for index, message in enumerate(file.message_type):
        api.MergeFrom(
            _visit_message(
                comments,
                file=file,
                location=SourceCodeInfo.Location(
                    path=[
                        FileDescriptorProto.MESSAGE_TYPE_FIELD_NUMBER, index
                    ],
                ),
                message=message,
                qualified_name=_qualified_name(file, message.name),
                # A state is a message carrying `(rbt.v1alpha1.state)`.
                state=message.options.HasExtension(options_pb2.state),
            ),
        )
    for index, enum in enumerate(file.enum_type):
        api.MergeFrom(
            _visit_enum(
                comments,
                file=file,
                location=SourceCodeInfo.Location(
                    path=[FileDescriptorProto.ENUM_TYPE_FIELD_NUMBER, index],
                ),
                enum=enum,
                qualified_name=_qualified_name(file, enum.name),
            ),
        )
    return api
