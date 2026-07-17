import uuid
from benchmark.v1.benchmark_rbt import Benchmark
from reboot.aio.external import ExternalContext

# Benchmark for construction performance, specifically creating a new
# durable state by calling an explicit factory method.


async def op(context: ExternalContext, data: None) -> None:
    state_id = str(uuid.uuid4())
    # Create idempotently so that a transparently retried call can
    # not fail with 'StateAlreadyConstructed'.
    await Benchmark.idempotently(alias=state_id).create(context, state_id)
