# backend/src/servicers/counter.py
from rbt.v1alpha1.errors_pb2 import Ok, PermissionDenied, Unauthenticated
from reboot.aio.auth.authorizers import Authorizer, allow_if, is_app_internal
from reboot.aio.contexts import (
    ReaderContext,
    TransactionContext,
    WriterContext,
)
from tests.reboot.documentation.ai_chat_counter import (
    CounterEntry,
    CreateCounterRequest,
    CreateCounterResponse,
    InitializeCounterRequest,
    ListCountersResponse,
)
from tests.reboot.documentation.ai_chat_counter_rbt import Counter, User
from typing import Optional


def _caller_is_owner(
    *,
    context: ReaderContext,
    state: Optional[Counter.State],
    **kwargs,
):
    """Allow when the caller's `user_id` matches the Counter's recorded
    `owner_id`. A not-yet-constructed Counter (`state is None`) falls
    through to deny."""
    if context.auth is None or not context.auth.user_id:
        return Unauthenticated()
    if state is not None and context.auth.user_id == state.owner_id:
        return Ok()
    return PermissionDenied()


class UserServicer(User.Servicer):
    """Servicer for the User state machine."""

    async def create_counter(
        self,
        context: TransactionContext,
        request: CreateCounterRequest,
    ) -> CreateCounterResponse:
        """Create a new Counter and return its ID."""
        counter, _ = await Counter.create(
            context,
            description=request.description,
            owner_id=context.state_id,
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

    def authorizer(self) -> Authorizer:
        return Counter.Authorizer(
            # `create` is restricted to trusted app code and records
            # the counter's owner; every other method is restricted to
            # that owner (or, again, to trusted app code).
            create=allow_if(all=[is_app_internal]),
            get=allow_if(any=[_caller_is_owner, is_app_internal]),
            increment=allow_if(any=[_caller_is_owner, is_app_internal]),
            description=allow_if(any=[_caller_is_owner, is_app_internal]),
        )

    async def create(
        self,
        context: WriterContext,
        request: InitializeCounterRequest,
    ) -> None:
        """Initialize the counter with a description and record its
        owner."""
        self.state.description = request.description
        self.state.owner_id = request.owner_id

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
        self.state.value += (
            request.amount if request.amount is not None else 1
        )

    async def get(
        self,
        context: ReaderContext,
    ) -> Counter.GetResponse:
        """Get the current counter value."""
        return Counter.GetResponse(value=self.state.value)
