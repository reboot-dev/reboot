from reboot.api import (
    API,
    Field,
    Methods,
    Model,
    Reader,
    Tool,
    Transaction,
    Type,
)


class ShopState(Model):
    name: str = Field(tag=1)
    open: bool = Field(tag=2)


class StockRequest(Model):
    item: str = Field(tag=1)
    quantity: int = Field(tag=2)


class StockResponse(Model):
    remaining: int = Field(tag=1)


class OutOfStockError(Model):
    item: str = Field(tag=1)


ShopMethods = Methods(
    create=Transaction(request=None, response=None, factory=True, mcp=None),
    stock=Transaction(
        request=StockRequest,
        response=None,
        description="Add stock of an item.",
        mcp=None,
    ),
    remaining=Reader(
        request=StockRequest,
        response=StockResponse,
        errors=[OutOfStockError],
        description="How much of an item is left.",
        mcp=Tool(),
    ),
)

api = API(
    Shop=Type(
        state=ShopState,
        methods=ShopMethods,
        description="A shop, and the stock it has to sell.",
    )
)
