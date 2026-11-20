import unittest
from google.protobuf import text_format
from rbt.v1alpha1.statecharts import statechart_pb2
from reboot.api import API, Methods, Type, Writer
from reboot.pydantic_api import api_of
from reboot.pydantic_statechart import model_of_event, rename_events
from tests.reboot.statecharts import door_api, door_api_pb2
from tests.reboot.statecharts.door_api import Opened
from tests.reboot.statecharts.door_api_rbt import Door


class DoorTest(unittest.TestCase):
    """Tests the statechart that a state type of a Pydantic API is
    given, with the `Door` of `door_api.py`."""

    def test_event_that_is_named_as_model_is_imported_is_model(self) -> None:
        self.assertIs(
            Opened,
            model_of_event("tests.reboot.statecharts.door_api.Opened"),
        )

    def test_event_that_is_named_as_message_is_no_model(self) -> None:
        for event in [
            # A message.
            "google.protobuf.Empty",
            # What `door_api.py` has that is no model.
            "tests.reboot.statecharts.door_api.STATECHART",
            # What it does not have.
            "tests.reboot.statecharts.door_api.Knocked",
            "Opened",
        ]:
            self.assertIsNone(model_of_event(event))

    def test_state_type_of_api_has_statechart_as_api_declares_it(self) -> None:
        (state_type,) = api_of(
            door_api.api,
            filename="tests/reboot/statecharts/door_api.py",
        ).state_types

        # Each event is still named as its model is.
        self.assertEqual(door_api.STATECHART, state_type.statechart)

    def test_api_has_schema_of_model_of_each_event(self) -> None:
        api = api_of(
            door_api.api,
            filename="tests/reboot/statecharts/door_api.py",
        )

        # `Closed` and `Alarmed` are of no method.
        for event in api.state_types[0].statechart.events:
            self.assertIn(event, api.schemas)

    def test_event_that_is_named_as_model_is_reexported_is_renamed(
        self,
    ) -> None:
        # `door_test.py` imports `Opened`, so it is also what
        # `tests.reboot.statecharts.door_test.Opened` is.
        statechart = text_format.Parse(
            """
            events: "tests.reboot.statecharts.door_test.Opened"
            events: "google.protobuf.Empty"
            initial: "CLOSED"
            states {
              name: "CLOSED"
              transitions {
                on {
                  event: "tests.reboot.statecharts.door_test.Opened"
                }
              }
              transitions { on { event: "google.protobuf.Empty" } }
            }
            """,
            statechart_pb2.Statechart(),
        )

        (state_type,) = api_of(
            API(
                Door=Type(
                    state=door_api.DoorState,
                    statechart=statechart,
                    methods=Methods(
                        create=Writer(
                            request=None,
                            response=None,
                            factory=True,
                            mcp=None,
                        ),
                    ),
                ),
            ),
            filename="tests/reboot/statecharts/door_test.py",
        ).state_types

        # The model is named by the module that it is declared in, as
        # a `Reference` to it is, and what is no model is left as it
        # is.
        self.assertEqual(
            rename_events(
                statechart,
                lambda event: {
                    "tests.reboot.statecharts.door_test.Opened":
                        "tests.reboot.statecharts.door_api.Opened",
                }.get(event, event),
            ),
            state_type.statechart,
        )
        self.assertEqual(
            [
                "tests.reboot.statecharts.door_api.Opened",
                "google.protobuf.Empty",
            ],
            list(state_type.statechart.events),
        )

    def test_message_is_generated_for_model_of_each_event(self) -> None:
        # `Opened` is also the request of `open`, and `Closed` and
        # `Alarmed` are of no method.
        self.assertEqual(
            ["by"],
            [field.name for field in door_api_pb2.Opened.DESCRIPTOR.fields],
        )
        self.assertEqual(
            ["by"],
            [field.name for field in door_api_pb2.Closed.DESCRIPTOR.fields],
        )
        self.assertEqual([], list(door_api_pb2.Alarmed.DESCRIPTOR.fields))

    def test_generated_servicer_has_statechart_with_events_as_messages(
        self,
    ) -> None:
        # What `door_api.STATECHART` generates to: each event is the
        # message of its model, which is of the package of the API
        # file and has the name of the model.
        self.assertEqual(
            rename_events(
                door_api.STATECHART,
                lambda event: {
                    "tests.reboot.statecharts.door_api.Opened":
                        "tests.reboot.statecharts.Opened",
                    "tests.reboot.statecharts.door_api.Closed":
                        "tests.reboot.statecharts.Closed",
                    "tests.reboot.statecharts.door_api.Alarmed":
                        "tests.reboot.statecharts.Alarmed",
                }[event],
            ),
            Door.Servicer.__statechart__,
        )
        self.assertEqual(
            [
                "tests.reboot.statecharts.Opened",
                "tests.reboot.statecharts.Closed",
                "tests.reboot.statecharts.Alarmed",
            ],
            list(Door.Servicer.__statechart__.events),
        )
        self.assertEqual(
            "tests.reboot.statecharts.Closed",
            Door.Servicer.__statechart__.states[1].entry[1].timer.enqueue.
            event,
        )

    def test_generated_servicer_has_methods_of_statechart(self) -> None:
        for method in ["is_allowed", "is_locked", "count", "report", "watch"]:
            self.assertIn(method, Door.Servicer.__abstractmethods__)


if __name__ == "__main__":
    unittest.main()
