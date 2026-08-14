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


class CounterState(Model):
    count: int = Field(tag=1)


class CountResponse(Model):
    count: int = Field(tag=1)


class PeerRequest(Model):
    peer_id: str = Field(tag=1)


class PeersRequest(Model):
    peer_ids: list[str] = Field(tag=1)


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
            # A transaction that touches nothing at all. Because it
            # never writes, it never upgrades its participant lock
            # from shared to exclusive.
            noop=Transaction(
                request=None,
                response=None,
                mcp=None,
            ),
            # A transaction that writes its own state, and so does
            # upgrade its participant lock to exclusive.
            transactionally_increment=Transaction(
                request=None,
                response=CountResponse,
                mcp=None,
            ),
            increment=Writer(
                request=None,
                response=CountResponse,
                mcp=None,
            ),
            # Calls `inner` on `peer_id`, making that state a nested
            # participant of this transaction.
            outer=Transaction(
                request=PeerRequest,
                response=None,
                mcp=None,
            ),
            # Writes every state in `peer_ids`, each a distinct state
            # ref, from within one transaction.
            fanout=Transaction(
                request=PeersRequest,
                response=None,
                mcp=None,
            ),
            # A nested transaction that only reads.
            inner=Transaction(
                request=None,
                response=CountResponse,
                mcp=None,
            ),
            get=Reader(
                request=None,
                response=CountResponse,
                mcp=None,
            ),
        ),
    ),
)
