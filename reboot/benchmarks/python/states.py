import asyncio
from benchmark.v1.benchmark_rbt import Benchmark
from reboot.aio.external import ExternalContext

# Number of states that benchmarks pick from at random.
STATES = 1024

# How many states to create concurrently during setup.
CREATE_CONCURRENCY = 128


async def create_states(context: ExternalContext) -> list[str]:
    """Creates the pool of `Benchmark` states that benchmarks operate
    on and returns their state ids."""
    state_ids = [f"benchmark-{i}" for i in range(STATES)]
    for begin in range(0, len(state_ids), CREATE_CONCURRENCY):
        chunk = state_ids[begin:begin + CREATE_CONCURRENCY]
        # Create idempotently so that a transparently retried call
        # can not fail with 'StateAlreadyConstructed'.
        await asyncio.gather(
            *(
                Benchmark.idempotently(alias=state_id).create(
                    context,
                    state_id,
                ) for state_id in chunk
            )
        )
    return state_ids
