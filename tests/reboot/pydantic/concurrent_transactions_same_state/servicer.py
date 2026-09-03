import asyncio
from reboot.aio.auth.authorizers import allow
from reboot.aio.contexts import (
    ReaderContext,
    TransactionContext,
    WriterContext,
)
from tests.reboot.pydantic.concurrent_transactions_same_state.servicer_api import (
    CountResponse,
    DriverRequest,
    PeerRequest,
)
from tests.reboot.pydantic.concurrent_transactions_same_state.servicer_api_rbt import (
    Counter,
)

COUNTER_ID = "the-one-counter"


class Rendezvous:
    """A meeting point that only opens once callers with `expected`
    distinct names have arrived, so a caller can only get through if
    all of them are inside at the same time. Serialized callers
    deadlock instead."""

    def __init__(self) -> None:
        self.expected = 0
        self.arrived: set[str] = set()
        self.everyone_arrived = asyncio.Event()

    def reset(self, expected: int) -> None:
        self.expected = expected
        self.arrived = set()
        self.everyone_arrived.clear()

    async def arrive(self, name: str) -> None:
        # Names rather than a count, because a transaction that aborts
        # is retried from the top and so runs a method it already ran
        # again: Reboot promises that a transaction happens once, not
        # that the code in it is invoked once. A count of invocations
        # would climb past `expected`, and worse, could open the
        # meeting point on one caller counted twice standing in for
        # another that has not arrived at all.
        self.arrived.add(name)
        if len(self.arrived) >= self.expected:
            self.everyone_arrived.set()
        await self.everyone_arrived.wait()


# Shared by the servicers and the tests, which run in this process.
rendezvous = Rendezvous()

# Set by `parked_increment` once it is a participant on the state and
# holding its lock; awaited by a test that needs that to have happened
# before it does anything else.
parked_increment_is_participant = asyncio.Event()

# Awaited by `parked_increment` before it writes; set by a test that
# wants to choose when that write happens.
parked_increment_may_write = asyncio.Event()


class CounterServicer(Counter.Servicer):

    def authorizer(self):
        return allow()

    async def create(
        self,
        context: WriterContext,
    ) -> None:
        self.state.count = 0

    async def increment(
        self,
        context: WriterContext,
    ) -> CountResponse:
        self.state.count += 1
        return CountResponse(count=self.state.count)

    async def get(
        self,
        context: ReaderContext,
    ) -> CountResponse:
        return CountResponse(count=self.state.count)

    async def call_inner(
        self,
        context: TransactionContext,
        request: PeerRequest,
    ) -> None:
        # Every driver calls `inner` on the same peer, so the name of
        # the state `inner` runs on says nothing about which driver is
        # inside it; hand `inner` this driver's name instead.
        await Counter.ref(request.peer_id).inner(
            context,
            driver_id=context.state_id,
        )

    async def inner(
        self,
        context: TransactionContext,
        request: DriverRequest,
    ) -> CountResponse:
        await rendezvous.arrive(request.driver_id)
        return CountResponse(count=self.state.count)

    async def call_parked_increment(
        self,
        context: TransactionContext,
        request: PeerRequest,
    ) -> None:
        await Counter.ref(request.peer_id).parked_increment(context)

    async def parked_increment(
        self,
        context: TransactionContext,
    ) -> CountResponse:
        parked_increment_is_participant.set()
        await parked_increment_may_write.wait()
        return await self.ref().increment(context)

    async def call_touch(
        self,
        context: TransactionContext,
        request: PeerRequest,
    ) -> None:
        await Counter.ref(request.peer_id).touch(context)

    async def touch(
        self,
        context: TransactionContext,
    ) -> None:
        pass
