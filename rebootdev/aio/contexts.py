from __future__ import annotations

import asyncio
import dataclasses
import grpc.aio
import json
import uuid
from abc import ABC
from collections import defaultdict
from contextlib import contextmanager
from contextvars import ContextVar
from datetime import timedelta
from enum import Enum
from google.protobuf.message import Message
from logging import Logger
from rbt.v1alpha1 import errors_pb2, react_pb2, react_pb2_grpc, sidecar_pb2
from rebootdev.aio.aborted import SystemAborted, is_grpc_retryable_exception
from rebootdev.aio.auth import Auth
from rebootdev.aio.backoff import Backoff
from rebootdev.aio.headers import (
    TRANSACTION_PARTICIPANTS_HEADER,
    TRANSACTION_PARTICIPANTS_TO_ABORT_HEADER,
    Headers,
)
from rebootdev.aio.idempotency import Idempotency, IdempotencyManager
from rebootdev.aio.internals.channel_manager import (
    LegacyGrpcChannel,
    _ChannelManager,
)
from rebootdev.aio.internals.contextvars import Servicing, _servicing
from rebootdev.aio.tasks import TaskEffect
from rebootdev.aio.types import (
    ApplicationId,
    GrpcMetadata,
    ServiceName,
    StateId,
    StateRef,
    StateTypeName,
)
from rebootdev.time import DateTimeWithTimeZone
from typing import (
    Awaitable,
    Callable,
    Generic,
    Iterable,
    Iterator,
    Optional,
    Tuple,
    TypeVar,
)

ContextT = TypeVar('ContextT', bound='Context')
ResponseT = TypeVar('ResponseT', bound=Message)


