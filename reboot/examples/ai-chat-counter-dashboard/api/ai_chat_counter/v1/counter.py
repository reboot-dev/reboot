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


class CreateCounterResponse(Model):
    counter_id: str = Field(tag=1)


class SessionState(Model):
    pass


class CounterState(Model):
    value: int = Field(tag=1, default=0)


class GetResponse(Model):
    value: int = Field(tag=1)


class IncrementRequest(Model):
    """Request with an amount parameter."""
    amount: int = Field(tag=1)


class DashboardConfig(Model):
    """Configuration passed by the AI."""
    personalized_message: str = Field(tag=1)


api = API(
    Session=Type(
        state=SessionState,
        methods=Methods(
            create_counter=Transaction(
                request=None,
                response=CreateCounterResponse,
                description="Create a new Counter. Returns "
                "the ID of the new counter. That ID is "
                "not human-readable; pass it to future "
                "tool calls where needed, but no need to "
                "tell the human what it is.",
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
            show_dashboard=UI(
                request=DashboardConfig,
                path="web/ui/dashboard",
                title="Counter Dashboard",
                description="Dashboard UI. Use "
                "`personalized_message` to impart wisdom "
                "on the topic of counting things.",
            ),
            create=Writer(
                request=None,
                response=None,
                factory=True,
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
        ),
    ),
)
