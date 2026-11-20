from __future__ import annotations

import asyncio
import uuid
from google.protobuf.message import Message
from google.protobuf.timestamp_pb2 import Timestamp
from rbt.v1alpha1 import database_pb2, errors_pb2, tasks_pb2, tasks_pb2_grpc
from reboot.aio.aborted import Aborted, SystemAborted
from reboot.aio.caller_id import CallerID
from reboot.aio.headers import Headers
from reboot.aio.internals.channel_manager import _ChannelManager
from reboot.aio.types import ApplicationId, StateRef, StateTypeName
from reboot.time import DateTimeWithTimeZone
from typing import Any, Generator, Optional


class TaskCancellation:
    """The runtime-side cancellation state of a dispatched task, shared
    between the `TasksDispatcher` (which learns about cancellation
    requests) and the `WorkflowContext` running the task (which
    delivers them).

    A cancellation goes through two states:

    1. _Requested_: a caller asked for the task to be cancelled. This
       is recorded durably in the task's record (see
       `TaskEffect.cancel_requested`) before `request()` is called, so
       that a request made before a crash is still known once the task
       is recovered.

    2. _Delivered_: the workflow raised `asyncio.CancelledError` at a
       suspension point or after a step. Where that happened is
       recorded by the primitive that delivered it (a memoized block
       marks itself cancelled; a control loop records the iteration),
       so that a replay raises at the very same place. Delivery is
       tracked per run on the `WorkflowContext`, not here, because a
       retried run starts over and replays its way back to the
       recorded place.

    A cancellation requested for a workflow that is implemented in
    Node.js is not delivered this way, but with a plain
    `asyncio.Task.cancel()` as before (see `TasksDispatcher.cancel_task`);
    `deliverable` is false for it.
    """

    def __init__(self, *, requested: bool):
        self._requested = asyncio.Event()
        self._deliverable = True
        if requested:
            self._requested.set()

        # Set by `TasksDispatcher.stop()` right before it cancels the
        # `asyncio.Task` running this task, so that the workflow can
        # tell a shutdown apart from a requested cancellation: a
        # shutdown is not durable and the task will be re-dispatched,
        # so no cleanup must run (and no step must have effects) in
        # response to it.
        self.shutting_down = False

    @property
    def requested(self) -> bool:
        return self._requested.is_set()

    @property
    def deliverable(self) -> bool:
        """Whether the runtime delivers this cancellation at suspension
        points and after steps (as opposed to it having been delivered
        with a plain `asyncio.Task.cancel()`)."""
        return self._deliverable

    def request(self, *, deliver: bool = True) -> None:
        """Marks the cancellation as requested, waking up any suspension
        point the workflow is waiting in."""
        self._deliverable = deliver
        self._requested.set()

    async def wait(self) -> None:
        """Waits until cancellation has been requested."""
        await self._requested.wait()


