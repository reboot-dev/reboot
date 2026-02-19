from reboot.aio.auth.authorizers import allow
from reboot.aio.contexts import ReaderContext, WriterContext
from tests.reboot.pydantic.discriminated_union.servicer_api import (
    NestedState,
    NestedTestRequest,
    NestedTestResponse,
    OptionA,
    State,
    TestRequest,
    TestResponse,
)
from tests.reboot.pydantic.discriminated_union.servicer_api_rbt import (
    DiscriminatedUnionTest,
    NestedDiscriminatedUnionTest,
)


class DiscriminatedUnionTestServicer(DiscriminatedUnionTest.Servicer):

    def authorizer(self):
        return DiscriminatedUnionTest.Authorizer(
            initialize=allow(),
            process_variant=allow(),
            get_current_variant=allow(),
        )

    async def initialize(
        self,
        context: WriterContext,
    ) -> None:
        assert isinstance(self.state, State)
        self.state.current_variant = OptionA(
            kind='A',
            value_a='initial',
        )

    async def process_variant(
        self,
        context: WriterContext,
        request: TestRequest,
    ) -> TestResponse:
        assert isinstance(self.state, State)
        assert isinstance(request, TestRequest)

        self.state.current_variant = request.discriminated_union

        return TestResponse(result=request.discriminated_union)

    async def get_current_variant(
        self,
        context: ReaderContext,
    ) -> TestResponse:
        assert isinstance(self.state, State)

        return TestResponse(result=self.state.current_variant)


class NestedDiscriminatedUnionTestServicer(
    NestedDiscriminatedUnionTest.Servicer
):

    def authorizer(self):
        return NestedDiscriminatedUnionTest.Authorizer(
            initialize=allow(),
            process_nested_variant=allow(),
            get_current_nested_variant=allow(),
        )

    async def initialize(
        self,
        context: WriterContext,
    ) -> None:
        assert isinstance(self.state, NestedState)
        self.state.current_variant = OptionA(
            kind='A',
            value_a='initial',
        )

    async def process_nested_variant(
        self,
        context: WriterContext,
        request: NestedTestRequest,
    ) -> NestedTestResponse:
        assert isinstance(self.state, NestedState)
        assert isinstance(request, NestedTestRequest)

        self.state.current_variant = request.discriminated_union

        return NestedTestResponse(result=request.discriminated_union)

    async def get_current_nested_variant(
        self,
        context: ReaderContext,
    ) -> NestedTestResponse:
        assert isinstance(self.state, NestedState)

        return NestedTestResponse(result=self.state.current_variant)
