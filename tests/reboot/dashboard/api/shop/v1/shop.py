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
from typing import Optional


class ShopState(Model):
    name: str = Field(tag=1)
    open: bool = Field(tag=2)


class StockRequest(Model):
    item: str = Field(tag=1)
    # A bound, so that what a value must satisfy beyond its type is
    # read too.
    quantity: int = Field(tag=2, ge=0)
    # A free-form map, which Pydantic titles after the field rather
    # than after any type: the page must not read that title as one.
    labels: dict[str, str] = Field(tag=3, default_factory=dict)


class Price(Model):
    """What one item costs."""
    currency: str = Field(tag=1)
    cents: int = Field(tag=2)


class Item(Model):
    """One thing the shop sells."""
    name: str = Field(tag=1)
    price: Optional[Price] = Field(tag=2, default=None)


class StockResponse(Model):
    remaining: int = Field(tag=1)
    items: list[Item] = Field(tag=2, default_factory=list)
    # Two dimensions, so that how deep a list goes is read from the
    # schema rather than assumed to be one.
    shelves: list[list[Item]] = Field(tag=3, default_factory=list)


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
