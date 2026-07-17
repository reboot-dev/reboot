import random
from benchmark.v1.benchmark_rbt import Benchmark
from reboot.aio.external import ExternalContext
from states import create_states

# Benchmark for reader performance: calls a minimal reader on a
# random state from a pre-created pool.


async def setup(context: ExternalContext) -> list[str]:
    return await create_states(context)


async def op(context: ExternalContext, state_ids: list[str]) -> None:
    await Benchmark.ref(random.choice(state_ids)).get(context)
