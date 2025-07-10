from __future__ import annotations

import asyncio
import grpc
import log.log
import logging
import sys
import uuid
from abc import ABC, abstractmethod
from collections import defaultdict
from contextlib import asynccontextmanager
from dataclasses import dataclass
from datetime import timedelta
from google.protobuf import any_pb2
from google.protobuf.message import Message
from grpc.aio import AioRpcError
from log.log import log_at_most_once_per
from rbt.v1alpha1 import (
    sidecar_pb2,
    tasks_pb2,
    transactions_pb2,
    transactions_pb2_grpc,
)
from rbt.v1alpha1.errors_pb2 import (
    StateAlreadyConstructed,
    StateNotConstructed,
    TransactionParticipantFailedToCommit,
    TransactionParticipantFailedToPrepare,
)
from rebootdev.admin.export_import_converters import ExportImportItemConverters
from rebootdev.aio.aborted import Aborted, SystemAborted
from rebootdev.aio.backoff import Backoff
from rebootdev.aio.contexts import (
    Context,
    Participants,
    React,
    ReaderContext,
    TransactionContext,
    WorkflowContext,
    WriterContext,
)
from rebootdev.aio.exceptions import InputError
from rebootdev.aio.headers import Headers
from rebootdev.aio.internals.channel_manager import _ChannelManager
from rebootdev.aio.internals.middleware import Middleware
from rebootdev.aio.internals.tasks_dispatcher import (
    TaskResponseOrError,
    TasksDispatcher,
)
from rebootdev.aio.once import AsyncOnce
from rebootdev.aio.servicers import RebootServiceable, Serviceable
from rebootdev.aio.tasks import Loop, TaskEffect
from rebootdev.aio.tracing import asynccontextmanager_span, function_span
from rebootdev.aio.types import (
    ApplicationId,
    StateId,
    StateRef,
    StateTypeName,
    assert_type,
    state_type_tag_for_name,
)
from rebootdev.consensus.sidecar import (
    SORTED_MAP_ENTRY_TYPE_NAME,
    SORTED_MAP_TYPE_NAME,
    SidecarClient,
    SidecarServer,
    SidecarServerFailed,
)
from rebootdev.time import DateTimeWithTimeZone
from typing import (
    AsyncGenerator,
    AsyncIterator,
    Awaitable,
    Callable,
    Optional,
    Set,
    TypeAlias,
    TypeVar,
    cast,
)

