import random
from benchmark.v1.benchmark_rbt import Benchmark
from reboot.aio.external import ExternalContext
from states import create_states

# Benchmark for single-state transaction performance: a transaction
# that writes only its own state. Compared to the plain writer
# benchmark this isolates the transaction-machinery overhead.


async def setup(context: ExternalContext) -> list[str]:
    return await create_states(context)


async def op(context: ExternalContext, state_ids: list[str]) -> None:
    await Benchmark.ref(random.choice(state_ids)).transfer(
        context,
        peer_ids=[],
    )
