# backend/src/servicers/counter.py
from ai_chat_counter.v1.counter_rbt import Counter, Session
from reboot.aio.auth.authorizers import Authorizer, allow
from reboot.aio.contexts import (
    ReaderContext,
    TransactionContext,
    WriterContext,
)


class SessionServicer(Session.Servicer):
    """Servicer for the Session state machine."""

    def authorizer(self) -> Authorizer:
        return allow()

    async def create_counter(
        self,
        context: TransactionContext,
    ) -> Session.CreateCounterResponse:
        """Create a new Counter and return its ID."""
        counter, _ = await Counter.create(context)
        return Session.CreateCounterResponse(
            counter_id=counter.state_id,
        )


class CounterServicer(Counter.Servicer):
    """Servicer for the Counter state machine."""

    def authorizer(self) -> Authorizer:
        return allow()

    async def create(self, context) -> None:
        pass

    async def increment(
        self,
        context: WriterContext,
        request: Counter.IncrementRequest,
    ) -> None:
        """Increment the counter by the specified amount."""
        self.state.value += (
            request.amount if request.amount is not None else 1
        )

    async def get(
        self,
        context: ReaderContext,
    ) -> Counter.GetResponse:
        """Get the current counter value."""
        return Counter.GetResponse(value=self.state.value)
