from benchmark.v1.benchmark import CountResponse, PeersRequest
from benchmark.v1.benchmark_rbt import Benchmark
from reboot.aio.auth.authorizers import allow
from reboot.aio.contexts import (
    ReaderContext,
    TransactionContext,
    WriterContext,
)


class BenchmarkServicer(Benchmark.Servicer):

    def authorizer(self):
        return allow()

    async def create(
        self,
        context: WriterContext,
    ) -> None:
        self.state.count = 0
        self.state.payload = ""

    async def get(
        self,
        context: ReaderContext,
    ) -> CountResponse:
        return CountResponse(count=self.state.count)

    async def bump(
        self,
        context: WriterContext,
    ) -> CountResponse:
        self.state.count += 1
        return CountResponse(count=self.state.count)

    async def noop(
        self,
        context: TransactionContext,
    ) -> None:
        pass

    async def audit(
        self,
        context: TransactionContext,
        request: PeersRequest,
    ) -> CountResponse:
        response = await self.ref().get(context)
        count = response.count
        for peer_id in request.peer_ids:
            response = await Benchmark.ref(peer_id).get(context)
            count += response.count
        return CountResponse(count=count)

    async def transfer(
        self,
        context: TransactionContext,
        request: PeersRequest,
    ) -> None:
        await self.ref().bump(context)
        for peer_id in request.peer_ids:
            await Benchmark.ref(peer_id).bump(context)
