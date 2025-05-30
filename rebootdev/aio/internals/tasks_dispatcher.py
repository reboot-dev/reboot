import asyncio
import log.log  # type: ignore[import]
import logging
from datetime import timedelta
from functools import partial
from google.protobuf import any_pb2
from google.protobuf.message import Message
from google.protobuf.timestamp_pb2 import Timestamp
from rbt.v1alpha1 import tasks_pb2
from rebootdev.aio.backoff import Backoff
from rebootdev.aio.internals.contextvars import use_application_id
from rebootdev.aio.internals.tasks_cache import TasksCache
from rebootdev.aio.tasks import Loop, TaskEffect
from rebootdev.aio.types import ApplicationId
from rebootdev.time import DateTimeWithTimeZone
from typing import Awaitable, Callable, Optional, Protocol, Tuple
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

TaskResponseOrError = Tuple[Optional[Message | Loop], Optional[Message]]


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
    ) -> Awaitable[TaskResponseOrError]:
        pass


CompleteTaskCallable = Callable[[TaskEffect, TaskResponseOrError],
                                Awaitable[None]]

IsCancelled = bool


class TasksDispatcher:
    """Encapsulates dispatching and retrying tasks as well as informing
    the TasksCache about said tasks and their status.
    """

    def __init__(
        self,
        *,
        application_id: ApplicationId,
        dispatch: DispatchCallable,
        tasks_cache: TasksCache,
        ready: asyncio.Event,
    ):
        self._application_id = application_id
        self._dispatch = dispatch
        self._tasks_cache = tasks_cache
        self._ready = ready
        self._complete_task: Optional[CompleteTaskCallable] = None

        # Signal that stop has been requested.
        self._stop_requested = asyncio.Event()

        # We need to hold a reference to each asyncio.Task we create
        # for running our tasks otherwise the Python interpreter might
        # try and garbage collect them even if they haven't finished.
        self._dispatched_tasks: dict[bytes, Tuple[asyncio.Task,
                                                  IsCancelled]] = {}

    def set_complete_task(self, complete_task: CompleteTaskCallable) -> None:
        """Set the complete task callable."""
        self._complete_task = complete_task

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
            raise ValueError('Stop requested')

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
                                await asyncio.sleep(seconds)

                        occurred_at.FromDatetime(DateTimeWithTimeZone.now())
                        self._tasks_cache.update_task_info(
                            task.task_id,
                            status=tasks_pb2.TaskInfo.Status.STARTED,
                            occurred_at=occurred_at,
                        )

                        response_or_loop, error = await self._dispatch(task)

                        if isinstance(response_or_loop, Loop):
                            occurred_at.FromDatetime(
                                DateTimeWithTimeZone.now()
                            )
                            self._tasks_cache.update_task_info(
                                task.task_id,
                                status=tasks_pb2.TaskInfo.Status.STARTED,
                                occurred_at=occurred_at,
                                iteration=True,
                            )
                            continue

                        if response_or_loop is not None:

                            response: Message = response_or_loop

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
                                status=tasks_pb2.TaskInfo.Status.COMPLETED,
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
                            f"Task '{task.task_id.state_type}.{task.method_name}' (UUID={str(UUID(bytes=task.task_id.task_uuid))}) "
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
                        await backoff()

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
                                  ] = (asyncio_task, False)

            async def cleanup_async(task: TaskEffect):
                assert self._complete_task is not None
                if self.is_task_cancelled(task.task_id.task_uuid):
                    await self._complete_task(
                        task, (None, tasks_pb2.TaskCancelledError())
                    )

            # It's possible that the task will never even start
            # because we'll call `cancel()` on it immediately. In that
            # case, it won't be able to remove itself from
            # `self._dispatched_tasks` so we need to do it via
            # `add_done_callback()`.
            def cleanup_done(task: TaskEffect, _):
                if self.is_task_cancelled(task.task_id.task_uuid):
                    self._tasks_cache.resolve_future(
                        task.task_id,
                        error=tasks_pb2.TaskCancelledError(),
                    )
                del self._dispatched_tasks[task.task_id.task_uuid]

            def cleanup(task: TaskEffect, _):
                loop = asyncio.get_running_loop()
                cleanup_task = loop.create_task(cleanup_async(task))
                cleanup_task.add_done_callback(partial(cleanup_done, task))

            # NOTE: we need to use `partial()` to bind `task` because
            # just capturing the variable means it might change (see
            # #2832).
            asyncio_task.add_done_callback(partial(cleanup, task))

    async def cancel_task(
        self,
        task_uuid: bytes,
    ) -> tasks_pb2.CancelTaskResponse:
        """Cancel the task with the specified UUID."""
        task, is_cancelled = self._dispatched_tasks.get(
            task_uuid, (None, False)
        )

        if is_cancelled:
            return tasks_pb2.CancelTaskResponse(
                status=tasks_pb2.CancelTaskResponse.Status.CANCELLING
            )

        if task is None:
            return tasks_pb2.CancelTaskResponse(
                status=tasks_pb2.CancelTaskResponse.Status.NOT_FOUND
            )

        self._dispatched_tasks[task_uuid] = (task, True)
        task.cancel()

        return tasks_pb2.CancelTaskResponse(
            status=tasks_pb2.CancelTaskResponse.Status.OK
        )

    def is_task_cancelled(
        self,
        task_uuid: bytes,
    ) -> bool:
        """Check if the task with the specified UUID has been cancelled."""
        _, is_cancelled = self._dispatched_tasks.get(task_uuid, (None, False))
        return is_cancelled

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
        for task, _ in list(self._dispatched_tasks.values()):
            # We don't set is_cancelled to True here, because
            # TasksServicer.CancelTask is not called at this point and after the
            # task is cancelled, it will be removed from _dispatched_tasks.
            task.cancel()

        while len(self._dispatched_tasks) > 0:
            # Wait for all dispatched tasks to finish. If the tasks are taking
            # too long, we will log a warning to the user.

            # NOTE: In contrast to `asyncio.wait_for`, `asyncio.wait` does not
            # raise `TimeoutError` if the timeout is reached and does not
            # `cancel` the `asyncio.Tasks` (again) on timeout.
            tasks = [task for task, _ in self._dispatched_tasks.values()]
            await asyncio.wait(
                tasks,
                timeout=5,
            )

            # As tasks complete, they should be removed from
            # `_dispatched_tasks`.
            if len(self._dispatched_tasks) == 0:
                break

            # If there are still tasks left, log a warning to the user.
            logger.warning(
                'We are still waiting for cancelled tasks to finish, are you '
                'possibly catching and forgetting to propagate a CancelledError?'
            )

            for uuid in self._dispatched_tasks.keys():
                logger.warning(
                    f'Waiting for task with UUID {str(UUID(bytes=uuid))}'
                )
