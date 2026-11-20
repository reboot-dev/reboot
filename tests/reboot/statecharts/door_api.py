from google.protobuf import text_format
from rbt.v1alpha1.statecharts import statechart_pb2
from reboot.api import API, Field, Methods, Model, Type, Writer


class DoorState(Model):
    times_opened: int = Field(tag=1, default=0)
    locked: bool = Field(tag=2, default=False)


class Opened(Model):
    by: str = Field(tag=1)


class Closed(Model):
    by: str = Field(tag=1, default="")


class Alarmed(Model):
    pass


# The statechart of a door. It is `CLOSED` until an `Opened`, which is
# also what `open` is given, and then `OPEN` until a `Closed`, which
# no method is given: the timer of `OPEN` enqueues one and the schedule
# `watch` may. A door that is locked while it is `OPEN` is `ALARMED`,
# which is final.
#
# An event that is a model is named as the model is imported.
STATECHART = text_format.Parse(
    """
    events: "tests.reboot.statecharts.door_api.Opened"
    events: "tests.reboot.statecharts.door_api.Closed"
    events: "tests.reboot.statecharts.door_api.Alarmed"
    initial: "CLOSED"
    exit { call { description: "Report" inline { method: "report" } } }
    states {
      name: "CLOSED"
      transitions {
        on {
          event: "tests.reboot.statecharts.door_api.Opened"
          guard { inline { method: "is_allowed" } }
          to: "OPEN"
          actions {
            call {
              description: "Count"
              inline {
                method: "count"
                injects: "tests.reboot.statecharts.door_api.Alarmed"
              }
            }
          }
        }
      }
    }
    states {
      name: "OPEN"
      initial: "QUIET"
      entry {
        schedule {
          inline {
            method: "watch"
            enqueues: "tests.reboot.statecharts.door_api.Closed"
          }
          cancellable: true
        }
      }
      entry {
        timer {
          seconds: 30
          enqueue {
            event: "tests.reboot.statecharts.door_api.Closed"
            value {
              fields {
                key: "by"
                value { string_value: "the timer" }
              }
            }
          }
        }
      }
      exit { inject { event: "tests.reboot.statecharts.door_api.Alarmed" } }
      transitions {
        on {
          event: "tests.reboot.statecharts.door_api.Closed"
          to: "CLOSED"
        }
      }
      transitions {
        on { event: "tests.reboot.statecharts.door_api.Alarmed" }
      }
      transitions {
        when {
          description: "Locked"
          condition { inline { method: "is_locked" } }
          to: "ALARMED"
        }
      }
      states { name: "QUIET" }
    }
    states { name: "ALARMED" final: true }
    """,
    statechart_pb2.Statechart(),
)

api = API(
    Door=Type(
        state=DoorState,
        statechart=STATECHART,
        methods=Methods(
            create=Writer(
                request=None,
                response=None,
                factory=True,
                mcp=None,
            ),
            open=Writer(
                request=Opened,
                response=None,
                mcp=None,
            ),
        ),
    ),
)
