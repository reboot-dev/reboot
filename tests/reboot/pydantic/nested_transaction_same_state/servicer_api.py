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


class NestedTransactionResponse(Model):
    outers_write_seen_by_nested: str = Field(tag=1)


class OuterTransactionRequest(Model):
    call_nested_transaction: bool = Field(tag=1)
    call_writer: bool = Field(tag=2)


class OuterTransactionResponse(Model):
    outers_write_seen_by_nested: str = Field(tag=1)
    nesteds_write_seen_by_outer: str = Field(tag=2)
    writers_write_seen_by_outer: str = Field(tag=3)
    outers_write_seen_by_outer: str = Field(tag=4)


class GetResponse(Model):
    written_by_outer: str = Field(tag=1)
    written_by_nested: str = Field(tag=2)
    written_by_writer: str = Field(tag=3)


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
                request=None,
                response=NestedTransactionResponse,
                mcp=None,
            ),
            writer=Writer(request=None, response=None, mcp=None),
            get=Reader(request=None, response=GetResponse, mcp=None),
        ),
    ),
)
