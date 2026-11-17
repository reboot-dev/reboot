from reboot.aio.auth.authorizers import allow
from reboot.aio.contexts import ReaderContext, WorkflowContext, WriterContext
from tests.reboot.pydantic.task_id.servicer_api import (
    RunResponse,
    RunTaskIdResponse,
    StartResponse,
)
from tests.reboot.pydantic.task_id.servicer_api_rbt import Report


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

    async def run_task_id(self, context: ReaderContext) -> RunTaskIdResponse:
        return RunTaskIdResponse(task_id=self.state.run_task_id)
