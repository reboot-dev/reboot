from reboot.api import Field, Model


class OverdraftError(Model):
    amount: float = Field(tag=1)
