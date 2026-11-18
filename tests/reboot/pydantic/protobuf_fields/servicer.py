from reboot.aio.auth.authorizers import allow
from reboot.aio.contexts import ReaderContext, WorkflowContext, WriterContext
from reboot.aio.types import StateRef
from tests.reboot.pydantic.protobuf_fields.servicer_api import (
    RememberRequest,
    RunResponse,
    StartResponse,
    TaskIdsResponse,
)
from tests.reboot.pydantic.protobuf_fields.servicer_api_rbt import Report


class ReportServicer(Report.Servicer):

    def authorizer(self):
        return allow()

    async def start(self, context: WriterContext) -> StartResponse:
        task_id = await self.ref().schedule().run(context)
        self.state.run_task_id = task_id
        return StartResponse(task_id=task_id)

    @classmethod
    async def run(cls, context: WorkflowContext) -> RunResponse:
        return RunResponse(state_id=context.state_id)

    async def remember(
        self,
        context: WriterContext,
        request: RememberRequest,
    ) -> None:
        assert request.task_id is not None
        self.state.remembered_task_ids.append(request.task_id)

    async def task_ids(self, context: ReaderContext) -> TaskIdsResponse:
        return TaskIdsResponse(
            run_task_id=self.state.run_task_id,
            remembered_task_ids=self.state.remembered_task_ids,
            remembered_task_ids_by_state_id={
                StateRef(task_id.state_ref).id: task_id
                for task_id in self.state.remembered_task_ids
            },
        )
