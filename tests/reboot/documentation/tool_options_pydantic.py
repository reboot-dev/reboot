from reboot.api import API, Field, Methods, Model, Reader, Tool, Type


class CheckStockRequest(Model):
    item: str = Field(tag=1)


class StockResponse(Model):
    count: int = Field(tag=1)


class InventoryState(Model):
    stock: dict[str, int] = Field(tag=1, default_factory=dict)


InventoryMethods = Methods(
    check_stock=Reader(
        request=CheckStockRequest,
        response=StockResponse,
        description="Check stock for an item.",
        mcp=Tool(name="inventory_check", title="Check Inventory"),
    ),
)

api = API(
    Inventory=Type(
        state=InventoryState,
        methods=InventoryMethods,
    ),
)