class Participants:
    # Participants that we should commit.
    _should_commit: defaultdict[StateTypeName, set[StateRef]]

    # Participants that we should abort. This is used to support a
    # nested transaction which aborts with a declared error. In that
    # case, we want all of its participants to abort but the parent
    # transaction to commit.
    _should_abort: defaultdict[StateTypeName, set[StateRef]]

    # Whether or not this set of participants should all be considered
    # aborted. Initially is `False` but once set to `True` is used to
    # ensure no more participants are added.
    _aborted: bool

    @classmethod
    def from_sidecar(cls, participants: sidecar_pb2.Participants):
        """Constructs an instance from the sidecar protobuf representation."""
        result = cls()
        for (state_type, state_refs) in participants.should_commit.items():
            for state_ref in state_refs.state_refs:
                result.add(state_type, StateRef(state_ref))
        for (state_type, state_refs) in participants.should_abort.items():
            for state_ref in state_refs.state_refs:
                result.add(state_type, StateRef(state_ref), abort=True)
        return result

    def to_sidecar(self) -> sidecar_pb2.Participants:
        """Helper to construct the sidecar protobuf representation."""
        return sidecar_pb2.Participants(
            should_commit={
                state_type:
                    sidecar_pb2.Participants.StateRefs(
                        state_refs=[
                            state_ref.to_str() for state_ref in state_refs
                        ]
                    )
                for (state_type, state_refs) in self._should_commit.items()
            },
            should_abort={
                state_type:
                    sidecar_pb2.Participants.StateRefs(
                        state_refs=[
                            state_ref.to_str() for state_ref in state_refs
                        ]
                    ) for (state_type, state_refs) in self._should_abort.items()
            },
        )

    def __init__(self):
        self._should_commit = defaultdict(set)
        self._should_abort = defaultdict(set)
        self._aborted = False

    def should_prepare(self) -> Iterator[Tuple[StateTypeName, StateRef]]:
        """Returns an iterator of (state_type, state_ref) tuples for each
        participant to prepare."""
        for state_type, state_ref in self.should_commit():
            yield (state_type, state_ref)
        for state_type, state_ref in self.should_abort():
            yield (state_type, state_ref)

    def should_commit(self) -> Iterator[Tuple[StateTypeName, StateRef]]:
        """Returns an iterator of (state_type, state_ref) tuples for each
        participant to commit."""
        for state_type, state_refs in self._should_commit.items():
            for state_ref in state_refs:
                yield (state_type, state_ref)

    def should_abort(self) -> Iterator[Tuple[StateTypeName, StateRef]]:
        """Returns an iterator of (state_type, state_ref) tuples for each
        participant to abort."""
        for state_type, state_refs in self._should_abort.items():
            for state_ref in state_refs:
                yield (state_type, state_ref)

    def abort(self):
        """Marks all participants as "to abort"."""
        for state_type, state_refs in self._should_commit.items():
            self._should_abort[state_type].update(state_refs)
        self._should_commit.clear()
        self._aborted = True

    def add(
        self,
        state_type: StateTypeName,
        state_ref: StateRef,
        *,
        abort: bool = False,
    ):
        assert isinstance(state_type, str)
        assert isinstance(state_ref, StateRef)
        assert not self._aborted
        if abort:
            assert (
                state_type not in self._should_commit or
                state_ref not in self._should_commit[state_type]
            )
            self._should_abort[state_type].add(state_ref)
        else:
            assert (
                state_type not in self._should_abort or
                state_ref not in self._should_abort[state_type]
            )
            self._should_commit[state_type].add(state_ref)

    def update(
        self,
        state_type: StateTypeName,
        state_refs: Iterable[StateRef],
        *,
        abort: bool = False,
    ):
        # NOTE: manually looping through and calling `self.add()`
        # instead of just using `update()` on `self._participants` and
        # ``self._participants_to_abort` to assert invariant check
        # that participants to commit and abort are mutually
        # exclusive.
        for state_ref in state_refs:
            self.add(state_type, state_ref, abort=abort)

    def union(self, participants: 'Participants'):
        for (state_type, state_refs) in participants._should_commit.items():
            self.update(state_type, state_refs)
        for (state_type, state_refs) in participants._should_abort.items():
            self.update(state_type, state_refs, abort=True)

    def to_grpc_metadata(self) -> GrpcMetadata:
        """Helper to encode transaction participants into gRPC metadata.
        """
        return (
            (
                TRANSACTION_PARTICIPANTS_HEADER,
                json.dumps(
                    {
                        state_type:
                            [state_ref.to_str() for state_ref in state_refs]
                        for (state_type,
                             state_refs) in self._should_commit.items()
                    }
                )
            ),
            (
                TRANSACTION_PARTICIPANTS_TO_ABORT_HEADER,
                json.dumps(
                    {
                        state_type:
                            [state_ref.to_str() for state_ref in state_refs]
                        for (state_type,
                             state_refs) in self._should_abort.items()
                    }
                )
            ),
        )

    @classmethod
    def from_grpc_metadata(cls, metadata: GrpcMetadata) -> 'Participants':
        """Helper to decode transaction participants from gRPC metadata.
        """
        participants = cls()
        for (key, value) in metadata:
            if key == TRANSACTION_PARTICIPANTS_HEADER:
                for (state_type_name, state_refs) in json.loads(value).items():
                    participants.update(
                        state_type_name,
                        [StateRef(state_ref) for state_ref in state_refs],
                    )
            elif key == TRANSACTION_PARTICIPANTS_TO_ABORT_HEADER:
                for (state_type_name, state_refs) in json.loads(value).items():
                    participants.update(
                        state_type_name,
                        [StateRef(state_ref) for state_ref in state_refs],
                        abort=True,
                    )
        return participants


class RetryReactively(Exception):
    """Exception to raise when in a reactive method context and wanting to
    retry the method after state or reader's responses have changed.
    """
    pass


