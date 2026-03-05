"""Counter servicer implementation."""

from mcp_counter.v1.counter_rbt import Chat, Counter
from reboot.aio.auth.authorizers import allow
from reboot.aio.contexts import (
    ReaderContext,
    TransactionContext,
    WriterContext,
)


class ChatServicer(Chat.Servicer):
    """Servicer for the Chat state machine."""

    def authorizer(self):
        return allow()

    async def create_counter(
        self,
        context: TransactionContext,
    ) -> Chat.CreateCounterResponse:
        """Create a new Counter and return its ID."""
        counter, _ = await Counter.create(context)
        return Chat.CreateCounterResponse(
            counter_id=counter.state_id,
        )


class CounterServicer(Counter.Servicer):
    """Servicer for the Counter state machine."""

    def authorizer(self):
        return allow()

    async def create(self, context) -> None:
        # We don't need any non-default values in our
        # state; it just needs to exist.
        pass

    async def increment(
        self,
        context: WriterContext,
        request: Counter.IncrementRequest,
    ) -> None:
        """Increment the counter by the specified amount."""
        self.state.value += request.amount

    async def decrement(
        self,
        context: WriterContext,
        request: Counter.DecrementRequest,
    ) -> None:
        """Decrement the counter by the specified amount."""
        self.state.value -= request.amount

    async def get(
        self,
        context: ReaderContext,
    ) -> Counter.GetResponse:
        """Get the current counter value."""
        return Counter.GetResponse(value=self.state.value)
