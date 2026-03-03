from reboot.api import (
    API,
    Field,
    Methods,
    Model,
    Reader,
    Transaction,
    Type,
    Workflow,
    Writer,
)


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


api = API(
    Ping=Type(
        state=PingState,
        methods=Methods(
            do_ping=Transaction(
                request=None,
                response=DoPingResponse,
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
)
