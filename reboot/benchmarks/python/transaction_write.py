import random
from benchmark.v1.benchmark_rbt import Benchmark
from reboot.aio.external import ExternalContext
from states import create_states

# Benchmark for read-write transaction performance: a transaction
# that writes its own state plus one other random state (the
# bank-transfer shape).


async def setup(context: ExternalContext) -> list[str]:
    return await create_states(context)


async def op(context: ExternalContext, state_ids: list[str]) -> None:
    state_id, peer_id = random.sample(state_ids, 2)
    await Benchmark.ref(state_id).transfer(
        context,
        peer_ids=[peer_id],
    )
