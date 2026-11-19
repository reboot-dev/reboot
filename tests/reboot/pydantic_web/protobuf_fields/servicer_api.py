from google.protobuf.timestamp_pb2 import Timestamp
from rbt.v1alpha1.tasks_pb2 import TaskId
from reboot.api import API, Field, Methods, Model, Reader, Type, Writer
from tests.reboot.pydantic_web.protobuf_fields.receipt_pb2 import Receipt
from typing import Optional


class State(Model):
    scheduled_task_id: Optional[TaskId] = Field(
        tag=1,
        default=None,
        description="The id of the `tick` task that `start` scheduled.",
    )
    recorded_task_id: Optional[TaskId] = Field(
        tag=2,
        default=None,
        description="The task id `record` was given.",
    )
    recorded_at: Optional[Timestamp] = Field(
        tag=3,
        default=None,
        description="The time `record` was given.",
    )
    receipts: list[Receipt] = Field(
        tag=4,
        default_factory=list,
        description="The receipts `record` was given, in order.",
    )


class StartResponse(Model):
    task_id: TaskId = Field(
        tag=1,
        description="The id of the scheduled `tick` task.",
    )


class RecordRequest(Model):
    task_id: TaskId = Field(
        tag=1,
        description="One of Reboot's own messages.",
    )
    at: Timestamp = Field(
        tag=2,
        description="A well-known type.",
    )
    receipt: Receipt = Field(
        tag=3,
        description="A message the application declares.",
    )


class GetStateResponse(Model):
    scheduled_task_id: Optional[TaskId] = Field(
        tag=1,
        default=None,
    )
    recorded_task_id: Optional[TaskId] = Field(
        tag=2,
        default=None,
    )
    recorded_at: Optional[Timestamp] = Field(
        tag=3,
        default=None,
    )
    receipts: list[Receipt] = Field(
        tag=4,
        default_factory=list,
    )


api = API(
    Test=Type(
        state=State,
        methods=Methods(
            start=Writer(
                request=None,
                response=StartResponse,
                factory=True,
                description="Schedules `tick` and returns its task id.",
                mcp=None,
            ),
            tick=Writer(
                request=None,
                response=None,
                description="The task that `start` schedules.",
                mcp=None,
            ),
            record=Writer(
                request=RecordRequest,
                response=None,
                description="Keeps one message of each kind.",
                mcp=None,
            ),
            get_state=Reader(
                request=None,
                response=GetStateResponse,
                description="Every message the state keeps.",
                mcp=None,
            ),
        ),
    ),
)