logger = log.log.get_logger(__name__)
# TODO(rjh): some mechanism where developers can configure the Reboot log
# level per-module or globally. For now, default to `WARNING`: we have warnings
# in this file that we expect users to want to see.
logger.setLevel(logging.WARNING)

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
        state: Message,
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
            )

        @classmethod
        def from_sidecar(
            cls,
            transaction: sidecar_pb2.Transaction,
            middleware: Middleware,
        ) -> StateManager.Transaction:
            return cls(
                transaction_ids=[
                    uuid.UUID(bytes=transaction_id)
                    for transaction_id in transaction.transaction_ids
                ],
                coordinator_state_type=transaction.coordinator_state_type,
                coordinator_state_ref=StateRef(
                    transaction.coordinator_state_ref
                ),
                state_type=transaction.state_type,
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
            idempotent_mutations: Optional[dict[uuid.UUID,
                                                sidecar_pb2.IdempotentMutation]
                                          ] = None,
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

    @abstractmethod
    def add_to_server(self, server: grpc.aio.Server) -> None:
        """Hook for adding the state manager to a gRPC server."""
        raise NotImplementedError()

    @abstractmethod
    async def actors(
        self
    ) -> AsyncIterator[dict[StateTypeName, Set[StateRef]]]:
        """Returns an iterator of all the actors under management."""
        raise NotImplementedError()
        yield  # Necessary for type checking.

    @abstractmethod
    async def export_items(
        self, state_type: StateTypeName
    ) -> AsyncIterator[sidecar_pb2.ExportItem]:
        """Exports the committed state of all actors of the given type."""
        raise NotImplementedError
        yield  # Necessary for type checking.

    @abstractmethod
    async def import_task(
        self,
        state_type: StateTypeName,
        state_ref: StateRef,
        task: sidecar_pb2.Task,
        middleware: Middleware,
    ) -> None:
        """Imports state for an actor, overwriting on collision."""
        raise NotImplementedError

    @abstractmethod
    async def import_actor(
        self,
        state_type: StateTypeName,
        state_ref: StateRef,
        state: Message,
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
    ) -> None:
        """Imports state for an actor, overwriting on collision."""
        raise NotImplementedError

    @abstractmethod
    async def import_idempotent_mutation(
        self,
        state_type: StateTypeName,
        state_ref: StateRef,
        idempotent_mutation: sidecar_pb2.IdempotentMutation,
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
    @asynccontextmanager
    async def task_workflow(
        self,
        context: WorkflowContext,
    ) -> AsyncIterator[Callable[[TaskEffect, TaskResponseOrError],
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
    def check_for_idempotent_mutation(
        self,
        context: WriterContext | WorkflowContext | TransactionContext,
    ) -> Optional[sidecar_pb2.IdempotentMutation]:
        """Helper for code generated writers and transactions that returns the
        serialized response if the mutation has been performed or None
        if the mutation has not been performed.
        """
        raise NotImplementedError()

    @abstractmethod
    async def load_task_response(
        self,
        task_id: tasks_pb2.TaskId,
    ) -> Optional[tuple[tasks_pb2.TaskResponseOrError, sidecar_pb2.Task]]:
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
        sidecar_address: str,
        serviceables: list[Serviceable],
    ) -> None:
        self._sidecar_client = SidecarClient(sidecar_address)

        self._state_type_by_state_tag: dict[str, StateTypeName] = {}

        for serviceable in serviceables:
            # Filter out legacy gRPC serviceables.
            if isinstance(serviceable, RebootServiceable):
                tag = state_type_tag_for_name(serviceable.state_type_name())
                self._state_type_by_state_tag[tag
                                             ] = serviceable.state_type_name()

        # Is this state manager shutting down?
        self._shutting_down = False

        # All known actors under management.
        self._actors: defaultdict[StateTypeName,
                                  Set[StateRef]] = defaultdict(set)
        self._actors_changed_events: list[asyncio.Event] = []

        # TODO(benh): add a helper class, e.g., ActorData, that
        # encapsulates all of '_states', '_mutator_locks', etc.
        self._states: defaultdict[StateTypeName,
                                  dict[StateRef,
                                       Message]] = defaultdict(lambda: {})

        # A "mutator" is either a writer or a transaction.
        #
        # TODO(benh): replace this with a semaphore so that we can
        # free up memory for state_types, actors that are no longer
        # active.
        self._mutator_locks: defaultdict[StateTypeName, defaultdict[
            StateRef,
            asyncio.Lock]] = defaultdict(lambda: defaultdict(asyncio.Lock))

        # Transactions that actors of this state manager are
        # participating in.
        self._participant_transactions: defaultdict[StateTypeName, dict[
            StateRef, StateManager.Transaction]] = defaultdict(lambda: {})

        # Semaphore used to get transactions to queue while another
        # transaction is executing. This provides a more "fair"
        # approach that also prevents a "thundering herd" everytime a
        # transaction completes. We use a semaphore instead of a lock
        # so that we can check if there are waiters so we can clean up
        # the semaphore when there are no waiters.
        self._participant_transactions_semaphore: defaultdict[
            StateTypeName,
            defaultdict[StateRef, asyncio.Semaphore]] = defaultdict(
                lambda: defaultdict(asyncio.Semaphore)
            )

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

        self._loads: defaultdict[StateTypeName, dict[
            StateRef, asyncio.Event]] = defaultdict(lambda: {})

        # Any streaming readers. We're explicitly using a 'dict' as
        # the value instead of a 'defaultdict' because we don't want
        # to construct memory every time we "check" if there is a
        # queue of streaming readers. That could be a lot of empty
        # queues because we check for streaming readers on _every_
        # write!
        self._streaming_readers: defaultdict[StateTypeName, dict[
            StateRef,
            list[asyncio.
                 Queue[_StreamingReaderItem]]]] = defaultdict(lambda: {})

        # Idempotent mutations keyed by the idempotency key.
        self._idempotent_mutations: dict[uuid.UUID,
                                         sidecar_pb2.IdempotentMutation] = {}

    async def shutdown(self) -> None:
        """Shuts down this state manager, which includes cancellation of
        background tasks.
        """
        # Tell new coordinator commit control loops that may be created while
        # we're working on shutting down that we are, in fact, shutting down.
        # They will get cancelled immediately after creation.
        self._shutting_down = True
        # Cancel all previously created coordinator commit control loops.
        for task in self._coordinator_commit_control_loop_tasks.values():
            task.cancel()

    async def wait(self) -> None:
        """Waits for this state manager to be fully shut down."""
        for task in self._coordinator_commit_control_loop_tasks.values():
            try:
                await task
            except asyncio.CancelledError:
                pass

    async def actors(
        self
    ) -> AsyncIterator[dict[StateTypeName, Set[StateRef]]]:
        """Override of StateManager.actors() for
        SidecarStateManager.
        """
        event = asyncio.Event()
        self._actors_changed_events.append(event)
        try:
            while True:
                yield dict(self._actors)
                await event.wait()
                event.clear()
        finally:
            self._actors_changed_events.remove(event)

    async def export_items(
        self, state_type: StateTypeName
    ) -> AsyncIterator[sidecar_pb2.ExportItem]:
        async for item in self._sidecar_client.export(state_type):
            yield item

    async def import_task(
        self,
        state_type: StateTypeName,
        state_ref: StateRef,
        task: sidecar_pb2.Task,
        middleware: Middleware,
    ) -> None:
        async with self._mutator_locks[state_type][state_ref]:
            pending_task_effect = (
                None if task.status == sidecar_pb2.Task.Status.COMPLETED else
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
            )
            if pending_task_effect is not None:
                middleware.tasks_dispatcher.dispatch([pending_task_effect])

    async def import_actor(
        self,
        state_type: StateTypeName,
        state_ref: StateRef,
        state: Message,
    ) -> None:
        async with self._mutator_locks[state_type][state_ref]:
            await self._store(
                state_type=state_type,
                state_ref=state_ref,
                effects=Effects(state=state),
            )

    async def import_sorted_map_entry(
        self,
        state_type: StateTypeName,
        state_ref: StateRef,
        state: bytes,
        actor_converters: ExportImportItemConverters,
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

        async with self._mutator_locks[state_type][state_ref]:
            await self._store(
                state_type=state_type,
                state_ref=state_ref,
                effects=effects,
            )

    async def import_idempotent_mutation(
        self,
        state_type: StateTypeName,
        state_ref: StateRef,
        idempotent_mutation: sidecar_pb2.IdempotentMutation,
    ) -> None:
        async with self._mutator_locks[state_type][state_ref]:
            await self._store(
                state_type=state_type,
                state_ref=state_ref,
                idempotent_mutation=idempotent_mutation,
            )

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
            ongoing_transaction: Optional[
                StateManager.Transaction
            ] = self._participant_transactions[state_type_name].get(state_ref)
            if ongoing_transaction is not None and ongoing_transaction.prepared(
            ):
                # There is a transaction ongoing, and it has been prepared. We
                # need to wait for it to complete.
                try:
                    await ongoing_transaction
                except:
                    # Any errors coming from the transaction do not concern us
                    # here.
                    pass
        else:
            transaction = self._participant_transactions[state_type_name].get(
                state_ref
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
            load = asyncio.Event()
            self._loads[state_type_name][state_ref] = load

            try:
                data: Optional[bytes
                              ] = await self._sidecar_client.load_actor_state(
                                  state_type_name, state_ref
                              )
                if data is not None:
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
                    queues: Optional[list[asyncio.Queue[_StreamingReaderItem]]
                                    ] = self._streaming_readers[
                                        state_type_name].get(state_ref)

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
        task: Optional[sidecar_pb2.Task] = None,
        idempotency_key: Optional[uuid.UUID] = None,
        idempotent_mutation: Optional[sidecar_pb2.IdempotentMutation] = None,
        constructor: bool = False,
        sync: bool = True,
    ) -> None:
        """Private helper for storing state from the sidecar.

        Code should use writer(), not _store() directly.
        """
        task_upserts: list[sidecar_pb2.Task] = []
        actor_upserts: list[sidecar_pb2.Actor] = []
        colocated_upserts: list[sidecar_pb2.ColocatedUpsert] = []
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
            assert self._mutator_locks[state_type][state_ref].locked()

            state_copy = type(effects.state)()
            state_copy.CopyFrom(effects.state)

            actor_upserts.append(
                sidecar_pb2.Actor(
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
                    sidecar_pb2.ColocatedUpsert(
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

            idempotent_mutation = sidecar_pb2.IdempotentMutation(
                state_type=state_type,
                state_ref=state_ref.to_str(),
                key=idempotency_key.bytes,
                response=response.SerializeToString(),
                task_ids=[
                    task_effect.task_id for task_effect in
                    ((effects.tasks or []) if effects is not None else [])
                ],
            )

        if transaction is not None and not transaction._stored:
            # Regardless of what a dev may have specified, we want to
            # ensure the write related to beginning a transaction
            # survives machine failures.
            #
            # As has been suggested in other places in the code, in
            # the future we can actually keep all writes after the
            # first one in memory to improve performance further. But
            # the first one needs to be persisted because it
            # demarcates that this state is part of a transaction.
            sync = True

        if constructor:
            # Regardless of what a dev may have specified, we want to
            # ensure that constructors can survive machine failures.
            sync = True

            # Ensure that when creating a `SortedMap`, the `SortedMapEntry`
            # state type's column family has also been created.
            if state_type == SORTED_MAP_TYPE_NAME:
                ensure_state_types_created.append(SORTED_MAP_ENTRY_TYPE_NAME)

        # NOTE: we _must_ store the data in the sidecar _before_
        # updating in memory state in case the store fails.
        await self._sidecar_client.store(
            actor_upserts,
            task_upserts,
            colocated_upserts,
            ensure_state_types_created,
            sidecar_pb2.Transaction(
                state_type=state_type,
                state_ref=state_ref.to_str(),
                transaction_ids=[
                    transaction_id.bytes for transaction_id in transaction.ids
                ],
                coordinator_state_type=transaction.coordinator_state_type,
                coordinator_state_ref=transaction.coordinator_state_ref.to_str(
                ),
            ) if transaction is not None else None,
            idempotent_mutation,
            sync=sync,
        )

        # Now that everything is stored we can update in memory
        # state. First we update state related to effects (if any).
        if effects is not None:
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
                self._states[state_type][state_ref] = state_copy
                queues = self._streaming_readers[state_type].get(state_ref)

                # Record the presence of this actor.
                self._actors[state_type].add(state_ref)
                for event in self._actors_changed_events:
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
                self._idempotent_mutations
                if transaction is None else transaction.idempotent_mutations
            )
            if idempotency_key is None:
                # We're importing an existing `idempotent_mutation`.
                idempotency_key = uuid.UUID(bytes=idempotent_mutation.key)
            else:
                # We're creating a new `idempotent_mutation`: it must not
                # already exist.
                assert idempotency_key not in idempotent_mutations
            idempotent_mutations[idempotency_key] = idempotent_mutation

    def validate_transaction_participant(
        self,
        context: Context,
        transaction: StateManager.Transaction,
    ) -> None:
        """Helper to validate that a transaction participant is conforming to
        the requirements of being a participant."""
        # We *MUST* have persisted the transaction before returning any
        # value back to the caller. Check that this is the case.
        assert transaction._stored, 'Transaction not persisted'

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

        transaction: Optional[
            StateManager.Transaction
        ] = self._participant_transactions[state_type].get(state_ref)

        if (
            transaction is not None and
            context.transaction_id == transaction.started_id
        ):
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
            # Acquire semaphore which might mean we queue until our turn.
            await self._participant_transactions_semaphore[state_type][
                state_ref].acquire()

            assert self._participant_transactions[state_type].get(
                state_ref
            ) is None

            transaction = StateManager.Transaction.from_context(
                context, tasks_dispatcher
            )

            self._participant_transactions[state_type][state_ref] = transaction

            # Wait for any non-transactional writers!
            await self._mutator_locks[state_type][state_ref].acquire()

        assert transaction is not None

        # Make sure we've stored this transaction.
        #
        # We need the transaction to be stored _before_ sending a
        # response to the user, otherwise they may read two different
        # states if we crash.
        #
        # We also need to store the transaction _before_ making any
        # calls which might call into RocksDB. In particular,
        # `StateManager.colocated_read()`, which may be called from a
        # reader, will read from RocksDB, and will want to use the
        # transaction. See
        # https://github.com/reboot-dev/mono/issues/4019 for more
        # details.
        #
        # TODO: do this concurrently with yielding the transaction and
        # calling into the developers method for better performance and
        # then only wait for the store to complete before things like
        # `StateManager.colocated_read()` or before we return (or if
        # this `transactionally()` wraps a `transaction` method type
        # then we make sure that we've stored before we run 2PC).
        #
        # Other optimizations to consider:
        #
        # Doing this store now will also allow us to skip actually
        # doing any stores from a `writer` or a `transaction`, those
        # could just update memory until we are asked to prepare. We
        # can also look at optimistically performing a prepare after
        # returning to the caller by introducing a mechanism that
        # tracks not only the participants but also the number of
        # times they've been used within the transaction and thus not
        # having to do the prepare when requested for the common case
        # that a state is only involved in a transaction once.
        await self.transaction_participant_store(transaction)

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
                        context.channel_manager, transaction
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
            transaction = self._participant_transactions[state_type_name].get(
                state_ref
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
            if state is not None:
                # Every reader/writer gets a copy of their own state so
                # that they can execute concurrently.
                state_copy = state_type()
                state_copy.CopyFrom(state)
                yield (state_copy, None)

            while True:
                next_item: _StreamingReaderItem = await queue.get()

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
            watch_state_task.cancel()
            try:
                await watch_state_task
            except asyncio.CancelledError:
                pass
            except:
                print(
                    'Failed to cancel "watch state" task',
                    file=sys.stderr,
                )
                pass

            # Make sure we stop all transitive `React.Query` calls.
            await context.react.cancel()

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
            assert self._mutator_locks[state_type_name][state_ref].locked()

        mutator_or_transaction_writer_lock: asyncio.Lock = (
            self._mutator_locks[state_type_name][state_ref]
            if transaction is None else
            self._transaction_writer_locks[state_type_name][state_ref]
        )
        async with mutator_or_transaction_writer_lock:
            # Every reader/writer gets a copy of their own state so
            # that they can execute concurrently.
            state_copy = state_type()
            state_copy.CopyFrom(
                await self._load(
                    context,
                    state_type,
                    authorize=authorize,
                    from_constructor=from_constructor,
                    requires_constructor=requires_constructor,
                )
            )

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
                            constructor=context.constructor,
                        )
                        transaction.stored = True
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
        response_or_error: TaskResponseOrError,
    ):
        state_type = task_effect.task_id.state_type
        state_ref = StateRef(task_effect.task_id.state_ref)
        response_or_loop, error = response_or_error

        async with self._mutator_locks[state_type][state_ref]:
            if isinstance(response_or_loop, Loop):
                loop: Loop = response_or_loop

                if loop.when is not None:
                    task_effect.schedule = (
                        DateTimeWithTimeZone.now() + loop.when
                    ) if isinstance(loop.when, timedelta) else loop.when

                task_effect.iteration += 1

                await self._store(
                    state_type=state_type,
                    state_ref=state_ref,
                    task=task_effect.to_sidecar_task(),
                )
            else:
                # Store response and mark this Task as completed in
                # persistent storage. Even though we're writing here, we're
                # not writing the actor's state.
                task_response: Optional[any_pb2.Any] = None
                task_error: Optional[any_pb2.Any] = None
                if error is not None:
                    assert response_or_loop is None

                    task_error = any_pb2.Any()
                    task_error.Pack(error)
                else:
                    assert response_or_loop is not None
                    response: Message = response_or_loop

                    task_response = any_pb2.Any()
                    task_response.Pack(response)

                assert task_response is not None or task_error is not None

                await self._store(
                    state_type=state_type,
                    state_ref=state_ref,
                    task=sidecar_pb2.Task(
                        task_id=task_effect.task_id,
                        method=task_effect.method_name,
                        status=sidecar_pb2.Task.Status.COMPLETED,
                        request=task_effect.request.SerializeToString(),
                        response=task_response,
                        error=task_error,
                    ),
                )

    @asynccontextmanager
    async def task_workflow(
        self,
        context: WorkflowContext,
    ) -> AsyncIterator[Callable[[TaskEffect, TaskResponseOrError],
                                Awaitable[None]]]:
        """Override of StateManager.task_workflow(...) for SidecarStateManager."""

        yield self.complete_task

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
        assert self._participant_transactions[state_type_name][state_ref
                                                              ] == transaction

        # We should already hold the mutator lock!
        assert self._mutator_locks[state_type_name][state_ref].locked()

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

        async def complete(effects: Effects) -> None:
            # Currently, we always need to store, even if
            # `transaction.stored`, because the state may have been
            # updated.
            #
            # NOTE: even if we optimize this later and only store the
            # state when we do a 2PC prepare, we might still need to
            # store here to record the idempotent mutation!
            async with transaction.lock:
                await self._store(
                    state_type=state_type_name,
                    state_ref=state_ref,
                    effects=effects,
                    transaction=transaction,
                    idempotency_key=context.idempotency_key,
                    constructor=context.constructor,
                )
                transaction.stored = True

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

            # Two phase commit: (1) prepare
            await self._transaction_coordinator_prepare(
                application_id=context.application_id,
                channel_manager=context.channel_manager,
                transaction_id=transaction.root_id,
                participants=context.participants,
            )

            # TODO(benh): if all of the participants were able to
            # prepare successfully consider retrying the sidecar call
            # more than once!
            await self._sidecar_client.transaction_coordinator_prepared(
                transaction.root_id, context.participants
            )

            participants = self._coordinator_participants[transaction.root_id]

            # Not expecting `participants` to ever be cancelled, see:
            # https://github.com/reboot-dev/mono/issues/3241
            assert not participants.cancelled()

            participants.set_result(context.participants)
        except:
            # Mark all the participants as need to be aborted.
            context.participants.abort()

            if context.nested:
                # Raise the exception up to the outermost transaction,
                # so the coordinator can handle the failure there.
                raise

            # Best effort try and tell the participants that the
            # transaction was aborted; if they don't hear from us now
            # they'll find out when they watch on their own.
            await self._transaction_coordinator_abort(
                application_id=context.application_id,
                channel_manager=context.channel_manager,
                transaction_id=transaction.root_id,
                participants=context.participants,
            )

            # To indicate that the transaction has aborted we set the
            # participants, which will all be in
            # `participants.should_abort`.
            participants = self._coordinator_participants[transaction.root_id]

            # Not expecting `participants` to ever be cancelled, see:
            # https://github.com/reboot-dev/mono/issues/3241
            assert not participants.cancelled()

            participants.set_result(context.participants)

            # Remove transaction so that participants "watch control
            # loop" will determine that the transaction has aborted!
            del self._coordinator_participants[transaction.root_id]

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

    def check_for_idempotent_mutation(
        self,
        context: WriterContext | WorkflowContext | TransactionContext,
    ) -> Optional[sidecar_pb2.IdempotentMutation]:
        """Override of StateManager.check_for_idempotent_mutation(...)
        for SidecarStateManager.
        """
        if context.idempotency_key is None:
            return None

        idempotent_mutations = self._idempotent_mutations
        transaction: Optional[StateManager.Transaction] = None

        if context.transaction_ids is not None:
            transaction = self._participant_transactions[
                context.state_type_name].get(context._state_ref)

            if (
                transaction is not None and
                context.transaction_root_id == transaction.root_id
            ):
                # TODO(benh): check if the idempotency key exists in
                # self._idempotent_mutations and if it does raise an
                # error that the user is incorrectly reusing an
                # idempotency key (within a transaction). While we
                # can't check for all incorrect uses, any that we can
                # check for will help the user sort out bugs.
                idempotent_mutations = transaction.idempotent_mutations

        idempotent_mutation = idempotent_mutations.get(context.idempotency_key)

        if idempotent_mutation is not None:
            # Trigger reactive readers to observe the idempotent mutation.
            # While they might have _already_ observed this mutation, this
            # is important in order to ensure we propagate all the way back
            # to the React generated code which may be waiting for this
            # mutation to be observed.
            state_copy: Optional[Message] = None
            queues: Optional[list[asyncio.Queue[_StreamingReaderItem]]] = None

            if transaction is not None:
                assert transaction.state is not None
                state_copy = transaction.state
                queues = transaction.streaming_readers
            else:
                queues = self._streaming_readers[
                    idempotent_mutation.state_type].get(
                        StateRef.from_maybe_readable(
                            idempotent_mutation.state_ref
                        ),
                        None,
                    )
                state_copy = self._states[idempotent_mutation.state_type].get(
                    StateRef.from_maybe_readable(
                        idempotent_mutation.state_ref
                    ),
                    None,
                )

            if queues is not None:
                assert state_copy is not None
                for queue in queues:
                    queue.put_nowait((state_copy, context.idempotency_key))

        return idempotent_mutation

    async def load_task_response(
        self,
        task_id: tasks_pb2.TaskId,
    ) -> Optional[tuple[tasks_pb2.TaskResponseOrError, sidecar_pb2.Task]]:
        """Loads the response for the given task. Returns None if the task is
        not yet complete. Throws if the task ID is not recognized.
        """
        return await self._sidecar_client.load_task_response(task_id)

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
    ):
        """Helper for a transaction coordinator performing the prepare step of
        two phase commit."""
        try:
            # TODO(benh): do in parallel!
            for (state_type, state_ref) in participants.should_prepare():
                # Getting a channel to the actor should succeed, since its
                # participation in a transaction that is in the prepare step
                # indicates that (1) it is up and running and (2) we should be
                # able to reach it. If either of those are untrue, that's
                # sufficient reason to fail the transaction.
                # TODO(rjh, benh): consider being more generous with temporarily
                #                  unavailable participants.
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
                    await stub.Prepare(
                        transactions_pb2.PrepareRequest(
                            transaction_id=transaction_id.bytes
                        ),
                        metadata=Headers(
                            application_id=application_id,
                            state_ref=state_ref,
                        ).to_grpc_metadata(),
                    )
                except AioRpcError as error:
                    raise SystemAborted(
                        TransactionParticipantFailedToPrepare(),
                        message=error.details(),
                    ) from None
        except:
            # TODO(benh): handle failed transaction!
            raise

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
        # TODO(benh): do this for loop and the one below all in parallel!

        for (state_type, state_ref) in participants.should_commit():
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

        # Need to abort all of the participants that should be aborted.
        for (state_type, state_ref) in participants.should_abort():
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

    async def _transaction_coordinator_abort(
        self,
        *,
        application_id: ApplicationId,
        channel_manager: _ChannelManager,
        transaction_id: uuid.UUID,
        participants: Participants,
    ):
        for (state_type, state_ref) in participants.should_prepare():
            # TODO(benh): do in parallel!

            try:
                # Getting a channel to the participant may fail; notably this
                # can happen after the coordinator restarts if it tries to abort
                # before it has (re)discovered the location of the participant.
                # That's OK; see the comment in the `except` block.
                #
                # TODO(rjh, benh): post-restart aborts are common, since all
                # uncommitted in-flight transactions must abort on coordinator
                # restart. Such aborts are likely to not go through in
                # `DirectResolver` environments, due to the above race. Consider
                # ways of avoiding this inefficiency.
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
            except:
                # NOTE: aborting is best effort abort, each
                # participant is responsible for checking back in with
                # the coordinator as well in case we were unable to
                # send an abort to them.
                continue

    async def _transaction_participant_watch(
        self,
        channel_manager: _ChannelManager,
        transaction: StateManager.Transaction,
    ):
        # Keep watching the coordinator even in the face of connection
        # failures or coordinator restarts.
        backoff = Backoff()
        while not transaction.finished():
            try:
                # Getting a channel to the coordinator may fail, for example
                # because this consensus is still (re)starting and hasn't
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
                    )
                )

                if not watch_response.aborted:
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

        # If we don't know about the transaction than treat is as
        # aborted. This is possible, e.g., after a consensus where a
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

            for (state_type, state_ref) in participants.should_commit():
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
        transaction = self._participant_transactions[state_type].get(state_ref)
        if transaction is None:
            raise RuntimeError(
                f"No pending transaction for state type '{state_type}' "
                f"state '{state_ref.id}'"
            )
        elif transaction.root_id != transaction_id:
            raise RuntimeError('Pending transaction id differs')
        else:
            # All RPCs that are part of this transaction should
            # have completed which means all streaming readers
            # should have completed!
            assert len(transaction.streaming_readers) == 0

            await transaction.tasks_dispatcher.validate(transaction.tasks)

            if transaction.must_abort:
                raise RuntimeError('Transaction must abort')

            # TODO(benh): take advantage of the fact that only
            # prepared transactions can be recovered and instead of
            # storing state in the sidecar after each write, instead
            # store the state in memory and pass the updated state and
            # tasks to the sidecar here.

            await self._sidecar_client.transaction_participant_prepare(
                state_type, state_ref
            )

            transaction.prepare()

            return transactions_pb2.PrepareResponse()

    async def Commit(
        self, request: transactions_pb2.CommitRequest,
        grpc_context: grpc.aio.ServicerContext
    ) -> transactions_pb2.CommitResponse:
        headers = Headers.from_grpc_context(grpc_context)

        state_ref = headers.state_ref
        state_type = self._state_type_for_state_ref(state_ref)

        transaction_id = uuid.UUID(bytes=request.transaction_id)
        transaction = self._participant_transactions[state_type].get(state_ref)

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
        transaction = self._participant_transactions[state_type].get(state_ref)

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
                    transaction.stored = True

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
                await self._sidecar_client.transaction_participant_commit(
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

                queues = self._streaming_readers[state_type].get(state_ref)

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
                    transaction.tasks_dispatcher.dispatch(transaction.tasks)

                # Add all actors created during the transaction.
                if len(transaction.actors) > 0:
                    for (state_type, state_refs) in transaction.actors.items():
                        self._actors[state_type].update(state_refs)

                    for event in self._actors_changed_events:
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
                self._idempotent_mutations.update(
                    transaction.idempotent_mutations
                )

                transaction.commit()

                _ = self._participant_transactions[state_type].pop(state_ref)

                semaphore = self._participant_transactions_semaphore[
                    state_type][state_ref]

                semaphore.release()

                if not semaphore.locked():
                    del self._participant_transactions_semaphore[state_type][
                        state_ref]
                    if len(
                        self._participant_transactions_semaphore[state_type]
                    ) == 0:
                        del self._participant_transactions_semaphore[state_type
                                                                    ]

                assert self._mutator_locks[state_type][state_ref].locked()
                self._mutator_locks[state_type][state_ref].release()

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

                # We only reach out to the sidecar to abort in case we have
                # persisted anything.
                if transaction.stored:
                    # TODO(benh): add test case for sidecar failure!
                    await self._sidecar_client.transaction_participant_abort(
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

                # Need to abort all streaming readers that are part of
                # this transaction!
                for queue in transaction.streaming_readers:
                    queue.put_nowait(None)

                transaction.abort()

                _ = self._participant_transactions[state_type].pop(state_ref)

                semaphore = self._participant_transactions_semaphore[
                    state_type][state_ref]

                semaphore.release()

                if not semaphore.locked():
                    del self._participant_transactions_semaphore[state_type][
                        state_ref]
                    if len(
                        self._participant_transactions_semaphore[state_type]
                    ) == 0:
                        del self._participant_transactions_semaphore[state_type
                                                                    ]

                assert self._mutator_locks[state_type][state_ref].locked()
                self._mutator_locks[state_type][state_ref].release()

    async def _colocated_omnidirectional_range(
        self,
        context,
        *,
        start: Optional[str],
        end: Optional[str],
        limit: int,
        reverse: bool,
    ) -> list[tuple[str, bytes]]:
        transaction = None if context.transaction_ids is None else sidecar_pb2.Transaction(
            state_type=context.state_type_name,
            state_ref=context._state_ref.to_str(),
            transaction_ids=[
                transaction_id.bytes
                for transaction_id in context.transaction_ids
            ],
            coordinator_state_type=context.transaction_coordinator_state_type,
            coordinator_state_ref=(
                context.transaction_coordinator_state_ref.to_str()
                if context.transaction_coordinator_state_ref else None
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
            page = await self._sidecar_client.colocated_reverse_range(
                parent_state_ref=parent_state_ref,
                start=start_ref,
                end=end_ref,
                limit=limit,
                transaction=transaction,
            )
        else:
            page = await self._sidecar_client.colocated_range(
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
        recover_response = await self._sidecar_client.recover(
            {
                state_type: state_type_tag_for_name(state_type)
                for state_type in middleware_by_state_type_name.keys()
            }
        )

        for actor in recover_response.actors:
            self._actors[actor.state_type].add(StateRef(actor.state_ref))
            for event in self._actors_changed_events:
                event.set()

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
                f"'{str(uuid.UUID(bytes=sidecar_transaction.transaction_ids[0]))}'",
            )

            transaction = StateManager.Transaction.from_sidecar(
                sidecar_transaction, middleware
            )

            # This transaction should NOT already be recovered!
            assert transaction.state_ref not in self._participant_transactions[
                transaction.state_type]

            self._participant_transactions[transaction.state_type][
                transaction.state_ref] = transaction

            await self._participant_transactions_semaphore[
                transaction.state_type][transaction.state_ref].acquire()

            # The mutator lock should not be held yet as recovery
            # _must_ occur before we start serving and as we asserted
            # above there are not multiple transactions per actor!
            assert not self._mutator_locks[transaction.state_type][
                transaction.state_ref].locked()

            await self._mutator_locks[transaction.state_type
                                     ][transaction.state_ref].acquire()

            # TODO(benh): don't just "watch" the transaction, also
            # proactively tell the coordinator if this transaction
            # 'must_abort' if we recovered an unprepared transaction
            # so that we can abort a long-running transaction sooner
            # rather than later.

            transaction.watch_task = asyncio.create_task(
                self._transaction_participant_watch(
                    channel_manager, transaction
                ),
                name=f'self._transaction_participant_watch(...) in {__name__}',
            )

        for (transaction_id, participants) in [
            (uuid.UUID(transaction_id), participants)
            for (transaction_id, participants
                ) in recover_response.prepared_coordinator_transactions.items()
        ]:
            self._coordinator_participants[transaction_id] = asyncio.Future()
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
                    participants=Participants.from_sidecar(participants),
                ),
                name=
                f'self._transaction_coordinator_commit_control_loop(...) in {__name__}',
            )

        for idempotent_mutation in recover_response.idempotent_mutations:
            idempotency_key = uuid.UUID(bytes=idempotent_mutation.key)
            assert idempotency_key not in self._idempotent_mutations
            self._idempotent_mutations[idempotency_key] = idempotent_mutation

    def _get_task_effect_from_sidecar_task(
        self,
        middleware: Middleware,
        task: sidecar_pb2.Task,
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

    async def _transaction_coordinator_commit_control_loop(
        self,
        *,
        application_id: ApplicationId,
        channel_manager: _ChannelManager,
        transaction_id: uuid.UUID,
        participants: Participants,
    ) -> None:
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
                await self._sidecar_client.transaction_coordinator_cleanup(
                    transaction_id
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


class LocalSidecarStateManager(SidecarStateManager):
    """Implementation of state manager that also encapsulates a
    'SidecarServer' for local use.
    """

    def __init__(
        self,
        directory: str,
        shards: list[sidecar_pb2.ShardInfo],
        serviceables: list[Serviceable],
    ):
        try:
            self._sidecar = SidecarServer(
                directory,
                sidecar_pb2.ConsensusInfo(shard_infos=shards),
            )
        except SidecarServerFailed as e:
            if (
                'Failed to instantiate service' in str(e) and
                '/LOCK:' in str(e)
            ):
                raise InputError(
                    reason=(
                        "Failed to start sidecar server.\n"
                        "Did you start another instance of `rbt dev run` "
                        "in another terminal?"
                    ), causing_exception=e
                )
            raise e

        # Now call our super constructor with the sidecar address and the
        # serviceables list.
        super().__init__(
            sidecar_address=self._sidecar.address,
            serviceables=serviceables,
        )

    async def shutdown_and_wait(self):
        """Shuts down the state manager and sidecar. This is a single method,
        instead of a separate `shutdown` and `wait`, since the state manager
        must be fully shut down (including `wait`ing for it) before it's safe to
        shut down the sidecar.
        """
        # First stop the state manager that's using the sidecar server.
        await super().shutdown()
        # Wait for the state manager to be fully shut down, so that we're sure
        # nobody needs the sidecar server anymore.
        await super().wait()

        # Now shut down the sidecar server. These methods are synchronous C++,
        # so the blocking `wait()` must be called through `run_in_executor` to
        # not block the event loop.
        self._sidecar.shutdown()
        loop = asyncio.get_running_loop()
        await loop.run_in_executor(
            # Use the default executor.
            executor=None,
            func=self._sidecar.wait,
        )