class React:
    """Encapsulates machinery necessary for contexts that are "reactive",
    aka, those that are initiated from calls to `React.Query` and who
    then transform subsequent reader calls into `React.Query` calls
    themselves (for full transitive reactivity).
    """

    class Querier(Generic[ResponseT]):
        """Performs the `React.Query` RPCs.

        Maintains an `asyncio.Task` for every unique request that is
        used (uniqueness is determined via serializing the request).

        Expects a call to `cancel_unused()` to cancel the
        `asyncio.Task`s that are no longer necessary.
        """

        # State, service, and method we are invoking.
        _state_type_name: StateTypeName
        _state_ref: StateRef
        _method: str

        # Type of the response we are receiving.
        _response_type: type[ResponseT]

        # Event which indicates that new data has been received and we
        # should re-invoke methods.
        _event: asyncio.Event

        _channel_manager: _ChannelManager

        # Tasks that are calling `React.Query`, keyed by the
        # serialized request.
        _tasks: dict[bytes, asyncio.Task]

        # The gRPC call to `React.Query` that each of our
        # `asyncio.Task`s are making.
        _calls: dict[asyncio.Task, grpc.aio.Call]

        # The latest response or error received from calling
        # `React.Query`, set by our `asyncio.Task`s.
        _responses: dict[asyncio.Task, asyncio.Future[ResponseT]]

        # An event indicating that a response has been used and thus
        # the next response can be retrieved.
        _used_response: dict[asyncio.Task, asyncio.Event]

        # The subset of `_tasks` that's been used since the last call
        # to `cancel_*()`.  Any tasks not in this `set` are considered
        # "unused" for the purposes of `cancel_unused()`.
        _used_tasks: set[asyncio.Task]

        # Whether or not this querier has been invalidated (see
        # `React.invalidate()` for more details).
        invalidated: bool

        def __init__(
            self,
            *,
            state_type_name: StateTypeName,
            state_ref: StateRef,
            method: str,
            response_type: type[ResponseT],
            event: asyncio.Event,
            channel_manager: _ChannelManager,
        ):
            self._state_type_name = state_type_name
            self._state_ref = state_ref
            self._method = method
            self._response_type = response_type
            self._event = event
            self._channel_manager = channel_manager
            self._tasks = dict()
            self._calls = dict()
            self._responses = dict()
            self._used_response = dict()
            self._used_tasks = set()
            self.invalidated = False

        def __del__(self):
            assert len(self._tasks) == 0

        async def call(
            self,
            request: Message,
            *,
            metadata: GrpcMetadata,
        ) -> tuple[grpc.aio.Call, asyncio.Future[ResponseT]]:
            serialized_request = request.SerializeToString(deterministic=True)

            task: Optional[asyncio.Task] = self._tasks.get(serialized_request)

            if task is not None:
                self._used_tasks.add(task)

                self._used_response[task].set()

                assert task in self._calls
                assert task in self._responses

                return (self._calls[task], self._responses[task])

            # Need to track whether or not we have received
            # the first response because we don't want to
            # cause an unnecessary reaction (i.e.,
            # re-execution of the user's code) for the first
            # response.
            have_first_response = asyncio.Event()

            async def query():
                task: Optional[asyncio.Task] = asyncio.current_task()

                assert task is not None

                # In the event we receive an error from the call we
                # want to try again because it's possible that we'll
                # get a response if some other state changes, but
                # rather than continuously bombarding the server with
                # requests we exponentially backoff before retrying.
                #
                # TODO(benh): introduce a mechanism where we can
                # actually wait until a new response would be
                # produced, e.g., because we track the state
                # version/clock and only retry calls when the state
                # changes.
                backoff = Backoff(max_backoff_seconds=5)

                while True:
                    channel = self._channel_manager.get_channel_to_state(
                        self._state_type_name, self._state_ref
                    )

                    call = react_pb2_grpc.ReactStub(channel).Query(
                        react_pb2.QueryRequest(
                            method=self._method,
                            request=serialized_request,
                        ),
                        metadata=metadata,
                    )

                    # We need an extra level of indirection to loop
                    # through the gRPC responses because empirically
                    # it appears as though we cannot cancel an
                    # `asyncio.Task` that is "blocked" in the gRPC
                    # `call` generator. Possible bug:
                    # https://github.com/grpc/grpc/issues/28999
                    #
                    # We get this extra level of indirection by
                    # calling a coroutine that performs the `async
                    # for` loop such that when our `asyncio.Task` gets
                    # cancelled, we can then do `call.cancel()` which
                    # will cancel the underlying gRPC generator.
                    async def loop():
                        assert task is not None

                        async for query_response in call:
                            if not query_response.HasField('response'):
                                continue

                            response = self._response_type()
                            response.ParseFromString(query_response.response)

                            self._used_response[task].clear()

                            self._calls[task] = call

                            self._responses[task] = asyncio.Future()
                            self._responses[task].set_result(response)

                            if not have_first_response.is_set():
                                have_first_response.set()
                            else:
                                self._event.set()

                            await self._used_response[task].wait()

                        raise RuntimeError('React.Query should be infinite')

                    try:
                        await loop()
                    except asyncio.CancelledError:
                        call.cancel()
                        try:
                            await call
                        except:
                            pass
                        raise
                    except BaseException as exception:
                        if is_grpc_retryable_exception(exception):
                            continue

                        self._used_response[task].clear()

                        self._calls[task] = call

                        self._responses[task] = asyncio.Future()
                        self._responses[task].set_exception(exception)

                        if not have_first_response.is_set():
                            have_first_response.set()
                        else:
                            self._event.set()

                        await self._used_response[task].wait()

                        # Let's retry after a backoff!
                        await backoff()

            task = asyncio.create_task(query(), name=f'query() in {__name__}')

            self._tasks[serialized_request] = task
            self._used_response[task] = asyncio.Event()
            self._used_tasks.add(task)

            await have_first_response.wait()

            return await self.call(request, metadata=metadata)

        async def cancel_all(self):
            # Mark all tasks as unused and then cancel unused, which
            # will be all of them!
            self._used_tasks = set()
            await self.cancel_unused()

        async def cancel_unused(self):
            tasks = self._tasks
            self._tasks = dict()

            used_tasks = self._used_tasks
            self._used_tasks = set()

            unused_tasks = set()

            for (serialized_request, task) in tasks.items():
                if task in used_tasks:
                    self._tasks[serialized_request] = task
                else:
                    task.cancel()
                    unused_tasks.add(task)

            for task in unused_tasks:
                try:
                    await task
                except:
                    pass

    _channel_manager: _ChannelManager
    _queriers: dict[str, Querier]
    _event: asyncio.Event

    # The "iteration" of dependency updates that we've received,
    # useful for distinguishing whether or not it is safe to wait on
    # `_event` or if it's possible that we've missed an update.
    _iteration: int

    # Lock to ensure that we only increment `_iteration` once for
    # every set of `_event.set()` calls between `_event.wait()`.
    _lock: asyncio.Lock

    _cancelled: bool

    def __init__(self, channel_manager: _ChannelManager):
        self._channel_manager = channel_manager
        self._queriers = dict()
        self._event = asyncio.Event()
        self._iteration = 0
        self._lock = asyncio.Lock()
        self._cancelled = False

    @property
    def event(self) -> asyncio.Event:
        return self._event

    @property
    def iteration(self) -> int:
        return self._iteration

    async def iterate(self, iteration: int):
        """Helper for waiting only if we're still at the current iteration."""
        if self._iteration == iteration:
            # Using a lock to ensure that even if there are multiple
            # callers to `iterate`, only one of them increments
            # `self._iteration`.
            async with self._lock:
                if self._iteration == iteration:
                    await self._event.wait()
                    self._event.clear()
                    self._iteration += 1
        return self._iteration

    async def call(
        self,
        *,
        state_type_name: StateTypeName,
        state_ref: StateRef,
        service_name: ServiceName,
        method: str,
        request: Message,
        response_type: type[ResponseT],
        metadata: GrpcMetadata,
    ) -> tuple[grpc.aio.Call, asyncio.Future[ResponseT]]:
        """Performs an RPC by calling `React.Query` instead."""
        if self._cancelled:
            raise SystemAborted(errors_pb2.Cancelled())

        # Lookup or create a `Querier` for performing this RPC and
        # then delegate the call to it.
        key = f'{service_name}.{method}/{state_ref}'

        querier: Optional[React.Querier[ResponseT]] = self._queriers.get(key)

        if querier is None:
            querier = React.Querier(
                state_type_name=state_type_name,
                state_ref=state_ref,
                method=method,
                response_type=response_type,
                event=self._event,
                channel_manager=self._channel_manager,
            )
            self._queriers[key] = querier

        assert querier is not None

        if querier.invalidated:
            # Need to remove querier before cancelling all so that any
            # other concurrent calls made while `await`ing the cancel
            # will create a new querier.
            del self._queriers[key]

            await querier.cancel_all()

            # Now just try this method again, which will either create
            # a new querier or use a querier created while we were
            # `await`ing the cancellation of the old one above.
            return await self.call(
                state_type_name=state_type_name,
                state_ref=state_ref,
                service_name=service_name,
                method=method,
                request=request,
                response_type=response_type,
                metadata=metadata,
            )

        return await querier.call(request, metadata=metadata)

    async def cancel_unused_queries(self):
        for querier in self._queriers.values():
            await querier.cancel_unused()

    async def cancel(self):
        self._cancelled = True
        for querier in self._queriers.values():
            await querier.cancel_all()
            assert len(querier._tasks) == 0

    def invalidate(
        self,
        *,
        state_type_name: StateTypeName,
        state_ref: StateRef,
    ):
        """Invalidates a querier, if it exists, but does _NOT_ cancel it
        because we still want to get any updated responses to trigger
        re-execution, however when we re-execute we'll make a new call.

        TODO: we can improve the performance here by requiring
        idempotency for mutations within a reactive setting and then
        we can simply only expose updated responses that include the
        idempotency key of mutations to ensure we read our writes.
        """
        for key, querier in self._queriers.items():
            if key.startswith(f'{state_type_name}.'
                             ) and key.endswith(f'/{state_ref}'):
                querier.invalidated = True


