from rbt.v1alpha1.errors_pb2 import FailedPrecondition
from reboot.aio.auth.authorizers import allow
from reboot.aio.contexts import WriterContext
from tests.reboot.pydantic_web.errors.servicer_api import (
    AnotherError,
    MyError,
    RaiseErrorRequest,
    State,
)
from tests.reboot.pydantic_web.errors.servicer_api_rbt import Test


class TestServicer(Test.Servicer):

    def authorizer(self):
        return allow()

    async def initialize(
        self,
        context: WriterContext,
    ) -> None:
        assert isinstance(self.state, State)
        self.state.initialized = True

    async def raise_error(
        self,
        context: WriterContext,
        request: RaiseErrorRequest,
    ) -> None:
        if request.error_to_trigger == "my_error":
            raise Test.RaiseErrorAborted(
                MyError(message="This is my error", code=42)
            )
        elif request.error_to_trigger == "another_error":
            raise Test.RaiseErrorAborted(
                AnotherError(reason="This is another error reason")
            )
        elif request.error_to_trigger == "failed_precondition":
            raise Test.RaiseErrorAborted(FailedPrecondition())
        # Do not raise anything for "none".
