"""A second API file in the shop's package, whose `pick` declares the
error `shop.py` defines and declares."""
from reboot.api import API, Field, Methods, Model, Transaction, Type
from shop.v1.shop import OutOfStockError, StockRequest


class WarehouseState(Model):
    pallets: int = Field(tag=1)


WarehouseMethods = Methods(
    create=Transaction(request=None, response=None, factory=True, mcp=None),
    pick=Transaction(
        request=StockRequest,
        response=None,
        errors=[OutOfStockError],
        description="Take stock off a pallet.",
        mcp=None,
    ),
)

api = API(
    Warehouse=Type(
        state=WarehouseState,
        methods=WarehouseMethods,
        description="Where the shop's stock waits.",
    )
)