# TODO(benh): make this an immutable dataclass. This is currently
# tricky because `iteration` is mutated on an instance.
class TaskEffect:
    """An effect which represents running an asynchronous task. If this
    effect is successfully persisted then the task will be dispatched.

    NOTE: this is a user-facing interface while database_pb2.Task is
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
        cancel_requested: bool = False,
        cancelled_at_iteration: Optional[int] = None,
    ):
        self.state_id = state_ref.id
        self.method_name = method_name
        self.request = request
        self.task_id = tasks_pb2.TaskId(
            state_type=state_type,
            state_ref=state_ref.to_str(),
            task_uuid=task_uuid or uuid.uuid4().bytes,
        )
        self.schedule = schedule
        self.iteration = iteration

        # Durable cancellation state; see `database_pb2.Task`.
        self.cancel_requested = cancel_requested
        self.cancelled_at_iteration = cancelled_at_iteration

        # Set by the state manager once the task's completion has been
        # stored, so that a cancellation request that races with the
        # completion does not store the task as pending again.
        self.completed = False

        self._cancellation: Optional[TaskCancellation] = None

    @property
    def cancellation(self) -> TaskCancellation:
        """The runtime-side cancellation state of this task, created on
        first use (so that it is created within the event loop that
        dispatches the task)."""
        if self._cancellation is None:
            self._cancellation = TaskCancellation(
                requested=self.cancel_requested,
            )
        return self._cancellation

    @classmethod
    def from_sidecar_task(
        cls, task: database_pb2.Task, request_type: type[Message]
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
            cancel_requested=task.cancel_requested,
            cancelled_at_iteration=(
                task.cancelled_at_iteration
                if task.HasField('cancelled_at_iteration') else None
            ),
        )

    def to_sidecar_task(self) -> database_pb2.Task:
        timestamp: Optional[Timestamp] = None

        if self.schedule is not None:
            timestamp = Timestamp()
            timestamp.FromDatetime(self.schedule)

        return database_pb2.Task(
            task_id=self.task_id,
            method=self.method_name,
            status=database_pb2.Task.Status.PENDING,
            request=self.request.SerializeToString(),
            timestamp=timestamp,
            iteration=self.iteration,
            cancel_requested=self.cancel_requested,
            cancelled_at_iteration=self.cancelled_at_iteration,
        )


class TaskHandle:
    """Base class of the generated `<Method>Task` classes: a handle on a
    scheduled or spawned task that can be awaited (the generated
    subclass implements `__await__`, as it knows the response type)
    and cancelled.
    """

    def __init__(
        self,
        context: Any,
        *,
        task_id: tasks_pb2.TaskId,
    ) -> None:
        # Imported here to avoid a circular import: the contexts need
        # the tasks.
        from reboot.aio.contexts import Context
        from reboot.aio.external import ExternalContext

        assert isinstance(context, (Context, ExternalContext)), type(context)

        # Depending on the context type (inside or outside a Reboot
        # application) we may or may not know the application ID. If we
        # don't know it, then the `ExternalContext.gateway` will
        # determine it.
        #
        # TODO: in the future we expect to support cross-application
        #       calls, in which case the developer may explicitly pass
        #       in an application ID here.
        self._application_id: Optional[ApplicationId] = None
        self._channel_manager: _ChannelManager = context.channel_manager
        self._task_id = task_id

        # Who is asking matters for `cancel()`: a call from within the
        # application may cancel as is, while one from outside needs
        # admin credentials (see `TasksServicer.CancelTask`), so keep
        # the caller ID and bearer token to make that call with.
        self._caller_id: Optional[CallerID] = None
        self._bearer_token: Optional[str] = None

        if isinstance(context, Context):
            self._application_id = context.application_id
            self._caller_id = CallerID(application_id=context.application_id)
        else:
            self._caller_id = context.caller_id
            self._bearer_token = context.bearer_token

    @property
    def task_id(self) -> tasks_pb2.TaskId:
        return self._task_id

    def __await__(self) -> Generator[None, None, Any]:
        raise NotImplementedError

    async def cancel(self) -> None:
        """Asks for the task to be cancelled and waits for it to finish,
        however it finishes.

        The workflow running the task sees an `asyncio.CancelledError`
        at its next suspension point (`until`, `sleep`, or the start
        of a control loop iteration), or right after the step
        (`at_least_once`, `at_most_once`, inline write) that is in
        flight once that step has completed. It may clean up in an
        `except asyncio.CancelledError` block using those same
        primitives; where the cancellation landed is recorded so that
        a retry of the workflow lands it in the same place.

        Returns once the task has finished: because it re-raised the
        `CancelledError`, because it caught it and returned a value
        (which `await`ing this handle yields), or because it raised a
        declared error, which is raised here as it would be when
        `await`ing this handle. A task that had already finished is
        left as is.
        """
        await self._request_cancellation()

        try:
            await self
        except Aborted as aborted:
            if isinstance(aborted.error, errors_pb2.Cancelled):
                return
            raise

    async def _request_cancellation(self) -> None:
        # Imported here to avoid a circular import: the stubs need the
        # contexts, which need the tasks.
        from reboot.aio.stubs import UnaryRetriedCall

        state_type = StateTypeName(self._task_id.state_type)
        state_ref = StateRef(self._task_id.state_ref)

        channel = self._channel_manager.get_channel_to_state(
            state_type,
            state_ref,
        )

        stub = tasks_pb2_grpc.TasksStub(channel)

        call = UnaryRetriedCall(
            call=None,  # `RetriedCall` can create the call itself.
            stub_method=stub.CancelTask,
            method_name="CancelTask",
            request=tasks_pb2.CancelTaskRequest(task_id=self._task_id),
            metadata=Headers(
                state_ref=state_ref,
                application_id=self._application_id,
                caller_id=self._caller_id,
                bearer_token=self._bearer_token,
            ).to_grpc_metadata(),
            aborted_type=SystemAborted,
        )

        # `NOT_FOUND` means the task is not running (any more): either
        # it has already finished, in which case there is nothing to
        # cancel and `await`ing the handle returns its outcome, or it
        # never existed, which `await`ing the handle reports as an
        # `UnknownTask`. `CANCELLING` means it had already been
        # requested. Neither is an error here.
        await call
