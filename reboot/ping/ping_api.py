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


# -- Chat models (simple counter). --


class CounterIncrementResponse(Model):
    counter_value: int = Field(tag=1)


class CounterValueResponse(Model):
    counter_value: int = Field(tag=1)


class ChatState(Model):
    counter_value: int = Field(tag=1, default=0)


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
    Chat=Type(
        state=ChatState,
        methods=Methods(
            show_clicker=UI(
                request=None,
                path="web/ui/clicker",
                title="Chat Clicker",
                description="Interactive clicker for the Chat's counter.",
            ),
            counter_increment=Writer(
                request=None,
                response=CounterIncrementResponse,
                description="Increment the counter.",
            ),
            counter_value=Reader(
                request=None,
                response=CounterValueResponse,
                description="Get the current counter value.",
            ),
        ),
    ),
)
