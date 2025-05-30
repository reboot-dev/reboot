import asyncio
from collections import OrderedDict
from google.protobuf.message import Message
from google.protobuf.timestamp_pb2 import Timestamp
from rbt.v1alpha1 import sidecar_pb2, tasks_pb2
from rebootdev.time import DateTimeWithTimeZone
from typing import Iterable, Optional

# Target capacity of the tasks responses cache. This is just a target
# because we want to keep all entries for tasks that are still pending
# so that any requests to wait on those tasks will not raise. While
# this means that we may have more entries in the cache than the
# target, the total number of pending tasks will never exceed
# 'tasks_dispatcher.DISPATCHED_TASKS_LIMIT', thus providing an upper
# bound on the size of the cache.
TASKS_RESPONSES_CACHE_TARGET_CAPACITY = 256


class TasksCache:

    def __init__(self):
        # Cache from task UUIDs to a future on the serialized bytes of
        # the response.
        self._cache: OrderedDict[bytes,
                                 tuple[asyncio.Future[bytes],
                                       tasks_pb2.TaskInfo]] = OrderedDict()

        # We may return to a caller _after_ a transaction has been
        # prepared by the coordinator (i.e., the coordinator has
        # persisted that all participants have prepared) but _before_
        # the transaction has committed. Because of this we might not
        # yet have dispatched the tasks, i.e., called
        # `put_pending_task(...)`, and thus we will think a task is
        # not in the cache.
        #
        # We solve this by also holding on to any tasks that have been
        # prepared in a transaction.
        self._transaction_prepared_tasks: dict[
            bytes,
            asyncio.Future[None],
        ] = {}

    def transaction_prepared_task(
        self,
        task_id: tasks_pb2.TaskId,
    ) -> None:
        """Adds task as transaction prepared."""
        uuid = task_id.task_uuid
        self._transaction_prepared_tasks[uuid] = asyncio.Future()

    def transaction_aborted_task(
        self,
        task_id: tasks_pb2.TaskId,
    ) -> None:
        """Removes task as transaction prepared, or does nothing if it had not
        previously been added as transaction prepared.
        """
        uuid = task_id.task_uuid
        if uuid in self._transaction_prepared_tasks:
            self._transaction_prepared_tasks[uuid].set_exception(
                RuntimeError("Transaction aborted")
            )
            del self._transaction_prepared_tasks[uuid]

    def update_task_info(
        self,
        task_id: tasks_pb2.TaskId,
        status: tasks_pb2.TaskInfo.Status,
        occurred_at: Timestamp,
        scheduled_at: Optional[Timestamp] = None,
        iteration: bool = False,
        failed: bool = False,
    ) -> None:

        uuid = task_id.task_uuid
        if uuid in self._cache:
            _, task_info = self._cache[uuid]

            task_info.status = status
            task_info.occurred_at.CopyFrom(occurred_at)
            if scheduled_at is not None:
                task_info.scheduled_at.CopyFrom(scheduled_at)
            if iteration is True:
                task_info.iterations += 1
            if failed is True:
                task_info.num_runs_failed_recently += 1

            self._cache.move_to_end(uuid)

    def put_pending_task(
        self,
        task_id: tasks_pb2.TaskId,
        method: str,
        iteration: int,
        schedule: Optional[DateTimeWithTimeZone],
    ) -> asyncio.Future[bytes]:
        """Adds a cache entry for the pending task so that any subsequent
        requests to wait on the task do not raise due to the task not
        having completed yet.

        Returns a future that the caller can set with the response
        bytes to indicate the completion of the task.
        """
        uuid = task_id.task_uuid

        assert uuid not in self._cache, f"Task {uuid} already in cache"

        future: asyncio.Future[bytes] = asyncio.Future()

        occurred_at = Timestamp()
        occurred_at.FromDatetime(DateTimeWithTimeZone.now())

        task_info = tasks_pb2.TaskInfo(
            task_id=task_id,
            status=tasks_pb2.TaskInfo.Status.SCHEDULED,
            occurred_at=occurred_at,
            method=method,
            iterations=iteration,
            num_runs_failed_recently=0,
        )

        if schedule is not None:
            scheduled_at = Timestamp()
            scheduled_at.FromDatetime(schedule)
            task_info.scheduled_at.CopyFrom(scheduled_at)

        self._cache[uuid] = (
            future,
            task_info,
        )

        self._cache.move_to_end(uuid)
        self._trim_cache()

        # Check if the task had been added as part of a transaction,
        # and if so, notify any waiters that the transaction has
        # committed and they can start waiting for the task.
        #
        # NOTE: there is an invariant here that after calling
        # `set_result()` on the future the task will be in the cache
        # and thus we do this after adding it to the cache above.
        if uuid in self._transaction_prepared_tasks:
            self._transaction_prepared_tasks[uuid].set_result(None)
            del self._transaction_prepared_tasks[uuid]

        return future

    def get_tasks(self) -> Iterable[tasks_pb2.TaskInfo]:
        """Get the TaskInfo of all tasks in the cache."""
        return (task_info for _, (future, task_info) in self._cache.items())

    async def get(self, task_id: tasks_pb2.TaskId) -> Optional[bytes]:
        """Get the cached response for a particular task, awaiting if necessary.
        Returns None if the given task is not cached."""
        uuid = task_id.task_uuid

        # Check if the task has been prepared as part of a transaction
        # and we are still waiting on the dispatch. If this is the
        # case, the transaction must have committed because that's the
        # only way we'd expose the task ID, we're just racing with the
        # task getting dispatched.
        if uuid in self._transaction_prepared_tasks:
            await self._transaction_prepared_tasks[uuid]

        if uuid not in self._cache:
            return None

        response_future: asyncio.Future[bytes] = self._cache[uuid][0]
        self._cache.move_to_end(uuid)
        self._trim_cache()
        return await response_future

    def resolve_future(
        self,
        task_id: tasks_pb2.TaskId,
        response: Optional[Message] = None,
        error: Optional[Message] = None,
    ) -> None:
        """Resolve the future for the given task with the given response."""
        uuid = task_id.task_uuid
        if uuid in self._cache:
            future, task_info = self._cache[uuid]
            if not future.done():
                result = tasks_pb2.TaskResponseOrError()

                assert response is not None or error is not None

                if response is not None:
                    assert error is None
                    result.response.Pack(response)
                    task_info.status = tasks_pb2.TaskInfo.Status.COMPLETED
                else:
                    assert response is None
                    result.error.Pack(error)

                    task_info.status = tasks_pb2.TaskInfo.Status.CANCELLED

                future.set_result(result.SerializeToString())
                task_info.occurred_at.FromDatetime(DateTimeWithTimeZone.now())
                self._cache.move_to_end(uuid)
                self._trim_cache()

    def put_with_response(
        self,
        task_id: tasks_pb2.TaskId,
        response: bytes,
        timestamp: Timestamp,
        status: sidecar_pb2.Task.Status,
        method: str,
        iteration: int = 0,
    ) -> None:
        """Cache the specified response for the task."""

        # When we have a response for a task, we know that the task
        # must have completed.
        assert status == sidecar_pb2.Task.Status.COMPLETED

        uuid = task_id.task_uuid
        if uuid not in self._cache:
            # NOTE: we always try and add to the cache, even if we're
            # at capacity, because when we call '_trim_cache()' it's
            # possible that there is a lesser recently used entry that
            # will get evicted instead of us. It's also possible that
            # the cache is full of pending entries, in which case we
            # will evict this entry, but for now we'll just let
            # '_trim_cache()' do its thing rather than optimize that
            # case here.
            future: asyncio.Future[bytes] = asyncio.Future()
            future.set_result(response)

            occurred_at = Timestamp()
            occurred_at.CopyFrom(timestamp)

            self._cache[uuid] = (
                future,
                tasks_pb2.TaskInfo(
                    task_id=task_id,
                    occurred_at=occurred_at,
                    status=tasks_pb2.TaskInfo.Status.COMPLETED,
                    method=method,
                    iterations=iteration,
                    num_runs_failed_recently=0,
                ),
            )

        self._cache.move_to_end(uuid)
        self._trim_cache()

    def _trim_cache(self):
        """Try to remove entries in the cache in excess of the capacity by
        removing those that are no longer pending.

        We want to keep pending entries in the cache so that any
        requests to wait will not raise.
        """
        uuids_to_remove: list[bytes] = []

        # Default iteration order of a OrderedDict is from the least
        # to most recently inserted (used).
        for uuid, (future, _) in self._cache.items():
            entries = len(self._cache) - len(uuids_to_remove)
            if entries <= TASKS_RESPONSES_CACHE_TARGET_CAPACITY:
                break
            if future.done():
                uuids_to_remove.append(uuid)

        for uuid in uuids_to_remove:
            _ = self._cache.pop(uuid)
