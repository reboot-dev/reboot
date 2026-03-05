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


# -- Session models. --


class CreateCounterResponse(Model):
    counter_id: str = Field(tag=1)


class SessionState(Model):
    pass


# -- Counter models (simple counter). --


class IncrementResponse(Model):
    value: int = Field(tag=1)


class ValueResponse(Model):
    value: int = Field(tag=1)


class CounterState(Model):
    value: int = Field(tag=1, default=0)


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
    Session=Type(
        state=SessionState,
        methods=Methods(
            create_counter=Transaction(
                request=None,
                response=CreateCounterResponse,
                description="Create a new Counter. Returns the ID of the new "
                "counter. That ID is not human-readable; pass it to future tool "
                "calls where needed, but no need to tell the human what it is.",
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
                request=None,
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
        ),
    ),
)
