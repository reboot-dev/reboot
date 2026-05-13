from __future__ import annotations

import asyncio
import bitarray  # type: ignore[import]
import grpc
import hashlib
import inspect
import itertools
import log.log
import logging
import math
import sys
import time
import traceback
import uuid
from abc import ABC, abstractmethod
from collections import defaultdict
from contextlib import asynccontextmanager
from contextvars import ContextVar
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from google.protobuf import any_pb2
from google.protobuf.message import Message
from google.protobuf.timestamp_pb2 import Timestamp
from grpc.aio import AioRpcError
from log.log import log_at_most_once_per
from rbt.v1alpha1 import (
    database_pb2,
    tasks_pb2,
    transactions_pb2,
    transactions_pb2_grpc,
)
from rbt.v1alpha1.errors_pb2 import (
    FailedPrecondition,
    StateAlreadyConstructed,
    StateNotConstructed,
    TransactionParticipantFailedToCommit,
    TransactionParticipantFailedToPrepare,
    Unavailable,
)
from reboot.admin.export_import_converters import ExportImportItemConverters
from reboot.aio import tracing
from reboot.aio.aborted import Aborted, SystemAborted
from reboot.aio.backoff import Backoff
from reboot.aio.concurrently import concurrently
from reboot.aio.contexts import (
    Context,
    Participants,
    React,
    ReaderContext,
    TransactionContext,
    WorkflowContext,
    WriterContext,
)
from reboot.aio.headers import Headers
from reboot.aio.internals.channel_manager import _ChannelManager
from reboot.aio.internals.middleware import Middleware
from reboot.aio.internals.tasks_dispatcher import (
    OnLoopIterationCallable,
    TaskResponseOrStatus,
    TasksDispatcher,
)
from reboot.aio.once import AsyncOnce
from reboot.aio.placement import PlacementClient
from reboot.aio.servicers import RebootServiceable, Serviceable
from reboot.aio.tasks import TaskEffect
from reboot.aio.tracing import asynccontextmanager_span, function_span, span
from reboot.aio.types import (
    ApplicationId,
    StateId,
    StateRef,
    StateTypeName,
    assert_type,
    state_type_tag_for_name,
)
from reboot.server.database import (
    SORTED_MAP_ENTRY_TYPE_NAME,
    SORTED_MAP_TYPE_NAME,
    DatabaseClient,
)
from reboot.time import DateTimeWithTimeZone
from reboot.uuidv7 import uuid7_timestamp_ms
from reboot.wait_for_tasks import wait_for_tasks
from struct import pack, unpack
from typing import (
    Any,
    AsyncContextManager,
    AsyncGenerator,
    AsyncIterator,
    Awaitable,
    Callable,
    Literal,
    Optional,
    Set,
    TypeAlias,
    TypeVar,
    cast,
    overload,
)

logger = log.log.get_logger(__name__)
# TODO(rjh): some mechanism where developers can configure the Reboot log
# level per-module or globally. For now, default to `WARNING`: we have warnings
# in this file that we expect users to want to see.
logger.setLevel(logging.WARNING)


def check_idempotency_key_not_expired(idempotency_key: uuid.UUID) -> None:
    """Check if the idempotency key is an expired UUIDv7.

    UUIDv7 keys encode a timestamp in their first 48 bits. If that timestamp
    is in the past, the idempotency key is considered expired and the mutation
    cannot be performed.

    Raises:
        SystemAborted: If the idempotency key is a UUIDv7 with a timestamp in
            the past.
    """
    if idempotency_key.version != 7:
        return

    timestamp_ms = uuid7_timestamp_ms(uuid.UUID(bytes=idempotency_key.bytes))

    now_ms = int(time.time() * 1000)

    if timestamp_ms < now_ms:
        raise SystemAborted(
            FailedPrecondition(),
            message=(
                "UUIDv7 idempotency key has expired: timestamp "
                f"{datetime.fromtimestamp(timestamp_ms / 1000, tz=timezone.utc)} "
                "is in the past (current time is "
                f"{datetime.fromtimestamp(now_ms / 1000, tz=timezone.utc)})"
            ),
        )


StateT = TypeVar('StateT', bound=Message)


class Effects:
    """Helper class that captures all the possible effects a method might
    have.

    Note: The `_colocated_upserts` argument is for internal use only. See
    usage in the `StateManager` class.
    """

    def __init__(
        self,
        *,
        state: Optional[Message] = None,
        response: Optional[Message] = None,
        error: Optional[Message] = None,
        tasks: Optional[list[TaskEffect]] = None,
        _colocated_upserts: Optional[list[tuple[str, Optional[bytes]]]] = None,
    ):
        self.state = state
        self.response = response
        self.error = error
        self.tasks = tasks
        self._colocated_upserts = _colocated_upserts

    def requires_exclusive(
        self,
        *,
        initial_state_bytes: Optional[bytes],
    ) -> bool:
        """Returns `True` iff applying these effects require the
        exclusive transaction lock, i.e., the state has been mutated,
        tasks were scheduled, or there are colocated keys.

        `initial_state_bytes` is the serialized state loaded for the
        transaction (or `None` if the state wasn't constructed yet).
        """
        if self.tasks:
            return True
        if self._colocated_upserts:
            return True
        if self.state is not None:
            if initial_state_bytes is None:
                # Going from no-state to state (i.e., an explicit or
                # implicit constructor) is a mutation.
                return True
            if initial_state_bytes != self.state.SerializeToString(
                deterministic=True,
            ):
                return True
        return False


# An entry in a streaming reader queue.
#
# A tuple of (state, idempotency_key) where 'idempotency_key' may be None.
# The entire item can be None if a queue consumer is in a transaction that
# is aborted. If the larger-than-memory state of a message changes (due to
# colocated_upserts), then the `Message` may match the previous `Message`.
#
# TODO: In future, reactive consumers of Collections should be able to indicate
# which ranges of the collection they are interested in, in order to avoid being
# invalidated for irrelevant changes. See
# https://rocksdb.org/blog/2018/11/21/delete-range.html for some discussion of
# how we might want to partition streaming reader queues for that case.
_StreamingReaderItem: TypeAlias = Optional[tuple[Message, Optional[uuid.UUID]]]

# A callable that should raise if access to the given state is not authorized.
# A copy of the state will be created before the call.
AuthorizeCallable: TypeAlias = Callable[[Optional[StateT]], Awaitable[None]]


class StateManager(ABC):
    """Base class for all state managers.

    State managers are used by the middleware to provide access to the
    underlying state.
    """

    class Writer:
        """Helper class that ensures all attempts to store state come from
        using 'StateManager.writer(...)'.
        """

        def __init__(self, complete: Callable[[Effects], Awaitable[None]]):
            self._complete = complete

        async def complete(self, effects: Effects) -> None:
            await self._complete(effects)

    class Transaction:
        """Helper class for managing ongoing transaction state.

        As a helper some members of the class are meant to be accessed
        directly, while others are meant to be accessed by methods.

        The methods are not meant to do anything complicated, but
        instead just provide syntactic sugar to simplify updating
        transaction state throughout the code. The one exception to
        that is that we've made the class awaitable to make it easy to
        wait for an ongoing transaction to finish (either aborted or
        committed) in the code.
        """

        @classmethod
        def from_context(
            cls,
            context: Context,
            tasks_dispatcher: TasksDispatcher,
            *,
            using_restart_detection: bool = False,
        ) -> StateManager.Transaction:
            assert context.transaction_ids is not None
            assert context.transaction_coordinator_state_type is not None
            assert context.transaction_coordinator_state_ref is not None
            return cls(
                transaction_ids=context.transaction_ids,
                coordinator_state_type=context.
                transaction_coordinator_state_type,
                coordinator_state_ref=context.
                transaction_coordinator_state_ref,
                state_type=context.state_type_name,
                state_ref=context._state_ref,
                tasks_dispatcher=tasks_dispatcher,
                idempotency_key=context.idempotency_key,
                using_restart_detection=using_restart_detection,
            )

        @classmethod
        def from_sidecar(
            cls,
            transaction: database_pb2.Transaction,
            middleware: Middleware,
        ) -> StateManager.Transaction:
            return cls(
                transaction_ids=[
                    uuid.UUID(bytes=transaction_id)
                    for transaction_id in transaction.transaction_ids
                ],
                coordinator_state_type=StateTypeName(
                    transaction.coordinator_state_type
                ),
                coordinator_state_ref=StateRef(
                    transaction.coordinator_state_ref
                ),
                state_type=StateTypeName(transaction.state_type),
                state_ref=StateRef(transaction.state_ref),
                tasks_dispatcher=middleware.tasks_dispatcher,
                stored=True,
                prepared=transaction.prepared,
                # During recovery any transactions that were not
                # prepared must abort because rocksdb only persists
                # transactions that have been prepared.
                must_abort=not transaction.prepared,
                tasks=[
                    TaskEffect.from_sidecar_task(
                        task,
                        middleware.request_type_by_method_name[task.method],
                    ) for task in transaction.uncommitted_tasks
                ],
                idempotent_mutations={
                    uuid.UUID(bytes=idempotent_mutation.key):
                        idempotent_mutation for idempotent_mutation in
                    transaction.uncommitted_idempotent_mutations
                },
            )

        def __init__(
            self,
            *,
            transaction_ids: list[uuid.UUID],
            coordinator_state_type: StateTypeName,
            coordinator_state_ref: StateRef,
            state_type: StateTypeName,
            state_ref: StateRef,
            tasks_dispatcher: TasksDispatcher,
            stored: bool = False,
            prepared: bool = False,
            must_abort: bool = False,
            tasks: Optional[list[TaskEffect]] = None,
            idempotency_key: Optional[uuid.UUID] = None,
            idempotent_mutations: Optional[dict[
                uuid.UUID, database_pb2.IdempotentMutation]] = None,
            using_restart_detection: bool = False,
        ) -> None:
            self._ids = transaction_ids

            self.coordinator_state_type = coordinator_state_type
            self.coordinator_state_ref = coordinator_state_ref
            self.state_type = state_type
            self.state_ref = state_ref

            self.idempotency_key = idempotency_key

            self.idempotent_mutations = idempotent_mutations or {}

            self.tasks_dispatcher = tasks_dispatcher

            # Lock to provide atomicity for updating some of the
            # members, e.g., 'stored'.
            self.lock = asyncio.Lock()

            # Whether or not the transaction has been stored in the
            # sidecar and thus we are officially a participant. Should
            # be read/written only when holding 'lock'. Use property
            # `self.stored` to access this safely.
            self._stored = stored

            # Whether restart detection is being used for this
            # transaction.
            self.using_restart_detection = using_restart_detection

            # The mode in which this transaction currently holds the
            # per-actor Lock for `(state_type, state_ref)`. Starts
            # at `"shared"` when joined via a `ReaderContext`,
            # otherwise `"exclusive"`. A shared-then-exclusive
            # transaction transitions to `"exclusive"` after a
            # successful `Lock.upgrade()`.
            self.mode: Lock.Mode = "exclusive"

            # Resolved by the first method called on the state as part
            # of this transaction once the per-state lock has been
            # acquired. Concurrent calls in the same transaction on
            # the same state `await` this before proceeding. If the
            # first acquire fails the future is resolved with the same
            # exception so concurrent calls propagate it.
            self.acquired_lock: asyncio.Future[None] = (
                asyncio.get_event_loop().create_future()
            )

            # Whether or not we should abort this transaction when
            # asked by the coordinator.
            self.must_abort = False

            # Provisional state within the transaction.
            self.state: Optional[Message] = None

            # Streaming readers executing within this transaction.
            #
            # An entry in the queue is a tuple of (state,
            # idempotency_key) where 'idempotency_key' may be None.
            self.streaming_readers: list[asyncio.Queue[_StreamingReaderItem]
                                        ] = []

            # Aggregated tasks that should be dispatched if this
            # transaction commits.
            self.tasks = tasks or []

            assert all(
                task.task_id.state_type == self.state_type
                for task in self.tasks
            ), 'Transaction contains tasks not belonging to transaction'

            # asyncio.Task for the "watch control loop" which watches
            # the coordinator for updates about the transaction, i.e.,
            # if it was aborted or has been committed.
            self.watch_task: Optional[asyncio.Task] = None

            # Whether or not the transaction has been prepared.
            self._prepared = prepared

            # Whether or not the transaction was committed.
            self._committed: asyncio.Future[bool] = asyncio.Future()

            self.actors: defaultdict[StateTypeName,
                                     Set[StateRef]] = defaultdict(set)

        @property
        def ids(self) -> list[uuid.UUID]:
            return self._ids

        @property
        def root_id(self) -> uuid.UUID:
            return self._ids[0]

        @property
        def started_id(self) -> uuid.UUID:
            """If this transaction was started as a nested transaction this
            property is the id of the nested transaction that started it."""
            return self._ids[-1]

        @property
        def parent_ids(self) -> list[uuid.UUID]:
            return self._ids[:-1]

        @property
        def stored(self) -> bool:
            """Getter to attribute `_stored` that checks that lock is held and
            that the attribute is safe to access."""
            assert self.lock.locked()
            return self._stored

        @stored.setter
        def stored(self, value: bool) -> None:
            """Setter to attribute `_stored` that checks that lock is held and
            that the attribute can be safely set."""
            assert self.lock.locked()
            self._stored = value

        def prepare(self) -> None:
            """Marks the transaction as prepared."""
            assert not self._prepared, 'Prepare should only happen once!'

            # Tell the task dispatcher that a set of tasks may be
            # dispatched if the transaction commits.
            self.tasks_dispatcher.transaction_prepare_dispatch(self.tasks)

            self._prepared = True

        def prepared(self) -> bool:
            """Returns whether or not the transaction is prepared."""
            return self._prepared

        def commit(self) -> None:
            """Marks the transaction as committed. Must first be prepared."""
            assert self.prepared()

            # NOTE: invariant is that after setting '_committed' we
            # WILL NOT RAISE, otherwise we won't be able to retry
            # to commit since 'finished()' will return true.
            self._committed.set_result(True)

        def abort(self) -> None:
            """Marks the transaction as aborted."""
            # Tell the task dispatcher that the set of tasks will
            # never be dispatched because the transaction aborted.
            self.tasks_dispatcher.transaction_abort_dispatch(self.tasks)

            # NOTE: invariant is that after setting '_committed' we
            # WILL NOT RAISE, otherwise we won't be able to retry
            # to abort since 'finished()' will return true.
            self._committed.set_result(False)

        def __await__(self):
            """Awaits for transaction to finish, i.e., aborted or committed."""

            async def closure():
                await self._committed

            return closure().__await__()

        def committed(self) -> bool:
            """Returns whether or not the transaction is committed."""
            if self._committed.done():
                return self._committed.result()
            else:
                return False

        def aborted(self) -> bool:
            """Returns whether or not the transaction is aborted."""
            if self._committed.done():
                return not self._committed.result()
            else:
                return False

        def finished(self) -> bool:
            """Returns whether or not the transaction is finished."""
            return self._committed.done()

    @property
    def latest_timestamp_ms(self) -> Optional[int]:
        """Return the latest known database timestamp (ms), e.g., for
        UUID7 transaction ID generation.
        """
        raise NotImplementedError()

    @abstractmethod
    def preload(
        self,
        state_type_name: StateTypeName,
        state_ref: StateRef,
    ) -> None:
        raise NotImplementedError()

    @abstractmethod
    def add_to_server(self, server: grpc.aio.Server) -> None:
        """Hook for adding the state manager to a gRPC server."""
        raise NotImplementedError()

    @abstractmethod
    async def actors(
        self,
        state_type: StateTypeName,
    ) -> AsyncIterator[list[StateRef]]:
        """Returns an iterator of all the actors under management."""
        raise NotImplementedError()
        yield  # Necessary for type checking.

    @abstractmethod
    async def export_items(
        self, state_type: StateTypeName
    ) -> AsyncIterator[database_pb2.ExportItem]:
        """Exports the committed state of all actors of the given type."""
        raise NotImplementedError
        yield  # Necessary for type checking.

    @abstractmethod
    async def import_task(
        self,
        state_type: StateTypeName,
        state_ref: StateRef,
        task: database_pb2.Task,
        middleware: Middleware,
        *,
        sync: bool = True,
    ) -> None:
        """Imports state for an actor, overwriting on collision."""
        raise NotImplementedError

    @abstractmethod
    async def import_actor(
        self,
        state_type: StateTypeName,
        state_ref: StateRef,
        state: Message,
        *,
        sync: bool = True,
    ) -> None:
        """Imports state for an actor, overwriting on collision."""
        raise NotImplementedError

    @abstractmethod
    async def import_sorted_map_entry(
        self,
        state_type: StateTypeName,
        state_ref: StateRef,
        state: bytes,
        actor_converters: ExportImportItemConverters,
        *,
        sync: bool = True,
    ) -> None:
        """Imports state for an actor, overwriting on collision."""
        raise NotImplementedError

    @abstractmethod
    async def import_idempotent_mutation(
        self,
        state_type: StateTypeName,
        state_ref: StateRef,
        idempotent_mutation: database_pb2.IdempotentMutation,
        *,
        sync: bool = True,
    ) -> None:
        """Imports state for an actor, overwriting on collision."""
        raise NotImplementedError

    @abstractmethod
    @asynccontextmanager
    async def transactionally(
        self,
        context: ReaderContext | WriterContext | TransactionContext,
        tasks_dispatcher: TasksDispatcher,
        *,  # TODO: Make all args keyword.
        aborted_type: Optional[type[Aborted]],
    ) -> AsyncIterator[Optional[Transaction]]:
        """Performs any necessary set up to execute the body of the context
        manager transactionally. The body may be for a reader, a
        writer, or a transaction itself.
        """
        raise NotImplementedError()
        yield  # Necessary for type checking.

    @abstractmethod
    @asynccontextmanager
    async def reader(
        self,
        context: ReaderContext,
        state_type: type[StateT],
        *,
        authorize: Optional[AuthorizeCallable],
    ) -> AsyncIterator[StateT]:
        """Helper that handles code generated readers. Loads and returns the
        state for the actor specified in the context.
        """
        raise NotImplementedError()
        yield  # Necessary for type checking.

    @abstractmethod
    @asynccontextmanager
    async def streaming_reader(
        self,
        context: ReaderContext,
        state_type: type[StateT],
        *,
        authorize: Optional[AuthorizeCallable],
    ) -> AsyncIterator[AsyncIterator[StateT]]:
        """Helper that handles code generated streaming readers. Loads an
        async iterator of states for the actor specified in the
        context.
        """
        raise NotImplementedError()
        yield  # Necessary for type checking.

    @abstractmethod
    @asynccontextmanager
    async def streaming_reader_idempotency_key(
        self,
        context: ReaderContext | WorkflowContext,
        state_type: type[StateT],
        *,
        authorize: Optional[AuthorizeCallable],
    ) -> AsyncIterator[AsyncIterator[tuple[StateT, Optional[uuid.UUID]]]]:
        """Loads an async iterator of states and the idempotency keys that
        caused that state update.
        """
        raise NotImplementedError()
        yield  # Necessary for type checking.

    @abstractmethod
    @asynccontextmanager
    async def reactively(
        self,
        context: ReaderContext | WorkflowContext,
        state_type: type[StateT],
        *,
        authorize: Optional[AuthorizeCallable],
    ) -> AsyncIterator[AsyncIterator[tuple[StateT, list[uuid.UUID]]]]:
        """Helper for executing a block of code "reactively"."""
        raise NotImplementedError()
        yield  # Necessary for type checking.

    @abstractmethod
    @asynccontextmanager
    async def writer(
        self,
        context: WriterContext,
        state_type: type[StateT],
        tasks_dispatcher: TasksDispatcher,
        *,
        authorize: Optional[AuthorizeCallable],
        transaction: Optional[Transaction] = None,
        from_constructor: bool = False,
        requires_constructor: bool = False,
    ) -> AsyncIterator[tuple[StateT, Writer]]:
        """Helper that handles code generated writers. Loads the state,
        performing any necessary functionality to ensure only one
        writer at a time, for the actor specified in the context.
        """
        raise NotImplementedError()
        yield  # Necessary for type checking.

    @abstractmethod
    async def complete_task(
        self,
        task_effect: TaskEffect,
        response_or_status: TaskResponseOrStatus,
    ) -> None:
        raise NotImplementedError()

    @abstractmethod
    @asynccontextmanager
    async def task_workflow(
        self,
        context: WorkflowContext,
        task_effect: TaskEffect,
        *,
        on_loop_iteration: OnLoopIterationCallable,
        validating_effects: bool,
    ) -> AsyncIterator[Callable[[TaskEffect, TaskResponseOrStatus],
                                Awaitable[None]]]:
        """Helper that handles code generated task workflows.
        """
        raise NotImplementedError()
        yield  # Necessary for type checking.

    @abstractmethod
    @asynccontextmanager
    async def transaction(
        self,
        context: TransactionContext,
        state_type: type[StateT],
        transaction: Transaction,
        *,
        authorize: Optional[AuthorizeCallable],
        from_constructor: bool = False,
        requires_constructor: bool = False,
    ) -> AsyncIterator[tuple[StateT, Callable[[Effects], Awaitable[None]]]]:
        """Helper that handles code generated transactions. Performs necessary
        functionality to execute the transaction for the actor
        specified in the context.
        """
        raise NotImplementedError()
        yield  # Necessary for type checking.

    @abstractmethod
    async def check_for_idempotent_mutation(
        self,
        context: WriterContext | WorkflowContext | TransactionContext,
    ) -> Optional[database_pb2.IdempotentMutation]:
        """Helper for code generated writers and transactions that returns the
        serialized response if the mutation has been performed or None
        if the mutation has not been performed.
        """
        raise NotImplementedError()

    @abstractmethod
    async def load_task_response(
        self,
        task_id: tasks_pb2.TaskId,
    ) -> Optional[tuple[tasks_pb2.TaskResponseOrError, database_pb2.Task]]:
        """Loads the response for the given task. Returns None if the task is
        not yet complete. Throws if the task ID is not recognized.
        """
        raise NotImplementedError()

    @abstractmethod
    async def read(
        self,
        context: WorkflowContext,
        state_type: type[StateT],
    ) -> StateT:
        """Helper for reading the state within a transaction."""
        raise NotImplementedError()

    @abstractmethod
    async def recover(
        self,
        *,
        application_id: ApplicationId,
        channel_manager: _ChannelManager,
        middleware_by_state_type_name: dict[StateTypeName, Middleware],
    ) -> None:
        """Attempt to recover server state after a potential restart."""
        raise NotImplementedError()

    @abstractmethod
    async def transaction_participant_store(
        self,
        transaction: StateManager.Transaction,
    ) -> None:
        raise NotImplementedError()

    @abstractmethod
    async def transaction_participant_commit(
        self,
        transaction: StateManager.Transaction,
    ) -> None:
        raise NotImplementedError()

    @abstractmethod
    async def transaction_participant_abort(
        self,
        transaction: StateManager.Transaction,
    ) -> None:
        raise NotImplementedError()

    @abstractmethod
    async def colocated_range(
        self,
        context: Context,
        *,
        start: Optional[str] = None,
        end: Optional[str] = None,
        limit: int,
    ) -> list[tuple[str, bytes]]:
        """Gets a range of colocated data for the current state machine id.

        The start key is inclusive and the end key is exclusive. If either is
        unset, then the range is unbounded in that direction.

        Returns a list of (key, value) tuples.
        """
        raise NotImplementedError()

    @abstractmethod
    async def colocated_reverse_range(
        self,
        context: Context,
        *,
        start: Optional[str] = None,
        end: Optional[str] = None,
        limit: int,
    ) -> list[tuple[str, bytes]]:
        """Gets a reverse range of colocated data for the current state machine id.

        The start key is inclusive and the end key is exclusive. If either is
        unset, then the range is unbounded in that direction.

        Returns a list of (key, value) tuples.
        """
        raise NotImplementedError()


