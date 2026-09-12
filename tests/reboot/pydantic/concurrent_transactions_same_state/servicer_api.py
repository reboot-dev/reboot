from reboot.api import (
    API,
    Exclusive,
    Field,
    Methods,
    Model,
    Reader,
    Shared,
    Transaction,
    Type,
    Writer,
)


class CounterState(Model):
    count: int = Field(tag=1)


class CountResponse(Model):
    count: int = Field(tag=1)


class PeerRequest(Model):
    peer_id: str = Field(tag=1)


class DriverRequest(Model):
    driver_id: str = Field(tag=1)


api = API(
    Counter=Type(
        state=CounterState,
        methods=Methods(
            # Must use this method to create an instance of `Counter`.
            create=Writer(
                request=None,
                response=None,
                factory=True,
                mcp=None,
            ),
            increment=Writer(
                request=None,
                response=CountResponse,
                mcp=None,
            ),
            get=Reader(
                request=None,
                response=CountResponse,
                mcp=None,
            ),
            # The rest are pairs of a root transaction and the nested
            # transaction it calls on `peer_id`. A nested call carries
            # no idempotency key, and the nested transaction is declared
            # shared, so it takes its state's lock in shared mode, which
            # is what lets several of them run on one state at the same
            # time.
            call_inner=Transaction(
                mode=Exclusive(),
                request=PeerRequest,
                response=None,
                mcp=None,
            ),
            # Takes the name of the driver that called it, because it runs
            # on the peer's state rather than the driver's and so cannot
            # work that out from its own context.
            inner=Transaction(
                mode=Shared(),
                request=DriverRequest,
                response=CountResponse,
                mcp=None,
            ),
            call_parked_increment=Transaction(
                mode=Exclusive(),
                request=PeerRequest,
                response=None,
                mcp=None,
            ),
            # Waits to be released, then increments through a writer.
            parked_increment=Transaction(
                mode=Shared(),
                request=None,
                response=CountResponse,
                mcp=None,
            ),
            call_touch=Transaction(
                mode=Exclusive(),
                request=PeerRequest,
                response=None,
                mcp=None,
            ),
            # Becomes a participant on the state and completes
            # without writing anything.
            touch=Transaction(
                mode=Shared(),
                request=None,
                response=None,
                mcp=None,
            ),
        ),
    ),
)