class EffectValidation(Enum):
    ENABLED = 1
    QUIET = 2
    DISABLED = 3


class EffectValidationRetry(Exception):
    """An exception type which is raised in order to abort and retry transactions
    for the purposes of effect validation."""


# Print effect validation warnings every 5 minutes.
_PRINT_EFFECT_VALIDATION_WARNINGS_DELTA = timedelta(minutes=5)


def _log_message_for_effect_validation(
    *,
    effect_validation: EffectValidation,
    identifier: str,
    timestamps: dict[str, DateTimeWithTimeZone],
    logger: Logger,
    message: str,
):
    """Helper for logging an info or debug `message` about an effect
    validation when it is set to `QUIET` given the `timestamps` that
    the last effect validation for the given `identifier` was logged.

    Updates `timestamps` regardless of whether or not anything was
    printed.
    """
    if effect_validation == EffectValidation.QUIET:
        if (
            identifier not in timestamps or (
                DateTimeWithTimeZone.now() - timestamps[identifier]
                > _PRINT_EFFECT_VALIDATION_WARNINGS_DELTA
            )
        ):
            timestamps[identifier] = DateTimeWithTimeZone.now()

            logger.info(
                f"{message} Will silence this message for the next "
                f"{_PRINT_EFFECT_VALIDATION_WARNINGS_DELTA.seconds // 60} minutes."
            )
        else:
            logger.debug(message)
    else:
        assert effect_validation == EffectValidation.ENABLED

        logger.info(message)