# There was a pretty serious bug in the semaphore
# implementation that meant that the semantics of semaphores
# was incorrect, in particular when there were waiters it
# would appears as though there were none. This would break
# out use case as described above, so we explicitly check the
# semantics here. Note that we do an explicit check rather
# than testing versions because this has been pulled into
# multiple versions and over time as we add support for other
# versions we decided it would be easier to just check for the
# semantics we expect.
#
# Bug: https://github.com/python/cpython/issues/90155
async def validate_semaphore_semantics():
    semaphore = asyncio.Semaphore()

    assertion_message = (
        "This release of Python suffers from a concurrency bug. "
        "Please update to a more recent release of Python! "
        "See https://github.com/python/cpython/issues/90155"
    )

    await semaphore.acquire()
    task = asyncio.create_task(semaphore.acquire())
    await asyncio.sleep(0)  # Yield to the task we just created.
    assert semaphore.locked(), assertion_message
    semaphore.release()
    assert semaphore.locked(), assertion_message
    await task
    assert semaphore.locked(), assertion_message
    semaphore.release()
    assert not semaphore.locked(), assertion_message


validate_semaphore_semantics_once = AsyncOnce(validate_semaphore_semantics)

validate_semaphore_semantics_once_task: asyncio.Task

# NOTE: we want to validate the semaphore semantics since
# we're using them and expecting the correct semantics for
# `self._participant_transactions_semaphore`.
try:
    loop = asyncio.get_running_loop()

    # NOTE: we're holding on to this task so that it doesn't get
    # destroyed while pending, unlikely, but possible.
    validate_semaphore_semantics_once_task = loop.create_task(
        validate_semaphore_semantics_once(),
        name=f'validate_semaphore_semantics_once() in {__name__}',
    )
except RuntimeError:
    asyncio.run(validate_semaphore_semantics_once())

# Default seconds we will wait to acquire one of the per-state locks
# before raising `Unavailable`.
LOCK_ACQUIRE_DEADLINE_DEFAULT_SECONDS = 30.0


class Lock:
    """Async per-state shared/exclusive lock with in-place upgrade.

    - `upgrade(...)` allows a caller that already holds `shared` to be
      promoted to `exclusive`. A caller can upgrade and skip other
      `exclusive` waiters, preserving the upgrading transaction's
      shared-consistent view of state. However, at most one upgrade
      may be pending per lock; a second `upgrade(...)` raises
      `SystemAborted(Unavailable())` immediately to avoid the deadlock
      where two shared holders both want to upgrade.

    - Waiters are FIFO among themselves and a new `shared` request
      does NOT jump the FIFO queue and join an active shared cohort if
      an exclusive waiter is queued, to guard against exclusive-waiter
      starvation.

    - Acquires that exceed `deadline` raise
      `SystemAborted(Unavailable())`; callers retry the surrounding
      transaction. Passing `deadline=None` means wait forever or until
      the task is cancelled.

    The lock is not `asyncio.Task` aware because it is meant to be
    used across multiple different calls on the same state, i.e.,
    across transactions. Instead, it tracks shared as a count and
    ensures a single exclusive holder.
    """

    Mode: TypeAlias = Literal["shared", "exclusive"]

    class _Waiter:

        __slots__ = ("mode", "future")

        def __init__(self, mode: Lock.Mode) -> None:
            self.mode = mode
            self.future: asyncio.Future[None] = (
                asyncio.get_event_loop().create_future()
            )

    def __init__(self) -> None:
        # Number of shared holders.
        self._shared: int = 0
        # `True` while a holder is in exclusive mode.
        self._exclusive: bool = False
        # Pending upgrader, if any.
        self._upgrader: Optional[Lock._Waiter] = None
        # FIFO of shared / exclusive waiters; new arrivals append, the
        # head is granted next.
        self._waiters: list[Lock._Waiter] = []

    def is_shared_locked(self) -> bool:
        return self._shared > 0

    def is_exclusive_locked(self) -> bool:
        return self._exclusive

    def is_locked(self) -> bool:
        """`True` if the lock is currently held in any mode."""
        return self.is_shared_locked() or self.is_exclusive_locked()

    async def acquire_shared(
        self,
        deadline_seconds: Optional[float] = (
            LOCK_ACQUIRE_DEADLINE_DEFAULT_SECONDS
        ),
    ) -> None:
        if self.try_acquire_shared():
            return
        await self._wait(mode="shared", deadline_seconds=deadline_seconds)

    async def acquire_exclusive(
        self,
        deadline_seconds: Optional[float] = (
            LOCK_ACQUIRE_DEADLINE_DEFAULT_SECONDS
        ),
    ) -> None:
        if self.try_acquire_exclusive():
            return
        await self._wait(mode="exclusive", deadline_seconds=deadline_seconds)

    async def upgrade(
        self,
        deadline_seconds: Optional[float] = (
            LOCK_ACQUIRE_DEADLINE_DEFAULT_SECONDS
        ),
    ) -> None:
        """Atomically promote a held shared hold to exclusive.

        Caller MUST already hold a shared hold. On success the
        shared hold is consumed and the caller now holds exclusive.
        On failure (another upgrade pending, or deadline exceeded),
        the caller still holds the shared.
        """
        assert self._shared > 0, (
            "upgrade() requires the caller to already hold shared"
        )
        # If we are the only shared holder, the upgrade is immediate.
        # (An upgrader pending here is impossible: an upgrader also
        # holds a shared, so `self._shared == 1` rules out any other
        # upgrader.)
        if self._shared == 1 and not self._exclusive:
            self._shared = 0
            self._exclusive = True
            return
        # Otherwise lets `_wait` as an upgrade.
        await self._wait(upgrade=True, deadline_seconds=deadline_seconds)

    def release_shared(self) -> None:
        assert self._shared > 0
        self._shared -= 1
        self._maybe_grant_next(released="shared")

    def release_exclusive(self) -> None:
        assert self._exclusive
        self._exclusive = False
        self._maybe_grant_next(released="exclusive")

    @asynccontextmanager
    async def shared(
        self,
        deadline_seconds: Optional[float] = (
            LOCK_ACQUIRE_DEADLINE_DEFAULT_SECONDS
        ),
    ) -> AsyncIterator[None]:
        await self.acquire_shared(deadline_seconds)
        try:
            yield
        finally:
            self.release_shared()

    @asynccontextmanager
    async def exclusive(
        self,
        deadline_seconds: Optional[float] = (
            LOCK_ACQUIRE_DEADLINE_DEFAULT_SECONDS
        ),
    ) -> AsyncIterator[None]:
        await self.acquire_exclusive(deadline_seconds)
        try:
            yield
        finally:
            self.release_exclusive()

    def try_acquire_shared(self) -> bool:
        if self._exclusive or self._upgrader is not None:
            return False
        # Exclusive-waiter-starvation guard.
        if any(waiter.mode == "exclusive" for waiter in self._waiters):
            return False
        self._shared += 1
        return True

    def try_acquire_exclusive(self) -> bool:
        if self._exclusive or self._shared > 0 or self._upgrader is not None:
            return False
        self._exclusive = True
        return True

    def _remove_waiter(self, waiter: Lock._Waiter) -> None:
        try:
            self._waiters.remove(waiter)
        except ValueError:
            pass

    @overload
    async def _wait(
        self,
        *,
        mode: Lock.Mode,
        deadline_seconds: Optional[float],
    ) -> None:
        ...

    @overload
    async def _wait(
        self,
        *,
        upgrade: Literal[True],
        deadline_seconds: Optional[float],
    ) -> None:
        ...

    async def _wait(
        self,
        *,
        mode: Optional[Lock.Mode] = None,
        upgrade: bool = False,
        deadline_seconds: Optional[float],
    ) -> None:
        """
        Construct a waiter and block until it is granted by
        `_maybe_grant_next`.
        """
        assert (mode is None) == upgrade
        if upgrade:
            mode = "exclusive"
        assert mode is not None

        waiter = Lock._Waiter(mode)

        if upgrade:
            if self._upgrader is not None:
                raise SystemAborted(
                    Unavailable(),
                    message=(
                        "Cannot upgrade shared lock to exclusive: "
                        "another transaction is already upgrading "
                        "the same state; retry the transaction."
                    ),
                )
            self._upgrader = waiter
        else:
            self._waiters.append(waiter)

        try:
            await asyncio.wait_for(waiter.future, timeout=deadline_seconds)
        except asyncio.TimeoutError:
            if upgrade:
                self._upgrader = None
            else:
                self._remove_waiter(waiter)
            raise SystemAborted(
                Unavailable(),
                message=(
                    f"Timed out waiting {deadline_seconds:.1f}s to "
                    f"{'upgrade to' if upgrade else 'acquire'} "
                    f"{mode} lock; retry the transaction."
                ),
            )
        except BaseException:
            # Cancellation or other exception, but we may have already
            # been granted and thus must release before re-raising.
            if (
                waiter.future.done() and not waiter.future.cancelled() and
                waiter.future.exception() is None
            ):
                if mode == "shared":
                    self.release_shared()
                else:
                    self.release_exclusive()
            elif upgrade:
                self._upgrader = None
            else:
                self._remove_waiter(waiter)
            raise

    def _maybe_grant_next(self, *, released: Lock.Mode) -> None:
        """Try to grant the next waiter(s) compatible with the
        current lock state.

        `released` documents which release happened so we can better
        capture the invariants that follow.
        """
        # Either we just released a shared hold or the exclusive hold,
        # either way there should not be an exclusive hold.
        assert not self._exclusive

        if self._upgrader is not None:
            # If we have an upgrader then we must have just released a
            # shared hold (because an upgrader should already have a
            # shared hold). An upgrader can be granted if there are no
            # other remaining shared holders, bypassing any queued
            # exclusive waiters.
            assert released == "shared"
            if self._shared == 1:
                upgrader = self._upgrader
                self._upgrader = None
                self._shared = 0
                self._exclusive = True
                if not upgrader.future.done():
                    upgrader.future.set_result(None)
            # While we have an upgrader nothing else gets granted.
            return

        # Nothing to do if we released a shared hold but still have
        # shared holders.
        if released == "shared" and self._shared > 0:
            return

        # Otherwise we just released exclusive or we just released the
        # last shared hold.
        assert released == "exclusive" or self._shared == 0

        # Grant waiters in FIFO ordering.
        while self._waiters:
            waiter = self._waiters[0]
            if waiter.mode == "exclusive":
                # We may have granted a shared waiter below if the
                # _first_ waiter was not exclusive and thus we've now
                # hit an exclusive waiter and need to return.
                if self._shared > 0:
                    return
                self._waiters.pop(0)
                self._exclusive = True
                if not waiter.future.done():
                    waiter.future.set_result(None)
                return
            # mode == "shared"
            self._waiters.pop(0)
            self._shared += 1
            if not waiter.future.done():
                waiter.future.set_result(None)
            # Continue granting a cohort of shared waiters up until
            # the first exclusive waiter.


