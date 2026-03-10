"""Shared models for cross-file import testing."""

from reboot.api import Field, Model
from tests.reboot.pydantic_web.nested_types.base_models.models import Address
from typing import Optional


class PhoneNumber(Model):
    """A shared phone number model."""

    country_code: str = Field(tag=1)
    number: str = Field(tag=2)


class ContactInfo(Model):
    """Contact information combining address and phone.

    This tests that a file without an API can import external Models.
    """

    address: Address = Field(tag=1)
    phone: Optional[PhoneNumber] = Field(default=None, tag=2)


class State(Model):
    """Customer state - defined externally to test external state import."""

    name: str = Field(tag=1)
    address: Address = Field(tag=2)
    phone: Optional[PhoneNumber] = Field(tag=3, default=None)


class GetStateResponse(Model):
    """Response - defined externally to test external response import."""

    name: str = Field(tag=1)
    address: Address = Field(tag=2)
    phone: Optional[PhoneNumber] = Field(tag=3, default=None)


class InvalidPhoneError(Model):
    """Error - defined externally to test external error import."""

    message: str = Field(tag=1)
