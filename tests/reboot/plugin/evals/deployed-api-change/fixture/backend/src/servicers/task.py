from reboot.aio.contexts import ReaderContext, WriterContext
from tracker.v1.task_rbt import Task


class TaskServicer(Task.Servicer):

    async def create(
        self, context: WriterContext, request: Task.EditRequest
    ) -> None:
        self.state.title = request.title
        self.state.priority = request.priority
        self.state.notes = request.notes

    async def edit(
        self, context: WriterContext, request: Task.EditRequest
    ) -> None:
        self.state.title = request.title
        self.state.priority = request.priority
        self.state.notes = request.notes

    async def complete(self, context: WriterContext) -> None:
        self.state.done = True

    async def get(self, context: ReaderContext) -> Task.State:
        return self.state
