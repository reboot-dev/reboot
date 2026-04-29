# api/ai_chat_counter/v1/counter.py
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
    Writer,
)


class CreateCounterRequest(Model):
    description: str = Field(tag=1)


class CreateCounterResponse(Model):
    counter_id: str = Field(tag=1)


class CounterEntry(Model):
    counter_id: str = Field(tag=1)
    description: str = Field(tag=2)


class ListCountersResponse(Model):
    counters: list[CounterEntry] = Field(tag=1, default_factory=list)


class UserState(Model):
    counter_ids: list[str] = Field(tag=1, default_factory=list)


class DescriptionResponse(Model):
    description: str = Field(tag=1)


class CounterState(Model):
    value: int = Field(tag=1, default=0)
    description: str = Field(tag=2, default="")


class GetResponse(Model):
    value: int = Field(tag=1)


class IncrementRequest(Model):
    """Request with an amount parameter."""
    amount: int | None = Field(tag=1, default=None)


api = API(
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
                mcp=Tool(),
            ),
            list_counters=Reader(
                request=None,
                response=ListCountersResponse,
                description="List all counters created "
                "by this user. Returns `counter_id` and "
                "description for each. The `counter_id` "
                "is not human-readable, but use it when "
                "calling tools that take a `counter_id`.",
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
                description="Interactive clicker UI "
                "for the counter.",
            ),
            create=Writer(
                request=CreateCounterRequest,
                response=None,
                factory=True,
                mcp=None,
            ),
            get=Reader(
                request=None,
                response=GetResponse,
                description="Get the current counter "
                "value.",
                mcp=Tool(),
            ),
            increment=Writer(
                request=IncrementRequest,
                response=None,
                description="Increment the counter by "
                "the specified amount.",
                mcp=Tool(),
            ),
            description=Reader(
                request=None,
                response=DescriptionResponse,
                mcp=None,
            ),
        ),
    ),
)
