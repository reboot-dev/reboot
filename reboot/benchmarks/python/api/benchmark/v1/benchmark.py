from reboot.api import (
    API,
    Field,
    Methods,
    Model,
    Reader,
    Transaction,
    Type,
    Writer,
)


class BenchmarkState(Model):
    count: int = Field(tag=1)
    payload: str = Field(tag=2)


class CountResponse(Model):
    count: int = Field(tag=1)


class PeersRequest(Model):
    peer_ids: list[str] = Field(tag=1)


BenchmarkMethods = Methods(
    # Must use this method to create an instance of `Benchmark`.
    create=Writer(
        request=None,
        response=None,
        factory=True,
        mcp=None,
    ),
    # The minimal reader: returns a field from state.
    get=Reader(
        request=None,
        response=CountResponse,
        mcp=None,
    ),
    # The minimal durable writer: increments a counter.
    bump=Writer(
        request=None,
        response=CountResponse,
        mcp=None,
    ),
    # A transaction that does nothing at all; measures the pure
    # transaction-machinery overhead.
    noop=Transaction(
        request=None,
        response=None,
        mcp=None,
    ),
    # A read-only transaction: reads this state plus every state in
    # `peer_ids`.
    audit=Transaction(
        request=PeersRequest,
        response=CountResponse,
        mcp=None,
    ),
    # A read-write transaction: writes this state plus every state in
    # `peer_ids`. With an empty `peer_ids` this is a single-state
    # transaction.
    transfer=Transaction(
        request=PeersRequest,
        response=None,
        mcp=None,
    ),
)

api = API(
    Benchmark=Type(
        state=BenchmarkState,
        methods=BenchmarkMethods,
    ),
)
