from __future__ import annotations

from rbt.v1alpha1 import errors_pb2, tasks_pb2, tasks_pb2_grpc
from reboot.aio.aborted import Aborted, SystemAborted
from reboot.aio.caller_id import CallerID
from reboot.aio.contexts import (
    Context,
    ReaderContext,
    TransactionContext,
    WorkflowContext,
    WriterContext,
)
from reboot.aio.external import ExternalContext
from reboot.aio.headers import Headers
from reboot.aio.internals.channel_manager import _ChannelManager
from reboot.aio.stubs import UnaryRetriedCall
from reboot.aio.types import ApplicationId, StateRef, StateTypeName
from typing import Any, Generator, Optional


async def request_task_cancellation(
    channel_manager: _ChannelManager,
    task_id: tasks_pb2.TaskId,
    *,
    application_id: Optional[ApplicationId],
    caller_id: Optional[CallerID] = None,
    bearer_token: Optional[str] = None,
) -> tasks_pb2.CancelTaskResponse:
    """Asks the server running the task to cancel it, retrying while
    that server is unavailable.

    A call from within the application carries its `caller_id` and is
    allowed as is; a call from outside carries the admin bearer token
    (see `TasksServicer.CancelTask`).

    The response says whether the task was running and is now being
    cancelled (`OK`), was already being cancelled (`CANCELLING`), or is
    not running, because it has finished or never existed
    (`NOT_FOUND`).
    """
    state_type = StateTypeName(task_id.state_type)
    state_ref = StateRef(task_id.state_ref)

    stub = tasks_pb2_grpc.TasksStub(
        channel_manager.get_channel_to_state(state_type, state_ref)
    )

    call: UnaryRetriedCall[tasks_pb2.CancelTaskResponse] = UnaryRetriedCall(
        call=None,  # `UnaryRetriedCall` can create the call itself.
        stub_method=stub.CancelTask,
        method_name="CancelTask",
        request=tasks_pb2.CancelTaskRequest(task_id=task_id),
        metadata=Headers(
            state_ref=state_ref,
            application_id=application_id,
            caller_id=caller_id,
            bearer_token=bearer_token,
        ).to_grpc_metadata(),
        aborted_type=SystemAborted,
    )

    return await call


class TaskHandle:
    """Base class of the generated `<Method>Task` classes: a handle on a
    task that can be awaited for the task's response (the generated
    subclass implements `__await__`, as it knows the response type) and
    cancelled with `cancel()`.
    """

    def __init__(
        self,
        context: Context | ExternalContext,
        *,
        task_id: tasks_pb2.TaskId,
    ) -> None:
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
        if isinstance(context, Context):
            self._application_id = context.application_id
        self._context = context
        self._channel_manager = context.channel_manager
        self._task_id = task_id

    def __await__(self) -> Generator[Any, None, Any]:
        raise NotImplementedError

    async def cancel(self) -> None:
        """Cancels the task, in a way that depends on the context this
        handle was created with.

        From a `writer` or `transaction`, cancelling the task is an
        effect, like scheduling one: it is requested only once the
        method's effects have been committed, so a method that aborts
        after calling this cancels nothing, and a method re-run to
        validate its effects cancels the task only once. This returns
        right away; the task is cancelled shortly after the commit.

        From a `workflow`, or from outside the application with an
        `ExternalContext`, the cancellation is requested right away,
        and this returns once the task has finished, however it has
        finished: because it was cancelled, because it caught the
        cancellation and returned a response (which `await`ing this
        handle then yields), or because it aborted with a declared
        error, which is raised here as it would be when `await`ing
        this handle. A task that had already finished is left as is;
        a task that never existed raises `UnknownTask`.

        A `reader` can not cancel a task, as it can not have effects.
        """
        if isinstance(self._context, (WriterContext, TransactionContext)):
            self._context._task_ids_to_cancel.append(self._task_id)
            return

        if isinstance(self._context, ReaderContext):
            raise RuntimeError(
                "Can not cancel a task from a 'reader', which can not have "
                "effects; cancel it from a 'writer', 'transaction', or "
                "'workflow' instead"
            )

        caller_id: Optional[CallerID] = None
        bearer_token: Optional[str] = None

        if isinstance(self._context, WorkflowContext):
            caller_id = CallerID(application_id=self._context.application_id)
        else:
            # Every other kind of `Context` was handled above, so this
            # handle was created outside the application.
            assert isinstance(self._context, ExternalContext), \
                type(self._context)
            caller_id = self._context.caller_id
            bearer_token = self._context.bearer_token

        await request_task_cancellation(
            self._channel_manager,
            self._task_id,
            application_id=self._application_id,
            caller_id=caller_id,
            bearer_token=bearer_token,
        )

        try:
            await self
        except Aborted as aborted:
            if isinstance(aborted.error, errors_pb2.Cancelled):
                return
            raise
