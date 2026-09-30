from catalog.items import Item
from catalog.payments import Payment
from common.errors import InsufficientFundsError, NotFoundError
from common.money import Money
from reboot.api import API, Field, Methods, Model, Reader, Type, Writer
from typing import Optional


class StoreState(Model):
    revenue: Money = Field(tag=1)
    items: dict[str, Item] = Field(tag=2)
    featured: Optional[Item] = Field(tag=3, default=None)
    last_payment: Optional[Payment] = Field(
        tag=4,
        discriminator='kind',
        default=None,
    )


class FindRequest(Model):
    name: str = Field(tag=1)


class PurchaseRequest(Model):
    name: str = Field(tag=1)
    payment: Payment = Field(tag=2, discriminator='kind')


class Receipt(Model):
    item: Item = Field(tag=1)
    paid: Money = Field(tag=2)
    change: Optional[Money] = Field(tag=3, default=None)


api = API(
    Store=Type(
        state=StoreState,
        methods=Methods(
            create=Writer(
                request=None,
                response=None,
                factory=True,
                mcp=None,
            ),
            stock=Writer(
                request=Item,
                response=None,
                mcp=None,
            ),
            revenue=Reader(
                request=None,
                response=Money,
                mcp=None,
            ),
            find=Reader(
                request=FindRequest,
                response=Item,
                errors=[NotFoundError],
                mcp=None,
            ),
            purchase=Writer(
                request=PurchaseRequest,
                response=Receipt,
                errors=[NotFoundError, InsufficientFundsError],
                mcp=None,
            ),
        ),
    ),
)
