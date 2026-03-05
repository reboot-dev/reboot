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

# -- Chat models. --


class CreateCounterResponse(Model):
    counter_id: str = Field(tag=1)


class ChatState(Model):
    pass


# -- Counter models. --


class CounterState(Model):
    value: int = Field(tag=1, default=0)


class ValueResponse(Model):
    value: int = Field(tag=1)


class AmountRequest(Model):
    """Request with an amount parameter, used by
    increment and decrement."""
    amount: int = Field(tag=1)


class DashboardConfig(Model):
    """Configuration passed by the AI when opening
    the dashboard."""
    personalized_message: str = Field(tag=1)


api = API(
    Chat=Type(
        state=ChatState,
        methods=Methods(
            create_counter=Transaction(
                request=None,
                response=CreateCounterResponse,
                description="Create a new Counter. Returns "
                "the ID of the new counter. That ID is not "
                "human-readable; pass it to future tool "
                "calls where needed, but no need to tell "
                "the human what it is.",
            ),
        ),
    ),
    Counter=Type(
        state=CounterState,
        methods=Methods(
            # `show_clicker` has no request type -- the
            # clicker UI needs no configuration from the AI.
            show_clicker=UI(
                request=None,
                path="web/ui/clicker",
                title="Counter Clicker",
                description=("Interactive clicker UI for the counter."),
            ),
            # `show_dashboard` takes a `DashboardConfig`
            # request -- the AI can personalize the
            # dashboard display.
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
                response=ValueResponse,
                description=("Get the current counter value."),
                mcp=Tool(),
            ),
            increment=Writer(
                request=AmountRequest,
                response=None,
                description="Increment the counter by "
                "the specified amount.",
                mcp=Tool(),
            ),
            decrement=Writer(
                request=AmountRequest,
                response=None,
                description="Decrement the counter by "
                "the specified amount.",
                mcp=Tool(),
            ),
        ),
    ),
)
