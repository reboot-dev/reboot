from reboot.aio.auth.authorizers import allow
from reboot.aio.contexts import (
    ReaderContext,
    TransactionContext,
    WriterContext,
)
from tests.reboot.pydantic.nested_transaction_same_state.servicer_api import (
    GetResponse,
    NestedTransactionResponse,
    OuterTransactionRequest,
    OuterTransactionResponse,
)
from tests.reboot.pydantic.nested_transaction_same_state.servicer_api_rbt import (
    Nested,
)

# What each of the three calls writes into the one field that is its
# own, so that every value in a response or in the committed state
# names whoever put it there.
OUTER_WROTE = "written by the outer transaction"
NESTED_WROTE = "written by the nested transaction"
WRITER_WROTE = "written by the writer"

# The default every field starts at. A field that still holds this
# once the transaction has committed lost the write meant for it.
NOT_WRITTEN = ""

# Read in place of a value by a call that was told to skip the step
# that would have produced it, so that a skipped step can not be
# mistaken for a lost write.
NOT_OBSERVED = "<step skipped>"


class NestedServicer(Nested.Servicer):

    def authorizer(self):
        return allow()

    async def outer_transaction(
        self,
        context: TransactionContext,
        request: OuterTransactionRequest,
    ) -> OuterTransactionResponse:
        # Write our own field before calling anybody, so that the
        # nested transaction has a write of ours to observe.
        self.state.written_by_outer = OUTER_WROTE

        outers_write_seen_by_nested = NOT_OBSERVED
        if request.call_nested_transaction:
            # A nested transaction on this very same state instance.
            nested = await self.ref().nested_transaction(context)
            outers_write_seen_by_nested = nested.outers_write_seen_by_nested

        nesteds_write_seen_by_outer = self.state.written_by_nested

        writers_write_seen_by_outer = NOT_OBSERVED
        if request.call_writer:
            await self.ref().writer(context)
            writers_write_seen_by_outer = self.state.written_by_writer

        return OuterTransactionResponse(
            outers_write_seen_by_nested=outers_write_seen_by_nested,
            nesteds_write_seen_by_outer=nesteds_write_seen_by_outer,
            writers_write_seen_by_outer=writers_write_seen_by_outer,
            outers_write_seen_by_outer=self.state.written_by_outer,
        )

    async def nested_transaction(
        self,
        context: TransactionContext,
    ) -> NestedTransactionResponse:
        outers_write_seen_by_nested = self.state.written_by_outer
        self.state.written_by_nested = NESTED_WROTE
        return NestedTransactionResponse(
            outers_write_seen_by_nested=outers_write_seen_by_nested,
        )

    async def writer(self, context: WriterContext) -> None:
        self.state.written_by_writer = WRITER_WROTE

    async def get(self, context: ReaderContext) -> GetResponse:
        return GetResponse(
            written_by_outer=self.state.written_by_outer,
            written_by_nested=self.state.written_by_nested,
            written_by_writer=self.state.written_by_writer,
        )
