"""Base models shared across multiple modules."""

from reboot.api import Field, Model


class Address(Model):
    """A physical address."""

    street: str = Field(tag=1)
    city: str = Field(tag=2)
    zip_code: str = Field(tag=3)
