from common.money import Money
from reboot.api import Field, Model
from typing import Optional


class Price(Model):
    amount: Money = Field(tag=1)
    discounts: list[Money] = Field(tag=2)
    tax: Optional[Money] = Field(tag=3, default=None)


class Item(Model):
    name: str = Field(tag=1)
    price: Price = Field(tag=2)
