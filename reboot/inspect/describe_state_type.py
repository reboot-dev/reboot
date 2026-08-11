"""Describes Reboot state types from protobuf descriptors.

Everything comes from the descriptor pool it is handed: a state type's
fields, and the methods of the services that supply them. Field and
method types are rendered as the Python names a person reads on a
page, such as `int` and `list[str]`, rather than as their protobuf
spelling.
"""
from google.protobuf import descriptor_pool
from google.protobuf.descriptor import FieldDescriptor
from log.log import get_logger
from rbt.v1alpha1 import options_pb2
from rbt.v1alpha1.inspect.inspect_pb2 import (
    FieldInfo,
    MethodInfo,
    StateTypeInfo,
)
from reboot.aio.types import StateTypeName
from typing import Iterable, Optional

logger = get_logger(__name__)

_TYPE_NAMES = {
    FieldDescriptor.TYPE_DOUBLE: 'float',
    FieldDescriptor.TYPE_FLOAT: 'float',
    FieldDescriptor.TYPE_INT64: 'int',
    FieldDescriptor.TYPE_UINT64: 'int',
    FieldDescriptor.TYPE_INT32: 'int',
    FieldDescriptor.TYPE_FIXED64: 'int',
    FieldDescriptor.TYPE_FIXED32: 'int',
    FieldDescriptor.TYPE_BOOL: 'bool',
    FieldDescriptor.TYPE_STRING: 'str',
    FieldDescriptor.TYPE_BYTES: 'bytes',
    FieldDescriptor.TYPE_UINT32: 'int',
    FieldDescriptor.TYPE_SFIXED32: 'int',
    FieldDescriptor.TYPE_SFIXED64: 'int',
    FieldDescriptor.TYPE_SINT32: 'int',
    FieldDescriptor.TYPE_SINT64: 'int',
}


def _type_name(field) -> str:
    """How to render `field`'s type."""
    if field.type in (
        FieldDescriptor.TYPE_MESSAGE, FieldDescriptor.TYPE_GROUP
    ):
        name = field.message_type.name
    elif field.type == FieldDescriptor.TYPE_ENUM:
        name = field.enum_type.name
    else:
        name = _TYPE_NAMES.get(field.type, 'unknown')

    if field.label == FieldDescriptor.LABEL_REPEATED:
        return f'list[{name}]'
    return name


def _fields_of(message) -> list[FieldInfo]:
    return [
        FieldInfo(name=field.name, type=_type_name(field))
        for field in message.fields
    ]


def _describe_method(method) -> MethodInfo:
    options = method.GetOptions().Extensions[options_pb2.method]
    kind = options.WhichOneof('kind') or ''

    info = MethodInfo(
        name=method.name,
        kind=kind,
        arguments=_fields_of(method.input_type),
        errors=list(options.errors),
        mcp=options.HasField('mcp'),
    )

    # An empty response means the method returns nothing; saying
    # "Empty" would be an implementation detail leaking out. The
    # response's fields rather than its name, because a synthesized
    # name such as `ShopRemainingResponse` says nothing the fields
    # don't.
    if method.output_type.full_name != 'google.protobuf.Empty':
        info.returns.extend(_fields_of(method.output_type))

    # An application that was created before `MethodOptions.description`
    # will have the deprecated `mcp` description, which is permitted
    # for backward compatibility.
    if options.description:
        info.description = options.description
    elif options.HasField('mcp') and options.mcp.description:
        info.description = options.mcp.description

    # Only writers and transactions can construct.
    if kind in ('writer', 'transaction'):
        info.factory = getattr(options, kind).HasField('constructor')

    return info


def describe_state_type(
    pool: descriptor_pool.DescriptorPool,
    state_type_name: StateTypeName,
    service_names: Iterable[str],
    file: str,
) -> Optional[StateTypeInfo]:
    """Describes one state type, or `None` when its descriptors can't
    be found, since a state type we can't describe shouldn't stop us
    describing the rest.

    `pool` holds the state type's descriptors and those of the
    services named in `service_names`, which supply its methods.

    `file` is the file the developer declared the state type in, which
    is reported as it is. A Pydantic API is described from a `.proto`
    synthesized from it, so the descriptors name a file that only
    exists inside the build.
    """
    try:
        state = pool.FindMessageTypeByName(state_type_name)
    except KeyError:
        logger.warning(
            f"No descriptor for state type '{state_type_name}'; "
            "omitting it from the schema"
        )
        return None

    info = StateTypeInfo(
        name=state_type_name,
        file=file,
        fields=_fields_of(state),
    )

    for service_name in service_names:
        try:
            service = pool.FindServiceByName(service_name)
        except KeyError:
            continue
        for method in service.methods:
            info.methods.append(_describe_method(method))

    return info
