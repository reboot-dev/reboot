import asyncio
import log.log  # type: ignore[import]
import logging
from datetime import timedelta
from functools import partial
from google.protobuf import any_pb2
from google.protobuf.message import Message
from google.protobuf.timestamp_pb2 import Timestamp
from google.rpc import code_pb2, status_pb2
from rbt.v1alpha1 import errors_pb2, tasks_pb2
from reboot.aio import tracing
from reboot.aio.aborted import SystemAborted
from reboot.aio.backoff import Backoff
from reboot.aio.internals.contextvars import use_application_id
from reboot.aio.internals.tasks_cache import TasksCache
from reboot.aio.tasks import TaskEffect
from reboot.aio.types import ApplicationId
from reboot.run_environments import in_nodejs, is_in_test
from reboot.time import DateTimeWithTimeZone
from typing import Awaitable, Callable, Optional, Protocol, Tuple, TypeVar
from uuid import UUID

logger = log.log.get_logger(__name__)
# Set logging to `WARNING` because we have warnings in this module
# that we expect users to want to see.
logger.setLevel(logging.WARNING)

# Limit on the total number of tasks that can be dispatched to avoid a
# denial of service attack.
#
# TODO(benh): make this configurable per service and/or actor
DISPATCHED_TASKS_LIMIT = 1024

_TASK_INITIAL_BACKOFF_SECONDS = 1

# How long `stop()` waits for the tasks it cancelled to finish before
# warning about those that have not.
STOP_WAIT_SECONDS = 1

TaskResponseOrStatus = Tuple[Optional[Message], Optional[status_pb2.Status]]

OnLoopIterationCallable = Callable[[int, Optional[DateTimeWithTimeZone]], None]


class DispatchCallable(Protocol):
    """Helper class for capturing the type of our dispatch
    callable. Necessary because of our keyword arguments which can not
    be captured with just Callable.
    """

    def __call__(
        self,
        task: TaskEffect,
        *,
        only_validate: bool = False,
        on_loop_iteration: OnLoopIterationCallable = (
            lambda iteration, next_iteration_schedule: None
        ),
    ) -> Awaitable[TaskResponseOrStatus]:
        pass


CompleteTaskCallable = Callable[[TaskEffect, TaskResponseOrStatus],
                                Awaitable[None]]

# Records that a task's cancellation has been requested (durably,
# before the task is told, see `TaskCancellation`).
CancelTaskCallable = Callable[[TaskEffect], Awaitable[None]]

T = TypeVar('T')


def _cancelled_status(task: TaskEffect) -> status_pb2.Status:
    return SystemAborted(
        errors_pb2.Cancelled(),
        message=f"the task running '{task.method_name}' was cancelled",
    ).to_status()


async def _wait_unless_cancellation_requested(
    awaitable: Awaitable[T],
    task: TaskEffect,
) -> bool:
    """Awaits `awaitable` unless (or until) cancellation of `task` is
    requested, in which case the `awaitable` is cancelled. Returns
    whether cancellation was requested (and the wait cut short)."""
    cancellation = task.cancellation

    if cancellation.requested:
        return True

    awaitable_future = asyncio.ensure_future(awaitable)
    requested_task = asyncio.create_task(
        cancellation.wait(),
        name=f'cancellation.wait() in {__name__}',
    )

    try:
        done, _ = await asyncio.wait(
            [awaitable_future, requested_task],
            return_when=asyncio.FIRST_COMPLETED,
        )
    except asyncio.CancelledError:
        awaitable_future.cancel()
        raise
    finally:
        requested_task.cancel()

    if awaitable_future in done:
        # Propagate any exception.
        await awaitable_future
        return False

    awaitable_future.cancel()
    # Let the cancellation of the awaitable run its course (without
    # raising its `CancelledError` here).
    await asyncio.wait([awaitable_future])
    return True


