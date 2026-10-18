from common.money import Money
from reboot.api import Field, Model
from typing import Literal


class CardPayment(Model):
    kind: Literal['card'] = Field(tag=1)
    last_four: str = Field(tag=2)


class CashPayment(Model):
    kind: Literal['cash'] = Field(tag=1)
    tendered: Money = Field(tag=2)


Payment = CardPayment | CashPayment
