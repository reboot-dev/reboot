"""Counter servicer implementation."""

from mcp_counter.v1.counter_rbt import Chat
from reboot.aio.auth.authorizers import allow
from reboot.aio.contexts import ReaderContext, WriterContext


class ChatServicer(Chat.Servicer):
    """Servicer for the Chat state machine."""

    def authorizer(self):
        return allow()

    async def increment(
        self,
        context: WriterContext,
        request: Chat.IncrementRequest,
    ) -> None:
        """Increment the counter by the specified amount."""
        self.state.value += request.amount

    async def decrement(
        self,
        context: WriterContext,
        request: Chat.DecrementRequest,
    ) -> None:
        """Decrement the counter by the specified amount."""
        self.state.value -= request.amount

    async def get(
        self,
        context: ReaderContext,
    ) -> Chat.GetResponse:
        """Get the current counter value."""
        return Chat.GetResponse(value=self.state.value)
