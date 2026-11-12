from rbt.v1alpha1.tasks_pb2 import TaskId
from reboot.api import (
    API,
    Field,
    Methods,
    Model,
    Reader,
    Type,
    Workflow,
    Writer,
)
from typing import Optional


class State(Model):
    run_task_id: Optional[TaskId] = Field(
        tag=1,
        default=None,
        description="The id of the `run` task that `start` scheduled.",
    )
    remembered_task_ids: list[TaskId] = Field(
        tag=2,
        default_factory=list,
        description="The ids `remember` was given, in order.",
    )


class StartResponse(Model):
    task_id: Optional[TaskId] = Field(
        tag=1,
        default=None,
        description="The id of the scheduled `run` task.",
    )


class RunResponse(Model):
    state_id: str = Field(
        tag=1,
        default="",
        description="The id of the state the task ran on.",
    )


class RememberRequest(Model):
    task_id: Optional[TaskId] = Field(
        tag=1,
        default=None,
        description="A task id to remember.",
    )


class TaskIdsResponse(Model):
    run_task_id: Optional[TaskId] = Field(
        tag=1,
        default=None,
        description="The id of the `run` task that `start` scheduled.",
    )
    remembered_task_ids: list[TaskId] = Field(
        tag=2,
        default_factory=list,
        description="The ids `remember` was given, in order.",
    )
    remembered_task_ids_by_state_id: dict[str, TaskId] = Field(
        tag=3,
        default_factory=dict,
        description="The remembered ids, by the id of the state they run on.",
    )


api = API(
    Report=Type(
        state=State,
        description="Keeps protobuf `TaskId`s in its state.",
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
            remember=Writer(
                request=RememberRequest,
                response=None,
                description="Remembers a task id.",
                mcp=None,
            ),
            task_ids=Reader(
                request=None,
                response=TaskIdsResponse,
                description="Every task id the state keeps.",
                mcp=None,
            ),
        ),
    ),
)
