from reboot.aio.auth.authorizers import allow
from reboot.aio.contexts import (
    ReaderContext,
    TransactionContext,
    WriterContext,
)
from tests.reboot.pydantic.transaction_with_same_state_id.servicer_api import (
    GetDataResponse,
    GetSecondaryDataResponse,
    TransactionRequest,
    WriterRequest,
)
from tests.reboot.pydantic.transaction_with_same_state_id.servicer_api_rbt import (
    MainTest,
    SecondaryTest,
)

SHARED_STATE_ID = "shared-state-id"


class MainTestServicer(MainTest.Servicer):

    def authorizer(self):
        return allow()

    async def transaction(
        self,
        context: TransactionContext,
        request: TransactionRequest,
    ) -> None:
        self.state.data = request.main_test_data

        await SecondaryTest.ref(SHARED_STATE_ID).writer(
            context,
            data=request.secondary_test_data,
        )

    async def get_data(
        self,
        context: ReaderContext,
    ) -> GetDataResponse:
        main_test_data = self.state.data

        secondary_test_data = await SecondaryTest.ref(
            SHARED_STATE_ID,
        ).get_data(context)

        return GetDataResponse(
            main_test_data=main_test_data,
            secondary_test_data=secondary_test_data.data,
        )


class SecondaryTestServicer(SecondaryTest.Servicer):

    def authorizer(self):
        return allow()

    async def writer(
        self,
        context: WriterContext,
        request: WriterRequest,
    ) -> None:
        self.state.data = request.data

    async def get_data(
        self,
        context: ReaderContext,
    ) -> GetSecondaryDataResponse:
        return GetSecondaryDataResponse(data=self.state.data)
