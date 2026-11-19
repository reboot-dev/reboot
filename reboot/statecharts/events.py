"""An event of a statechart in its two forms: the message that it is,
and what the queue of a `Status` has for it."""
from google.protobuf import json_format, symbol_database
from google.protobuf.message import Message
from rbt.v1alpha1.statecharts import statechart_pb2


def status_event_from_message(
    message: Message,
) -> statechart_pb2.Status.Event:
    """Returns what the queue of a `Status` has for `message`, which is
    an event: the full name of the message and, unless the message has
    no fields, its fields."""
    status_event = statechart_pb2.Status.Event(
        event=message.DESCRIPTOR.full_name,
    )

    if len(message.DESCRIPTOR.fields) > 0:
        status_event.value.update(
            json_format.MessageToDict(
                message,
                preserving_proto_field_name=True,
            ),
        )

    return status_event


def message_from_status_event(
    status_event: statechart_pb2.Status.Event,
) -> Message:
    """Returns the message that `status_event`, which is from the queue
    of a `Status`, is for. The module that the message is generated in
    has been imported."""
    message = symbol_database.Default().GetSymbol(status_event.event)()

    if status_event.HasField("value"):
        json_format.ParseDict(
            json_format.MessageToDict(status_event.value),
            message,
        )

    return message
