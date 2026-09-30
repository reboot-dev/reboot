from common.money import Money
from reboot.api import Field, Model


class NotFoundError(Model):
    name: str = Field(tag=1)


class InsufficientFundsError(Model):
    shortfall: Money = Field(tag=1)
