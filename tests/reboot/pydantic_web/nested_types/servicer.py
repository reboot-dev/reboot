"""Servicer implementation for nested types test."""

from reboot.aio.auth.authorizers import allow
from reboot.aio.contexts import ReaderContext, WriterContext
from tests.reboot.pydantic_web.nested_types.base_models.models import Address
from tests.reboot.pydantic_web.nested_types.servicer_api import (
    UpdateInfoRequest,
)
from tests.reboot.pydantic_web.nested_types.servicer_api_rbt import Customer
from tests.reboot.pydantic_web.nested_types.shared.models import (
    GetStateResponse,
    InvalidPhoneError,
    State,
)


class CustomerServicer(Customer.Servicer):
    """Servicer that demonstrates nested types from shared modules."""

    def authorizer(self):
        return allow()

    async def initialize(
        self,
        context: WriterContext,
    ) -> None:
        assert isinstance(self.state, State)
        # Initialize with default address.
        self.state.name = "John Doe"
        self.state.address = Address(
            street="123 Main St",
            city="Anytown",
            zip_code="12345",
        )

    async def update_info(
        self,
        context: WriterContext,
        request: UpdateInfoRequest,
    ) -> None:
        assert isinstance(self.state, State)
        # Raise error if phone number starts with "invalid" to test
        # external error model handling.
        if request.phone.number.startswith("invalid"):
            raise Customer.UpdateInfoAborted(
                InvalidPhoneError(
                    message=f"Invalid phone number: {request.phone.number}"
                )
            )
        self.state.address = request.address
        self.state.phone = request.phone

    async def get_state(
        self,
        context: ReaderContext,
    ) -> GetStateResponse:
        assert isinstance(self.state, State)
        return GetStateResponse(
            name=self.state.name,
            address=self.state.address,
            phone=self.state.phone,
        )
