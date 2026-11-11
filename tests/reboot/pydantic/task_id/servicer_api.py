from reboot.api import (
    API,
    Field,
    Methods,
    Model,
    Reader,
    TaskId,
    Type,
    Workflow,
    Writer,
)
from typing import Optional


class State(Model):
    # The id of the `run` task that `start` scheduled.
    run_task_id: Optional[TaskId] = Field(tag=1, default=None)


class StartResponse(Model):
    task_id: Optional[TaskId] = Field(tag=1, default=None)


class RunResponse(Model):
    state_id: str = Field(tag=1, default="")


class RunTaskIdResponse(Model):
    task_id: Optional[TaskId] = Field(tag=1, default=None)


api = API(
    Report=Type(
        state=State,
        methods=Methods(
            start=Writer(
                request=None,
                response=StartResponse,
                factory=True,
                description="Schedules `run` and remembers its task id.",
                mcp=None,
            ),
            run=Workflow(
                request=None,
                response=RunResponse,
                description="Returns the id of the state it ran on.",
                mcp=None,
            ),
            run_task_id=Reader(
                request=None,
                response=RunTaskIdResponse,
                description="The id of the `run` task, if any.",
                mcp=None,
            ),
        ),
    ),
)
