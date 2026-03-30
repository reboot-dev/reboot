from reboot.api import (
    API,
    UI,
    Field,
    Methods,
    Model,
    Reader,
    Tool,
    Transaction,
    Type,
    Workflow,
    Writer,
)

# -- Ping/Pong models. --


class DoPingResponse(Model):
    num_pings: int = Field(tag=1)


class DoPingPeriodicallyRequest(Model):
    num_pings: int = Field(tag=1)
    period_seconds: float = Field(tag=2)


class DoPingPeriodicallyResponse(Model):
    num_pings: int = Field(tag=1)


class DescribeResponse(Model):
    text: str = Field(tag=1)


class NumPingsResponse(Model):
    num_pings: int = Field(tag=1)


class DoPongResponse(Model):
    num_pongs: int = Field(tag=1)


class NumPongsResponse(Model):
    num_pongs: int = Field(tag=1)


class PingState(Model):
    num_pings: int = Field(tag=1, default=0)


class PongState(Model):
    num_pongs: int = Field(tag=1, default=0)


# -- User models. --


class CreateCounterRequest(Model):
    description: str = Field(tag=1)


class CreateCounterResponse(Model):
    counter_id: str = Field(tag=1)


class CounterEntry(Model):
    counter_id: str = Field(tag=1)
    description: str = Field(tag=2)


class ListCountersResponse(Model):
    counters: list[CounterEntry] = Field(tag=1, default_factory=list)


class WhoAmIResponse(Model):
    user_id: str = Field(tag=1)


class UserState(Model):
    counter_ids: list[str] = Field(tag=1, default_factory=list)


# -- Counter models (simple counter). --


class DescriptionResponse(Model):
    description: str = Field(tag=1)


class IncrementResponse(Model):
    value: int = Field(tag=1)


class ValueResponse(Model):
    value: int = Field(tag=1)


class CounterState(Model):
    value: int = Field(tag=1, default=0)
    description: str = Field(tag=2, default="")


api = API(
    Ping=Type(
        state=PingState,
        methods=Methods(
            show_pinger=UI(
                request=None,
                path="web/ui/pinger",
                title="Ping Counter",
                description="Interactive UI for the Ping's counter.",
            ),
            do_ping=Transaction(
                request=None,
                response=DoPingResponse,
                mcp=Tool(),
            ),
            do_ping_periodically=Workflow(
                request=DoPingPeriodicallyRequest,
                response=DoPingPeriodicallyResponse,
            ),
            describe=Reader(
                request=None,
                response=DescribeResponse,
            ),
            num_pings=Reader(
                request=None,
                response=NumPingsResponse,
                mcp=Tool(),
            ),
        ),
    ),
    Pong=Type(
        state=PongState,
        methods=Methods(
            do_pong=Writer(
                request=None,
                response=DoPongResponse,
            ),
            num_pongs=Reader(
                request=None,
                response=NumPongsResponse,
            ),
        ),
    ),
    User=Type(
        state=UserState,
        methods=Methods(
            create_counter=Transaction(
                request=CreateCounterRequest,
                response=CreateCounterResponse,
                description="Create a new Counter with a "
                "description of what it counts. Returns "
                "the `counter_id`, which is not "
                "human-readable but should be passed to "
                "future tool calls that need it.",
            ),
            list_counters=Reader(
                request=None,
                response=ListCountersResponse,
                description="List all counters created by "
                "this user. Returns `counter_id` and "
                "description for each. The `counter_id` is "
                "not human-readable, but use it when "
                "calling tools that take a `counter_id`.",
            ),
            whoami=Reader(
                request=None,
                response=WhoAmIResponse,
                description="Returns the authenticated user's ID.",
                mcp=Tool(),
            ),
        ),
    ),
    Counter=Type(
        state=CounterState,
        methods=Methods(
            show_clicker=UI(
                request=None,
                path="web/ui/clicker",
                title="Counter Clicker",
                description=("Interactive clicker for the Counter."),
            ),
            create=Writer(
                request=CreateCounterRequest,
                response=None,
                factory=True,
            ),
            increment=Writer(
                request=None,
                response=IncrementResponse,
                description="Increment the counter.",
                mcp=Tool(),
            ),
            value=Reader(
                request=None,
                response=ValueResponse,
                description="Get the current counter value.",
                mcp=Tool(),
            ),
            description=Reader(
                request=None,
                response=DescriptionResponse,
            ),
        ),
    ),
)
