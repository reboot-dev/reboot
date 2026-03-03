"""Counter servicer implementation."""

from mcp_counter.v1.counter_rbt import Counter
from reboot.aio.auth.authorizers import allow
from reboot.aio.contexts import ReaderContext, WriterContext


class CounterServicer(Counter.Servicer):
    """Servicer for the Counter state machine."""

    def authorizer(self):
        return allow()

    async def create(
        self,
        context: WriterContext,
    ) -> None:
        """Create a new counter initialized to 0."""
        self.state.value = 0

    async def increment(
        self,
        context: WriterContext,
    ) -> None:
        """Increment the counter by 1."""
        self.state.value += 1

    async def decrement(
        self,
        context: WriterContext,
    ) -> None:
        """Decrement the counter by 1."""
        self.state.value -= 1

    async def get(
        self,
        context: ReaderContext,
    ) -> Counter.GetResponse:
        """Get the current counter value."""
        return Counter.GetResponse(value=self.state.value)