class TasksDispatcher:
    """Encapsulates dispatching and retrying tasks as well as informing
    the TasksCache about said tasks and their status.
    """

    # The task that keeps waiting for the tasks `stop()` cancelled,
    # held so that it is not garbage collected before it is done.
    _keep_waiting_for_cancelled_tasks_task: Optional[asyncio.Task]

    def __init__(
        self,
        *,
        application_id: ApplicationId,
        dispatch: DispatchCallable,
        tasks_cache: TasksCache,
        ready: asyncio.Event,
        complete_task: CompleteTaskCallable,
        cancel_task: CancelTaskCallable,
    ):
        self._application_id = application_id
        self._dispatch = dispatch
        self._tasks_cache = tasks_cache
        self._ready = ready
        self._complete_task = complete_task
        self._cancel_task = cancel_task

        # Signal that stop has been requested.
        self._stop_requested = asyncio.Event()

        # We need to hold a reference to each asyncio.Task we create
        # for running our tasks otherwise the Python interpreter might
        # try and garbage collect them even if they haven't finished.
        # We also keep the `TaskEffect`, which carries the task's
        # cancellation state (see `TaskCancellation`).
        self._dispatched_tasks: dict[bytes, Tuple[asyncio.Task,
                                                  TaskEffect]] = {}

        self._keep_waiting_for_cancelled_tasks_task = None

    async def validate(self, tasks: list[TaskEffect]) -> None:
        """Validate that the specified tasks can be dispatched.

        There is an invariant that no other tasks will get validated
        until after 'tasks' are either stored and dispatched or an
        error is raised, otherwise we can't ensure that we'll stay
        below the limit.

        For this reason we don't validate when we're dispatching
        because we _must_ dispatch tasks that have been stored.

        It also means our limit is really more of a "soft" limit in
        that future validations will fail, but we may go above the
        limit for some time until enough tasks complete.
        """
        # Ensure that we aren't exceeding the tasks limit (to avoid a
        # possible denial of service exploit).
        if len(self._dispatched_tasks) + len(tasks) > DISPATCHED_TASKS_LIMIT:
            raise RuntimeError('Too many tasks')

        # Now call dispatch for each task but to only validate.
        await asyncio.gather(
            *[self._dispatch(task, only_validate=True) for task in tasks]
        )

    def transaction_prepare_dispatch(self, tasks: list[TaskEffect]) -> None:
        """Marks the task as prepared in a transaction and pending dispatch if
        the transaction commits."""
        for task in tasks:
            self._tasks_cache.transaction_prepared_task(task.task_id)

    def transaction_abort_dispatch(self, tasks: list[TaskEffect]) -> None:
        """Marks the task as aborted in a transaction and thus no pending
        dispatch should be expected."""
        for task in tasks:
            self._tasks_cache.transaction_aborted_task(task.task_id)

    def dispatch(self, tasks: list[TaskEffect]) -> None:
        """Creates an async dispatch and retry loop for each of the specified
        tasks."""

        # If stop has been requested we should not dispatch any new tasks.
        if self._stop_requested.is_set():
            # Return, don't raise, since this method can be called from
            # contexts where it isn't safe to raise.
            return

        async def dispatch_retry_loop(
            task: TaskEffect,
            response_future: asyncio.Future[bytes],
        ):
            with use_application_id(self._application_id):
                # TODO(benh): let tasks configure their retry/backoff values.
                backoff = Backoff(
                    initial_backoff_seconds=_TASK_INITIAL_BACKOFF_SECONDS,
                )

                occurred_at = Timestamp()

                # NOTE: The convergence criteria here is that the task either
                # successfully completes or is cancelled. A cancelled task must
                # propagate the `asyncio.exceptions.CancelledError` as is
                # standard python practice. A task that fails to complete or
                # cancel will continue to retry.
                while True:
                    try:
                        # Wait until we are ready to serve traffic with actually
                        # calling user code.
                        await self._ready.wait()

                        response: Optional[Message] = None
                        error: Optional[status_pb2.Status] = None

                        # Sleep until this task is scheduled!
                        #
                        # TODO(benh): improve the scheduling so that all tasks are
                        # not concurrently sleeping to keep resources low.
                        if task.schedule is not None:
                            assert task.schedule.tzinfo is not None and task.schedule.tzinfo.utcoffset(
                                task.schedule
                            ) is not None, "Task schedule must have timezone info"

                            seconds = (
                                task.schedule - DateTimeWithTimeZone.now()
                            ).total_seconds()
                            if seconds > 0:
                                with tracing.span(
                                    state_name=
                                    f"{task.task_id.state_type}('{task.state_id}')",
                                    span_name=
                                    f"{task.method_name}(): waiting until the scheduled start time",
                                    level=tracing.TraceLevel.CUSTOMER,
                                ):
                                    # A task that is cancelled before
                                    # its scheduled start never starts:
                                    # there is nothing to clean up.
                                    if await _wait_unless_cancellation_requested(
                                        asyncio.sleep(seconds),
                                        task,
                                    ):
                                        error = _cancelled_status(task)
                                        await self._complete_task(
                                            task,
                                            (None, error),
                                        )

                        if error is None:
                            occurred_at.FromDatetime(
                                DateTimeWithTimeZone.now()
                            )
                            self._tasks_cache.update_task_info(
                                task.task_id,
                                status=tasks_pb2.TaskInfo.Status.STARTED,
                                occurred_at=occurred_at,
                            )

                            def on_loop_iteration(
                                iteration: int,
                                next_iteration_schedule: Optional[
                                    DateTimeWithTimeZone],
                            ):
                                """
                                Called in anticipation of a next loop
                                iteration (before the iteration starts, and
                                before waiting for the appropriate start
                                time).
                                """
                                occurred_at.FromDatetime(
                                    DateTimeWithTimeZone.now()
                                )
                                scheduled_at: Optional[Timestamp] = None
                                if next_iteration_schedule is not None:
                                    scheduled_at = Timestamp()
                                    scheduled_at.FromDatetime(
                                        next_iteration_schedule
                                    )
                                self._tasks_cache.update_task_info(
                                    task.task_id,
                                    status=tasks_pb2.TaskInfo.Status.
                                    SCHEDULED_ITERATION,
                                    occurred_at=occurred_at,
                                    scheduled_at=scheduled_at,
                                    # The `iteration` is the number of the
                                    # anticipated next iteration; it implies
                                    # we've completed `iteration` previous
                                    # iterations.
                                    iterations=iteration,
                                )

                            response, error = await self._dispatch(
                                task,
                                on_loop_iteration=on_loop_iteration,
                            )

                        if response is not None:
                            any_response = any_pb2.Any()
                            any_response.Pack(response)

                            response_or_error = tasks_pb2.TaskResponseOrError(
                                response=any_response
                            )

                            response_future.set_result(
                                response_or_error.SerializeToString()
                            )

                            occurred_at.FromDatetime(
                                DateTimeWithTimeZone.now()
                            )
                            self._tasks_cache.update_task_info(
                                task.task_id,
                                status=tasks_pb2.TaskInfo.Status.COMPLETED,
                                occurred_at=occurred_at,
                            )

                            break
                        else:
                            assert error is not None
                            assert isinstance(error, status_pb2.Status)

                            any_error = any_pb2.Any()
                            any_error.Pack(error)

                            response_or_error = tasks_pb2.TaskResponseOrError(
                                error=any_error
                            )

                            response_future.set_result(
                                response_or_error.SerializeToString()
                            )

                            occurred_at.FromDatetime(
                                DateTimeWithTimeZone.now()
                            )
                            self._tasks_cache.update_task_info(
                                task.task_id,
                                status=(
                                    tasks_pb2.TaskInfo.Status.CANCELLED
                                    if error.code == code_pb2.CANCELLED else
                                    tasks_pb2.TaskInfo.Status.ABORTED
                                ),
                                occurred_at=occurred_at,
                            )
                            break
                    except asyncio.exceptions.CancelledError:
                        # Allow task cancellation to be propagated. Exception
                        # handling is done on the outer scope.
                        # The cache update will occur in the cleanup_task later.
                        raise
                    except BaseException as exception:
                        exception_str = f"{exception}"
                        logger.warning(
                            f"Task '{task.task_id.state_type}.{task.method_name}' (UUID={UUID(bytes=task.task_id.task_uuid)}) "
                            f"failed with {type(exception).__name__}{': ' + exception_str if len(exception_str) > 0 else ''}; "
                            "will retry after backoff ..."
                        )

                        seconds = backoff.next_backoff_seconds

                        occurred_at.FromDatetime(DateTimeWithTimeZone.now())
                        scheduled_at = Timestamp()
                        scheduled_at.FromDatetime(
                            DateTimeWithTimeZone.now() +
                            timedelta(seconds=seconds)
                        )

                        self._tasks_cache.update_task_info(
                            task.task_id,
                            status=tasks_pb2.TaskInfo.Status.SCHEDULED_RETRY,
                            occurred_at=occurred_at,
                            scheduled_at=scheduled_at,
                            failed=True,
                        )
                        # Retry right away if the task gets cancelled
                        # while backing off, so that the workflow
                        # gets to run its cleanup without delay (the
                        # retry replays up to where the cancellation
                        # is delivered).
                        await _wait_unless_cancellation_requested(
                            backoff(),
                            task,
                        )

        for task in tasks:
            # To provide idempotence, in the event that this task has
            # already been dispatched we simply ignore it.
            if task.task_id.task_uuid in self._dispatched_tasks:
                continue

            # Add task to the TasksCache _before_ we return to the
            # caller so that if they try and wait on it it will be
            # known about.
            response_future: asyncio.Future[
                bytes] = self._tasks_cache.put_pending_task(
                    task.task_id,
                    task.method_name,
                    task.iteration,
                    task.schedule,
                )

            asyncio_task = asyncio.create_task(
                dispatch_retry_loop(task, response_future),
                name=f'dispatch_retry_loop(...) in {__name__}',
            )

            self._dispatched_tasks[task.task_id.task_uuid
                                  ] = (asyncio_task, task)

            def finished_by_asyncio_cancellation(
                task: TaskEffect,
                asyncio_task: asyncio.Task,
            ) -> bool:
                """Whether the `asyncio.Task` running `task` ended with a
                `CancelledError` because the task was cancelled (as
                opposed to us shutting down, after which the task is
                re-dispatched elsewhere). A requested cancellation
                normally finishes the task from within the dispatch
                retry loop; this is for a Node.js workflow, which is
                still cancelled with `asyncio.Task.cancel()`, and for
                a workflow that raised `CancelledError` on its own.
                """
                return (
                    asyncio_task.cancelled() and
                    task.cancellation.requested and
                    not task.cancellation.shutting_down
                )

            async def cleanup_async(
                task: TaskEffect,
                asyncio_task: asyncio.Task,
            ):
                assert self._complete_task is not None
                if finished_by_asyncio_cancellation(task, asyncio_task):
                    await self._complete_task(
                        task,
                        (None, _cancelled_status(task)),
                    )

            # It's possible that the task will never even start
            # because we'll call `cancel()` on it immediately. In that
            # case, it won't be able to remove itself from
            # `self._dispatched_tasks` so we need to do it via
            # `add_done_callback()`.
            def cleanup_done(task: TaskEffect, asyncio_task: asyncio.Task, _):
                if finished_by_asyncio_cancellation(task, asyncio_task):
                    self._tasks_cache.resolve_future(
                        task.task_id,
                        status=_cancelled_status(task),
                    )
                del self._dispatched_tasks[task.task_id.task_uuid]

            def cleanup(task: TaskEffect, asyncio_task: asyncio.Task):
                loop = asyncio.get_running_loop()
                cleanup_task = loop.create_task(
                    cleanup_async(task, asyncio_task)
                )
                cleanup_task.add_done_callback(
                    partial(cleanup_done, task, asyncio_task)
                )

            # NOTE: we need to use `partial()` to bind `task` because
            # just capturing the variable means it might change (see
            # #2832); the done callback is passed the `asyncio.Task`.
            asyncio_task.add_done_callback(partial(cleanup, task))

    async def cancel_task(
        self,
        task_uuid: bytes,
    ) -> tasks_pb2.CancelTaskResponse:
        """Requests cancellation of the task with the specified UUID.

        The request is recorded durably first (so that it survives a
        crash) and then delivered to the workflow running the task,
        which sees `asyncio.CancelledError` at its next suspension
        point or after the step that is in flight, and may clean up
        before finishing (see `TaskCancellation`). A task that has not
        started yet (waiting for its scheduled time) never starts.

        A Node.js workflow is still cancelled by cancelling the
        `asyncio.Task` running it, as before.
        """
        entry = self._dispatched_tasks.get(task_uuid)

        if entry is None:
            return tasks_pb2.CancelTaskResponse(
                status=tasks_pb2.CancelTaskResponse.Status.NOT_FOUND
            )

        asyncio_task, task = entry

        if task.cancellation.requested:
            return tasks_pb2.CancelTaskResponse(
                status=tasks_pb2.CancelTaskResponse.Status.CANCELLING
            )

        if in_nodejs():
            # TODO: deliver cancellation durably to Node.js workflows
            # too, using `AbortSignal` in place of `CancelledError`.
            task.cancellation.request(deliver=False)
            asyncio_task.cancel()
        else:
            # Records the request and then signals the running
            # workflow (via `task.cancellation`).
            await self._cancel_task(task)

        return tasks_pb2.CancelTaskResponse(
            status=tasks_pb2.CancelTaskResponse.Status.OK
        )

    async def stop(self) -> None:
        """Stop dispatching Reboot tasks, and cancel any outstanding
        `asyncio.Task`s that represent an attempt to execute those Reboot
        Tasks, so those may be safely re-dispatched again elsewhere later.
        """

        # Signal that stop has been requested to avoid dispatching new tasks.
        self._stop_requested.set()

        # Cancel existing `asyncio.Tasks`.
        # NOTE: we make a copy of the values to dodge errors arising from the
        # dictionary changing size during iteration. Python does not like when
        # that happens.
        for asyncio_task, task in list(self._dispatched_tasks.values()):
            # This is not a cancellation of the task (it will be
            # re-dispatched, and must not be marked as finished or
            # run any cleanup); let the workflow know that we are
            # shutting down before we cancel its `asyncio.Task`.
            task.cancellation.shutting_down = True
            asyncio_task.cancel()

        # Wait for the cancelled tasks to finish, warning along the way
        # about those that are taking too long.
        #
        # In a test, wait for as long as it takes: a task that does not
        # come back from its cancellation is a bug in the code under
        # test, which has to handle cancellation since an application
        # may cancel its tasks, and the test is better stuck here,
        # saying why, than hung silently once its event loop shuts
        # down.
        #
        # Otherwise, wait only once here, and then keep waiting, and
        # warning, in a task of our own: a task that does not come back
        # from its cancellation must not hold up whatever else is being
        # stopped, and the process exits once all of that has, with the
        # task still running if it must (#278).
        if not await self._wait_for_cancelled_tasks():
            if is_in_test():
                await self._keep_waiting_for_cancelled_tasks()
            else:
                self._keep_waiting_for_cancelled_tasks_task = asyncio.create_task(
                    self._keep_waiting_for_cancelled_tasks(),
                    name=f'_keep_waiting_for_cancelled_tasks() in {__name__}',
                )

    async def _wait_for_cancelled_tasks(self) -> bool:
        """Waits up to `STOP_WAIT_SECONDS` for the tasks that `stop()`
        cancelled to finish. Returns whether they all have, and warns
        about those that have not."""
        if len(self._dispatched_tasks) == 0:
            return True

        # NOTE: In contrast to `asyncio.wait_for`, `asyncio.wait` does not
        # raise `TimeoutError` if the timeout is reached and does not
        # `cancel` the `asyncio.Tasks` (again) on timeout.
        tasks = [
            asyncio_task for asyncio_task, _ in self._dispatched_tasks.values()
        ]
        await asyncio.wait(
            tasks,
            timeout=STOP_WAIT_SECONDS,
        )

        # As tasks complete, they should be removed from
        # `_dispatched_tasks`.
        if len(self._dispatched_tasks) == 0:
            return True

        # If there are still tasks left, log a warning to the user.
        logger.warning(
            'We are still waiting for cancelled tasks to finish, are you '
            'possibly catching and forgetting to propagate a CancelledError?'
        )

        for uuid in self._dispatched_tasks.keys():
            logger.warning(f'Waiting for task with UUID {UUID(bytes=uuid)}')

        return False

    async def _keep_waiting_for_cancelled_tasks(self) -> None:
        """Keeps waiting for the tasks that `stop()` cancelled to finish,
        warning every `STOP_WAIT_SECONDS` about those that have not."""
        while not await self._wait_for_cancelled_tasks():
            pass
