from reboot.aio.auth.authorizers import allow
from reboot.aio.contexts import ReaderContext, WriterContext
from tests.reboot.pydantic_web.optional_fields.servicer_api import (
    GetStateResponse,
    SetMessageAndCounterRequest,
    State,
)
from tests.reboot.pydantic_web.optional_fields.servicer_api_rbt import Test


class TestServicer(Test.Servicer):

    def authorizer(self):
        return allow()

    async def set_message_and_counter(
        self,
        context: WriterContext,
        request: SetMessageAndCounterRequest,
    ) -> None:
        assert isinstance(self.state, State)
        self.state.message = request.message
        self.state.counter = request.counter

    async def get_state(
        self,
        context: ReaderContext,
    ) -> GetStateResponse:
        assert isinstance(self.state, State)
        return GetStateResponse(
            message=self.state.message,
            counter=self.state.counter,
        )
