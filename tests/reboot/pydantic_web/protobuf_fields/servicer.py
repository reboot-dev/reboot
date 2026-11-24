from reboot.aio.auth.authorizers import allow
from reboot.aio.contexts import ReaderContext, WriterContext
from tests.reboot.pydantic_web.protobuf_fields.servicer_api import (
    GetStateResponse,
    RecordRequest,
    StartResponse,
)
from tests.reboot.pydantic_web.protobuf_fields.servicer_api_rbt import Test


class TestServicer(Test.Servicer):

    def authorizer(self):
        return allow()

    async def start(self, context: WriterContext) -> StartResponse:
        task_id = await self.ref().schedule().tick(context)
        self.state.scheduled_task_id = task_id
        return StartResponse(task_id=task_id)

    async def tick(self, context: WriterContext) -> None:
        pass

    async def record(
        self,
        context: WriterContext,
        request: RecordRequest,
    ) -> None:
        self.state.recorded_task_id = request.task_id
        self.state.recorded_at = request.at
        self.state.receipts.append(request.receipt)

    async def get_state(self, context: ReaderContext) -> GetStateResponse:
        return GetStateResponse(
            scheduled_task_id=self.state.scheduled_task_id,
            recorded_task_id=self.state.recorded_task_id,
            recorded_at=self.state.recorded_at,
            receipts=self.state.receipts,
        )