class Context(ABC, IdempotencyManager):
    """Common base class for all contexts.

    Contexts holds information relevant to the current call.

    Construction of a Context object is done by the servicer
    middleware. You should never need to construct a Context yourself.
    """
    # Python asyncio context variable that stores the current context.
    _context: ContextVar[Optional[Context]] = ContextVar(
        'Context of the current asyncio context',
        default=None,
    )

    @classmethod
    def get(cls) -> Optional[Context]:
        """Returns context for the current asyncio context, or None."""
        return cls._context.get()

    @classmethod
    def get_or_raise(cls) -> Context:
        """Returns context for the current asyncio context, or raises."""
        context = cls._context.get()
        if context is None:
            raise RuntimeError(
                'Missing asyncio context variable `context`; '
                'are you trying to make a call outside of a servicer?'
            )
        return context

    @classmethod
    def set(cls, context: Context):
        """Sets the context for the current asyncio context."""
        return cls._context.set(context)

    @contextmanager
    def use(self) -> Iterator[None]:
        """Context manager that uses `self` for the current asyncio context."""
        old_context = Context.get()
        try:
            Context.set(self)
            yield
        finally:
            if old_context is not None:
                Context.set(old_context)

    _channel_manager: _ChannelManager
    _headers: Headers

    # `None` unless this context is being used to run a task.
    _task: Optional[TaskEffect]

    # Participants aggregated from all RPCs rooted at the method for
    # which we initially created this context.
    #
    # We use this when a method is executed within a transaction so
    # that we can pass back to the coordinator the precise set of
    # participants.
    participants: Participants

    # Number of outstanding RPCs rooted at the method for which we
    # initially created this context. Incremented whenever an RPC
    # begins, and decremented when it completes (whether successfully
    # or not).
    #
    # We use this when a method is executed within a transaction to
    # ensure that all RPCs complete so that we know we have aggregated
    # all possible participants - this count must reach 0.
    #
    # TODO(benh): consider using this for not just transactions but
    # all methods, or at least making it the default with an option to
    # opt out.
    outstanding_rpcs: int

    # Whether or not the transaction enclosing this context should
    # abort.
    transaction_must_abort: bool

    # Extra machinery for handling reactive contexts. Set when using
    # the `StateManager.reactively()` helper.
    react: Optional[React]

    # Auth specific information as provided by the `TokenVerifier`, if present.
    auth: Optional[Auth]

    # Full name of the state type being invoked (e.g. `foo.v1.Bar`).
    _state_type_name: StateTypeName

    # Whether or not this context is being used for a "constructor",
    # i.e., a writer or transaction of an state that has not yet been
    # constructed.
    _constructor: bool

    # A secret specific to this application, for use only in intra-application
    # calls.
    _app_internal_api_key_secret: str

    # Configured effect validation.
    _effect_validation: EffectValidation

    # Any tasks scheduled with this context that we need to include as
    # part of the effects.
    _tasks: list[TaskEffect]

    # NOTE: `_colocated_upserts` argument is for internal use only. See
    # usage in the `StateManager` class.
    _colocated_upserts: Optional[list[tuple[str, Optional[bytes]]]]

    def __init__(
        self,
        *,
        channel_manager: _ChannelManager,
        headers: Headers,
        state_type_name: StateTypeName,
        app_internal_api_key_secret: str,
        effect_validation: EffectValidation,
        task: Optional[TaskEffect] = None,
    ):
        # Note: this is intended as a private constructor only to be
        # called by the middleware.
        if _servicing.get() is not Servicing.INITIALIZING:
            raise RuntimeError(
                'Context should only be constructed by middleware'
            )

        super().__init__(
            seed=uuid.UUID(bytes=task.task_id.task_uuid)
            if task is not None else None,
            required=isinstance(self, WorkflowContext),
            required_reason=
            'Calls to mutators within a `workflow` must use idempotency'
            if isinstance(self, WorkflowContext) else None,
        )

        self._channel_manager = channel_manager
        self._headers = headers
        self._state_type_name = state_type_name
        self._task = task

        self.participants = Participants()
        self.outstanding_rpcs = 0
        self.transaction_must_abort = False

        self.react = None

        self.auth = None

        self._constructor = False

        self._effect_validation = effect_validation

        self._app_internal_api_key_secret = app_internal_api_key_secret

        self._tasks = []

        self._colocated_upserts = None

        # Store the context as an asyncio contextvar for access via
        # APIs where we don't pass a `context` but we know one has
        # been created (or should have been created).
        Context._context.set(self)

    @property
    def channel_manager(self) -> _ChannelManager:
        """Return channel manager.
        """
        return self._channel_manager

    @property
    def application_id(self) -> ApplicationId:
        """Return application ID.
        """
        assert self._headers.application_id is not None
        return self._headers.application_id

    @property
    def state_type_name(self) -> StateTypeName:
        """Return the name of the state type.
        """
        return self._state_type_name

    @property
    def state_id(self) -> StateId:
        """Return state id.
        """
        return self._headers.state_ref.id

    @property
    def _state_ref(self) -> StateRef:
        return self._headers.state_ref

    @property
    def cookie(self) -> Optional[str]:
        return self._headers.cookie

    @property
    def app_internal(self) -> bool:
        """Returns true if this context is for an application internal call,
        otherwise false.
        """
        return self._headers.app_internal_authorization == self._app_internal_api_key_secret

    @property
    def transaction_ids(self) -> Optional[list[uuid.UUID]]:
        """Returns all transaction ids that make up the path from root and
        nested transactions to the current transaction.
        """
        return self._headers.transaction_ids

    @property
    def transaction_id(self) -> Optional[uuid.UUID]:
        """Return transaction id.
        """
        if self._headers.transaction_ids is not None:
            return self._headers.transaction_ids[-1]
        else:
            return None

    @property
    def transaction_root_id(self) -> Optional[uuid.UUID]:
        """Return transaction root id, i.e., the outermost transaction.
        """
        if self._headers.transaction_ids is not None:
            return self._headers.transaction_ids[0]
        else:
            return None

    @property
    def transaction_parent_ids(self) -> Optional[list[uuid.UUID]]:
        """Return transaction parent ids if this is a nested transaction.
        """
        if self._headers.transaction_ids is not None:
            return self._headers.transaction_ids[:-1]
        else:
            return None

    @property
    def workflow_id(self) -> Optional[uuid.UUID]:
        """Return workflow id.
        """
        return self._headers.workflow_id

    @property
    def transaction_coordinator_state_type(self) -> Optional[StateTypeName]:
        """Return transaction coordinator state type.
        """
        return self._headers.transaction_coordinator_state_type

    @property
    def transaction_coordinator_state_ref(self) -> Optional[StateRef]:
        """Return transaction coordinator state ref.
        """
        return self._headers.transaction_coordinator_state_ref

    @property
    def idempotency_key(self) -> Optional[uuid.UUID]:
        """Return optional idempotency key.
        """
        return self._headers.idempotency_key

    @property
    def caller_bearer_token(self) -> Optional[str]:
        """
        Return the bearer token used to call into this context, if any.

        NOTE: be careful when you use the caller's bearer token in transitive
        calls! This is only safe if the downstream service can be trusted with
        the caller's credentials.
        """
        return self._headers.bearer_token

    @property
    def constructor(self) -> bool:
        """Return whether or not this context is being used for a method that
        is acting as a constructor.
        """
        return self._constructor

    @property
    def task(self) -> Optional[TaskEffect]:
        """Returns the task if this context is being used to execute a
        task, otherwise `None`.
        """
        return self._task

    @property
    def task_id(self) -> Optional[uuid.UUID]:
        """Returns the task if this context is being used to execute a
        task, otherwise `None`.
        """
        return (
            uuid.UUID(bytes=self._task.task_id.task_uuid)
            if self._task is not None else None
        )

    @property
    def iteration(self) -> Optional[int]:
        """Returns the loop iteration if this context is being used to
        execute a control loop task, otherwise `None`.

        Note that a single loop iteration may _retry_ multiple times; each of
        these retries are for the same iteration. A new iteration starts only
        when the previous iteration completes by returning `Loop`.
        """
        return self._task.iteration if self._task is not None else None

    def legacy_grpc_channel(self) -> grpc.aio.Channel:
        """Get a gRPC channel that can connect to any Reboot-hosted legacy
        gRPC service. Simply use this channel to create a Stub and call it, no
        address required."""
        return LegacyGrpcChannel(self._channel_manager)

    @classmethod
    def idempotency(
        cls,
        *,
        alias: Optional[str] = None,
        key: Optional[uuid.UUID | str] = None,
        each_iteration: Optional[bool] = None,
    ) -> Idempotency:
        """Helper to create an `Idempotency` instance, or raise if being used
        incorrectly.
        """
        if each_iteration:
            if key is not None:
                raise TypeError(
                    'Passing `each_iteration=True` is invalid when passing `key`'
                )

            context = cls.get_or_raise()

            if not isinstance(context, WorkflowContext):
                raise TypeError(
                    'Passing `each_iteration=True` is only valid within a `workflow`'
                )

            alias = (alias or "-") + f' (iteration #{context.iteration})'

        return Idempotency(alias=alias, key=key)


