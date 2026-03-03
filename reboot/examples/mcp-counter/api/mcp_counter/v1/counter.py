from reboot.api import (
    API,
    UI,
    Field,
    Methods,
    Model,
    Reader,
    Tool,
    Type,
    Writer,
)


class ChatState(Model):
    value: int = Field(tag=1, default=0)


class ValueResponse(Model):
    value: int = Field(tag=1)


class AmountRequest(Model):
    """Request with an amount parameter, used by increment and decrement."""
    amount: int = Field(tag=1)


class DashboardConfig(Model):
    """Configuration passed by the AI when opening the dashboard."""
    personalized_message: str = Field(tag=1)


ChatMethods = Methods(
    # `show_clicker` has no request type -- the clicker UI
    # needs no configuration from the AI.
    show_clicker=UI(
        request=None,
        path="web/ui/clicker",
        title="Counter Clicker",
        description="Interactive clicker UI for the counter.",
    ),
    # `show_dashboard` takes a `DashboardConfig` request --
    # the AI can personalize the dashboard display.
    show_dashboard=UI(
        request=DashboardConfig,
        path="web/ui/dashboard",
        title="Counter Dashboard",
        description=
        "Dashboard UI. Use `personalized_message` to impart wisdom on the topic of counting things.",
    ),
    get=Reader(
        request=None,
        response=ValueResponse,
        description="Get the current counter value.",
        mcp=Tool(),
    ),
    increment=Writer(
        request=AmountRequest,
        response=None,
        description="Increment the counter by the specified amount.",
    ),
    decrement=Writer(
        request=AmountRequest,
        response=None,
        description="Decrement the counter by the specified amount.",
    ),
)

api = API(
    Chat=Type(
        state=ChatState,
        methods=ChatMethods,
    ),
)
