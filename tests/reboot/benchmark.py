import asyncio
import json
import random
import statistics
import time
from reboot.aio.applications import Application
from reboot.aio.auth.authorizers import allow
from reboot.aio.contexts import (
    EffectValidation,
    ReaderContext,
    TransactionContext,
    WriterContext,
)
from reboot.aio.external import ExternalContext
from reboot.aio.tests import Reboot
from reboot.aio.types import StateId
from tests.reboot.general_rbt import General, GeneralRequest, GeneralResponse
from tests.reboot.general_servicer import GeneralServicer


# To test our boilerplate code generator, instead of inheriting from
# `general_rbt.General.Servicer` like a user normally would, we inherit from
# the boilerplate code generated into `general_servicer.GeneralServicer`. This
# is functionally insignificant, since the boilerplate `GeneralServicer` doesn't
# add any functionality to the `General.Servicer` but merely summarizes it in a
# separate file, but from a testing perspective it helps ensure that the
# boilerplate code passes type checks and is correct.
# We are covering transaction and constructor tests here.
class MyGeneralServicer(GeneralServicer):

    def authorizer(self):
        return allow()

    async def ConstructorWriter(
        self,
        context: WriterContext,
        state: General.State,
        request: GeneralRequest,
    ) -> GeneralResponse:
        return GeneralResponse()

    async def Reader(
        self,
        context: ReaderContext,
        state: General.State,
        request: GeneralRequest,
    ) -> GeneralResponse:
        return GeneralResponse()

    async def Writer(
        self,
        context: WriterContext,
        state: General.State,
        request: GeneralRequest,
    ) -> GeneralResponse:
        return GeneralResponse()

    async def Transaction(
        self,
        context: TransactionContext,
        state: General.State,
        request: GeneralRequest,
    ) -> GeneralResponse:
        general = General.ref(context.state_id)
        await general.Reader(context)
        await general.Writer(context)
        return GeneralResponse()


async def _run(
    rbt: Reboot,
    context: ExternalContext,
    state_ids: list[StateId],
    *,
    servers: int,
    method_name: str,
    concurrency: int,
) -> None:

    # Make `requests` requests from `concurrency` clients.
    requests_made = 0
    requests = 1000
    latencies = []

    async def client() -> None:
        nonlocal requests, requests_made
        while requests_made < requests:
            requests_made += 1

            state = General.ref(random.choice(state_ids))
            method = getattr(state, method_name)
            now = time.time_ns()
            await method(context)
            then = time.time_ns()
            latencies.append(then - now)

    now = time.time_ns()
    await asyncio.gather(*(client() for _ in range(concurrency)))
    then = time.time_ns()
    wall_time = then - now

    result = {
        "servers":
            servers,
        "method":
            method_name,
        "concurrent calls":
            concurrency,
        "requests per second":
            int(requests / float(wall_time / 1_000_000_000)),
        "median (ms/call)":
            statistics.median(latencies) / 1_000_000,
        "min (ms/call)":
            min(latencies) / 1_000_000,
        "max (ms/call)":
            max(latencies) / 1_000_000,
        "total time (ms)":
            sum(latencies) / 1_000_000,
        "wall time (ms)":
            int(wall_time / 1_000_000),
    }
    print(json.dumps(result, indent=2))


async def benchmark() -> None:
    rbt = Reboot()
    await rbt.start()

    for servers in [1, 2, 4, 8, 16, 32, 64]:
        await rbt.up(
            Application(servicers=[MyGeneralServicer]),
            effect_validation=EffectValidation.DISABLED,
            servers=servers,
        )

        context = rbt.create_external_context(name='run_servicer')
        state_ids = [str(state_id) for state_id in range(4096)]
        await asyncio.gather(
            *(
                General.ConstructorWriter(context, state_id)
                for state_id in state_ids
            )
        )

        for method_name in ['Reader', 'Writer', 'Transaction']:
            for concurrency in [64]:
                await _run(
                    rbt,
                    context,
                    state_ids,
                    servers=servers,
                    method_name=method_name,
                    concurrency=concurrency,
                )
        await rbt.down()

    await rbt.stop()


if __name__ == "__main__":
    asyncio.run(benchmark())
