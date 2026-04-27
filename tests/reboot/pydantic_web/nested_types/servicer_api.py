"""API definition that uses models from different folders."""

from reboot.api import API, Field, Methods, Model, Reader, Type, Writer
from tests.reboot.pydantic_web.nested_types.base_models.models import Address
from tests.reboot.pydantic_web.nested_types.shared.models import (
    GetStateResponse,
    InvalidPhoneError,
    PhoneNumber,
    State,
)


class UpdateInfoRequest(Model):
    """Request to update the customer's info - defined locally."""

    address: Address = Field(tag=1)
    phone: PhoneNumber = Field(tag=2)


CustomerMethods = Methods(
    initialize=Writer(
        request=None,
        response=None,
        factory=True,
        mcp=None,
    ),
    update_info=Writer(
        request=UpdateInfoRequest,
        response=None,
        errors=[InvalidPhoneError],
        mcp=None,
    ),
    get_state=Reader(
        request=None,
        response=GetStateResponse,
        mcp=None,
    ),
)

api = API(Customer=Type(state=State, methods=CustomerMethods))
