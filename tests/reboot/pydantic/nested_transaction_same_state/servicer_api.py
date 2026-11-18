from reboot.api import (
    API,
    Exclusive,
    Field,
    Methods,
    Model,
    Reader,
    Transaction,
    Type,
    Writer,
)


class NestedState(Model):
    # One field per call that writes, so that a lost write shows up as
    # the field belonging to the call whose write went missing, rather
    # than as a number whose meaning the reader has to reconstruct.
    written_by_outer: str = Field(tag=1, default="")
    written_by_nested: str = Field(tag=2, default="")
    written_by_writer: str = Field(tag=3, default="")
    written_by_writer_in_nested: str = Field(tag=4, default="")


class NestedTransactionRequest(Model):
    call_writer_and_reader: bool = Field(tag=1)
    abort: bool = Field(tag=2)


class RequestedAbortError(Model):
    pass


class NestedTransactionResponse(Model):
    outers_write_seen_by_nested: str = Field(tag=1)
    nesteds_write_seen_by_writer_in_nested: str = Field(tag=2)
    writer_in_nesteds_write_seen_by_nested: str = Field(tag=3)
    nesteds_write_seen_by_reader_in_nested: str = Field(tag=4)
    writer_in_nesteds_write_seen_by_reader_in_nested: str = Field(tag=5)


class WriterInNestedResponse(Model):
    nesteds_write_seen_by_writer_in_nested: str = Field(tag=1)


class OuterTransactionRequest(Model):
    call_nested_transaction: bool = Field(tag=1)
    call_writer: bool = Field(tag=2)
    nested_calls_writer_and_reader: bool = Field(tag=3)
    nested_aborts: bool = Field(tag=4)


class OuterTransactionResponse(Model):
    outers_write_seen_by_nested: str = Field(tag=1)
    nesteds_write_seen_by_outer: str = Field(tag=2)
    writers_write_seen_by_outer: str = Field(tag=3)
    outers_write_seen_by_outer: str = Field(tag=4)
    nesteds_write_seen_by_writer_in_nested: str = Field(tag=5)
    writer_in_nesteds_write_seen_by_nested: str = Field(tag=6)
    nesteds_write_seen_by_reader_in_nested: str = Field(tag=7)
    writer_in_nesteds_write_seen_by_reader_in_nested: str = Field(tag=8)
    writer_in_nesteds_write_seen_by_outer: str = Field(tag=9)


class GetResponse(Model):
    written_by_outer: str = Field(tag=1)
    written_by_nested: str = Field(tag=2)
    written_by_writer: str = Field(tag=3)
    written_by_writer_in_nested: str = Field(tag=4)


api = API(
    Nested=Type(
        state=NestedState,
        methods=Methods(
            outer_transaction=Transaction(
                mode=Exclusive(),
                request=OuterTransactionRequest,
                response=OuterTransactionResponse,
                mcp=None,
            ),
            nested_transaction=Transaction(
                mode=Exclusive(),
                request=NestedTransactionRequest,
                response=NestedTransactionResponse,
                errors=[RequestedAbortError],
                mcp=None,
            ),
            writer=Writer(request=None, response=None, mcp=None),
            writer_in_nested=Writer(
                request=None,
                response=WriterInNestedResponse,
                mcp=None,
            ),
            get=Reader(request=None, response=GetResponse, mcp=None),
        ),
    ),
)