class BloomFilter:
    """
    Copied from https://github.com/richard-rogers/pybloom3. We're not
    using pybloom3 (or one of its forks) because they are scantly
    maintained and we need to modify it sufficiently enough that
    extending it is not trivial.

    TODO: move this into a generic place if/when we determine that it
    is not overly specific to our use for idempotent mutations.
    """

    def __init__(self, capacity: int, error_rate: float):
        if not capacity > 0:
            raise ValueError("`capacity` must be > 0")
        self._capacity = capacity

        if not (0 < error_rate < 1):
            raise ValueError("`error_rate` must be between 0 and 1")
        self._error_rate = error_rate

        # Given:
        #
        # M = num_bits
        # k = num_slices
        # P = error_rate
        # n = capacity
        # k = log2(1/P)
        #
        # Solving for m = bits_per_slice:
        #
        # n ~= M * ((ln(2) ** 2) / abs(ln(P)))
        # n ~= (k * m) * ((ln(2) ** 2) / abs(ln(P)))
        # m ~= n * abs(ln(P)) / (k * (ln(2) ** 2))
        num_slices = int(math.ceil(math.log(1.0 / error_rate, 2)))
        bits_per_slice = int(
            math.ceil(
                (capacity * abs(math.log(error_rate))) /
                (num_slices * (math.log(2)**2))
            )
        )

        self._num_slices = num_slices
        self._bits_per_slice = bits_per_slice
        self._num_bits = num_slices * bits_per_slice

        self._count = 0

        self._make_hashes = BloomFilter.make_hashfuncs(
            self._num_slices,
            self._bits_per_slice,
        )

        self._bitarray = bitarray.bitarray(self._num_bits, endian="little")
        self._bitarray.setall(0)

    @classmethod
    def make_hashfuncs(cls, num_slices: int, num_bits: int):
        if num_bits >= (1 << 31):
            fmt_code, chunk_size = 'Q', 8
        elif num_bits >= (1 << 15):
            fmt_code, chunk_size = 'I', 4
        else:
            fmt_code, chunk_size = 'H', 2
        total_hash_bits = 8 * num_slices * chunk_size
        if total_hash_bits > 384:
            hashfn = hashlib.sha512
        elif total_hash_bits > 256:
            hashfn = hashlib.sha384
        elif total_hash_bits > 160:
            hashfn = hashlib.sha256
        elif total_hash_bits > 128:
            hashfn = hashlib.sha1
        else:
            hashfn = hashlib.md5
        fmt = fmt_code * (hashfn().digest_size // chunk_size)
        num_salts, extra = divmod(num_slices, len(fmt))
        if extra:
            num_salts += 1
        salts = tuple(
            hashfn(hashfn(pack('I', i)).digest()) for i in range(num_salts)
        )

        def _make_hashfuncs(key: bytes):
            assert isinstance(key, bytes)
            i = 0
            for salt in salts:
                h = salt.copy()
                h.update(key)
                for uint in unpack(fmt, h.digest()):
                    yield uint % num_bits
                    i += 1
                    if i >= num_slices:
                        return

        return _make_hashfuncs

    def __contains__(self, key: bytes):
        """Tests a key's membership in this bloom filter."""
        hashes = self._make_hashes(key)
        offset = 0
        for k in hashes:
            if not self._bitarray[offset + k]:
                return False
            offset += self._bits_per_slice
        return True

    def __len__(self):
        """Return the number of keys stored by this bloom filter."""
        return self._count

    @property
    def capacity(self):
        """Return the capacity of this bloom filter."""
        return self._capacity

    @property
    def error_rate(self):
        """Return the error rate of this bloom filter."""
        return self._error_rate

    def add(self, key: bytes, *, skip_check: bool = False):
        """
        Adds a key to this bloom filter. If the key already exists in this
        filter it will return True. Otherwise False.
        """
        # If we're not checking for presence while adding then we need
        # to prematurely fail if we're at capacity, even if the item
        # we're adding may already be present. If we are checking for
        # presence, then we can defer failing until we determine that
        # we are indeed adding to the filter.
        if skip_check and self._count == self._capacity:
            raise IndexError("`BloomFilter` is at capacity")

        hashes = self._make_hashes(key)
        found_all_bits = True
        offset = 0

        for k in hashes:
            if (
                not skip_check and found_all_bits and
                not self._bitarray[offset + k]
            ):
                found_all_bits = False
                if self._count == self._capacity:
                    raise IndexError("`BloomFilter` is at capacity")
            self._bitarray[offset + k] = True
            offset += self._bits_per_slice

        if skip_check or not found_all_bits:
            self._count += 1
            return False
        else:
            return True


class ScalableBloomFilter:

    # We'll scale up the bloom filters to maximum 1,000,000 entries
    # with an error rate of 0.0000001 (which will provide a
    # probability of 1 in 9,994,083) since that is ~4MB which is a
    # good size for reading/writing rocksdb values.
    MAX_CAPACITY = 1_000_000
    INITIAL_CAPACITY = 100
    ERROR_RATE = 0.0000001
    # In order to have an error rate of 0.0000001 even as we add bloom
    # filters we need to adjust the error rate of each added bloom
    # filter so that the sum of the error rates converge to
    # 0.0000001. We do that with a gentle tightening ratio of 0.9
    # because we're not sure how many filters we may need to add.
    TIGHTENING_RATIO = 0.9

    def __init__(self):
        self._filters = [
            BloomFilter(
                capacity=self.INITIAL_CAPACITY,
                error_rate=self.ERROR_RATE,
            )
        ]

    def __contains__(self, key: bytes):
        for filter in reversed(self._filters):
            if key in filter:
                return True
        return False

    def add(self, key: bytes):
        if key in self:
            return True

        filter = self._filters[-1]

        # Add another filter if we've run out of capacity.
        if len(filter) == filter.capacity:
            filter = BloomFilter(
                # Increase the capacity 10x, unless we're already at
                # 1,000,000 entries, in which case keep it that size.
                capacity=(
                    filter.capacity if filter.capacity == self.MAX_CAPACITY
                    else filter.capacity * 10
                ),
                # Adjust the error rate with a tightening ratio so we
                # converge on our desired overall error rate.
                error_rate=filter.error_rate * self.TIGHTENING_RATIO,
            )
            self._filters.append(filter)

        filter.add(
            key,
            # We skip the check because we know that the key is not in
            # the filter (or this is a brand new _empty_ filter).
            skip_check=True,
        )

        return False


class IdempotentMutations:
    """
    Tracks idempotent mutations for a specific state.

    Uses a bloom filter to avoid unnecessary database lookups.
    The bloom filter is populated in two phases:

    1. Initial recovery (per `state_ref`): recovers non-expiring
       and unexpired expiring mutations (no workflow-scoped ones).

    2. On-demand workflow recovery: the first time we look up a
       mutation with a particular `workflow_id`, we bulk-recover
       all mutations for that (`state_ref`, `workflow_id`) pair and
       add them to the bloom filter.

    After both phases, the bloom filter either tells us an idempotent
    mutation is "definitely not in the set" and thus no database query
    is needed, or else is "possibly in the set" meaning we need to
    query the database for the specific key.
    """

    def __init__(
        self,
        *,
        state_type_name: StateTypeName,
        state_ref: StateRef,
        database_client: DatabaseClient,
        idempotent_mutations: list[database_pb2.IdempotentMutation],
    ):
        self._state_type_name = state_type_name
        self._state_ref = state_ref
        self._database_client = database_client

        self._bloom_filter = ScalableBloomFilter()

        # Track which workflow IDs have been bulk-recovered
        # into the bloom filter so we only do it once per
        # workflow.
        self._recovered_workflow_ids: set[uuid.UUID] = set()

        # Track which (workflow_id, iteration) pairs have been
        # bulk-recovered so we only do it once per pair.
        self._recovered_workflow_iterations: set[tuple[uuid.UUID, int]] = set()

        for idempotent_mutation in idempotent_mutations:
            self._add_to_bloom_filter(idempotent_mutation)

    @staticmethod
    def _make_bloom_key(
        idempotency_key_bytes: bytes,
        workflow_id_bytes: Optional[bytes] = None,
        workflow_iteration: Optional[int] = None,
    ) -> bytes:
        """
        Returns a composite bloom filter key that includes the workflow ID
        bytes and optional iteration (as bytes, when present) to
        properly scope per workflow/iteration.
        """
        key = idempotency_key_bytes
        if workflow_id_bytes is not None:
            key = workflow_id_bytes + key
        if workflow_iteration is not None:
            key = workflow_iteration.to_bytes(8, byteorder="big") + key
        return key

    def _add_to_bloom_filter(
        self,
        idempotent_mutation: database_pb2.IdempotentMutation,
    ) -> None:
        """Add an idempotent mutation to the bloom filter."""
        bloom_key = self._make_bloom_key(
            idempotent_mutation.key,
            idempotent_mutation.workflow_id
            if idempotent_mutation.HasField("workflow_id") else None,
            idempotent_mutation.workflow_iteration
            if idempotent_mutation.HasField("workflow_iteration") else None,
        )
        self._bloom_filter.add(bloom_key)

    @classmethod
    async def recover(
        cls,
        state_type_name: StateTypeName,
        state_ref: StateRef,
        database_client: DatabaseClient,
    ) -> IdempotentMutations:
        response = await database_client.recover_idempotent_mutations(
            state_type_name,
            state_ref,
        )
        return cls(
            state_type_name=state_type_name,
            state_ref=state_ref,
            database_client=database_client,
            idempotent_mutations=response.idempotent_mutations,
        )

    async def _recover_workflow(self, workflow_id: uuid.UUID) -> None:
        """
        Bulk-recover all idempotent mutations for a specific workflow and
        add them to the bloom filter. Only done once per
        `workflow_id`.
        """
        if workflow_id in self._recovered_workflow_ids:
            return

        response = await self._database_client.recover_idempotent_mutations(
            self._state_type_name,
            self._state_ref,
            workflow_id=workflow_id,
        )

        for idempotent_mutation in response.idempotent_mutations:
            self._add_to_bloom_filter(idempotent_mutation)

        self._recovered_workflow_ids.add(workflow_id)

    async def _recover_workflow_iteration(
        self,
        workflow_id: uuid.UUID,
        workflow_iteration: int,
    ) -> None:
        """
        Bulk-recover all idempotent mutations for a specific
        (workflow, iteration) pair and add them to the bloom filter.
        Only done once per pair.
        """
        key = (workflow_id, workflow_iteration)
        if key in self._recovered_workflow_iterations:
            return

        response = await self._database_client.recover_idempotent_mutations(
            self._state_type_name,
            self._state_ref,
            workflow_id=workflow_id,
            workflow_iteration=workflow_iteration,
        )

        for idempotent_mutation in response.idempotent_mutations:
            self._add_to_bloom_filter(idempotent_mutation)

        self._recovered_workflow_iterations.add(key)

    def complete_workflow_iteration(
        self,
        workflow_id: uuid.UUID,
        iteration: int,
    ) -> None:
        """Remove the tracking entry for a completed iteration.
        Once an iteration advances, its mutations will never be
        queried again.
        """
        self._recovered_workflow_iterations.discard(
            (
                workflow_id,
                iteration,
            ),
        )

    def complete_workflow(self, workflow_id: uuid.UUID) -> None:
        """Remove all tracking entries for a completed workflow.
        Called when the task is marked COMPLETED so the sets
        don't grow unboundedly.
        """
        self._recovered_workflow_ids.discard(workflow_id)

    async def get(
        self,
        idempotency_key: uuid.UUID,
        *,
        workflow_id: Optional[uuid.UUID] = None,
        workflow_iteration: Optional[int] = None,
    ) -> Optional[database_pb2.IdempotentMutation]:
        if workflow_id is not None and workflow_iteration is not None:
            # Ensure we've recovered this iteration's mutations
            # into the bloom filter.
            await self._recover_workflow_iteration(
                workflow_id,
                workflow_iteration,
            )
        elif workflow_id is not None:
            # Ensure we've recovered this workflow's mutations
            # into the bloom filter.
            await self._recover_workflow(workflow_id)

        # Check bloom filter.
        bloom_key = self._make_bloom_key(
            idempotency_key.bytes,
            workflow_id.bytes if workflow_id is not None else None,
            workflow_iteration,
        )

        if bloom_key in self._bloom_filter:
            response = await self._database_client.recover_idempotent_mutations(
                self._state_type_name,
                self._state_ref,
                idempotency_key=idempotency_key,
                workflow_id=workflow_id,
                workflow_iteration=workflow_iteration,
            )

            if len(response.idempotent_mutations) > 0:
                assert len(response.idempotent_mutations) == 1
                # TODO: cache the idempotent mutation.
                return response.idempotent_mutations[0]

        # Backwards compatibility: mutations stored before
        # workflow-scoped idempotent mutations were added will be
        # under a non-workflow key. If this is for a workflow but we
        # haven't found the idempotent mutation fall back to a
        # non-workflow lookup.
        if workflow_id is not None:
            return await self.get(idempotency_key)

        return None

    def __setitem__(
        self,
        idempotency_key: uuid.UUID,
        idempotent_mutation: database_pb2.IdempotentMutation,
    ):
        self._add_to_bloom_filter(idempotent_mutation)
        # TODO: cache the idempotent mutation.

    def update(
        self,
        idempotent_mutations: dict[uuid.UUID, database_pb2.IdempotentMutation],
    ):
        for idempotent_mutation in idempotent_mutations.values():
            self._add_to_bloom_filter(idempotent_mutation)
            # TODO: cache the idempotent mutations.


class SidecarStateManager(
    StateManager,
    transactions_pb2_grpc.CoordinatorServicer,
    transactions_pb2_grpc.ParticipantServicer,
):
    """Implementation of state manager that stores data using the sidecar.

    SidecarStateManager also implements both the coordinator and
    participant interfaces for performing transactions.
    """

    def __init__(
        self,
        *,
        database_address: str,
        serviceables: list[Serviceable],
        shards: list[database_pb2.ShardInfo],
        placement_client: PlacementClient,
        application_id: ApplicationId,
    ) -> None:
        self._database_client = DatabaseClient(database_address)
        self._shards = shards
        self._placement_client = placement_client
        self._application_id = application_id

        self._state_type_by_state_tag: dict[str, StateTypeName] = {}

        for serviceable in serviceables:
            # Filter out legacy gRPC serviceables.
            if isinstance(serviceable, RebootServiceable):
                tag = state_type_tag_for_name(serviceable.state_type_name())
                self._state_type_by_state_tag[tag
                                             ] = serviceable.state_type_name()

        # Is this state manager shutting down?
        self._shutting_down = False

        # A way to get notified when the list of actors under management
        # may have changed.
        self._actors_list_maybe_changed_events: list[asyncio.Event] = []

        # TODO(benh): add a helper class, e.g., ActorData, that
        # encapsulates all of '_states', '_locks', etc.
        self._states: defaultdict[StateTypeName,
                                  dict[StateRef,
                                       Message]] = defaultdict(lambda: {})

        # A "mutator" is either a writer or a transaction. Now a
        # read/write lock so that read-only transactions on the same
        # state can run concurrently while writers and write-mode
        # transactions remain exclusive.
        #
        # TODO(benh): replace this with a semaphore so that we can
        # free up memory for state_types, actors that are no longer
        # active.
        self._locks: defaultdict[StateTypeName, defaultdict[
            StateRef, Lock]] = defaultdict(lambda: defaultdict(Lock))

        # Transactions that actors of this state manager are
        # participating in. Each `(state_type, state_ref)` may have
        # multiple concurrent read-mode transactions or at most one
        # write-mode transaction; the inner dict is keyed by
        # `transaction.root_id` so callers look up "their" transaction
        # by `context.transaction_root_id`.
        self._participant_transactions: defaultdict[StateTypeName, dict[
            StateRef, dict[
                uuid.UUID,
                StateManager.Transaction,
            ]]] = defaultdict(lambda: {})

        # Map from transaction UUID to a Future with the
        # participants of the transaction that have been prepared, or
        # that all need to be aborted, for all transactions being
        # coordinated by this state manager.
        #
        # TODO(benh): need to remove these from this list after some
        # expiration timeout, or better yet, run a control loop that
        # forever tries to complete the commit phase and only
        # afterwards removes this from the list (and from rocksdb).
        self._coordinator_participants: dict[
            uuid.UUID,
            asyncio.Future[Participants],
        ] = {}

        # Coordinator "commit control loop" tasks for transactions
        # that have been prepared.
        self._coordinator_commit_control_loop_tasks: dict[uuid.UUID,
                                                          asyncio.Task] = {}

        # When a writer is invoked from within a transaction only we
        # will abstain from taking the mutator lock but we still
        # want to only execute one writer at a time which we ensure by
        # having each writer within a transaction take a sublock.
        self._transaction_writer_locks: defaultdict[StateTypeName, defaultdict[
            StateRef,
            asyncio.Lock]] = defaultdict(lambda: defaultdict(asyncio.Lock))

        self._loads: defaultdict[StateTypeName,
                                 dict[StateRef,
                                      asyncio.Event]] = defaultdict(dict)

        # Futures for state preloads. `preload()` creates a future
        # that resolves with `Optional[bytes]` (raw data, or `None` if
        # the state doesn't exist). `_load()` pops the future and
        # awaits it before falling back to its own call into the
        # database.
        #
        # NOTE: we've kept the original `_loads` events separate from
        # `_state_preloads` futures to simplify the addition of the
        # preload feature.
        self._state_preloads: defaultdict[
            StateTypeName,
            dict[StateRef, asyncio.Future[Optional[bytes]]],
        ] = defaultdict(dict)

        # Futures for calls to the database to recovery idempotent
        # mutations. `preload()` creates a future that resolves with
        # the idempotent mutations; `check_for_idempotent_mutation()`
        # also creates a future so concurrent callers await it instead
        # of doing their own recovery but they resolve with `None` to
        # signal to concurrent callers that nothing else needs to be
        # done.
        #
        # Unlike for state loading, for idempotent mutations we
        # combined load and preload into a single future because there
        # was no pre-existing mechanism like there was for state
        # loading (although arguably that was a bug).
        self._idempotent_mutations_loads: defaultdict[
            StateTypeName,
            dict[
                StateRef,
                asyncio.Future[Optional[list[database_pb2.
                                             IdempotentMutation]]],
            ],
        ] = defaultdict(dict)

        # Strong references to in-flight preload tasks. The asyncio
        # event loop only keeps weak references to tasks, so a task
        # created via `asyncio.create_task()` without a strong
        # reference may be garbage collected mid-flight. We hold the
        # tasks here and discard them via `add_done_callback` once
        # they complete.
        self._preload_tasks: set[asyncio.Task] = set()

        # Any streaming readers. We're explicitly using a 'dict' as
        # the value instead of a 'defaultdict' because we don't want
        # to construct memory every time we "check" if there is a
        # queue of streaming readers. That could be a lot of empty
        # queues because we check for streaming readers on _every_
        # write!
        self._streaming_readers: defaultdict[StateTypeName, dict[
            StateRef,
            list[asyncio.Queue[_StreamingReaderItem]]]] = defaultdict(dict)

        # Idempotent mutations per state type, state ref, idempotency key.
        self._idempotent_mutations: defaultdict[StateTypeName, dict[
            StateRef, IdempotentMutations]] = defaultdict(dict)

        # Recovery timestamp from the database, set during
        # `recover()`. Represents the database's clock reading
        # when this server recovered. Used for restart detection.
        self._recovery_timestamp_ms: Optional[int] = None

        # Latest timestamp from the database, updated by
        # piggybacked responses and periodic refresh. Used for
        # UUID7 transaction ID generation.
        self._latest_timestamp_ms: Optional[int] = None

        # Event used to cancel and restart the periodic refresh
        # timer when a piggybacked timestamp is received.
        self._timestamp_refresh_event = asyncio.Event()

        # Task for the periodic timestamp refresh loop.
        self._timestamp_refresh_task: Optional[asyncio.Task] = None

    @property
    def latest_timestamp_ms(self) -> Optional[int]:
        return self._latest_timestamp_ms

    def _lookup_participant_transactions(
        self,
        state_type: StateTypeName,
        state_ref: StateRef,
    ) -> dict[uuid.UUID, StateManager.Transaction]:
        """Returns the transactions currently joined on `(state_type,
        state_ref)`, keyed by their `root_id`. Returns an empty dict
        if none. Never inserts a new entry.
        """
        return self._participant_transactions[state_type].get(state_ref, {})

    def _lookup_participant_transaction(
        self,
        state_type: StateTypeName,
        state_ref: StateRef,
        transaction_root_id: uuid.UUID,
    ) -> Optional[StateManager.Transaction]:
        """Lookup a single transaction by its root id on `(state_type,
        state_ref)`. Returns `None` if absent.
        """
        return self._lookup_participant_transactions(
            state_type,
            state_ref,
        ).get(transaction_root_id)

    def _complete_participant_transaction(
        self,
        state_type: StateTypeName,
        state_ref: StateRef,
        transaction: StateManager.Transaction,
    ) -> None:
        """Pop the transaction from `_participant_transactions` and
        release the mutator lock in the mode the transaction held it.
        """
        transactions = self._participant_transactions[state_type].get(
            state_ref
        )
        assert transactions is not None, (
            f"No participant transactions for "
            f"'{state_type}'/'{state_ref.id}'"
        )
        popped = transactions.pop(transaction.root_id, None)
        assert popped is transaction, (
            f"Participant transaction '{transaction.root_id}' for "
            f"'{state_type}'/'{state_ref.id}' was not the one we "
            "expected to remove"
        )
        if len(transactions) == 0:
            del self._participant_transactions[state_type][state_ref]

        lock = self._locks[state_type][state_ref]
        if transaction.mode == "exclusive":
            lock.release_exclusive()
        else:
            lock.release_shared()

    def _can_use_restart_detection(
        self,
        root_transaction_id: uuid.UUID,
        state_type: StateTypeName,
    ) -> bool:
        """Return whether restart detection can be used for this transaction
        to optimize performance.

        Restart detection requires all of:

        1. A recovery timestamp from the database (i.e., the database
           supports timestamps).

        2. A UUIDv7 root transaction ID (which embeds a
           timestamp). UUIDv4 transactions (from older coordinators
           that don't yet generate UUIDv7 IDs) don't carry a
           timestamp, so we can't compare against the recovery
           timestamp.

        3. A state type that is not `SortedMap`. `SortedMap`
           operations use `colocated_[reverse_]range()` which reads
           from RocksDB within the transaction, requiring the RocksDB
           transaction to have been started at join time. See
           https://github.com/reboot-dev/mono/issues/4019.
        """
        return (
            self._recovery_timestamp_ms is not None and
            root_transaction_id.version == 7 and
            state_type != SORTED_MAP_TYPE_NAME
        )

    def _update_latest_timestamp(
        self,
        timestamp: Optional[Timestamp],
        *,
        from_refresh: bool = False,
    ) -> None:
        """Update the latest database timestamp if newer. Also
        resets the periodic refresh countdown (unless this update
        is from the refresh loop itself).
        """
        if timestamp is None:
            return
        timestamp_ms = timestamp.ToMilliseconds()
        if (
            self._latest_timestamp_ms is None or
            timestamp_ms > self._latest_timestamp_ms
        ):
            self._latest_timestamp_ms = timestamp_ms
        # Reset the periodic refresh countdown since we just
        # got a fresh timestamp (unless this call IS from the
        # refresh loop itself).
        if not from_refresh:
            self._timestamp_refresh_event.set()

    async def _refresh_timestamp_loop(
        self,
        interval_seconds: float = 2.0,
    ) -> None:
        """Periodically fetch the latest timestamp from the database. The
        timer resets each time a piggybacked timestamp is received, so
        the periodic RPC only fires after `interval_seconds` of
        complete idleness.
        """
        while not self._shutting_down:
            self._timestamp_refresh_event.clear()
            try:
                # Wait `interval_seconds`, but can be cancelled early
                # by `_update_latest_timestamp()` setting the event.
                await asyncio.wait_for(
                    self._timestamp_refresh_event.wait(),
                    timeout=interval_seconds,
                )
                # Event was set, i.e., we got a piggybacked timestamp
                # so restart the countdown (no RPC needed).
                continue
            except asyncio.TimeoutError:
                # `interval_seconds` have elapsed. Do the refresh RPC.
                pass
            try:
                timestamp = await self._database_client.refresh_timestamp()
                self._update_latest_timestamp(timestamp, from_refresh=True)
            except Exception:
                # Best effort; retry next interval.
                pass

    async def shutdown(self) -> None:
        """Shuts down this state manager, which includes cancellation of
        background tasks.
        """
        # Tell new coordinator commit control loops that may be created while
        # we're working on shutting down that we are, in fact, shutting down.
        # They will get cancelled immediately after creation.
        self._shutting_down = True

        # Cancel the periodic timestamp refresh task.
        if self._timestamp_refresh_task is not None:
            self._timestamp_refresh_task.cancel()

        # Cancel all previously created coordinator commit control loops.
        for task in self._coordinator_commit_control_loop_tasks.values():
            task.cancel()

        # Cancel all participant watch tasks.
        for state_type_transactions in self._participant_transactions.values():
            for transactions in state_type_transactions.values():
                for transaction in transactions.values():
                    if transaction.watch_task is not None:
                        transaction.watch_task.cancel()

    async def wait(self) -> None:
        """Waits for this state manager to be fully shut down."""
        for task in self._coordinator_commit_control_loop_tasks.values():
            try:
                await task
            except asyncio.CancelledError:
                pass

        # Wait for all participant watch tasks to complete.
        for state_type_transactions in self._participant_transactions.values():
            for transactions in state_type_transactions.values():
                for transaction in transactions.values():
                    if transaction.watch_task is not None:
                        try:
                            await transaction.watch_task
                        except asyncio.CancelledError:
                            pass

    async def shutdown_and_wait(self):
        await self.shutdown()
        await self.wait()

    async def actors(
        self,
        state_type: StateTypeName,
    ) -> AsyncIterator[list[StateRef]]:
        """Override of StateManager.actors() for
        SidecarStateManager.
        """
        event = asyncio.Event()
        self._actors_list_maybe_changed_events.append(event)
        try:
            while True:
                # Make a call to the sidecar to get the list of actors
                # of the given type. This avoids us having to have a
                # full list of all actor IDs in memory.
                yield await self._database_client.find(
                    state_type,
                    # TODO(rjh): returning all actors IDs is not very
                    #            scalable. Instead, we should take
                    #            parameters from the caller about which
                    #            actors they're interested in, and what
                    #            they want the limit to be.
                    start_id="",
                    limit=2**32 - 1,  # Max for proto `uint32`.
                    shard_ids=[shard.shard_id for shard in self._shards],
                )

                await event.wait()
                event.clear()
        except Exception as e:
            logger.error(
                "Error in actors() generator: %s",
                e,
                exc_info=True,
            )
            raise
        finally:
            self._actors_list_maybe_changed_events.remove(event)

    async def export_items(
        self, state_type: StateTypeName
    ) -> AsyncIterator[database_pb2.ExportItem]:
        shard_ids = [shard.shard_id for shard in self._shards]
        async for item in self._database_client.export(state_type, shard_ids):
            yield item

    async def import_task(
        self,
        state_type: StateTypeName,
        state_ref: StateRef,
        task: database_pb2.Task,
        middleware: Middleware,
        *,
        sync: bool = True,
    ) -> None:
        async with self._locks[state_type][state_ref].exclusive(
            deadline_seconds=None
        ):
            pending_task_effect = (
                None if task.status == database_pb2.Task.Status.COMPLETED else
                self._get_task_effect_from_sidecar_task(middleware, task)
            )
            if pending_task_effect is not None:
                await middleware.tasks_dispatcher.validate(
                    [pending_task_effect]
                )
            await self._store(
                state_type=state_type,
                state_ref=state_ref,
                task=task,
                sync=sync,
            )
            if pending_task_effect is not None:
                middleware.tasks_dispatcher.dispatch([pending_task_effect])

    async def import_actor(
        self,
        state_type: StateTypeName,
        state_ref: StateRef,
        state: Message,
        *,
        sync: bool = True,
    ) -> None:
        async with self._locks[state_type][state_ref].exclusive(
            deadline_seconds=None
        ):
            await self._store(
                state_type=state_type,
                state_ref=state_ref,
                effects=Effects(state=state),
                sync=sync,
            )

    async def import_sorted_map_entry(
        self,
        state_type: StateTypeName,
        state_ref: StateRef,
        state: bytes,
        actor_converters: ExportImportItemConverters,
        *,
        sync: bool = True,
    ) -> None:
        # TODO: We do not support directly inserting a
        # SORTED_MAP_ENTRY_TYPE_NAME as a Message, so it must be stored
        # via colocated_upserts. See #2983.
        if state_type != SORTED_MAP_ENTRY_TYPE_NAME:
            raise ValueError(f"Unexpected raw state of type `{state_type}`.")
        components = state_ref.components()
        if len(components) != 2:
            raise ValueError(
                f"Expected compound key for state of type `{state_type}`. "
                f"Got: {state_ref}"
            )

        # We execute the colocated_upsert under the parent actor's lock.
        state_type = SORTED_MAP_TYPE_NAME
        state_ref = components[0]
        state_id = components[1].id
        if not state_ref.matches_state_type(SORTED_MAP_TYPE_NAME):
            raise ValueError(
                f"Parent state type of `{SORTED_MAP_ENTRY_TYPE_NAME}` must "
                f"be `{SORTED_MAP_TYPE_NAME}`."
            )
        effects = Effects(
            # TODO: This is unfortunate: we'd like to be able to insert the
            # colocated value without also storing a state for the SortedMap
            # itself. But the Effects type does not allow for that currently,
            # and would need changing to support fine-grained invalidation
            # for colocated upserts. See #3328.
            state=actor_converters.get_message(SORTED_MAP_TYPE_NAME),
            _colocated_upserts=[(state_id, state)],
        )

        async with self._locks[state_type][state_ref].exclusive(
            deadline_seconds=None
        ):
            await self._store(
                state_type=state_type,
                state_ref=state_ref,
                effects=effects,
                sync=sync,
            )

    async def import_idempotent_mutation(
        self,
        state_type: StateTypeName,
        state_ref: StateRef,
        idempotent_mutation: database_pb2.IdempotentMutation,
        *,
        sync: bool = True,
    ) -> None:
        async with self._locks[state_type][state_ref].exclusive(
            deadline_seconds=None
        ):
            # Recover idempotent mutations before trying to import any
            # since there is an invariant that we won't do a store on
            # a state before recovering its idempotent mutations.
            if state_ref not in self._idempotent_mutations[state_type]:
                # NOTE: we assume that an import is done before any
                # other concurrent calls and thus we don't bother with
                # `self._idempotent_mutations_loads` machinery here.
                self._idempotent_mutations[state_type][state_ref] = (
                    await IdempotentMutations.recover(
                        state_type,
                        state_ref,
                        self._database_client,
                    )
                )

            await self._store(
                state_type=state_type,
                state_ref=state_ref,
                idempotent_mutation=idempotent_mutation,
                sync=sync,
            )

    @function_span()
    async def _maybe_authorize(
        self,
        authorize: Optional[AuthorizeCallable],
        state: Optional[StateT],
    ) -> None:
        if not authorize:
            return

        if state is not None:
            # TODO: If we can read-only a state object we can avoid a copy here.
            state_copy = type(state)()
            state_copy.CopyFrom(state)
            state = state_copy

        await authorize(state)

    def preload(
        self,
        state_type_name: StateTypeName,
        state_ref: StateRef,
    ) -> None:
        """Fire a `Preload` RPC to load both state and idempotent
        mutations in a single round-trip to the database. This is a
        fire-and-forget optimization that returns immediately; the
        actual RPC runs as a background task.

        Results are delivered via futures in `_state_preloads` and
        `_idempotent_mutations_loads`. `_load()` and
        `check_for_idempotent_mutation()` await these futures before
        falling back to their own RPCs.

        If state or idempotent mutations are already cached or already
        being loaded, this call is a no-op.

        Unconsumed futures are auto-cleaned after 60 seconds. The
        cleanup uses future identity so a stale timer never evicts a
        newer preload's data.
        """
        # Only try and load state if it's not already cached, not
        # already being loaded, or not already preloaded.
        state_future: Optional[asyncio.Future[Optional[bytes]]] = None
        if (
            state_ref not in self._states[state_type_name] and
            state_ref not in self._loads[state_type_name] and
            state_ref not in self._state_preloads[state_type_name]
        ):
            state_future = asyncio.get_event_loop().create_future()
            self._state_preloads[state_type_name][state_ref] = state_future

        # Only try and load idempotent mutations similarly.
        idempotent_mutations_future: Optional[asyncio.Future[Optional[list[
            database_pb2.IdempotentMutation]]]] = None
        if (
            state_ref not in self._idempotent_mutations[state_type_name] and
            state_ref not in self._idempotent_mutations_loads[state_type_name]
        ):
            idempotent_mutations_future = (
                asyncio.get_event_loop().create_future()
            )
            self._idempotent_mutations_loads[state_type_name][
                state_ref] = idempotent_mutations_future

        if state_future is None and idempotent_mutations_future is None:
            # Nothing to preload!
            return

        async def _preload():
            try:
                response = await self._database_client.preload(
                    state_type_name,
                    state_ref,
                    skip_state=state_future is None,
                    skip_idempotent_mutations=(
                        idempotent_mutations_future is None
                    ),
                )
                if response.HasField("timestamp"):
                    self._update_latest_timestamp(response.timestamp)
                if state_future is not None:
                    state_future.set_result(
                        response.actor.state if response.
                        HasField("actor") else None
                    )
                if idempotent_mutations_future is not None:
                    idempotent_mutations_future.set_result(
                        response.idempotent_mutations
                    )
                # Wait 60 seconds for any consumer to come along and
                # pop the futures, otherwise we'll pop them ourselves
                # in the `finally`. This allows a method call that
                # starts a preload but then gets cancelled, e.g., due
                # to a network issue, can retry and consume the
                # preload it previously started.
                await asyncio.sleep(60)
            except asyncio.CancelledError:
                # Don't swallow cancellations, so the parent
                # task can be cancelled properly.
                raise
            except:
                # Preloading is best-effort, so just set an exception
                # to signal to any waiters that they should try and
                # load themselves. We use `set_exception()` (not
                # `cancel()`) so consumers can distinguish when they
                # are cancelled.
                error = RuntimeError("Preload failed")
                if state_future is not None and not state_future.done():
                    state_future.set_exception(error)
                if (
                    idempotent_mutations_future is not None and
                    not idempotent_mutations_future.done()
                ):
                    idempotent_mutations_future.set_exception(error)
            finally:
                # Clean up any unconsumed futures. Identity check
                # ensures we only pop our own future, not a newer
                # preload's since we might have waited for 60 seconds.
                if (
                    state_future is not None and
                    self._state_preloads[state_type_name].get(state_ref)
                    is state_future
                ):
                    del self._state_preloads[state_type_name][state_ref]
                if (
                    idempotent_mutations_future is not None and
                    self._idempotent_mutations_loads[state_type_name].
                    get(state_ref) is idempotent_mutations_future
                ):
                    del self._idempotent_mutations_loads[state_type_name][
                        state_ref]

        # Save a strong reference to the task so the GC doesn't
        # collect it mid-flight; discard once it completes.
        preload_task = asyncio.create_task(_preload())
        self._preload_tasks.add(preload_task)
        preload_task.add_done_callback(self._preload_tasks.discard)

    @function_span()
    async def _load(
        self,
        context: Context,
        state_type: type[StateT],
        *,
        authorize: Optional[AuthorizeCallable],
        from_reader: bool = False,
        from_constructor: bool = False,
        requires_constructor: bool = False,
    ) -> StateT:
        """Private helper for loading state from the sidecar.

        Code should use reader(), writer(), or streaming_reader(), not
        _load() directly.
        """
        state_type_name = context.state_type_name
        state_ref = context._state_ref

        transaction: Optional[StateManager.Transaction] = None

        if context.transaction_ids is None:
            # When reading the state of an actor outside of a transaction while
            # a transaction is ongoing we always return the last committed state
            # (the latest "snapshot"). If, however, that ongoing transaction has
            # been prepared then its transaction coordinator may have
            # successfully run two phase commit and we just haven't heard about
            # it yet. In this case, it is possible that we receive a read
            # outside of a transaction that is expecting the actor to have the
            # state which has not yet been committed locally, and thus we must
            # wait for our local transaction to commit (or abort, but in that
            # case the read won't have been expecting the uncommitted state).
            # This avoids the race condition laid out in
            # https://github.com/reboot-dev/mono/issues/1621.
            #
            # NOTE: The `ongoing_transaction` is different from the
            # `transaction` variable above: the `transaction` variable is tied
            # to `context` (through `context.transaction_id`), while the
            # `ongoing_transaction` is an ongoing transaction on the actor that
            # the caller is not a participant of.
            with span(
                state_name=state_type_name,
                span_name="reboot.aio.state_managers._load() - "
                "awaiting 'ongoing_transaction'"
            ):
                # With multiple concurrent transactions allowed per
                # state, look for a *prepared* exclusive transaction
                # whose changes we may need to wait for. Shared
                # transactions have no changes pending, so they don't
                # gate this read.
                for ongoing_transaction in self._lookup_participant_transactions(
                    state_type_name, state_ref
                ).values():
                    if (
                        ongoing_transaction.mode == "exclusive" and
                        ongoing_transaction.prepared()
                    ):
                        # There is an exclusive transaction ongoing
                        # and it has been prepared. Wait for it to
                        # complete (the lock guarantees at most one
                        # such transaction exists).
                        try:
                            await ongoing_transaction
                        except asyncio.CancelledError:
                            # Don't swallow cancellations, so the parent
                            # task can be cancelled properly.
                            raise
                        except:
                            # Any errors coming from the transaction
                            # do not concern us here.
                            pass
                        break
        else:
            assert context.transaction_root_id is not None
            transaction = self._lookup_participant_transaction(
                state_type_name,
                state_ref,
                context.transaction_root_id,
            )
            assert transaction is not None and not transaction.prepared(
            ) and not transaction.finished(
            ) and context.transaction_root_id == transaction.root_id, (
                f"Transaction '{str(context.transaction_root_id)}' missing "
                f"for state type '{state_type_name}' and state '{state_ref.id}'"
            )

        state: Optional[StateT] = cast(
            StateT, self._states[state_type_name].get(state_ref)
        )

        if transaction is not None:
            with span(
                state_name=state_type_name,
                span_name="reboot.aio.state_managers._load() - "
                "get state if transaction is not 'None'"
            ):
                # Need to set transaction state if this is the first time
                # doing a load within a transaction for this actor.
                if transaction.state is None and state is not None:
                    # Make a copy of `state` so that modifications within
                    # the transaction aren't seen by concurrent readers.
                    transaction.state = state_type()
                    transaction.state.CopyFrom(state)
                state = cast(StateT, transaction.state)

        if state is not None:
            await self._maybe_authorize(authorize, state)
            if from_constructor:
                logger.error(
                    f"State '{state_ref.id}' for state type '{state_type_name}' already constructed"
                )
                raise SystemAborted(StateAlreadyConstructed())
            return state

        # We don't have state cached, so attempt to load it from
        # the sidecar. This will return None if state has not
        # (yet) been stored.
        #
        # To avoid multiple readers or a reader/writer trying to
        # load the state at the same time, we use a "load" event
        # which once triggered implies the state has been loaded.
        #
        # We are specifically _not_ using the actor lock because a
        # writer will have already acquired the lock at this point
        # (see the 'writer()' method below) and _will not release_
        # the lock until some later point (e.g., after it has
        # serviced the RPC) which will hold up other readers! Once
        # the state is loaded we want all the readers to be able
        # to begin execution immediately.
        load = self._loads[state_type_name].get(state_ref)
        if load is None:
            with span(
                state_name=state_type_name,
                span_name="reboot.aio.state_managers._load() - "
                "loading the state first time"
            ):
                load = asyncio.Event()
                self._loads[state_type_name][state_ref] = load

                try:
                    with span(
                        state_name=state_type_name,
                        span_name="reboot.aio.state_managers._load() "
                        "- load_actor_state"
                    ):
                        data: Optional[bytes] = None

                        # Check for a future from `preload()` before
                        # calling into the database ourselves.
                        #
                        # NOTE: we `pop()` the preload here beacuse
                        # any other concurrent callers and any other
                        # calls to `preload()` will see the event in
                        # `_loads` and wait on that.
                        preload = self._state_preloads[state_type_name].pop(
                            state_ref, None
                        )
                        if preload is not None:
                            try:
                                data = await preload
                            except asyncio.CancelledError:
                                # Propagate any cancellations, e.g.,
                                # if the RPC that instigated this load
                                # was cancelled. Note that `preload`
                                # is a future not a task so it won't
                                # get cancelled and another caller can
                                # still await it.
                                raise
                            except Exception:
                                # Preload failed; need to make a call
                                # to the database which we signal by
                                # setting `preload` back to `None`.
                                preload = None

                        # Only try and load if we didn't preload (or
                        # preload failed). Otherwise, if `data` is
                        # `None` it means we preloaded and the state
                        # does not yet exist.
                        if preload is None:
                            data = await self._database_client.load_actor_state(
                                state_type_name, state_ref
                            )

                    if data is not None:
                        with span(
                            state_name=state_type_name,
                            span_name="reboot.aio.state_managers._load() "
                            "- parseFromString"
                        ):
                            state = state_type()
                            state.ParseFromString(data)

                    # We need to call into the authorizer _before_ we reveal
                    # anything else about the state, e.g., if it's already constructed
                    # or not.
                    await self._maybe_authorize(authorize, state)

                    if data is not None:
                        if from_constructor:
                            logger.error(
                                f"State '{state_ref.id}' for state type '{state_type_name}' "
                                "already constructed"
                            )
                            raise SystemAborted(StateAlreadyConstructed())

                        assert state is not None

                        self._states[state_type_name][state_ref] = state

                        if transaction is not None:
                            # Make a copy of `state` so that
                            # modifications within the transaction
                            # aren't seen by concurrent readers.
                            transaction.state = state_type()
                            transaction.state.CopyFrom(state)
                            state = cast(StateT, transaction.state)

                        # Need to enqueue the loaded state to any
                        # outstanding queues; see comments in
                        # 'streaming_reader()' for more details.
                        #
                        # Note that even though enqueuing requires
                        # doing an 'await' which means we might yield
                        # to the event loop, because we don't trigger
                        # the 'load' event until _after_ we're done
                        # with all the queues we know that we'll get
                        # all future state updates. That is, if it's a
                        # reader (or streaming reader) that is doing
                        # the loading then a writer will be waiting
                        # for the 'load' event. Meanwhile if it is a
                        # writer doing the loading then it will do all
                        # the enqueuing before even returning from
                        # this function.
                        with span(
                            state_name=state_type_name,
                            span_name="reboot.aio.state_managers._load() "
                            "- putting new state on queues"
                        ):
                            queues: Optional[
                                list[asyncio.Queue[_StreamingReaderItem]]
                            ] = self._streaming_readers[state_type_name].get(
                                state_ref
                            )

                            if queues is not None:
                                for queue in queues:
                                    # NOTE: we defer making a reader
                                    # specific copy of this state until
                                    # the reader actually reads it to
                                    # reduce memory usage.
                                    queue.put_nowait((state, None))

                            if transaction is not None:
                                for queue in transaction.streaming_readers:
                                    # NOTE: we defer making a reader
                                    # specific copy of this state until
                                    # the reader actually reads it to
                                    # reduce memory usage.
                                    queue.put_nowait((state, None))

                            return state
                    elif requires_constructor and not from_constructor:
                        logger.warning(
                            f"State '{state_ref.id}' for state type '{state_type_name}' not "
                            "constructed (must call a constructor to construct)"
                        )
                        raise SystemAborted(
                            StateNotConstructed(requires_constructor=True)
                        )
                    elif from_reader:
                        log_at_most_once_per(
                            seconds=300,
                            log_method=logger.warning,
                            message=(
                                f"State '{state_ref.id}' for state type "
                                f"'{state_type_name}' not constructed (call "
                                "any writer to construct). Will silence this "
                                "message for the next 5 minutes."
                            ),
                        )
                        raise SystemAborted(StateNotConstructed())
                    else:
                        # State is not constructed and we're calling a
                        # constructor, expose as much via `context`.
                        #
                        # TODO(benh): refactor to return `None` and
                        # then we can create a new `context` before
                        # passing to users instead of doing mutation
                        # here!
                        context._constructor = True

                        state = state_type()

                        assert state is not None

                        if transaction is not None:
                            # NOTE: no need to copy state here since
                            # it is not stored in `self._states`.
                            transaction.state = state

                        return state
                finally:
                    # Trigger anyone waiting on the load. Note that it
                    # doesn't matter whether or not we were actually
                    # able to load any state; no matter what we want
                    # all coroutines waiting on the load to resume.
                    del self._loads[state_type_name][state_ref]
                    load.set()
        else:
            # We'll wait for the load and then recursively try
            # again in the event that the loader failed (e.g.,
            # perhaps the loader was from a reader and the
            # actor had not yet been constructed but we're a
            # writer and will successfully be able to load).
            with span(
                state_name=state_type_name,
                span_name="reboot.aio.state_managers._load() - "
                "waiting for the load",
            ):
                await load.wait()
                return await self._load(
                    context,
                    state_type,
                    authorize=authorize,
                    from_reader=from_reader,
                    from_constructor=from_constructor,
                    requires_constructor=requires_constructor,
                )

    async def _store(
        self,
        *,
        state_type: StateTypeName,
        state_ref: StateRef,
        effects: Optional[Effects] = None,
        transaction: Optional[StateManager.Transaction] = None,
        task: Optional[database_pb2.Task] = None,
        idempotency_key: Optional[uuid.UUID] = None,
        idempotent_mutation: Optional[database_pb2.IdempotentMutation] = None,
        workflow_id: Optional[uuid.UUID] = None,
        workflow_iteration: Optional[int] = None,
        constructor: bool = False,
        sync: bool = True,
    ) -> None:
        """Private helper for storing state from the sidecar.

        Code should use writer(), not _store() directly.
        """
        task_upserts: list[database_pb2.Task] = []
        actor_upserts: list[database_pb2.Actor] = []
        colocated_upserts: list[database_pb2.ColocatedUpsert] = []
        ensure_state_types_created: list[StateTypeName] = []

        # NOTE: to be safe, we create a copy of state in case a
        # reference to it somehow is being held (e.g., in a coroutine
        # that the user didn't realize) and it gets modified while the
        # sidecar is storing it but before we add it to the streaming
        # readers queues below.
        state_copy: Optional[Message] = None

        if effects is not None:
            # Invariant for storing actor state is that the caller
            # holds the mutator actor lock!
            #
            # TODO(benh): better yet would be to check that the current
            # asyncio context holds the lock ... maybe use a contextvar?
            assert self._locks[state_type][state_ref].is_locked()

            if effects.state is not None:
                state_copy = type(effects.state)()
                state_copy.CopyFrom(effects.state)

                actor_upserts.append(
                    database_pb2.Actor(
                        state_type=state_type,
                        state_ref=state_ref.to_str(),
                        state=state_copy.SerializeToString(),
                    )
                )

            if effects.tasks is not None:
                task_upserts += [
                    task_effect.to_sidecar_task()
                    for task_effect in effects.tasks
                ]

                # Regardless of what a dev may have specified, we want
                # to ensure task scheduling survives machine failures.
                sync = True

            if effects._colocated_upserts is not None:
                if state_type != SORTED_MAP_TYPE_NAME:
                    raise ValueError(
                        "To create a larger than memory collection, "
                        f"please use the {SORTED_MAP_TYPE_NAME} builtin type."
                    )
                colocated_upserts.extend(
                    database_pb2.ColocatedUpsert(
                        state_type=SORTED_MAP_ENTRY_TYPE_NAME,
                        key=state_ref.colocate(
                            SORTED_MAP_ENTRY_TYPE_NAME, StateId(key)
                        ).to_str(),
                        value=value,
                    ) for key, value in effects._colocated_upserts
                )

        if task is not None:
            task_upserts.append(task)

            # Regardless of what a dev may have specified, we want to
            # ensure task updates survive machine failures.
            sync = True

        # If we've been passed an idempotency key then we must have a
        # response that we need to store as well within 'effects'.
        if idempotency_key is not None:
            assert idempotent_mutation is None, (
                "Only one of `idempotency_key` or "
                "`idempotent_mutation` may be specified."
            )
            assert effects is not None
            assert effects.response is not None

            response = effects.response

            idempotent_mutation = database_pb2.IdempotentMutation(
                state_type=state_type,
                state_ref=state_ref.to_str(),
                key=idempotency_key.bytes,
                response=response.SerializeToString(),
                task_ids=[
                    task_effect.task_id for task_effect in
                    ((effects.tasks or []) if effects is not None else [])
                ],
                workflow_id=(workflow_id.bytes if workflow_id else None),
                workflow_iteration=(
                    workflow_iteration
                    if workflow_iteration is not None else None
                ),
            )

        # When using restart detection, we defer ALL writes to prepare
        # time. Only prepared transactions can be recovered after a
        # crash, so intermediate writes within a transaction don't
        # need to be persisted — we can keep them in memory on the
        # `Transaction` object (via `transaction.state`,
        # `transaction.tasks`, and `transaction.idempotent_mutations`)
        # and send everything in one batch at prepare time. This
        # eliminates a sidecar RPC on every writer/transaction
        # `complete()` call.
        #
        # The in-memory state updates below (updating
        # `transaction.state`, streaming readers, idempotent
        # mutations, etc.) still run so that readers within the
        # transaction see the latest state, and so that the data is
        # available at prepare time.
        if transaction is not None and transaction.using_restart_detection:
            pass  # Skip the database call below.
        else:
            if transaction is not None and not transaction._stored:
                # Regardless of what a dev may have specified, we want
                # to ensure the write related to beginning a
                # transaction survives machine failures.
                sync = True

            if constructor:
                # Regardless of what a dev may have specified, we want
                # to ensure that constructors can survive machine
                # failures.
                sync = True

                # Ensure that when creating a `SortedMap`, the
                # `SortedMapEntry` state type's column family has also
                # been created.
                if state_type == SORTED_MAP_TYPE_NAME:
                    ensure_state_types_created.append(
                        SORTED_MAP_ENTRY_TYPE_NAME
                    )

            # NOTE: we _must_ store the data in the database _before_
            # updating in memory state in case the store fails.
            timestamp = await self._database_client.store(
                actor_upserts,
                task_upserts,
                colocated_upserts,
                ensure_state_types_created,
                database_pb2.Transaction(
                    state_type=state_type,
                    state_ref=state_ref.to_str(),
                    transaction_ids=[
                        transaction_id.bytes
                        for transaction_id in transaction.ids
                    ],
                    coordinator_state_type=transaction.coordinator_state_type,
                    coordinator_state_ref=transaction.coordinator_state_ref.
                    to_str(),
                ) if transaction is not None else None,
                idempotent_mutation,
                sync=sync,
            )

            # Update latest timestamp from piggybacked response.
            self._update_latest_timestamp(timestamp)

            # The database call actually happened, so mark the
            # transaction as stored. (When using restart detection
            # we took the `pass` branch above and writes are
            # deferred to prepare, so the flag stays unset.)
            if transaction is not None:
                transaction.stored = True

        # Now that everything is stored we can update in memory
        # state. First we update state related to effects (if any).
        if effects is not None and effects.state is not None:
            assert state_copy is not None

            queues: Optional[list[asyncio.Queue[_StreamingReaderItem]]] = None

            if transaction is not None:
                assert transaction.state is not None
                # NOTE: must do `CopyFrom` here as the state is passed
                # by _reference_ to the transaction method.
                transaction.state.CopyFrom(state_copy)
                queues = transaction.streaming_readers

                # Record the eventual presence of this actor, after
                # the transaction has committed.
                transaction.actors[state_type].add(state_ref)

            else:
                state_was_cached = state_ref in self._states[state_type]
                self._states[state_type][state_ref] = state_copy
                queues = self._streaming_readers[state_type].get(state_ref)

                if not state_was_cached:
                    # We MAY have just created a new actor.
                    for event in self._actors_list_maybe_changed_events:
                        event.set()

            if queues is not None:
                for queue in queues:
                    # NOTE: we defer making a reader specific copy of this
                    # state until the reader actually reads it to reduce
                    # memory usage.
                    queue.put_nowait((state_copy, idempotency_key))

        # Now we update state related to idempotency (if any).
        if idempotent_mutation is not None:
            idempotent_mutations = (
                # Invariant here that we've already recovered the
                # idempotent mutations for this state ref because we
                # must have checked an idempotent mutation before
                # executing it (if that invariant is broken we'll get
                # a `KeyError`).
                self._idempotent_mutations[state_type][state_ref]
                if transaction is None else transaction.idempotent_mutations
            )
            if idempotency_key is None:
                # We're importing an existing `idempotent_mutation`.
                idempotency_key = uuid.UUID(bytes=idempotent_mutation.key)
            else:
                # We're creating a new `idempotent_mutation`: the
                # invariant is that it shouldn't already exist but
                # it's expensive to assert as much because it may
                # require going to the database.
                pass
            idempotent_mutations[idempotency_key] = idempotent_mutation

    def validate_transaction_participant(
        self,
        context: Context,
        transaction: StateManager.Transaction,
    ) -> None:
        """Helper to validate that a transaction participant is conforming to
        the requirements of being a participant."""
        # We *MUST* have persisted the transaction before returning
        # any value back to the caller -- unless restart detection is
        # active, in which case the store is deferred to prepare time.
        assert transaction._stored or transaction.using_restart_detection, (
            'Transaction not persisted'
        )

        # All outstanding RPCs must complete before returning (and
        # it should always be > 0 otherwise we have a bug).
        assert context.outstanding_rpcs >= 0, (
            f'context.outstanding_rpcs == {context.outstanding_rpcs}'
        )

        # Check that the tasks of the transaction all belong to the same state type
        # as the transaction.
        assert all(
            task.task_id.state_type == context.state_type_name
            for task in transaction.tasks
        ), 'Transaction contains tasks not belonging to transaction'

        if context.outstanding_rpcs > 0:
            # TODO(benh): test this case!
            raise RuntimeError(
                'Detected outstanding RPCs; all RPCs must be '
                'await\'ed when performing a transaction'
            )

    @asynccontextmanager_span(
        # We expect an `EffectValidationRetry` exception; that's not an error.
        set_status_on_exception=False
    )
    async def transactionally(
        self,
        context: ReaderContext | WriterContext | TransactionContext,
        tasks_dispatcher: TasksDispatcher,
        *,  # TODO: Make all args keyword.
        aborted_type: Optional[type[Aborted]],
    ) -> AsyncIterator[Optional[StateManager.Transaction]]:
        """Override of StateManager.transactionally(...) for
        SidecarStateManager.
        """
        state_type = context.state_type_name
        state_ref = context._state_ref

        if context.transaction_ids is None:
            yield None
            # Nothing else to do after control is returned to this
            # context manager, just return!
            return

        assert context.transaction_parent_ids is not None
        assert context.transaction_coordinator_state_type is not None
        assert context.transaction_coordinator_state_ref is not None
        assert context.transaction_root_id is not None

        # Look up an existing transaction on this state by its root
        # id. Sibling / parent / nested conflicts all share the same
        # root id with us, so a single lookup catches them all; truly
        # unrelated transactions (different root) coexist via the
        # Lock without further coordination here.
        transaction: Optional[StateManager.Transaction
                             ] = self._lookup_participant_transaction(
                                 state_type,
                                 state_ref,
                                 context.transaction_root_id,
                             )

        if (
            transaction is not None and
            context.transaction_id == transaction.started_id
        ):
            # Another method on this state within the same transaction
            # has already started (i.e., calls were made
            # concurrently). We must wait for that first call to
            # acquire the per-state lock before we continue here.
            await transaction.acquired_lock

            if transaction.finished():
                # TODO(benh): add a test case for this!
                committed_or_aborted = "committed" if transaction.committed(
                ) else "aborted"
                raise RuntimeError(
                    f'Transaction was {committed_or_aborted}; do you have '
                    'a rogue RPC, e.g., from an asynchronous computation '
                    'that you forgot to wait for?'
                )
            elif transaction.prepared():
                # TODO(benh): add a test case for when we find out
                # that a transaction is no longer running due to
                # trying to watch it and yet we still think we are
                # running and instead need to stop running.
                raise RuntimeError(
                    'Transaction has been prepared; do you have a rogue '
                    'RPC, e.g., from an asynchronous computation that '
                    'you forgot to wait for?'
                )
            elif transaction.must_abort:
                # Rather than waste cycles on a transaction that will
                # eventually abort we try and propagate failure sooner.
                #
                # TODO(while-false): Check code path and add test.
                raise RuntimeError('Transaction must abort')
        elif (
            transaction is not None and
            transaction.root_id in context.transaction_parent_ids
        ):
            raise RuntimeError(
                "Nested transactions must currently read/modify mutually exclusive "
                "state from their parent transactions. You are attempting to "
                f"{'read' if isinstance(context, ReaderContext) else 'modify'} "
                f"'{state_ref.id}' of type '{state_type}' which is already used "
                "in a parent transaction. This restriction will be relaxed in a "
                "future release of Reboot. Do you have a use case where you "
                "are trying to do this? Please reach out "
                "to the maintainers and tell us about it!"
            )
        elif (
            transaction is not None and
            context.transaction_id in transaction.parent_ids
        ):
            raise RuntimeError(
                "Parent transactions must currently read/modify mutually exclusive "
                "state from their nested transactions. You are attempting to "
                f"{'read' if isinstance(context, ReaderContext) else 'modify'} "
                f"'{state_ref.id}' of type '{state_type}' which is already used "
                "in a nested transaction. This restriction will be relaxed in a "
                "future release of Reboot. Do you have a use case where you "
                "are trying to do this? Please reach out "
                "to the maintainers and tell us about it!"
            )
        elif (
            transaction is not None and any(
                transaction_id in transaction.parent_ids
                for transaction_id in context.transaction_parent_ids
            )
        ):
            raise RuntimeError(
                "Nested transactions must currently read/modify mutually exclusive "
                "state from their sibling transactions. You are attempting to "
                f"{'read' if isinstance(context, ReaderContext) else 'modify'} "
                f"'{state_ref.id}' of type '{state_type}' which is already used "
                "in a sibling transaction. This restriction will be relaxed in a "
                "future release of Reboot. Do you have a use case where you "
                "are trying to do this? Please reach out "
                "to the maintainers and tell us about it!"
            )
        else:
            # If we can use restart detection for this transaction,
            # ensure that the last restart was before the start of the
            # transaction to ensure consistency.
            root_transaction_id = context.transaction_ids[0]

            using_restart_detection = self._can_use_restart_detection(
                root_transaction_id, state_type
            )

            if using_restart_detection:
                transaction_timestamp_ms = uuid7_timestamp_ms(
                    root_transaction_id
                )
                if (
                    self._recovery_timestamp_ms is not None and
                    self._recovery_timestamp_ms > transaction_timestamp_ms
                ):
                    # Server recovered after this transaction started,
                    # which means it may have already participated and
                    # lost in-memory state when it restarted. Return
                    # UNAVAILABLE so the caller retries with a fresh
                    # transaction.
                    transaction_time = datetime.fromtimestamp(
                        transaction_timestamp_ms / 1000,
                        tz=timezone.utc,
                    ).isoformat()
                    recovery_time = datetime.fromtimestamp(
                        self._recovery_timestamp_ms / 1000,
                        tz=timezone.utc,
                    ).isoformat()
                    raise SystemAborted(
                        Unavailable(),
                        message=(
                            f"Transaction {root_transaction_id} was "
                            f"created at {transaction_time} but this "
                            f"server recovered at {recovery_time}; retry "
                            "required to ensure consistency."
                        ),
                    )

            transaction = StateManager.Transaction.from_context(
                context,
                tasks_dispatcher,
                using_restart_detection=using_restart_detection,
            )

            # Mode is determined by the kind of method we're initially
            # calling as part of this transaction. A `writer` is
            # always exclusive, a `reader` and `transaction` start
            # shared, but we may upgrade if we either determine that
            # the transaction requires exclusive or if we later call a
            # `writer`.
            transaction.mode = (
                "exclusive" if isinstance(context, WriterContext) else "shared"
            )

            # Insert into `_participant_transactions` BEFORE acquiring
            # the lock so that any concurrent calls for the same
            # transaction can wait until we've acquired the lock.  The
            # check above and this insert have no `await` between
            # them, so we cannot race with another caller.
            transactions = self._participant_transactions[
                state_type].setdefault(state_ref, {})
            assert transaction.root_id not in transactions
            transactions[transaction.root_id] = transaction

            # Wait for any incompatible holders to release. Shared
            # mode parallelizes; exclusive mode is exclusive (and
            # queues FIFO behind any queued exclusive waiters). On
            # success / failure we resolve `transaction.acquired_lock`
            # so concurrent callers on the same transaction can
            # proceed (or propagate our failure).
            try:
                if transaction.mode == "shared":
                    await self._locks[state_type][state_ref].acquire_shared()
                else:
                    await self._locks[state_type][state_ref].acquire_exclusive(
                    )
            except BaseException as e:
                transaction.acquired_lock.set_exception(e)
                del transactions[transaction.root_id]
                if len(transactions) == 0:
                    del self._participant_transactions[state_type][state_ref]
                raise
            else:
                transaction.acquired_lock.set_result(None)

        assert transaction is not None

        # When restart detection is not being used, store the
        # transaction to disk at join time (the legacy behavior).
        if not transaction.using_restart_detection:
            await self.transaction_participant_store(transaction)

        # Add ourselves as a read-only transaction participant iff
        # we have acquired the shared lock AND we have no
        # idempotency key AND we are using restart detection.
        # These mirror the gate in `transaction_participant_prepare`'s
        # elision branch: we must only flag ourselves as read-only
        # in the coordinator's `Participants` if Prepare will
        # actually elide and release on the participant side.
        #
        # If we mark ourselves read-only while the elision won't
        # fire (e.g., `SortedMap` participants, which always have
        # `using_restart_detection == False`), the coordinator
        # would persist us as read-only and then skip us on
        # recovery's re-prepare (`skip_read_only=True`) — even
        # though the legacy non-restart-detection path actually
        # wrote a record to disk at join time and went through
        # normal Prepare. That would strand the participant in
        # an unconfirmed state across coordinator restarts.
        #
        # If we later upgrade the lock, e.g., because a `writer()`
        # on this state gets called or a `transaction()` has
        # effects that require the exclusive lock, then we'll
        # update `context.participants` to indicate that this
        # participant is not read-only which correctly wins/taints
        # as we merge participants back up to the coordinator.
        context.participants.add(
            state_type,
            state_ref,
            read_only=(
                transaction.mode == "shared" and
                context.idempotency_key is None and
                transaction.using_restart_detection
            ),
        )

        try:
            yield transaction

            # Now that control has resumed here we're exiting the
            # context manager so we can validate the user is following
            # the transaction requirements.
            self.validate_transaction_participant(context, transaction)
        except BaseException as exception:
            # Transaction doesn't need to abort if this is from the
            # backend and safe, i.e., declared or generated by Reboot.
            if (
                aborted_type is not None and
                aborted_type.is_from_backend_and_safe(exception)
            ):
                # We don't need to abort, but we do need to validate
                # the user is following the transaction requirements.
                self.validate_transaction_participant(context, transaction)

                raise

            # All other errors abort the transaction.
            transaction.must_abort = True
            raise
        finally:
            if context.transaction_must_abort:
                transaction.must_abort = True

            # Start watching the transaction.
            #
            # This needs to be done _after_ the servicer method has
            # completed because if we find out via watching that the
            # transaction is committed/aborted we will finish the
            # transaction, remove it from '_participant_transactions'
            # (allowing other transactions to proceed), and release
            # the mutator lock, which can not be done until after the
            # servicer method has completed!
            #
            # NOTE: we CAN NOT preemptively finish the transaction,
            # e.g., to allow other writers or transactions to proceed,
            # because it's possible that this state type/actor might be
            # re-involved in the same transaction until the
            # transaction has finished.
            #
            # Also, the watch task may already be started by a
            # different RPC (or by recovery) and we only want one of
            # them!
            #
            # Finally, the transaction may already be completed if the
            # coordinator == participant and two phase commit was
            # successful so we don't need to watch anything.
            if transaction.watch_task is None and not transaction.finished():
                transaction.watch_task = asyncio.create_task(
                    self._transaction_participant_watch(
                        context.application_id,
                        context.channel_manager,
                        transaction,
                    ),
                    name=
                    f'self._transaction_participant_watch(...) in {__name__}',
                )

    @asynccontextmanager_span(
        # We expect an `EffectValidationRetry` exception; that's not an error.
        set_status_on_exception=False
    )
    async def reader(
        self,
        context: ReaderContext,
        state_type: type[StateT],
        *,
        authorize: Optional[AuthorizeCallable],
    ) -> AsyncIterator[StateT]:
        """Override of StateManager.reader(...) for SidecarStateManager."""
        # Every reader/writer gets a copy of their own state so
        # that they can execute concurrently.
        #
        # TODO(benh): investigate overriding __delattr__ and
        # __setattr__ such that either we make the states immutable
        # and thus can share them rather than copy them, or we do some
        # kind of copy-on-write.
        state_copy = state_type()
        state_copy.CopyFrom(
            await self._load(
                context, state_type, authorize=authorize, from_reader=True
            )
        )
        yield state_copy

    @asynccontextmanager
    async def streaming_reader(
        self,
        context: ReaderContext,
        state_type: type[StateT],
        *,
        authorize: Optional[AuthorizeCallable],
    ) -> AsyncIterator[AsyncIterator[StateT]]:

        async def iterator() -> AsyncGenerator[StateT, None]:
            async with self.streaming_reader_idempotency_key(
                context,
                state_type,
                authorize=authorize,
            ) as states:
                async for (state, idempotency_key) in states:
                    yield state

        states = iterator()

        yield states

    @asynccontextmanager
    async def streaming_reader_idempotency_key(
        self,
        context: ReaderContext | WorkflowContext,
        state_type: type[StateT],
        *,
        authorize: Optional[AuthorizeCallable],
    ) -> AsyncIterator[AsyncIterator[tuple[StateT, Optional[uuid.UUID]]]]:
        state_type_name = context.state_type_name
        state_ref = context._state_ref

        transaction: Optional[StateManager.Transaction] = None

        if context.transaction_ids is not None:
            assert context.transaction_root_id is not None
            transaction = self._lookup_participant_transaction(
                state_type_name,
                state_ref,
                context.transaction_root_id,
            )
            assert transaction is not None

        # NOTE: concurrency is a little tricky here! We want to
        # _atomically_ load the state _and_ add our queue so that we
        # don't miss any state updates. We do that by first adding our
        # queue to the list, which we know will not yield the event loop.
        #
        # Next we look to see if we have a cached state, which we can
        # also do without yielding the event loop. If we do have a
        # cached state, then we'll use that as the first state that
        # we'll yield below.
        #
        # If we don't have a cached state then we'll try and load the
        # state and in doing so the loaded state will get enqueued on
        # the queue (see '_load()' for where we do this) since we
        # already added our queue to the list. Of course, it's
        # possible another coroutine will win the loading race before
        # us but then it will enqueue the loaded state on our queue,
        # again, because we already added our queue to the list.

        queue: asyncio.Queue[_StreamingReaderItem] = asyncio.Queue()

        if transaction is None:
            self._streaming_readers[state_type_name].setdefault(
                state_ref,
                [],
            ).append(queue)
        else:
            transaction.streaming_readers.append(queue)

        async def iterator(
            state: Optional[StateT]
        ) -> AsyncGenerator[tuple[StateT, Optional[uuid.UUID]], None]:
            if state is not None and queue.qsize() == 0:
                # Every reader/writer gets a copy of their own state so
                # that they can execute concurrently.
                state_copy = state_type()
                state_copy.CopyFrom(state)
                yield (state_copy, None)

            while True:
                next_item: _StreamingReaderItem = await queue.get()

                # TODO: just get the last item from the queue, but
                # aggregate all of the idempotency keys.

                # Currently stream is never "closed" so we should
                # never not have state unless we're in a transaction
                # that was aborted!
                if next_item is None:
                    if transaction is not None:
                        assert transaction.finished()
                        assert not transaction.committed()
                        raise RuntimeError('Transaction aborted!')

                assert next_item is not None

                next_state, idempotency_key = next_item

                # We create _another_ copy of the state _here_ rather than each
                # time a state is added to a queue so that we don't make
                # unnecessary copies, i.e., we only copy when a reader actually
                # wants the state.
                #
                # Every iteration gets a completely new `state_copy`, so that if
                # (by accident or design) something is still holding a reference
                # to a previous snapshot of the state, that isn't unexpectedly
                # overwritten.
                state_copy = state_type()
                state_copy.CopyFrom(cast(StateT, next_state))
                # We currently authorize for each new `state`
                # as a change in the state might now raise a
                # `PermissionDenied`.
                await self._maybe_authorize(authorize, state_copy)
                yield (state_copy, idempotency_key)

        state = await self._load(
            context, state_type, authorize=authorize, from_reader=True
        )

        states = iterator(state)

        try:
            yield states
        finally:
            # Remove our queue from the list so that states aren't
            # added to it anymore.
            if transaction is None:
                self._streaming_readers[state_type_name][state_ref].remove(
                    queue
                )
            else:
                transaction.streaming_readers.remove(queue)

    @asynccontextmanager
    async def reactively(
        self,
        context: ReaderContext | WorkflowContext,
        state_type: type[StateT],
        *,
        authorize: Optional[AuthorizeCallable],
    ) -> AsyncIterator[AsyncIterator[tuple[StateT, list[uuid.UUID]]]]:
        """Override of StateManager.reactively(...) for SidecarStateManager."""
        # Construct the `React` machinery necessary for enabling
        # transforming reader RPCs into `React.Query` calls (providing
        # transitive reactivity).
        context.react = React(context.channel_manager)

        # We hold on to the latest state and _all_ of the aggregated
        # idempotency keys that may have gotten us to the latest state
        # because it's possible that we'll get state updates in
        # `watch_state()` faster than the `iterator()` will share
        # them.
        #
        # It's also possible that streaming state updates will fail,
        # e.g., because the actor doesn't exist yet, so we store the
        # latest state as an `asyncio.Future` so we can also store an
        # exception.
        #
        # Because we need to create a new future every time we want to
        # store a new state (or set the exception), we need to store
        # it in some outermost container so that it can be shared
        # across scopes.
        @dataclass(kw_only=True)
        class StateOrException:
            state: Optional[StateT] = None
            exception: Optional[BaseException] = None

            def get(self):
                if self.exception is not None:
                    raise self.exception
                return self.state

        state_or_exception = StateOrException()
        aggregated_idempotency_keys: list[uuid.UUID] = []

        # Watch the actor's state for any changes.
        async def watch_state():
            try:
                async with self.streaming_reader_idempotency_key(
                    context,
                    state_type,
                    authorize=authorize,
                ) as states:
                    async for (state, idempotency_key) in states:
                        # NOTE: we need to _atomically_ update both
                        # `state` and `idempotency_keys`.
                        state_or_exception.state = state

                        if idempotency_key is not None:
                            aggregated_idempotency_keys.append(idempotency_key)

                        assert context.react is not None
                        context.react.event.set()
            except asyncio.CancelledError:
                # Don't swallow cancellations, so the parent
                # task can be cancelled properly.
                raise
            except BaseException as exception:
                state_or_exception.exception = exception

                assert context.react is not None
                context.react.event.set()

        async def iterator(
        ) -> AsyncGenerator[tuple[StateT, list[uuid.UUID]], None]:
            # Wait for either updates to the actor state (or the
            # initial state), or any updates from transitive calls to
            # `React.Query`.
            assert context.react is not None
            iteration = context.react.iteration
            while True:
                iteration = await context.react.iterate(iteration)

                # We want to _move_ the idempotency keys to the caller
                # so that they can do with it what they please and
                # we'll aggregate into a new empty list.
                idempotency_keys = aggregated_idempotency_keys.copy()
                aggregated_idempotency_keys.clear()

                yield (state_or_exception.get(), idempotency_keys)

                # Cancel any queries that weren't used when we yielded
                # control, i.e., are no longer relevant to the code
                # paths that are being executed in the user's code.
                await context.react.cancel_unused_queries()

        watch_state_task = asyncio.create_task(
            watch_state(),
            name=f'watch_state() in {__name__}',
        )

        states = iterator()

        try:
            yield states
        finally:
            # Tear down in order: fully stop the `watch_state()`
            # before cancelling `React.Query` calls, so
            # the two don't race on `context.react`'s queriers.
            try:
                await wait_for_tasks([watch_state_task], cancel=True)
            finally:
                # Still execute the `React.Query` cancellation and
                # cleanup even if we were cancelled while waiting for
                # `watch_state()`.
                react_cancel_task = asyncio.ensure_future(
                    context.react.cancel()
                )
                try:
                    await wait_for_tasks(
                        [react_cancel_task],
                        cancel=False,
                    )
                finally:
                    context.react = None

    @asynccontextmanager_span(
        # We expect an `EffectValidationRetry` exception; that's not an error.
        set_status_on_exception=False
    )
    async def writer(
        self,
        context: WriterContext,
        state_type: type[StateT],
        tasks_dispatcher: TasksDispatcher,
        *,
        authorize: Optional[AuthorizeCallable],
        transaction: Optional[StateManager.Transaction] = None,
        from_constructor: bool = False,
        requires_constructor: bool = False,
    ) -> AsyncIterator[tuple[StateT, StateManager.Writer]]:
        """Override of StateManager.writer(...) for SidecarStateManager."""
        state_type_name = context.state_type_name
        state_ref = context._state_ref
        # To ensure only one writer at a time we use a lock. If we're
        # in a transaction then we should already have acquired the
        # mutator lock but we still need to acquire the "transaction
        # writer lock" so that only one writer will execute at a time
        # within a transaction.
        if transaction is not None:
            assert self._locks[state_type_name][state_ref].is_locked()
            # If the transaction joined this state in `"shared"` mode
            # (because the first call was a reader), upgrade to
            # `"exclusive"` so we serialize against any other holder.
            # `upgrade()` beats exclusive waiters queued for the lock,
            # preserving the transaction's initial read of state.
            if transaction.mode == "shared":
                await self._locks[state_type_name][state_ref].upgrade()
                transaction.mode = "exclusive"
                # And now `context.participants` should no longer
                # propagate this participant as read-only.
                context.participants.add(
                    state_type_name,
                    state_ref,
                    read_only=False,
                )

        # Outside a transaction we need the per-state exclusive lock
        # for the duration of the writer call. Inside a transaction
        # the transaction already holds the exclusive lock for the
        # state (we may have upgraded above); we just need the
        # intra-transaction writer lock to serialize concurrent
        # writers.
        if transaction is None:
            lock: AsyncContextManager[None] = (
                self._locks[state_type_name][state_ref].exclusive()
            )
        else:
            lock = self._transaction_writer_locks[state_type_name][state_ref]
        async with lock:
            # Every reader/writer gets a copy of their own state so
            # that they can execute concurrently.
            loaded_result = await self._load(
                context,
                state_type,
                authorize=authorize,
                from_constructor=from_constructor,
                requires_constructor=requires_constructor,
            )
            with span(
                state_name=state_type_name,
                span_name="reboot.aio.state_managers."
                "SidecarStateManager.writer() - Copy State",
            ):
                state_copy = state_type()
                state_copy.CopyFrom(loaded_result)

            async def complete(effects: Effects) -> None:
                if transaction is None:
                    if effects.tasks is not None:
                        # NOTE: we validate tasks added as part of a
                        # transaction when we prepare.
                        await tasks_dispatcher.validate(effects.tasks)
                    await self._store(
                        state_type=state_type_name,
                        state_ref=state_ref,
                        effects=effects,
                        idempotency_key=context.idempotency_key,
                        workflow_id=context.workflow_id,
                        workflow_iteration=context.workflow_iteration,
                        constructor=context.constructor,
                        sync=context.sync,
                    )
                    if effects.tasks is not None:
                        tasks_dispatcher.dispatch(effects.tasks)
                else:
                    # NOTE: we do this store while holding the
                    # transaction lock so any outstanding readers
                    # won't also try and store this transaction in the
                    # sidecar as well (instead they'll wait until we
                    # finish storing and then see that we've stored
                    # and just return).
                    async with transaction.lock:
                        await self._store(
                            state_type=state_type_name,
                            state_ref=state_ref,
                            effects=effects,
                            transaction=transaction,
                            idempotency_key=context.idempotency_key,
                            workflow_id=context.workflow_id,
                            workflow_iteration=context.workflow_iteration,
                            constructor=context.constructor,
                        )
                        if effects.tasks is not None:
                            assert all(
                                task.task_id.state_type ==
                                transaction.state_type
                                for task in effects.tasks
                            ), 'Task state type does not match transaction state type'
                            transaction.tasks.extend(effects.tasks)

            yield (state_copy, StateManager.Writer(complete))

    async def complete_task(
        self,
        task_effect: TaskEffect,
        response_or_status: TaskResponseOrStatus,
    ) -> None:
        state_type = StateTypeName(task_effect.task_id.state_type)
        state_ref = StateRef(task_effect.task_id.state_ref)
        response, status = response_or_status

        async with self._locks[state_type][state_ref].exclusive(
            deadline_seconds=None
        ):
            # Store response and mark this Task as completed in
            # persistent storage. Even though we're writing here, we're
            # not writing the actor's state.
            task_response: Optional[any_pb2.Any] = None
            task_error: Optional[any_pb2.Any] = None
            if status is not None:
                assert response is None

                task_error = any_pb2.Any()
                task_error.Pack(status)
            else:
                assert response is not None

                task_response = any_pb2.Any()
                task_response.Pack(response)

            assert task_response is not None or task_error is not None

            await self._store(
                state_type=state_type,
                state_ref=state_ref,
                task=database_pb2.Task(
                    task_id=task_effect.task_id,
                    method=task_effect.method_name,
                    status=database_pb2.Task.Status.COMPLETED,
                    request=task_effect.request.SerializeToString(),
                    response=task_response,
                    error=task_error,
                ),
            )

            if state_ref in self._idempotent_mutations[state_type]:
                # Clean up per-workflow tracking so the sets in
                # `IdempotentMutations` don't grow unboundedly.
                workflow_id = uuid.UUID(bytes=task_effect.task_id.task_uuid)

                # Since we clean workflow iterations when the iteration
                # is done and we continue with the next one, we will
                # miss cleaning up the workflow iteration for the last
                # iteration of a loop, i.e. when we break/return/raise
                # an error. If we raise a declared error - we will
                # eventually call `complete_task()` which should clean
                # the workflow iteration, but when the error was not
                # declared - we don't want to clear the workflow
                # iteration, since we might need it on a workflow retry.
                self._idempotent_mutations[state_type][
                    state_ref].complete_workflow_iteration(
                        workflow_id,
                        task_effect.iteration,
                    )
                self._idempotent_mutations[state_type][
                    state_ref].complete_workflow(workflow_id)

    @asynccontextmanager
    async def task_workflow(
        self,
        context: WorkflowContext,
        task_effect: TaskEffect,
        *,
        on_loop_iteration: OnLoopIterationCallable,
        validating_effects: bool,
    ) -> AsyncIterator[Callable[[TaskEffect, TaskResponseOrStatus],
                                Awaitable[None]]]:
        """Override of StateManager.task_workflow(...) for SidecarStateManager."""

        # Construct the machinery necessary for enabling control
        # loops.
        #
        # TODO: currently we only allow a single control loop per
        # workflow, change that!
        loop_alias: Optional[str] = None

        within_loop: ContextVar[bool] = ContextVar(
            "Whether or not current asyncio context is within a control loop",
            default=False,
        )

        async def loop(
            alias: str,
            *,
            interval: Optional[timedelta] = None,
        ) -> AsyncGenerator[int, Any]:
            nonlocal loop_alias
            if loop_alias is not None:
                raise RuntimeError(
                    "Only one loop per workflow is currently supported "
                    f"(already ran loop '{loop_alias}'); "
                    "please reach out if this is a blocker for you!"
                )

            loop_alias = alias

            # Need a checkpoint of the context so that we can restore
            # it before each iteration.
            #
            # TODO: this will not play nicely with other concurrent
            # asyncio tasks _outside_ of the control loop, we should
            # detect that case and raise an exception that it is not
            # supported via something like an asyncio context variable
            # that indicates whether or not it is a descendent of the
            # asyncio context that created/started the loop and
            # ensuring that all of those asyncio contexts are
            # completed for each loop iteration.
            checkpoint = context.checkpoint()

            state_type = StateTypeName(task_effect.task_id.state_type)
            state_ref = StateRef(task_effect.task_id.state_ref)

            try:
                nonlocal within_loop
                within_loop.set(True)

                while True:
                    yield task_effect.iteration

                    # During effect validation we restart the loop at
                    # its last iteration (even if it had completed, we
                    # intentionally don't persist that, see the
                    # `finally` block). We do this, because we don't
                    # love the alternative semantics:
                    # 1. We don't want to restart the loop from the
                    #    first iteration - there may have been many,
                    #    many iterations, and re-running them all would
                    #    take a long time.
                    # 2. We don't want to restart the loop at an
                    #    iteration beyond the last one, as it would have
                    #    developers' conditions like `if iteration ==
                    #    10: break` suddenly be faced with `iteration`
                    #    values beyond 10.
                    #
                    # Re-running only the last iteration of the loop is
                    # a nice sweet-spot. However, since it was the
                    # _last_ iteration of the loop, it means that on
                    # effect validation, the iteration must (again)
                    # break out of the loop, and we should not get to
                    # this point in the code (i.e. we expect to jump to
                    # the `finally` block).
                    if validating_effects:
                        raise RuntimeError(
                            "While validating effects, the re-run of the last "
                            f"iteration of the '{alias}' control loop "
                            "did not break but instead attempted to continue "
                            "to iterate"
                        )

                    completed_iteration = task_effect.iteration

                    # Call iteration-complete callables BEFORE
                    # advancing and persisting the iteration
                    # counter, so that if a callable raises the
                    # exception propagates out of the iteration
                    # body and the entire workflow method gets
                    # retried -- including this iteration, since
                    # we haven't yet recorded its completion. The
                    # list is intentionally NOT cleared --
                    # callables are persistent across iterations
                    # of the same method invocation and only get
                    # cleared when the method itself completes.
                    # Async callables are awaited to completion.
                    for callable in context._on_iteration_complete:
                        result = callable(iteration=completed_iteration)
                        if inspect.isawaitable(result):
                            await result

                    async with self._locks[state_type][state_ref].exclusive(
                        deadline_seconds=None
                    ):
                        task_effect.iteration += 1

                        await self._store(
                            state_type=state_type,
                            state_ref=state_ref,
                            task=task_effect.to_sidecar_task(),
                        )

                    if state_ref in (self._idempotent_mutations[state_type]):
                        # The completed iteration's mutations will never
                        # be queried again; drop its tracking entry.
                        workflow_id = uuid.UUID(
                            bytes=task_effect.task_id.task_uuid
                        )
                        self._idempotent_mutations[state_type][
                            state_ref].complete_workflow_iteration(
                                workflow_id, completed_iteration
                            )

                    on_loop_iteration(
                        # The number of the anticipated next iteration.
                        task_effect.iteration,
                        # The time at which the next iteration should
                        # start, if not ASAP.
                        (DateTimeWithTimeZone.now() +
                         interval) if interval else None,
                    )

                    if interval is not None:
                        with tracing.span(
                            state_name=
                            f"{task_effect.task_id.state_type}('{task_effect.state_id}')",
                            span_name=
                            f"{task_effect.method_name}() loop iteration {task_effect.iteration}: waiting until the scheduled start time",
                            level=tracing.TraceLevel.CUSTOMER,
                        ):
                            # NOTE: using `context.wait()` so calls
                            # through Node.js will be cancelled.
                            await context.wait(
                                asyncio.sleep(interval.total_seconds())
                            )

                    # We need to restore the idempotency checkpoint so
                    # that each new loop iteration we allow empty
                    # calls to `.per_workflow()` and
                    # `.per_iteration()`.
                    #
                    # TODO: consider supporting that in
                    # `IdempotencyManager` by taking into account
                    # loops and iterations and only raising an error
                    # if you do an empty `.per_workflow()` or
                    # `.per_iteration()` call within the same
                    # iteration?
                    context.restore(checkpoint)
            finally:
                # The loop has ended, but we don't know (and can't know,
                # see https://github.com/reboot-dev/mono/issues/4761)
                # whether it ended successfully with a `break`/`return`,
                # or whether it failed with an exception; here we only
                # see a generic `GeneratorExit`. Fortunately, it doesn't
                # matter: we do NOT record the completion of the final
                # iteration of the loop in either case, since in case of
                # a workflow restart we either way want to re-run the
                # last iteration of the loop.
                within_loop.set(False)

        context.loop = loop
        context.within_loop = lambda: within_loop.get()

        retrying = True
        try:
            yield self.complete_task
            retrying = False
        finally:
            # The workflow method body has completed. Call
            # method-complete callables with `retrying=` indicating
            # whether the framework is about to retry, then clear
            # *both* callable lists so any re-invocation on this same
            # `WorkflowContext` starts with a fresh registration. If a
            # callable raises, the exception propagates out of the
            # workflow method body and the entire workflow method gets
            # retried.
            method_callables = context._on_method_complete
            context._on_method_complete = []
            context._on_iteration_complete = []
            for callable in method_callables:
                result = callable(retrying=retrying)
                if inspect.isawaitable(result):
                    await result

    @asynccontextmanager
    async def transaction(
        self,
        context: TransactionContext,
        state_type: type[StateT],
        transaction: StateManager.Transaction,
        *,
        authorize: Optional[AuthorizeCallable],
        from_constructor: bool = False,
        requires_constructor: bool = False,
    ) -> AsyncIterator[tuple[StateT, Callable[[Effects], Awaitable[None]]]]:
        """Override of StateManager.transaction(...) for SidecarStateManager."""
        state_type_name = context.state_type_name
        state_ref = context._state_ref

        # At this point we should already be executing
        # "transactionally".
        assert self._participant_transactions[state_type_name][state_ref][
            transaction.root_id] is transaction

        # We should already hold the lock.
        assert self._locks[state_type_name][state_ref].is_locked()

        # And we shouldn't have a transaction that must abort, e.g., a
        # transaction that was recovered but not prepared.
        #
        # Specifically in the case of transaction recovery it is
        # important that we don't load and return state that does not
        # actually reflect state that may have been updated as part of
        # the transaction but which we have now lost because we
        # restarted. Instead, we want to fail and propagate that
        # failure as soon as possible.
        assert not transaction.must_abort

        # We store a byte snapshot of the state, set after `_load()`
        # returns and before the user body runs; in order to be able
        # to determine in `complete()` whether or not the state was
        # mutated and we need to upgrade our lock to exclusive.
        initial_state_bytes: Optional[bytes] = None

        async def complete(effects: Effects) -> None:
            # Currently, we always need to store, even if
            # `transaction.stored`, because the state may have been
            # updated.
            #
            # NOTE: even if we optimize this later and only store the
            # state when we do a 2PC prepare, we might still need to
            # store here to record the idempotent mutation!
            async with transaction.lock:
                # Upgrade the lock if we're currently only holding the
                # lock as shared but we've got effects that need
                # exclusive.
                if transaction.mode == "shared" and effects.requires_exclusive(
                    initial_state_bytes=initial_state_bytes,
                ):
                    await self._locks[state_type_name][state_ref].upgrade()
                    transaction.mode = "exclusive"
                    # And now `context.participants` should no longer
                    # propagate this participant as read-only.
                    context.participants.add(
                        state_type_name,
                        state_ref,
                        read_only=False,
                    )
                await self._store(
                    state_type=state_type_name,
                    state_ref=state_ref,
                    effects=effects,
                    transaction=transaction,
                    idempotency_key=context.idempotency_key,
                    workflow_id=context.workflow_id,
                    workflow_iteration=context.workflow_iteration,
                    constructor=context.constructor,
                )

        if not context.nested:
            # We're starting a new transaction here, so we should have
            # a unique identifier, and it should not already be
            # tracked as a transaction that we're coordinating.
            assert transaction.root_id not in self._coordinator_participants

            # We need to add the participants future _before_ we try and
            # `_load()` the actor in case that raises and _before_ we
            # yield control to the servicer so any participants that it
            # calls will be able to start their watch control loops.
            self._coordinator_participants[transaction.root_id
                                          ] = asyncio.Future()

        try:
            # Need to try and load the state to handle non-constructor
            # transactions for actors that are not yet constructed!
            #
            # We need to do this _within_ the `try` block so that we
            # abort the transaction (and release the lock) if it
            # raises.
            state = await self._load(
                context,
                state_type,
                authorize=authorize,
                from_constructor=from_constructor,
                requires_constructor=requires_constructor,
            )

            # Snapshot the loaded state's bytes for the check in
            # `complete()`.
            if state is not None:
                initial_state_bytes = state.SerializeToString(
                    deterministic=True
                )

            yield (state, complete)

            # If this is a nested transaction then we're not the
            # coordinator and can just return.
            if context.nested:
                return

            # If the transaction is not nested then we are the
            # coordinator! Check the `context` and the `transaction`
            # to verify this.
            assert (
                (state_type_name, state_ref) == (
                    transaction.coordinator_state_type,
                    transaction.coordinator_state_ref,
                )
            ), f'{state_type_name} {state_ref.id} is not the transaction coordinator'

            # Before performing two phase commit we need to perform
            # some validation just as we do for any method in a
            # transaction (however since we are nested within
            # 'transactionally()' the validation won't be performed
            # there until after the transaction has actually
            # finished, hence, we need to first do it here).
            #
            # In the event validation raises we'll short circuit to
            # the abort phase of two phase commit which will "goto"
            # the `except` block below to actually run the abort.
            self.validate_transaction_participant(context, transaction)

            # If we know our participant will abort this transaction
            # then there is no need to do the prepare phase of two
            # phase commit as it will waste unnecessary cycles (even
            # though it is safe). Instead, we short circuit to the
            # abort phase of two phase commit by raising an error here
            # which will "goto" the `except` block below to actually
            # run the abort.
            if context.transaction_must_abort or transaction.must_abort:
                raise RuntimeError('Transaction must abort')

            # Two phase commit: (1) prepare.
            #
            # Concurrently write the participant list to the database
            # ("coordinator prepare") and send `Prepare` RPCs to all
            # participants ("participants prepare").
            #
            # In addition to the participant list the coordinator also
            # writes `preparing=True` to the database so it can
            # "re-prepare" if the server crashes and recovers. Once
            # the coordinator determines that the transaction is
            # prepared it will update the database with
            # `preparing=False` so that it doesn't need to keep
            # re-preparing if the server keeps crashing.
            coordinator_prepare_timestamp, _ = await asyncio.gather(
                self._database_client.transaction_coordinator_prepare(
                    transaction_id=transaction.root_id,
                    transaction_coordinator_state_ref=state_ref,
                    participants=context.participants,
                ),
                self._transaction_coordinator_prepare(
                    application_id=context.application_id,
                    channel_manager=context.channel_manager,
                    transaction_id=transaction.root_id,
                    participants=context.participants,
                ),
            )

            if coordinator_prepare_timestamp is not None:
                self._update_latest_timestamp(coordinator_prepare_timestamp)

            participants = self._coordinator_participants[transaction.root_id]

            # Not expecting `participants` to ever be cancelled, see:
            # https://github.com/reboot-dev/mono/issues/3241
            assert not participants.cancelled()

            participants.set_result(context.participants)
        except:
            if context.nested:
                # Mark all the participants as needing to be aborted,
                # then raise the exception up to the outermost
                # transaction so the coordinator can handle the
                # failure (including participants abort, database
                # coordinator record cleanup, etc).
                context.participants.abort()
                raise

            await self._transaction_coordinator_abort(
                application_id=context.application_id,
                channel_manager=context.channel_manager,
                transaction_id=transaction.root_id,
                participants=context.participants,
                coordinator_state_ref=state_ref,
            )

            raise
        else:
            # Two phase commit: (2) commit
            #
            # TODO(benh): remove these tasks once they complete!
            self._coordinator_commit_control_loop_tasks[
                transaction.root_id
            ] = asyncio.create_task(
                self._transaction_coordinator_commit_control_loop(
                    application_id=context.application_id,
                    channel_manager=context.channel_manager,
                    transaction_id=transaction.root_id,
                    participants=context.participants,
                    coordinator_state_ref=state_ref,
                    durably_prepared=False,
                ),
                name=
                f'self._transaction_coordinator_commit_control_loop(...) in {__name__}',
            )
            # If this coordinator is shutting down now (that may have happened
            # while we were waiting for the participants to prepare) then we
            # must immediately cancel the commit control loop again, since the
            # `shutdown()` method would have already done this for the other
            # commit control loops. We prefer this create-and-cancel approach
            # over never starting the commit control loop, since this way its
            # cleanup logic can run in the usual way.
            if self._shutting_down:
                self._coordinator_commit_control_loop_tasks[transaction.root_id
                                                           ].cancel()

    async def check_for_idempotent_mutation(
        self,
        context: WriterContext | WorkflowContext | TransactionContext,
    ) -> Optional[database_pb2.IdempotentMutation]:
        """Override of StateManager.check_for_idempotent_mutation(...)
        for SidecarStateManager.
        """
        if context.idempotency_key is None:
            return None

        # Check if the idempotency key is an expired UUIDv7.
        check_idempotency_key_not_expired(context.idempotency_key)

        state_type_name = context.state_type_name
        state_ref = context._state_ref

        # If there's an in-flight transaction for this state with a
        # matching idempotency key, wait for it to finish rather than
        # starting a duplicate. After it commits the normal check below
        # will find the cached response. This avoids
        # https://github.com/reboot-dev/mono/issues/5361.
        transaction: Optional[StateManager.Transaction]
        if isinstance(context, TransactionContext) and not context.nested:
            # Need to check every in-flight transaction on this state
            # for a matching idempotency key because under a shared
            # lock multiple transactions may coexist.
            for transaction in self._lookup_participant_transactions(
                state_type_name, state_ref
            ).values():
                if transaction.idempotency_key == context.idempotency_key:
                    await transaction
                    break

        # Recover idempotent mutations on demand if necessary.
        #
        # NOTE: we do this even if we are within a transaction because
        # once this transaction completes we need to have already
        # recovered the idempotent mutations.
        #
        # Likewise, we do this even if the state has not yet been
        # constructed because we might be about to construct the
        # state.
        #
        # TODO: in the event we do recover idempotent mutations for a
        # state that doesn't get constructed, we'll need/want to
        # remove this entry, but we should do that generically across
        # all data structures that are storing state via some LRU like
        # mechanism.
        if state_ref not in self._idempotent_mutations[state_type_name]:
            # Check for an in progress call to the database (from
            # another concurrent caller or `preload()`) and await it
            # if it exists.
            #
            # NOTE: we don't `pop()` here because we want any other
            # concurrent callers or calls to `preload()` to not start
            # redundant calls into the database. If the future
            # resolves and it came from `preload()` (i.e., the future
            # has a list of idempotent mutations) then we'll handle
            # removing the future from
            # `self._idempotent_mutations_loads`.
            load = self._idempotent_mutations_loads[state_type_name].get(
                state_ref
            )
            if load is not None:
                idempotent_mutations: Optional[list[
                    database_pb2.IdempotentMutation]] = None
                try:
                    idempotent_mutations = await load
                except asyncio.CancelledError:
                    # Propagate any cancellations, e.g., if the RPC
                    # that instigated this call to
                    # `check_for_idempotent_mutation()` was cancelled.
                    #
                    # NOTE: this doesn't cancel `load` since it is a
                    # future not a task.
                    raise
                except Exception:
                    # Fall back to our own RPC.
                    pass

                # If `idempotent_mutations` is not `None` then
                # `preload()` must have completed and we need to store
                # the idempotent mutations, unless another waiter
                # already took care of that and `state_ref` is now in
                # `self._idempotent_mutations`.
                if (
                    idempotent_mutations is not None and state_ref
                    not in self._idempotent_mutations[state_type_name]
                ):
                    self._idempotent_mutations[state_type_name][
                        state_ref] = IdempotentMutations(
                            state_type_name=state_type_name,
                            state_ref=state_ref,
                            database_client=self._database_client,
                            idempotent_mutations=idempotent_mutations,
                        )
                    # Also need to remove future that was created by
                    # `preload()`.
                    assert (
                        self._idempotent_mutations_loads[state_type_name].
                        get(state_ref) is load
                    )
                    del self._idempotent_mutations_loads[state_type_name][
                        state_ref]

            # Need to do our own loading, i.e., either no concurrent
            # caller or no `preload()` or `preload()` failed.
            if state_ref not in self._idempotent_mutations[state_type_name]:
                # Create a future so concurrent callers and
                # `preload()` don't also try.
                load = asyncio.get_event_loop().create_future()
                self._idempotent_mutations_loads[state_type_name][state_ref
                                                                 ] = load
                try:
                    self._idempotent_mutations[state_type_name][state_ref] = (
                        await IdempotentMutations.recover(
                            state_type_name,
                            state_ref,
                            self._database_client,
                        )
                    )
                    load.set_result(None)
                except:
                    # Loading failed, signal to any waiters that they
                    # should try themselves. We use `set_exception()`
                    # (not `cancel()`) so consumers can distinguish
                    # when they are cancelled.
                    load.set_exception(RuntimeError("Loading failed"))
                    raise
                finally:
                    # We are responsible for cleaning up our future.
                    assert (
                        self._idempotent_mutations_loads[state_type_name].
                        get(state_ref) is load
                    )
                    del self._idempotent_mutations_loads[state_type_name][
                        state_ref]

        idempotent_mutation: Optional[database_pb2.IdempotentMutation] = (
            await self._idempotent_mutations[state_type_name][state_ref].get(
                context.idempotency_key,
                workflow_id=context.workflow_id,
                workflow_iteration=context.workflow_iteration,
            )
        )

        # If we haven't found an idempotent mutation and we're within
        # a transaction, check and see if the transaction includes it.
        if idempotent_mutation is None and context.transaction_ids is not None:
            assert context.transaction_root_id is not None
            transaction = self._lookup_participant_transaction(
                state_type_name,
                state_ref,
                context.transaction_root_id,
            )

            if (
                transaction is not None and
                context.transaction_root_id == transaction.root_id
            ):
                idempotent_mutation = transaction.idempotent_mutations.get(
                    context.idempotency_key
                )

        # Trigger reactive readers in the React generated code to
        # observe the idempotent mutation.  While they might have
        # _already_ observed this mutation, this is important in order
        # to ensure we propagate all the way back to the React
        # generated code which may be waiting for this mutation to be
        # observed.
        #
        # Note that we only do this if we're not in a transaction, as
        # it is not until the end of the transaction that a React
        # generated reactive reader would see any updates.
        if context.transaction_ids is None and idempotent_mutation is not None:
            state = self._states[state_type_name].get(state_ref, None)

            # If state is `None` then we don't have any reactive
            # readers otherwise the state will have already been
            # `_load()`ed.
            if state is not None:
                queues = self._streaming_readers[state_type_name].get(
                    state_ref,
                    None,
                )

                if queues is not None:
                    for queue in queues:
                        queue.put_nowait((state, context.idempotency_key))

        return idempotent_mutation

    async def load_task_response(
        self,
        task_id: tasks_pb2.TaskId,
    ) -> Optional[tuple[tasks_pb2.TaskResponseOrError, database_pb2.Task]]:
        """Loads the response for the given task. Returns None if the task is
        not yet complete. Throws if the task ID is not recognized.
        """
        return await self._database_client.load_task_response(task_id)

    async def read(
        self,
        context: WorkflowContext,
        state_type: type[StateT],
    ) -> StateT:
        """Override of StateManager.read(...) for SidecarStateManager."""
        assert_type(context, [WorkflowContext])
        state = await self._load(context, state_type, authorize=None)
        # Make a copy of `state` in case the caller happens to set any
        # fields it won't be seen by any other methods.
        state_copy = state_type()
        state_copy.CopyFrom(state)
        return state_copy

    async def _transaction_coordinator_prepare(
        self,
        *,
        application_id: ApplicationId,
        channel_manager: _ChannelManager,
        transaction_id: uuid.UUID,
        participants: Participants,
        skip_read_only: bool = False,
    ):
        """Sends `Prepare` RPCs to all participants concurrently, retrying
        each participant individually until getting a definitive
        response.

        Passes `abort_via_response=True` in the request so that new
        participants use definitive responses via fields in
        `PrepareResponse` (`abort`, `restart_detected`) rather than
        the legacy semantics of raising an exception causing the RPC
        to abort with a gRPC status code. This eliminates ambiguity
        with proxy/middleware errors: any RPC-level failure is always
        non-definitive and retried.

        Old participants that don't understand
        `abort_via_response=True` will ignore the field and abort the
        RPC as before. The coordinator treats any such RPC error as
        non-definitive and retries until the participant gets
        updated. In practice this should only happen once during the
        upgrade and be very short lived.

        Raises `SystemAborted` ONLY for definitive participant
        responses:

          - `SystemAborted(TransactionParticipantFailedToPrepare())`
            if the participant set `abort=True` (no such transaction,
            different transaction, or `must_abort`).

          - `SystemAborted(Unavailable())` if the participant set
            `abort=True` and `restart_detected=True` (the participant
            restarted since this transaction began but it can be
            retried).

        Any other exception is retried internally with backoff; this
        method only returns or raises once every participant has
        reached a definitive state. This narrow contract is what
        `_transaction_coordinator_reprepare` relies on when it treats
        any `SystemAborted` as "safe to abort".
        """

        async def prepare(state_type: StateTypeName, state_ref: StateRef):
            # We retry indefinitely on any non-definitive outcome: we
            # cannot report the transaction as aborted to the caller
            # unless we have a definitive "never prepared" answer from
            # the participant, because this participant may in fact
            # prepare successfully on retry and a future recovery
            # could then commit the whole transaction.
            backoff = Backoff()
            while True:
                try:
                    # Getting a channel to the actor should succeed,
                    # since its participation in a transaction that is
                    # in the prepare step indicates that (1) it is up
                    # and running and (2) we should be able to reach
                    # it. If either is temporarily untrue, we'll retry
                    # below.
                    channel = channel_manager.get_channel_to_state(
                        state_type,
                        state_ref,
                        # Since this is a Reboot-internal process that
                        # the user may not be aware is running in the
                        # background, logging user-visible errors is
                        # unhelpful.
                        unresolvable_state_log_level=logging.DEBUG,
                    )

                    stub = transactions_pb2_grpc.ParticipantStub(channel)

                    response = await stub.Prepare(
                        transactions_pb2.PrepareRequest(
                            transaction_id=transaction_id.bytes,
                            abort_via_response=True,
                            # Tell the participant we will durably
                            # record which participants are read-only
                            # and skip them on recovery so it is safe
                            # for them to elide disk writes and
                            # release the read lock immediately upon
                            # `Prepare`. Old participants ignore this
                            # field and do the disk-writes.
                            read_only_aware=True,
                        ),
                        metadata=Headers(
                            application_id=application_id,
                            state_ref=state_ref,
                        ).to_grpc_metadata(),
                    )
                except asyncio.CancelledError:
                    raise
                except BaseException:
                    # Any RPC or network error is non-definitive
                    # (could be a proxy failure, an old server that
                    # doesn't understand `abort_via_response=True`,
                    # etc). Retry after backoff.
                    await backoff()
                    continue

                # RPC succeeded — definitive outcomes are conveyed via
                # response fields, never via gRPC status codes. This
                # eliminates ambiguity with proxy/middleware errors.
                if not response.abort:
                    return

                if response.restart_detected:
                    transaction_time = (
                        datetime.fromtimestamp(
                            uuid7_timestamp_ms(transaction_id) / 1000,
                            tz=timezone.utc,
                        ).isoformat()
                    )
                    recovery_time = (
                        response.recovery_timestamp.ToDatetime(
                            tzinfo=timezone.utc
                        ).isoformat()
                    ) if response.HasField(
                        "recovery_timestamp"
                    ) else "unknown"
                    raise SystemAborted(
                        Unavailable(),
                        message=
                        f"No pending transaction for state type '{state_type}' "
                        f"state '{state_ref}': the server must have "
                        f"restarted since transaction {transaction_id} began "
                        f"(transaction created at {transaction_time}, server "
                        f"recovered at {recovery_time}).",
                    ) from None

                raise SystemAborted(
                    TransactionParticipantFailedToPrepare(),
                ) from None

        await concurrently(
            prepare(state_type, state_ref) for (state_type, state_ref) in
            # On re-prepare `skip_read_only=True` because by then
            # read-only participants may have already forgotten the
            # transaction.
            participants.should_prepare(skip_read_only=skip_read_only)
        )

    async def _transaction_coordinator_commit(
        self,
        *,
        application_id: ApplicationId,
        channel_manager: _ChannelManager,
        transaction_id: uuid.UUID,
        participants: Participants,
    ):
        """Helper for a transaction coordinator performing the commit step of
        two phase commit."""

        async def commit(state_type: StateTypeName, state_ref: StateRef):
            # Do our best to tell the participant that the transaction has
            # committed. If we fail (e.g. because we can't get a channel), no
            # big deal; the caller will retry this at a later point.
            channel = channel_manager.get_channel_to_state(
                state_type,
                state_ref,
                # Since this is a Reboot-internal process that the user
                # may not be aware is running in the background, logging
                # user-visible errors is unhelpful.
                unresolvable_state_log_level=logging.DEBUG,
            )

            stub = transactions_pb2_grpc.ParticipantStub(channel)

            try:
                await stub.Commit(
                    transactions_pb2.CommitRequest(
                        transaction_id=transaction_id.bytes
                    ),
                    metadata=Headers(
                        application_id=application_id,
                        state_ref=state_ref,
                    ).to_grpc_metadata(),
                )
            except AioRpcError as error:
                raise SystemAborted(
                    TransactionParticipantFailedToCommit(),
                    message=error.details(),
                ) from None

        async def abort(state_type: StateTypeName, state_ref: StateRef):
            # Do our best to tell the participant that, from their
            # perspective, the transaction has aborted. If we fail
            # (e.g. because we can't get a channel), no big deal; the
            # caller will retry this at a later point.
            channel = channel_manager.get_channel_to_state(
                state_type,
                state_ref,
                # Since this is a Reboot-internal process that the user
                # may not be aware is running in the background, logging
                # user-visible errors is unhelpful.
                unresolvable_state_log_level=logging.DEBUG,
            )

            stub = transactions_pb2_grpc.ParticipantStub(channel)

            try:
                await stub.Abort(
                    transactions_pb2.AbortRequest(
                        transaction_id=transaction_id.bytes
                    ),
                    metadata=Headers(
                        application_id=application_id,
                        state_ref=state_ref,
                    ).to_grpc_metadata(),
                )
            except AioRpcError as error:
                raise SystemAborted(
                    TransactionParticipantFailedToCommit(),
                    message=error.details(),
                ) from None

        await concurrently(
            itertools.chain(
                (
                    commit(state_type, state_ref)
                    for (state_type, state_ref) in participants.should_commit()
                ),
                (
                    abort(state_type, state_ref)
                    for (state_type, state_ref) in participants.should_abort()
                ),
            )
        )

    async def _transaction_coordinator_abort(
        self,
        *,
        application_id: ApplicationId,
        channel_manager: _ChannelManager,
        transaction_id: uuid.UUID,
        participants: Participants,
        coordinator_state_ref: Optional[StateRef],
    ):
        """Aborts a transaction for which we are the coordinator:
        (1) marks all participants as "to abort"; (2) cleans up
        the "preparing" record that may be in the database; (3)
        best-effort sends `Abort` RPCs to all participants; and
        (4) publishes the aborted participants to the
        `_coordinator_participants` future so any participant
        "watch control loops" observe the abort, then deletes
        the future entry."""
        # Mark all the participants as need to be aborted.
        participants.abort()

        # Clean up the "preparing" record that may be in the database
        # when the coordinator stored the transaction participants
        # (and `preparing=True`). The database write may or may not
        # have completed (it could have been cancelled), but the
        # database supports deleting missing keys.
        #
        # If we crash before doing this we'll recover the transaction
        # in the database and our commit control loop will try to
        # re-prepare only to re-discover the transaction should abort,
        # which will then properly abort any other participants and
        # clean up the database. If this gets cleaned up before we
        # have succesfully aborted any other participants then their
        # watch should signal that the transaction doesn't exist and
        # they will abort themselves.
        await self._database_client.transaction_coordinator_cleanup(
            transaction_id=transaction_id,
            coordinator_state_ref=coordinator_state_ref,
        )

        # Best effort try and tell the participants that the
        # transaction was aborted; if they don't hear from us now
        # they'll find out when they watch on their own.
        async def abort(state_type: StateTypeName, state_ref: StateRef):
            try:
                # Getting a channel to the participant may fail; notably this
                # can happen after the coordinator restarts if it tries to abort
                # before it has (re)discovered the location of the participant.
                # That's OK; see the comment in the `except` block.
                channel = channel_manager.get_channel_to_state(
                    state_type,
                    state_ref,
                    # Since this is a Reboot-internal process that the user
                    # may not be aware is running in the background, logging
                    # user-visible errors is unhelpful.
                    unresolvable_state_log_level=logging.DEBUG,
                )

                stub = transactions_pb2_grpc.ParticipantStub(channel)

                await stub.Abort(
                    transactions_pb2.AbortRequest(
                        transaction_id=transaction_id.bytes
                    ),
                    metadata=Headers(
                        application_id=application_id,
                        state_ref=state_ref,
                    ).to_grpc_metadata(),
                )
            except asyncio.CancelledError:
                # Don't swallow cancellations, so the parent task can
                # be cancelled properly.
                raise
            except:
                # NOTE: aborting is best effort abort, each
                # participant is responsible for checking back in with
                # the coordinator as well in case we were unable to
                # send an abort to them.
                pass

        await concurrently(
            abort(state_type, state_ref)
            for (state_type, state_ref) in participants.should_prepare()
        )

        # To indicate that the transaction has aborted we set the
        # participants, which will all be in
        # `participants.should_abort`.
        #
        # Not expecting `participants` to ever be cancelled, see:
        # https://github.com/reboot-dev/mono/issues/3241
        assert not self._coordinator_participants[transaction_id].cancelled()
        self._coordinator_participants[transaction_id].set_result(participants)

        # Remove transaction so that participants "watch control loop"
        # will determine that the transaction has aborted!
        del self._coordinator_participants[transaction_id]

    async def _transaction_participant_watch(
        self,
        application_id: ApplicationId,
        channel_manager: _ChannelManager,
        transaction: StateManager.Transaction,
    ):
        # Keep watching the coordinator even in the face of connection
        # failures or coordinator restarts.
        backoff = Backoff()
        while not transaction.finished():
            try:
                # Getting a channel to the coordinator may fail, for example
                # because this server is still (re)starting and hasn't
                # (re)learnt the location of the coordinator yet. That's OK;
                # we'll retry later.
                channel = channel_manager.get_channel_to_state(
                    transaction.coordinator_state_type,
                    transaction.coordinator_state_ref,
                    # Since this is a Reboot-internal process that the user
                    # may not be aware is running in the background, logging
                    # user-visible errors is unhelpful.
                    unresolvable_state_log_level=logging.DEBUG,
                )

                stub = transactions_pb2_grpc.CoordinatorStub(channel)

                # TODO(benh): consider doing an 'asyncio.wait()' that
                # also waits for 'transaction' itself so that we stop
                # watching on the coordinator once it reaches out for
                # us to commit/abort.

                watch_response = await stub.Watch(
                    transactions_pb2.WatchRequest(
                        transaction_id=transaction.root_id.bytes,
                        state_type=transaction.state_type,
                        state_ref=transaction.state_ref.to_str(),
                    ),
                    metadata=Headers(
                        application_id=application_id,
                        state_ref=transaction.coordinator_state_ref,
                    ).to_grpc_metadata(),
                )

                if not watch_response.aborted:
                    # It is worth noting here that if this participant
                    # was read-only then
                    # `transaction_participant_commit` will be a no-op
                    # because the only way a transaction commits is if
                    # it was prepared and thus this read-only
                    # participant must have prepared so
                    # `transaction_participant_commit` will find a
                    # `finished` transaction.
                    await self.transaction_participant_commit(transaction)
                else:
                    await self.transaction_participant_abort(transaction)
                break
            except Exception as e:
                # Something went wrong. Don't give up, but do give the system
                # some time to resolve whatever problem we encountered.
                logger.debug(
                    f"Encountered an error in participant watch loop: {e}"
                )
                await backoff()

                # TODO(benh): print exception if we are verbose logging.
                # traceback.print_exc()

    def add_to_server(self, server: grpc.aio.Server) -> None:
        transactions_pb2_grpc.add_CoordinatorServicer_to_server(self, server)
        transactions_pb2_grpc.add_ParticipantServicer_to_server(self, server)

    async def Watch(
        self,
        request: transactions_pb2.WatchRequest,
        grpc_context: grpc.aio.ServicerContext,
    ) -> transactions_pb2.WatchResponse:
        transaction_id = uuid.UUID(bytes=request.transaction_id)

        # Extract metadata from grpc_context and assert that the coordinator
        # state_ref was set (which is crucial for routing).
        headers = Headers.from_grpc_context(grpc_context)
        coordinator_state_ref = headers.state_ref

        # Assert that this StateManager is authoritative for the coordinator_state_ref.
        shard_for_coordinator = self._placement_client.shard_for_actor(
            self._application_id,
            coordinator_state_ref,
        )
        authoritative_shards = [shard.shard_id for shard in self._shards]
        assert shard_for_coordinator in authoritative_shards, (
            f"Watch RPC for txn_id={transaction_id} routed to wrong StateManager! "
            f"Coordinator {coordinator_state_ref.id} should be on shard {shard_for_coordinator}, "
            f"but this StateManager is authoritative for shards {authoritative_shards}"
        )

        # If we don't know about the transaction than treat is as
        # aborted. This is possible, e.g., after a server where a
        # coordinator was running gets restarted before finishing a
        # transaction and thus all participants that are trying to
        # watch need to find out that the transaction should be
        # considered aborted.
        if transaction_id not in self._coordinator_participants:
            return transactions_pb2.WatchResponse(aborted=True)
        else:
            # We must shield to avoid
            # https://github.com/reboot-dev/mono/issues/3241.
            participants = await asyncio.shield(
                self._coordinator_participants[transaction_id]
            )

            # We may get a `Watch` from both participants that should
            # commit AND read-only participants, so we need to iterate
            # through both here.
            for (state_type, state_ref) in itertools.chain(
                participants.should_commit(),
                participants.read_only(),
            ):
                if request.state_type != state_type:
                    continue
                if request.state_ref == state_ref.to_str():
                    return transactions_pb2.WatchResponse(aborted=False)

            # If it shouldn't commit, it should abort!
            #
            # This also covers the case where a participant was
            # split-brained from the rest of the transaction. In that
            # case the transaction will have aborted (because there
            # was an unsafe error due to the split-brain), and we need
            # to tell the participant to also abort, regardless of
            # whether they are in `participants`.
            return transactions_pb2.WatchResponse(aborted=True)

    def _state_type_for_state_ref(self, state_ref: StateRef) -> StateTypeName:
        tag = state_ref.state_type_tag

        state_type = self._state_type_by_state_tag.get(tag, None)

        if state_type is None:
            raise RuntimeError(f"No state type found for state '{state_ref}'")

        return state_type

    async def Prepare(
        self,
        request: transactions_pb2.PrepareRequest,
        grpc_context: grpc.aio.ServicerContext,
    ) -> transactions_pb2.PrepareResponse:
        headers = Headers.from_grpc_context(grpc_context)

        state_ref = headers.state_ref
        state_type = self._state_type_for_state_ref(state_ref)

        transaction_id = uuid.UUID(bytes=request.transaction_id)
        transaction = self._lookup_participant_transaction(
            state_type, state_ref, transaction_id
        )
        if transaction is None:
            if (
                self._can_use_restart_detection(transaction_id, state_type) and
                # `_can_use_restart_detection` ensures that
                # `self._recovery_timestamp_ms` is not `None`.
                self._recovery_timestamp_ms  # type: ignore[operator]
                > uuid7_timestamp_ms(transaction_id)
            ):
                assert self._recovery_timestamp_ms is not None  # for mypy
                if request.abort_via_response:
                    recovery_timestamp = Timestamp()
                    recovery_timestamp.FromMilliseconds(
                        self._recovery_timestamp_ms,
                    )
                    return transactions_pb2.PrepareResponse(
                        abort=True,
                        restart_detected=True,
                        recovery_timestamp=recovery_timestamp,
                    )
                transaction_time = datetime.fromtimestamp(
                    uuid7_timestamp_ms(transaction_id) / 1000,
                    tz=timezone.utc,
                ).isoformat()
                recovery_time = datetime.fromtimestamp(
                    self._recovery_timestamp_ms / 1000,
                    tz=timezone.utc,
                ).isoformat()
                # Legacy path for old coordinators.
                raise RuntimeError(
                    f"No pending transaction for state type '{state_type}' "
                    f"state '{state_ref.id}': the server must have "
                    f"restarted since transaction {transaction_id} began "
                    f"(transaction created at {transaction_time}, server "
                    f"recovered at {recovery_time})."
                )
            if request.abort_via_response:
                logger.warning(
                    f"Failed to prepare transaction '{transaction_id}': "
                    f"No pending transaction for state type '{state_type}' "
                    f"state '{state_ref.id}'"
                )
                return transactions_pb2.PrepareResponse(abort=True)
            # Legacy path for old coordinators.
            raise RuntimeError(
                f"No pending transaction for state type '{state_type}' "
                f"state '{state_ref.id}'"
            )
        if transaction.root_id != transaction_id:
            if request.abort_via_response:
                logger.warning(
                    f"Failed to prepare transaction '{transaction_id}': "
                    "Pending transaction id differs"
                )
                return transactions_pb2.PrepareResponse(abort=True)
            # Legacy path for old coordinators.
            raise RuntimeError('Pending transaction id differs')
        else:
            # If the transaction is already prepared (e.g., because we
            # recovered it from the database after a restart and the
            # coordinator is re-preparing), just return success.
            if transaction.prepared():
                return transactions_pb2.PrepareResponse()

            # All RPCs that are part of this transaction should
            # have completed which means all streaming readers
            # should have completed!
            assert len(transaction.streaming_readers) == 0

            await transaction.tasks_dispatcher.validate(transaction.tasks)

            if transaction.must_abort:
                if request.abort_via_response:
                    logger.warning(
                        f"Failed to prepare transaction '{transaction_id}': "
                        "Transaction must abort"
                    )
                    return transactions_pb2.PrepareResponse(abort=True)
                # Legacy path for old coordinators.
                raise RuntimeError('Transaction must abort')

            await self.transaction_participant_prepare(
                transaction,
                read_only_aware=request.read_only_aware,
            )

            return transactions_pb2.PrepareResponse()

    async def Commit(
        self, request: transactions_pb2.CommitRequest,
        grpc_context: grpc.aio.ServicerContext
    ) -> transactions_pb2.CommitResponse:
        headers = Headers.from_grpc_context(grpc_context)

        state_ref = headers.state_ref
        state_type = self._state_type_for_state_ref(state_ref)

        transaction_id = uuid.UUID(bytes=request.transaction_id)
        transaction = self._lookup_participant_transaction(
            state_type, state_ref, transaction_id
        )

        # It's possible the transaction was already committed from
        # watching, and we might even be on to another transaction, so
        # we can let the coordinator know we are all set.
        if transaction is None or transaction.root_id != transaction_id:
            return transactions_pb2.CommitResponse()

        await self.transaction_participant_commit(transaction)

        # NOTE: we don't bother cancelling 'transaction.watch_task'
        # because it will complete on it's own once it notices that
        # the transaction has finished (either when it retries to
        # watch or when it hears back from the coordinator).
        #
        # Also, a watch task doesn't start until after control is
        # exited from 'transactionally()', which means that we might
        # not have started a watch task if the coordinator ==
        # participant since we may be in the middle of two phase
        # commit.
        #
        # We might we want to try and preemptively cancel the task to
        # lessen the strain on the coordinator but this appears more
        # difficult than just doing 'transaction.watch_task.cancel()'
        # as it looks like that propagates cancellation in unexpected
        # ways.

        return transactions_pb2.CommitResponse()

    async def Abort(
        self, request: transactions_pb2.AbortRequest,
        grpc_context: grpc.aio.ServicerContext
    ) -> transactions_pb2.AbortResponse:
        headers = Headers.from_grpc_context(grpc_context)

        state_ref = headers.state_ref
        state_type = self._state_type_for_state_ref(state_ref)

        transaction_id = uuid.UUID(bytes=request.transaction_id)
        transaction = self._lookup_participant_transaction(
            state_type, state_ref, transaction_id
        )

        # It's possible the transaction was already aborted from
        # watching, and we might even be on to another transaction, so
        # we can let the coordinator know we are all set.
        if transaction is None or transaction.root_id != transaction_id:
            return transactions_pb2.AbortResponse()

        await self.transaction_participant_abort(transaction)

        # NOTE: we don't bother cancelling 'transaction.watch_task'
        # because it will complete on it's own once it notices that
        # the transaction has finished (either when it retries to
        # watch or when it hears back from the coordinator).
        #
        # Also, a watch task doesn't start until after control is
        # exited from 'transactionally()', which means that we might
        # not have started a watch task if the coordinator ==
        # participant since we may be in the middle of two phase
        # commit.
        #
        # We might we want to try and preemptively cancel the task to
        # lessen the strain on the coordinator but this appears more
        # difficult than just doing 'transaction.watch_task.cancel()'
        # as it looks like that propagates cancellation in unexpected
        # ways.

        return transactions_pb2.AbortResponse()

    async def transaction_participant_store(
        self,
        transaction: StateManager.Transaction,
    ) -> None:
        # NOTE: doing double checked locking here so that we don't block if
        # there is a concurrent writer doing a store which it always does while
        # holding the transaction lock even though the transaction might already
        # be stored (e.g., by an earlier reader or writer). For this, we use
        # `_stored` to "unsafely" peek at the value.
        if not transaction._stored:
            async with transaction.lock:
                if not transaction.stored:
                    await self._store(
                        state_type=transaction.state_type,
                        state_ref=transaction.state_ref,
                        transaction=transaction,
                    )

    async def transaction_participant_prepare(
        self,
        transaction: StateManager.Transaction,
        *,
        read_only_aware: bool = False,
    ):
        state_type = transaction.state_type
        state_ref = transaction.state_ref

        async with transaction.lock:
            if not transaction.finished():
                # If the coordinator is `read_only_aware` and this
                # participant was read-only (i.e., only ever needed
                # the shared lock AND has nothing that needs
                # persisting, e.g., no idempotent mutations, no tasks,
                # and is using restart detection and hasn't already
                # written something to disk) then we can skip all disk
                # writes for prepare and commit, mark the transaction
                # prepared + committed in memory, and release the read
                # lock immediately.
                if (
                    transaction.mode == "shared" and
                    # NOTE: at this point if
                    # `transaction.idempotency_key is not None` then
                    # `len(transaction.idempotent_mutations) > 0`.
                    len(transaction.idempotent_mutations) == 0 and
                    transaction.using_restart_detection and read_only_aware
                ):
                    # Tasks always trigger a lock upgrade via
                    # `Effects.requires_exclusive()`, so a shared-mode
                    # transaction can never have tasks.
                    assert len(
                        transaction.tasks
                    ) == 0, ("A read-only transaction unexpectedly has tasks")
                    transaction.prepare()
                    transaction.commit()
                    # Release the shared lock and drop the participant
                    # entry. The coordinator skips us in commit, so we
                    # never need to be contacted again.
                    self._complete_participant_transaction(
                        state_type, state_ref, transaction
                    )
                    return
                # When using restart detection, all intermediate
                # writes were deferred (no database calls). Now at
                # prepare time we derive what we need from the
                # transaction's in-memory state and send it all at
                # once to the database. This is the only database
                # write for the entire transaction.
                #
                # When NOT using restart detection, the writes were
                # already applied to the RocksDB transaction during
                # intermediate `_store()` calls, so we just need to
                # call prepare on the existing transaction.
                if transaction.using_restart_detection:
                    timestamp = await self._database_client.transaction_participant_prepare(
                        state_type,
                        state_ref,
                        transaction=(
                            database_pb2.Transaction(
                                state_type=state_type,
                                state_ref=state_ref.to_str(),
                                transaction_ids=[
                                    transaction_id.bytes
                                    for transaction_id in transaction.ids
                                ],
                                coordinator_state_type=(
                                    transaction.coordinator_state_type
                                ),
                                coordinator_state_ref=(
                                    transaction.coordinator_state_ref.to_str()
                                ),
                            )
                        ),
                        state=(
                            transaction.state.SerializeToString()
                            if transaction.state is not None and
                            # Only persist the state when we actually
                            # mutated it. A transaction holding a
                            # shared lock means its
                            # `transaction.state` has not been
                            # mutated!
                            transaction.mode == "exclusive" else None
                        ),
                        task_upserts=[
                            task.to_sidecar_task()
                            for task in transaction.tasks
                        ],
                        idempotent_mutations=(
                            list(transaction.idempotent_mutations.values()) if
                            len(transaction.idempotent_mutations) > 0 else None
                        ),
                    )
                else:
                    timestamp = await self._database_client.transaction_participant_prepare(
                        state_type, state_ref
                    )

                self._update_latest_timestamp(timestamp)
                transaction.prepare()

    async def transaction_participant_commit(
        self, transaction: StateManager.Transaction
    ):
        state_type = transaction.state_type
        state_ref = transaction.state_ref

        # NOTE: there is a possible race where either the watch will
        # try and commit or the coordinator will reach out to the
        # participant to commit hence the need to lock as well as
        # check if the transaction has finished.
        async with transaction.lock:
            if not transaction.finished():
                # TODO(benh): add test case for sidecar failure!
                timestamp = await self._database_client.transaction_participant_commit(
                    state_type, state_ref
                )
                self._update_latest_timestamp(timestamp)

                # NOTE: invariant here is everything after this line
                # SHOULD NOT RAISE!
                #
                # If we raise while calling the sidecar above then
                # we'll retry, either via the watch or via the
                # coordinator (who ever ultimately called this
                # method).
                #
                # After this comment nothing can be retried again so
                # it SHOULD NOT RAISE.

                try:
                    queues = self._streaming_readers[state_type].get(state_ref)

                    state_was_cached = state_ref in self._states[state_type]
                    if transaction.state is not None:
                        self._states[state_type][state_ref] = transaction.state
                    else:
                        # This can occur during the recovery process, when the
                        # transaction is already prepared. In that case, we expect
                        # `transaction.state` to be `None` and we also expect that
                        # there will not be any state stored in `self._states`. Once
                        # the transaction gets committed then a subsequent reader
                        # or writer will retrieve the committed state from disk
                        # storage which will properly store it in `self._states`.
                        #
                        # Additionally, during recover we do not expect to have any
                        # active streaming readers so `queues` should be `None`.
                        assert queues is None
                        assert self._states[state_type].get(state_ref) is None

                    if queues is not None:
                        for queue in queues:
                            # NOTE: we defer making a reader specific copy
                            # of this state until the reader actually
                            # reads it to reduce memory usage.
                            queue.put_nowait(
                                (
                                    transaction.state,
                                    transaction.idempotency_key,
                                )
                            )

                    # NOTE: while dispatching tasks is idempotent and can
                    # be "retried" if necessary, the tasks should not run
                    # until after the state has been updated since they
                    # may rely on that state!
                    if len(transaction.tasks) > 0:
                        transaction.tasks_dispatcher.dispatch(
                            transaction.tasks
                        )

                    if not state_was_cached:
                        # We MAY have just added this actor as a new state.
                        # Notify anybody watching for a change in the
                        # existant actors.
                        #
                        # Note that it's OK to only consider this
                        # participant's state ref. If there's another
                        # participant that was added in this transaction,
                        # its state manager will perform the notification.
                        for event in self._actors_list_maybe_changed_events:
                            event.set()

                    # Add all idempotent mutations that occurred within
                    # this transaction.
                    #
                    # TODO(benh): once the transaction is committed the
                    # idempotency keys used for mutations within the
                    # transaction are really only useful for detecting when
                    # a user has incorrectly reused an idempotency key. We
                    # don't do any of those checks now, and in the future
                    # we might explicitly decide _not_ to store
                    # idempotency keys within a transaction to improve
                    # performance (or possibly make it configurable so
                    # users can tradeoff performance for better error
                    # detection of their own code).
                    if len(transaction.idempotent_mutations) > 0:
                        # Invariant here is that if this transaction
                        # includes idempotent mutations then we should
                        # have already recovered them from the
                        # database (we'll get a `KeyError` here if
                        # this invariant is broken).
                        self._idempotent_mutations[state_type][
                            state_ref].update(
                                transaction.idempotent_mutations
                            )

                    transaction.commit()

                    self._complete_participant_transaction(
                        state_type, state_ref, transaction
                    )
                except BaseException as e:
                    print(
                        "##### WOW! YOU'VE FOUND A BUG IN REBOOT! #####\n"
                        "Please report this to the maintainers:\n"
                        "  https://github.com/reboot-dev/reboot/issues/new?template=bug_report.md\n"
                        "Include the following error message:\n"
                        "  Raised exception in critical exception-intolerant "
                        "  Commit section:\n"
                        f"    {type(e)}: '{e}'\n"
                        "  Stack trace follows.\n"
                        "\n"
                        f"{traceback.format_exc()}"
                        "##############################################",
                        file=sys.stderr,
                    )
                    raise e

    async def transaction_participant_abort(
        self, transaction: StateManager.Transaction
    ):
        state_type = transaction.state_type
        state_ref = transaction.state_ref

        # NOTE: there is a possible race where either the watch will
        # try and commit or the coordinator will reach out to the
        # participant to commit hence the need to lock as well as
        # check if the transaction has finished.
        async with transaction.lock:
            if not transaction.finished():
                # If the prepare was cancelled before ever reaching
                # the database when using restart detection we won't
                # have anything to abort but the database tolerates
                # "no transaction found" as a no-op. If the prepare is
                # still in progress, the database ensures it is
                # serialized with this abort.
                if transaction.stored or transaction.using_restart_detection:
                    await self._database_client.transaction_participant_abort(
                        state_type, state_ref
                    )

                # NOTE: invariant here is everything after this line
                # SHOULD NOT RAISE!
                #
                # If we raise while calling the sidecar above then
                # we'll retry, either via the watch or via the
                # coordinator (who ever ultimately called this
                # method).
                #
                # After this comment nothing can be retried again so
                # it SHOULD NOT RAISE.

                try:
                    # Need to abort all streaming readers that are part of
                    # this transaction!
                    for queue in transaction.streaming_readers:
                        queue.put_nowait(None)

                    transaction.abort()

                    self._complete_participant_transaction(
                        state_type, state_ref, transaction
                    )
                except BaseException as e:
                    print(
                        "##### WOW! YOU'VE FOUND A BUG IN REBOOT! #####\n"
                        "Please report this to the maintainers:\n"
                        "  https://github.com/reboot-dev/reboot/issues/new?template=bug_report.md\n"
                        "Include the following error message:\n"
                        "  Raised exception in critical exception-intolerant "
                        "  Abort section:\n"
                        f"    {type(e)}: '{e}'\n"
                        "  Stack trace follows.\n"
                        "\n"
                        f"{traceback.format_exc()}"
                        "##############################################",
                        file=sys.stderr,
                    )
                    raise e

    async def _colocated_omnidirectional_range(
        self,
        context: Context,
        *,
        start: Optional[str],
        end: Optional[str],
        limit: int,
        reverse: bool,
    ) -> list[tuple[str, bytes]]:
        transaction = None if context.transaction_ids is None else database_pb2.Transaction(
            state_type=context.state_type_name,
            state_ref=context._state_ref.to_str(),
            transaction_ids=[
                transaction_id.bytes
                for transaction_id in context.transaction_ids
            ],
            coordinator_state_type=(
                context.transaction_coordinator_state_type or ""
            ),
            coordinator_state_ref=(
                context.transaction_coordinator_state_ref.to_str()
                if context.transaction_coordinator_state_ref else ""
            ),
        )
        if context.state_type_name != SORTED_MAP_TYPE_NAME:
            raise ValueError(
                "To create a larger than memory collection, "
                f"please use the {SORTED_MAP_TYPE_NAME} builtin type."
            )
        parent_state_ref = context._state_ref
        start_ref = None if start is None else StateRef.from_id(
            SORTED_MAP_ENTRY_TYPE_NAME, StateId(start)
        )
        end_ref = None if end is None else StateRef.from_id(
            SORTED_MAP_ENTRY_TYPE_NAME, StateId(end)
        )

        if reverse:
            page = await self._database_client.colocated_reverse_range(
                parent_state_ref=parent_state_ref,
                start=start_ref,
                end=end_ref,
                limit=limit,
                transaction=transaction,
            )
        else:
            page = await self._database_client.colocated_range(
                parent_state_ref=parent_state_ref,
                start=start_ref,
                end=end_ref,
                limit=limit,
                transaction=transaction,
            )

        def decode_key(k: StateRef) -> StateId:
            assert k.matches_state_type(SORTED_MAP_ENTRY_TYPE_NAME)
            return k.id

        return [(decode_key(k), v) for (k, v) in page]

    async def colocated_range(
        self,
        context: Context,
        *,
        start: Optional[str] = None,
        end: Optional[str] = None,
        limit: int,
    ) -> list[tuple[str, bytes]]:
        """Get the colocated state machines of this state machine in the given range.

        NOTE: Only `SortedMap` may consume this method currently. See #2983.
        """
        return await self._colocated_omnidirectional_range(
            context,
            start=start,
            end=end,
            limit=limit,
            reverse=False,
        )

    async def colocated_reverse_range(
        self,
        context: Context,
        *,
        start: Optional[str] = None,
        end: Optional[str] = None,
        limit: int,
    ) -> list[tuple[str, bytes]]:
        """Get the colocated state machines of this state machine in the given
        reverse range.

        NOTE: Only `SortedMap` may consume this method currently. See #2983.
        """
        return await self._colocated_omnidirectional_range(
            context,
            start=start,
            end=end,
            limit=limit,
            reverse=True,
        )

    @function_span()
    async def recover(
        self,
        *,
        application_id: ApplicationId,
        channel_manager: _ChannelManager,
        middleware_by_state_type_name: dict[StateTypeName, Middleware],
    ) -> None:
        """Attempt to recover server state after a potential restart."""
        recover_response = await self._database_client.recover(
            {
                state_type: state_type_tag_for_name(state_type)
                for state_type in middleware_by_state_type_name.keys()
            },
            shard_ids=[shard.shard_id for shard in self._shards],
        )

        # Extract recovery timestamp for restart detection.
        if recover_response.HasField("timestamp"):
            recovery_timestamp_ms = recover_response.timestamp.ToMilliseconds()
            self._recovery_timestamp_ms = recovery_timestamp_ms
            self._latest_timestamp_ms = recovery_timestamp_ms

        # Need to declare this up here as it is used in multiple scopes.
        middleware: Optional[Middleware] = None

        # To avoid dispatching only some tasks in case of a RuntimeError thrown
        # below, we save all the tasks here alongside their matching middleware
        # and dispatch them only after recovering everything.
        task_effects_by_middleware: defaultdict[
            Middleware, list[TaskEffect]] = defaultdict(list)

        for task in recover_response.pending_tasks:
            middleware = self._middleware_for_state_type_name(
                middleware_by_state_type_name,
                task.task_id.state_type,
                error_suffix=f"when restarting task '{task.task_id}'",
            )
            task_effect = self._get_task_effect_from_sidecar_task(
                middleware, task
            )
            task_effects_by_middleware[middleware].append(task_effect)

        # All tasks recovered, let's dispatch them.
        for middleware, task_effects in task_effects_by_middleware.items():
            middleware.tasks_dispatcher.dispatch(task_effects)

        # Now recover any ongoing transactions.
        for sidecar_transaction in recover_response.participant_transactions:
            middleware = self._middleware_for_state_type_name(
                middleware_by_state_type_name,
                sidecar_transaction.state_type,
                error_suffix="when recovering transaction "
                f"'{uuid.UUID(bytes=sidecar_transaction.transaction_ids[0])}'",
            )

            transaction = StateManager.Transaction.from_sidecar(
                sidecar_transaction, middleware
            )

            # Mark recovered transactions exclusive-mode. In an
            # upcoming commit we'll never recover transactions that
            # were read-only.
            transaction.mode = "exclusive"

            # This transaction should NOT already be recovered. There
            # may not yet be ANY transactions for this state.
            transactions = self._participant_transactions[
                transaction.state_type].setdefault(transaction.state_ref, {})
            assert transaction.root_id not in transactions
            transactions[transaction.root_id] = transaction

            # The mutator lock should not be held yet as recovery
            # _must_ occur before we start serving and we expect at
            # most one transaction per state during recovery!
            assert not self._locks[transaction.state_type][
                transaction.state_ref].is_locked()

            await self._locks[transaction.state_type][transaction.state_ref
                                                     ].acquire_exclusive(
                                                         deadline_seconds=None,
                                                     )

            # TODO(benh): don't just "watch" the transaction, also
            # proactively tell the coordinator if this transaction
            # 'must_abort' if we recovered an unprepared transaction
            # so that we can abort a long-running transaction sooner
            # rather than later.

            transaction.watch_task = asyncio.create_task(
                self._transaction_participant_watch(
                    application_id,
                    channel_manager,
                    transaction,
                ),
                name=f'self._transaction_participant_watch(...) in {__name__}',
            )

        for (transaction_id, coordinator) in [
            (uuid.UUID(transaction_id), coordinator)
            for (transaction_id, coordinator
                ) in recover_response.transaction_coordinators.items()
        ]:
            participants = Participants.from_sidecar(coordinator.participants)
            coordinator_state_ref = StateRef(
                coordinator.state_ref
            ) if coordinator.state_ref else None

            self._coordinator_participants[transaction_id] = asyncio.Future()

            if not coordinator.preparing:
                # Fully prepared: the commit control loop can proceed
                # directly to commit, so publish the participants
                # future now.
                self._coordinator_participants[transaction_id].set_result(
                    participants
                )

            self._coordinator_commit_control_loop_tasks[
                transaction_id
            ] = asyncio.create_task(
                self._transaction_coordinator_commit_control_loop(
                    application_id=application_id,
                    channel_manager=channel_manager,
                    transaction_id=transaction_id,
                    participants=participants,
                    coordinator_state_ref=coordinator_state_ref,
                    # If `coordinator.preparing` is true the
                    # coordinator recorded participants but crashed
                    # before confirming all were prepared; the commit
                    # control loop will re-prepare them before
                    # continuing.
                    durably_prepared=not coordinator.preparing,
                    needs_reprepare=coordinator.preparing,
                ),
                name=
                f'self._transaction_coordinator_commit_control_loop(...) in {__name__}',
            )

        # Start the periodic timestamp refresh loop only if the
        # database supports timestamps which it must if we have a
        # recovery timestamp.
        if self._recovery_timestamp_ms is not None:
            self._timestamp_refresh_task = asyncio.create_task(
                self._refresh_timestamp_loop(),
                name=f"self._refresh_timestamp_loop() in {__name__}",
            )

    def _get_task_effect_from_sidecar_task(
        self,
        middleware: Middleware,
        task: database_pb2.Task,
    ) -> TaskEffect:
        if task.method not in middleware.request_type_by_method_name:
            # TODO(#1443): Clean up this error handling once we have
            # validation of state type backwards compatibility for in-use task
            # methods.
            raise RuntimeError(
                f"Task method '{task.method}' has no registered "
                f"request type in middleware. Was the method removed?"
            )

        try:
            return TaskEffect.from_sidecar_task(
                task,
                middleware.request_type_by_method_name[task.method],
            )
        except Exception as e:
            # TODO(#1443): Clean up this error handling once we have
            # validation of state type backwards compatibility for in-use task
            # methods.
            raise RuntimeError('Error parsing task request') from e

    async def _transaction_coordinator_reprepare(
        self,
        *,
        application_id: ApplicationId,
        channel_manager: _ChannelManager,
        transaction_id: uuid.UUID,
        participants: Participants,
        coordinator_state_ref: Optional[StateRef],
    ) -> bool:
        """Recovery for coordinators that stored participants but didn't
        confirm all were prepared. Re-prepares all participants.
        Returns `True` if all participants re-prepared successfully,
        or `False` if the transaction was aborted (and cleaned up)
        because a participant gave a definitive response proving it
        never durably prepared this transaction.
        """
        prepared = False
        backoff = Backoff()
        while True:
            try:
                await self._transaction_coordinator_prepare(
                    application_id=application_id,
                    channel_manager=channel_manager,
                    transaction_id=transaction_id,
                    participants=participants,
                    # Read-only participants may have already elided
                    # their disk writes and released their locks
                    # during the original `Prepare` and re-preparing
                    # now may cause an abort because they have no
                    # in-memory transaction!
                    skip_read_only=True,
                )
                prepared = True
                break
            except asyncio.CancelledError:
                raise
            except SystemAborted:
                # Per `_transaction_coordinator_prepare`'s contract,
                # any `SystemAborted` it raises means some participant
                # has definitively no durable prepared state for this
                # transaction. If *any* participant never durably
                # prepared, the original prepare cannot have fully
                # succeeded, so the coordinator never reached the path
                # where it returned success to the caller. Therefore
                # it is safe to abort.
                break
            except BaseException as exception:
                # `_transaction_coordinator_prepare` is supposed
                # to have already retried any non-definitive
                # errors. If we end up here something unexpected
                # happened; log and retry with backoff.
                logger.warning(
                    f"Failed to re-prepare transaction '{transaction_id}': "
                    f"{exception}"
                )
                await backoff()
                continue

        if not prepared:
            # A participant gave a definitive "never prepared"
            # response. Abort.
            await self._transaction_coordinator_abort(
                application_id=application_id,
                channel_manager=channel_manager,
                transaction_id=transaction_id,
                participants=participants,
                coordinator_state_ref=coordinator_state_ref,
            )
            return False

        # All participants re-prepared successfully. Set the
        # participants future so watches work correctly.
        self._coordinator_participants[transaction_id].set_result(participants)
        return True

    async def _transaction_coordinator_commit_control_loop(
        self,
        *,
        application_id: ApplicationId,
        channel_manager: _ChannelManager,
        transaction_id: uuid.UUID,
        participants: Participants,
        coordinator_state_ref: Optional[StateRef],
        durably_prepared: bool,
        needs_reprepare: bool = False,
    ) -> None:
        if needs_reprepare:
            assert not durably_prepared, (
                "A coordinator transaction that is durably prepared "
                "should never need to re-prepare!"
            )
            # On recovery, the coordinator recorded participants but
            # crashed before confirming all were prepared. Re-prepare
            # all participants before continuing with the commit.
            if not await self._transaction_coordinator_reprepare(
                application_id=application_id,
                channel_manager=channel_manager,
                transaction_id=transaction_id,
                participants=participants,
                coordinator_state_ref=coordinator_state_ref,
            ):
                # The transaction was aborted, and cleanup already
                # happened in `_transaction_coordinator_reprepare`.
                del self._coordinator_commit_control_loop_tasks[transaction_id]
                return

        # If this coordinator transaction is not durably prepared,
        # i.e., the database still has "preparing=True" we must now
        # overwrite that with `preparing=False` to mark the
        # transaction as fully prepared.
        #
        # This MUST complete _before_ committing so that all
        # participants remain valid in the event we crash (again) and
        # need to re-prepare (again).
        if not durably_prepared:
            assert coordinator_state_ref is not None
            backoff = Backoff()
            while True:
                try:
                    timestamp = await self._database_client.transaction_coordinator_prepared(
                        transaction_id=transaction_id,
                        transaction_coordinator_state_ref=coordinator_state_ref,
                        participants=participants,
                    )
                    if timestamp is not None:
                        self._update_latest_timestamp(timestamp)
                    break
                except asyncio.CancelledError:
                    raise
                except BaseException:
                    await backoff()
                    continue

        backoff = Backoff()
        is_retry = False
        while True:
            try:
                if is_retry:
                    # Do some backoff. We do this here, rather than in the
                    # `except` block, so that if `await backoff()` is cancelled
                    # we'll still catch it below and warn.
                    await backoff()

                await self._transaction_coordinator_commit(
                    application_id=application_id,
                    channel_manager=channel_manager,
                    transaction_id=transaction_id,
                    participants=participants,
                )

                # We can safely delete the transaction because all
                # participants have acknowledged the commit!
                #
                # NOTE: as of the writing of this comment it is still
                # possible that one of the participants might have
                # started a watch which after we delete the entry from
                # 'self._coordinator_participants' below would cause
                # that watch to think that the transaction was aborted
                # but when the watch loop actually tries to do the
                # abort it will see that the transaction has actually
                # been finished because a commit was done first (from
                # the call above).
                del self._coordinator_participants[transaction_id]

                # Cleanup the sidecar participant state. If we fail before
                # doing this then this control loop will run again after
                # recover, but participants will acknowledge the transaction
                # as already completed, and allow us to exit the loop the
                # second time.
                await self._database_client.transaction_coordinator_cleanup(
                    transaction_id=transaction_id,
                    coordinator_state_ref=coordinator_state_ref,
                )

                break

            except asyncio.exceptions.CancelledError:
                # Cancelled errors need to be re-raised.
                # This probably means we are currently shutting down. The commit
                # loop will be resumed on next startup. This is safe.
                raise
            except BaseException as e:
                # Something went wrong. Don't give up, but mark the next
                # attempt as a retry.
                is_retry = True
                logger.debug(f"Coordinator failed to commit; will retry: {e}")
                continue

        # Our commit control loop `asyncio.Task` is about to complete. Remove it
        # from the list of active tasks. Note that this has to be done here,
        # since (by design) there may not be anybody else `await`ing the
        # completion of this task.
        del self._coordinator_commit_control_loop_tasks[transaction_id]

    def _middleware_for_state_type_name(
        self,
        middleware_by_state_type_name: dict[StateTypeName, Middleware],
        state_type_name: StateTypeName,
        *,
        error_suffix: str,
    ) -> Middleware:
        # Find the correct servicer middleware to handle this task, and use
        # it to recover the task's dispatch information.
        middleware = middleware_by_state_type_name.get(state_type_name)
        if middleware is not None:
            return middleware

        # TODO(#1443): Clean up this error handling once we have
        # validation of service backwards compatibility for in-use task
        # methods.
        raise RuntimeError(
            f"Missing middleware for state type '{state_type_name}' "
            f"{error_suffix}."
        )
