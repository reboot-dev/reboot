from benchmark.v1.benchmark_rbt import Benchmark
from reboot.aio.external import ExternalContext

# Benchmark for the single-state write ceiling: all clients call a
# durable writer on ONE state, whose writes are serialized by design.

STATE_ID = "benchmark-hot"


async def setup(context: ExternalContext) -> str:
    # Create idempotently so that a transparently retried call can
    # not fail with 'StateAlreadyConstructed'.
    await Benchmark.idempotently(alias=STATE_ID).create(context, STATE_ID)
    return STATE_ID


async def op(context: ExternalContext, state_id: str) -> None:
    await Benchmark.ref(state_id).bump(context)
