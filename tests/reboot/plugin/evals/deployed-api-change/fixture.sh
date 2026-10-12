#!/usr/bin/env bash
# A task tracker Reboot app, deployed to Reboot Cloud, with an API, a
# servicer and an entry point.
set -euo pipefail
mkdir -p api/tasks/v1 backend/src/servicers
printf 'dev run --application-name=tasks\ngenerate api/ --python=backend/api/\n' > .rbtrc
cat > api/tasks/v1/task.py <<'PY'
from reboot.api import API, Field, Methods, Model, Reader, Type, Writer


class TaskState(Model):
    title: str = Field(tag=1, default="", description="What needs doing.")
    priority: int = Field(tag=2, default=0, description="How urgent the task is, 0 (whenever) to 3 (today).")
    notes: str = Field(tag=3, default="", description="Free text the owner adds.")
    done: bool = Field(tag=4, default=False, description="Whether it is finished.")


class EditRequest(Model):
    title: str = Field(tag=1, default="", description="New title.")
    priority: int = Field(tag=2, default=0, description="New priority, 0 to 3.")
    notes: str = Field(tag=3, default="", description="New notes.")


api = API(
    Task=Type(
        state=TaskState,
        description="One task on someone's list.",
        methods=Methods(
            create=Writer(request=EditRequest, response=None, factory=True, description="Create the task.", mcp=None),
            edit=Writer(request=EditRequest, response=None, description="Change the task.", mcp=None),
            complete=Writer(request=None, response=None, description="Mark it done.", mcp=None),
            get=Reader(request=None, response=TaskState, description="Read the task.", mcp=None),
        ),
    ),
)
PY
cat > backend/src/servicers/task.py <<'PY'
from reboot.aio.contexts import ReaderContext, WriterContext
from tasks.v1.task_rbt import Task, TaskState


class TaskServicer(Task.Servicer):

    async def create(self, context: WriterContext, request: Task.EditRequest) -> None:
        self.state.title = request.title
        self.state.priority = request.priority
        self.state.notes = request.notes

    async def edit(self, context: WriterContext, request: Task.EditRequest) -> None:
        self.state.title = request.title
        self.state.priority = request.priority
        self.state.notes = request.notes

    async def complete(self, context: WriterContext) -> None:
        self.state.done = True

    async def get(self, context: ReaderContext) -> TaskState:
        return self.state
PY
cat > backend/src/main.py <<'PY'
import asyncio

from reboot.aio.applications import Application
from servicers.task import TaskServicer


async def main():
    await Application(servicers=[TaskServicer]).run()


if __name__ == "__main__":
    asyncio.run(main())
PY
git init -q -b main
git -c user.email=dev@example.com -c user.name=Dev add -A
git -c user.email=dev@example.com -c user.name=Dev commit -q -m "Task tracker, deployed"
