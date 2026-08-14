import asyncio
from reboot.aio.auth.authorizers import allow
from reboot.aio.contexts import (
    ReaderContext,
    TransactionContext,
    WriterContext,
)
from tests.reboot.pydantic.concurrent_transactions_same_state.servicer_api import (
    CountResponse,
    PeerRequest,
    PeersRequest,
)
from tests.reboot.pydantic.concurrent_transactions_same_state.servicer_api_rbt import (
    Counter,
)

COUNTER_ID = "the-one-counter"


class Rendezvous:
    """A meeting point that only opens once `expected` callers have
    arrived, so a caller can only get through if all of them are
    inside at the same time. Serialized callers deadlock instead."""

    def __init__(self) -> None:
        self.expected = 0
        self.arrived = 0
        self.everyone_arrived = asyncio.Event()

    def reset(self, expected: int) -> None:
        self.expected = expected
        self.arrived = 0
        self.everyone_arrived.clear()

    async def arrive(self) -> None:
        self.arrived += 1
        if self.arrived >= self.expected:
            self.everyone_arrived.set()
        await self.everyone_arrived.wait()


# Shared by the servicer and the test, which both run in this process.
rendezvous = Rendezvous()


class CounterServicer(Counter.Servicer):

    def authorizer(self):
        return allow()

    async def create(
        self,
        context: WriterContext,
    ) -> None:
        self.state.count = 0

    async def noop(
        self,
        context: TransactionContext,
    ) -> None:
        pass

    async def transactionally_increment(
        self,
        context: TransactionContext,
    ) -> CountResponse:
        return await self.ref().increment(context)

    async def increment(
        self,
        context: WriterContext,
    ) -> CountResponse:
        self.state.count += 1
        return CountResponse(count=self.state.count)

    async def fanout(
        self,
        context: TransactionContext,
        request: PeersRequest,
    ) -> None:
        for peer_id in request.peer_ids:
            await Counter.ref(peer_id).increment(context)

    async def outer(
        self,
        context: TransactionContext,
        request: PeerRequest,
    ) -> None:
        await Counter.ref(request.peer_id).inner(context)

    async def inner(
        self,
        context: TransactionContext,
    ) -> CountResponse:
        await rendezvous.arrive()
        return CountResponse(count=self.state.count)

    async def get(
        self,
        context: ReaderContext,
    ) -> CountResponse:
        return CountResponse(count=self.state.count)
