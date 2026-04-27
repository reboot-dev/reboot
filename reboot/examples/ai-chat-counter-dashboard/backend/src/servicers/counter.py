from ai_chat_counter.v1.counter import (
    CounterEntry,
    CreateCounterRequest,
    CreateCounterResponse,
    ListCountersResponse,
)
from ai_chat_counter.v1.counter_rbt import Counter, User
from reboot.aio.auth.authorizers import allow
from reboot.aio.contexts import (
    ReaderContext,
    TransactionContext,
    WriterContext,
)


class UserServicer(User.Servicer):
    """Servicer for the User state machine."""

    async def create_counter(
        self,
        context: TransactionContext,
        request: CreateCounterRequest,
    ) -> CreateCounterResponse:
        """Create a new Counter and return its ID."""
        counter, _ = await Counter.create(
            context, description=request.description
        )
        self.state.counter_ids.append(counter.state_id)
        return CreateCounterResponse(
            counter_id=counter.state_id,
        )

    async def list_counters(
        self,
        context: ReaderContext,
    ) -> ListCountersResponse:
        """List all counters created by this user."""
        counters = []
        for counter_id in self.state.counter_ids:
            response = await Counter.ref(counter_id).description(context)
            counters.append(
                CounterEntry(
                    counter_id=counter_id,
                    description=response.description,
                )
            )
        return ListCountersResponse(counters=counters)


class CounterServicer(Counter.Servicer):
    """Servicer for the Counter state machine."""

    def authorizer(self):
        return allow()

    async def create(
        self,
        context: WriterContext,
        request: CreateCounterRequest,
    ) -> None:
        """Initialize the counter with a description."""
        self.state.description = request.description

    async def description(
        self,
        context: ReaderContext,
    ) -> Counter.DescriptionResponse:
        """Get the counter's description."""
        return Counter.DescriptionResponse(
            description=self.state.description,
        )

    async def increment(
        self,
        context: WriterContext,
        request: Counter.IncrementRequest,
    ) -> None:
        """Increment the counter by the specified amount."""
        self.state.value += request.amount if request.amount is not None else 1

    async def get(
        self,
        context: ReaderContext,
    ) -> Counter.GetResponse:
        """Get the current counter value."""
        return Counter.GetResponse(value=self.state.value)
