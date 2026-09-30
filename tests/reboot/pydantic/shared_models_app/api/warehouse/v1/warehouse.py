from catalog.items import Item
from common.errors import NotFoundError
from common.money import Money
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
from store.v1.store import Receipt


class WarehouseState(Model):
    inventory: dict[str, Item] = Field(tag=1)
    receipts: list[Receipt] = Field(tag=2)


class RestockRequest(Model):
    store_id: str = Field(tag=1)
    name: str = Field(tag=2)


api = API(
    Warehouse=Type(
        state=WarehouseState,
        methods=Methods(
            create=Writer(
                request=None,
                response=None,
                factory=True,
                mcp=None,
            ),
            receive=Writer(
                request=Item,
                response=None,
                mcp=None,
            ),
            record=Writer(
                request=Receipt,
                response=None,
                mcp=None,
            ),
            restock=Transaction(
                mode=Exclusive(),
                request=RestockRequest,
                response=None,
                errors=[NotFoundError],
                mcp=None,
            ),
            value=Reader(
                request=None,
                response=Money,
                mcp=None,
            ),
        ),
    ),
)
