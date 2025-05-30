from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import timedelta
from google.protobuf.message import Message
from google.protobuf.timestamp_pb2 import Timestamp
from rbt.v1alpha1 import sidecar_pb2, tasks_pb2
from rebootdev.aio.types import StateRef, StateTypeName
from rebootdev.time import DateTimeWithTimeZone
from typing import Optional


# TODO(benh): make this an immutable dataclass.
class TaskEffect:
    """An effect which represents running an asynchronous task. If this
    effect is successfully persisted then the task will be dispatched.

    NOTE: this is a user-facing interface while sidecar_pb2.Task is
    (currently) only used internally.
    """

    def __init__(
        self,
        *,
        state_type: StateTypeName,
        state_ref: StateRef,
        method_name: str,
        request: Message,
        task_uuid: Optional[bytes] = None,
        schedule: Optional[DateTimeWithTimeZone] = None,
        iteration: int = 0,
    ):
        self.method_name = method_name
        self.request = request
        self.task_id = tasks_pb2.TaskId(
            state_type=state_type,
            state_ref=state_ref.to_str(),
            task_uuid=task_uuid or uuid.uuid4().bytes,
        )
        self.schedule = schedule
        self.iteration = iteration

    @classmethod
    def from_sidecar_task(
        cls, task: sidecar_pb2.Task, request_type: type[Message]
    ) -> TaskEffect:
        request = request_type()
        request.ParseFromString(task.request)
        return cls(
            state_type=StateTypeName(task.task_id.state_type),
            state_ref=StateRef(task.task_id.state_ref),
            method_name=task.method,
            request=request,
            task_uuid=task.task_id.task_uuid,
            schedule=DateTimeWithTimeZone.from_protobuf_timestamp(
                task.timestamp
            ) if task.HasField('timestamp') else None,
            iteration=task.iteration,
        )

    def to_sidecar_task(self) -> sidecar_pb2.Task:
        timestamp: Optional[Timestamp] = None

        if self.schedule is not None:
            timestamp = Timestamp()
            timestamp.FromDatetime(self.schedule)

        return sidecar_pb2.Task(
            task_id=self.task_id,
            method=self.method_name,
            status=sidecar_pb2.Task.Status.PENDING,
            request=self.request.SerializeToString(),
            timestamp=timestamp,
            iteration=self.iteration,
        )


@dataclass(kw_only=True, frozen=True)
class Loop:

    when: Optional[DateTimeWithTimeZone | timedelta] = None
