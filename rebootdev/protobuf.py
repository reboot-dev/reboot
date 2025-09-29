import textwrap
from google.protobuf import any_pb2
from google.protobuf.json_format import MessageToDict, MessageToJson, ParseDict
from google.protobuf.message import Message
from google.protobuf.struct_pb2 import Value
from pydantic import BaseModel  # type: ignore[import]
from typing import TypeVar

T = TypeVar('T')
MessageT = TypeVar('MessageT', bound=Message)
BaseModelT = TypeVar('BaseModelT', bound=BaseModel)


def _from(t: T, expected_type: type[T]) -> Value:
    if type(t) != expected_type:
        raise TypeError(
            f"Expecting argument of type '{expected_type.__name__}' "
            f"but got '{type(t).__name__}'"
        )
    return ParseDict(t, Value())


def from_str(s: str) -> Value:
    """Helper that returns a `google.protobuf.Value` from a `str`."""
    return _from(s, str)


def from_bool(b: bool) -> Value:
    """Helper that returns a `google.protobuf.Value` from a `bool`."""
    return _from(b, bool)


def from_float(f: float) -> Value:
    """Helper that returns a `google.protobuf.Value` from a `float`."""
    return _from(f, float)


def from_int(i: int) -> Value:
    """Helper that returns a `google.protobuf.Value` from an `int`."""
    return _from(i, int)


def from_dict(d: dict) -> Value:
    """Helper that returns a `google.protobuf.Value` from a `dict`."""
    return _from(d, dict)


def from_list(lst: list) -> Value:
    """Helper that returns a `google.protobuf.Value` from a `list`."""
    return _from(lst, list)


def from_message(message: Message) -> Value:
    """
    Helper that returns a `google.protobuf.Value` from a protobuf
    `Message`.
    """
    if not isinstance(message, Message):
        raise TypeError(
            "Expecting argument to be instance of protobuf 'Message'"
        )
    return _from(MessageToDict(message), dict)


def from_model(model: BaseModel, **kwargs) -> Value:
    """
    Helper that returns a `google.protobuf.Value` from a pydantic
    `BaseModel`.
    """
    if not isinstance(model, BaseModel):
        raise TypeError(
            "Expecting argument to be instance of 'pydantic.BaseModel'"
        )
    return _from(model.model_dump(**kwargs), dict)


def _as(value: Value, expected_type: type[T]) -> T:
    if type(value) != Value:
        raise TypeError("Expecting 'Value'")
    t = MessageToDict(value)
    if type(t) != expected_type:
        raise TypeError(
            f"Expecting value of type '{expected_type.__name__}' "
            f"but got '{type(t).__name__}'"
        )
    return t


def as_str(value: Value) -> str:
    """Helper that converts a `google.protobuf.Value` to a `str`."""
    return _as(value, str)


def as_bool(value: Value) -> bool:
    """Helper that converts a `google.protobuf.Value` to a `bool`."""
    return _as(value, bool)


def as_float(value: Value) -> float:
    """Helper that converts a `google.protobuf.Value` to a `float`."""
    return _as(value, float)


def as_int(value: Value) -> int:
    """Helper that converts a `google.protobuf.Value` to an `int`."""
    f = as_float(value)
    if not f.is_integer():
        raise TypeError("Expecting an 'int' but got a 'float'")
    return int(f)


def as_dict(value: Value) -> dict:
    """Helper that converts a `google.protobuf.Value` to a `dict`."""
    return _as(value, dict)


def as_list(value: Value) -> list:
    """Helper that converts a `google.protobuf.Value` to a `list`."""
    return _as(value, list)


def as_message(value: Value, message_type: type[MessageT]) -> MessageT:
    """
    Helper that converts a `google.protobuf.Value` to a protobuf message.
    """
    message = message_type()
    if not isinstance(message, Message):
        raise TypeError("Expecting message type to be a protobuf 'Message'")
    return ParseDict(as_dict(value), message)


def as_model(value: Value, model_type: type[BaseModelT]) -> BaseModelT:
    """
    Helper that converts a `google.protobuf.Value` to a pydantic model.
    """
    return model_type(**as_dict(value))


def pack(message: Message) -> any_pb2.Any:
    """Helper that creates a protobuf `Any` from a protobuf `Message`."""
    any = any_pb2.Any()
    any.Pack(message)
    return any


def unpack(any: any_pb2.Any, message_type: type[MessageT]) -> MessageT:
    """Helper that creates a protobuf `Message` from a protobuf `Any`."""
    message = message_type()
    if not any.Unpack(message):
        raise RuntimeError(
            f"Could not unpack `any` into '{message.DESCRIPTOR.full_name}'"
        )
    return message


def to_json(
    message_or_messages: Message | list[Message],
    *,
    indent: int = 2,
    **kwargs,
) -> str:
    """
    Helper for converting a protobuf `Message` or a list of protobuf
    `Messages` to a JSON string.

    Passes on any keyword arguments to `MessageToJson`.
    """
    if not isinstance(message_or_messages, list):
        return MessageToJson(message_or_messages, indent=indent, **kwargs)

    return "[" + "\n" + textwrap.indent(
        ",\n".join(
            [
                MessageToJson(message, indent=indent, **kwargs)
                for message in message_or_messages
            ]
        ),
        " " * indent,
    ) + "\n" + "]"
