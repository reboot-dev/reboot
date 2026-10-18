from reboot.api import Field, Model
from typing import Literal


class Money(Model):
    cents: int = Field(tag=1)
    currency: Literal['USD', 'EUR'] = Field(tag=2)
