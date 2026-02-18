from reboot.aio.auth.authorizers import allow
from reboot.aio.contexts import ReaderContext, WriterContext
from tests.reboot.pydantic.implicit_constructor_with_defaults.servicer_api import (
    GetStateResponse,
    State,
    UpdateStateRequest,
)
from tests.reboot.pydantic.implicit_constructor_with_defaults.servicer_api_rbt import (
    DefaultValuesTest,
)


class DefaultValuesTestServicer(DefaultValuesTest.Servicer):

    def authorizer(self):
        return allow()

    async def initialize_with_defaults(
        self,
        context: WriterContext,
    ) -> None:
        assert isinstance(self.state, State)
        assert self.state.text == ""
        assert self.state.number == 0
        assert self.state.flag is False
        assert self.state.status == "first"
        assert self.state.items == []
        assert self.state.mapping == {}
        assert self.state.optional_text is None
        assert self.state.variant is None

    async def update_state(
        self,
        context: WriterContext,
        request: UpdateStateRequest,
    ) -> None:
        assert isinstance(self.state, State)
        self.state.text = request.text
        self.state.number = request.number
        self.state.flag = request.flag
        self.state.status = request.status
        self.state.items = request.items
        self.state.mapping = request.mapping
        self.state.optional_text = request.optional_text
        self.state.variant = request.variant

    async def get_state(
        self,
        context: ReaderContext,
    ) -> GetStateResponse:
        assert isinstance(self.state, State)
        return GetStateResponse(
            text=self.state.text,
            number=self.state.number,
            flag=self.state.flag,
            status=self.state.status,
            items=self.state.items,
            mapping=self.state.mapping,
            optional_text=self.state.optional_text,
            variant=self.state.variant,
        )
