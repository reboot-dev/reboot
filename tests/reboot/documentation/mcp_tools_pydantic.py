from reboot.api import (
    API,
    Field,
    Methods,
    Model,
    Reader,
    Tool,
    Transaction,
    Type,
    Writer,
)


class CreateCounterResponse(Model):
    counter_id: str = Field(tag=1)


class GetResponse(Model):
    value: int = Field(tag=1)


class UserState(Model):
    counter_ids: list[str] = Field(tag=1, default_factory=list)


class CounterState(Model):
    value: int = Field(tag=1, default=0)


UserMethods = Methods(
    # AI-callable — the AI can call this.
    create_counter=Transaction(
        request=None,
        response=CreateCounterResponse,
        description="Create a new Counter. Returns "
        "the ID of the new counter.",
        mcp=Tool(),
    ),
    # NOT AI-callable — internal use only.
    cleanup=Writer(
        request=None,
        response=None,
        description="Clean up old state.",
        mcp=None,
    ),
)

CounterMethods = Methods(
    # AI-callable because of `mcp=Tool()`.
    get=Reader(
        request=None,
        response=GetResponse,
        description="Get the current counter value.",
        mcp=Tool(),
    ),
    # NOT AI-callable.
    create=Writer(
        request=None,
        response=None,
        factory=True,
        mcp=None,
    ),
)

api = API(
    User=Type(
        state=UserState,
        methods=UserMethods,
    ),
    Counter=Type(
        state=CounterState,
        methods=CounterMethods,
    ),
)