class ReaderContext(Context):
    """Call context for a reader call."""


class WriterContext(Context):
    """Call context for a writer call."""

    # Indicates whether or not you'd like the underlying storage layer
    # to use `fsync` (or equivalent) to persist the writer's effects.
    #
    # While a writer with `sync=False` may survive a process crash
    # (although those semantics may be changed later), it may not
    # survive a machine crash.
    #
    # NOTE: these semantics are only considered when:
    #   1. The writer is _not_ a constructor (implicitly or explicitly).
    #   2. The writer is _not_ scheduling any tasks.
    #   3. The writer is _not_ within a transaction.
    #   4. The writer is _not_ running as a task.
    sync: bool

    def __init__(
        self,
        *,
        channel_manager: _ChannelManager,
        headers: Headers,
        state_type_name: StateTypeName,
        app_internal_api_key_secret: str,
        effect_validation: EffectValidation,
        task: Optional[TaskEffect] = None,
    ):
        super().__init__(
            channel_manager=channel_manager,
            headers=headers,
            state_type_name=state_type_name,
            app_internal_api_key_secret=app_internal_api_key_secret,
            task=task,
            effect_validation=effect_validation,
        )

        self.sync = True


class TransactionContext(Context):
    """Call context for a transaction call."""

    def __init__(
        self,
        *,
        channel_manager: _ChannelManager,
        headers: Headers,
        state_type_name: StateTypeName,
        app_internal_api_key_secret: str,
        effect_validation: EffectValidation,
        task: Optional[TaskEffect] = None,
    ):
        assert (
            headers.transaction_ids is None or len(headers.transaction_ids) > 0
        )

        if headers.transaction_ids is None:
            headers = dataclasses.replace(
                headers,
                transaction_ids=[uuid.uuid4()],
                # The state servicing the request to executing a
                # method of kind transaction acts as the transaction
                # coordinator.
                transaction_coordinator_state_type=state_type_name,
                transaction_coordinator_state_ref=headers.state_ref,
            )
        else:
            assert (
                headers.transaction_coordinator_state_type is not None and
                headers.transaction_coordinator_state_ref is not None
            )

            headers = dataclasses.replace(
                headers,
                transaction_ids=headers.transaction_ids + [uuid.uuid4()],
            )

        super().__init__(
            channel_manager=channel_manager,
            headers=headers,
            state_type_name=state_type_name,
            app_internal_api_key_secret=app_internal_api_key_secret,
            task=task,
            effect_validation=effect_validation,
        )

    @property
    def transaction_ids(self) -> list[uuid.UUID]:
        """Returns all transaction ids that make up the path from root and
        nested transactions to the current transaction.
        """
        assert self._headers.transaction_ids is not None
        return self._headers.transaction_ids

    @property
    def transaction_id(self) -> uuid.UUID:
        """Return transaction id.
        """
        assert self._headers.transaction_ids is not None
        return self._headers.transaction_ids[-1]

    @property
    def transaction_root_id(self) -> uuid.UUID:
        """Return transaction root id, i.e., the outermost transaction.
        """
        assert self._headers.transaction_ids is not None
        return self._headers.transaction_ids[0]

    @property
    def transaction_parent_ids(self) -> list[uuid.UUID]:
        """Return transaction parent ids if this is a nested transaction.
        """
        assert self._headers.transaction_ids is not None
        return self._headers.transaction_ids[:-1]

    @property
    def transaction_coordinator_state_type(self) -> StateTypeName:
        """Return transaction coordinator service.
        """
        assert self._headers.transaction_coordinator_state_type is not None
        return self._headers.transaction_coordinator_state_type

    @property
    def transaction_coordinator_state_ref(self) -> StateRef:
        """Return transaction coordinator state ref.
        """
        assert self._headers.transaction_coordinator_state_ref is not None
        return self._headers.transaction_coordinator_state_ref

    @property
    def nested(self) -> bool:
        """Return whether or not this transaction is nested.
        """
        assert self._headers.transaction_ids is not None
        return len(self._headers.transaction_ids) > 1


class WorkflowContext(Context):
    """Call context for a workflow call."""


RetryReactivelyUntilT = TypeVar('RetryReactivelyUntilT')


async def retry_reactively_until(
    context: WorkflowContext,
    condition: Callable[[], Awaitable[RetryReactivelyUntilT]],
) -> RetryReactivelyUntilT:
    """Helper for waiting for something within a `WorkflowContext` that
    re-executes the given callable everytime that some reactive state
    has changed instead of raising `RetryReactively` and re-executing
    the entire workflow from the beginning (even though it's safe to
    do so, it is more expensive).
    """
    assert context.react is not None
    iteration = context.react.iteration

    while True:
        try:
            result = await condition()

            if not isinstance(result, bool):
                return result
            elif result:
                # NOTE: the type system is insufficient to let us
                # properly exclude types and declare the correct
                # overloads. Thus, we have to return `True` here, but
                # tell the type checker to ignore it.
                return True  # type: ignore[return-value]
        except RetryReactively:
            pass
        except:
            raise

        iteration = await context.react.iterate(iteration)
