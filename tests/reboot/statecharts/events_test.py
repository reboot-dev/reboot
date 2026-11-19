import unittest
from google.protobuf import struct_pb2
from google.protobuf.message import Message
from rbt.v1alpha1.statecharts import statechart_pb2
from reboot.statecharts.events import (
    message_from_status_event,
    status_event_from_message,
)
from tests.reboot.statecharts import order_pb2


class EventsTest(unittest.TestCase):
    """Tests the two forms of an event, with the `Paid` and the
    `Settled` of `order.proto`: `Paid` has the field `cents` and
    `Settled` has no fields."""

    def test_status_event_has_full_name_and_fields_of_message(self) -> None:
        self.assertEqual(
            statechart_pb2.Status.Event(
                event="tests.reboot.statecharts.Paid",
                value=struct_pb2.Struct(
                    fields={"cents": struct_pb2.Value(number_value=500)},
                ),
            ),
            status_event_from_message(order_pb2.Paid(cents=500)),
        )

    def test_status_event_of_message_without_fields_has_no_value(
        self,
    ) -> None:
        status_event = status_event_from_message(order_pb2.Settled())

        self.assertEqual(
            statechart_pb2.Status.Event(
                event="tests.reboot.statecharts.Settled",
            ),
            status_event,
        )
        self.assertFalse(status_event.HasField("value"))

    def test_message_is_what_status_event_is_for(self) -> None:
        messages: list[Message] = [
            order_pb2.Paid(cents=500),
            # A field that is not set is left out of the value.
            order_pb2.Paid(),
            order_pb2.Settled(),
        ]

        for message in messages:
            self.assertEqual(
                message,
                message_from_status_event(
                    status_event_from_message(message),
                ),
            )


if __name__ == "__main__":
    unittest.main()
