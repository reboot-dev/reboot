import functools
import grpc
import uuid
from abc import ABC, abstractmethod
from contextlib import contextmanager
from google.protobuf.message import Message
from logging import Logger
from rebootdev.aio.auth.authorizers import Authorizer
from rebootdev.aio.auth.token_verifiers import TokenVerifier
from rebootdev.aio.contexts import (
    Context,
    ContextT,
    EffectValidation,
    EffectValidationRetry,
    TransactionContext,
    WorkflowContext,
    _log_message_for_effect_validation,
)
from rebootdev.aio.headers import Headers
from rebootdev.aio.idempotency import IdempotencyManager
from rebootdev.aio.internals.channel_manager import _ChannelManager
from rebootdev.aio.internals.contextvars import Servicing, _servicing
from rebootdev.aio.internals.tasks_dispatcher import (
    TaskResponseOrError,
    TasksDispatcher,
)
from rebootdev.aio.placement import PlacementClient
from rebootdev.aio.tasks import TaskEffect
from rebootdev.aio.types import (
    ApplicationId,
    ConsensusId,
    ServiceName,
    StateRef,
    StateTypeName,
)
from rebootdev.settings import DOCS_BASE_URL
from rebootdev.time import DateTimeWithTimeZone
from typing import (
    Any,
    AsyncIterator,
    Callable,
    Concatenate,
    Coroutine,
    Iterator,
    Optional,
    ParamSpec,
    TypeVar,
)

P = ParamSpec('P')
SelfT = TypeVar('SelfT')
ReturnT = TypeVar('ReturnT')

# Dictionary 'method_name': 'timestamp' to keep track of when we last
# explained effect validation for a method. By using the helper
# `_log_message_for_effect_validation` we'll log a message on the
# first invocation of 'method_name' as well as after some time so that
# the user is not inundated with log messages.
_has_ever_explained_effect_validation: dict[str, DateTimeWithTimeZone] = {}


def maybe_run_function_twice_to_validate_effects(
    f: Callable[Concatenate[bool, P], Coroutine[Any, Any, ReturnT]]
) -> Callable[P, Coroutine[Any, Any, ReturnT]]:
    # TODO: Ideally this would inject a keyword argument, but that cannot currently be made
    # typesafe. See https://peps.python.org/pep-0612/#concatenating-keyword-parameters

    @functools.wraps(f)
    async def wrapper(*args: P.args, **kwargs: P.kwargs):
        try:
            return await f(False, *args, **kwargs)
        except EffectValidationRetry:
            return await f(True, *args, **kwargs)

    return wrapper


class Middleware(ABC):
    """Base class for generated middleware.
    """
    # We expect these values to be set by generated subclass constructors.
    tasks_dispatcher: TasksDispatcher
    request_type_by_method_name: dict[str, type[Message]]

    _token_verifier: Optional[TokenVerifier]
    _authorizer: Authorizer

    def __init__(
        self,
        *,
        application_id: ApplicationId,
        consensus_id: ConsensusId,
        state_type_name: StateTypeName,
        service_names: list[ServiceName],
        placement_client: PlacementClient,
        channel_manager: _ChannelManager,
        effect_validation: EffectValidation,
        app_internal_api_key_secret: str,
    ):
        self._application_id = application_id
        self._consensus_id = consensus_id
        self._state_type_name = state_type_name
        assert len(service_names) > 0
        self._service_names = service_names
        self._effect_validation = effect_validation
        self._app_internal_api_key_secret = app_internal_api_key_secret

        self.placement_client = placement_client
        self.channel_manager = channel_manager

    @property
    def application_id(self) -> ApplicationId:
        return self._application_id

    @property
    def consensus_id(self) -> ConsensusId:
        return self._consensus_id

    @property
    def state_type_name(self) -> StateTypeName:
        return self._state_type_name

    @property
    def service_names(self) -> list[ServiceName]:
        return self._service_names

    def create_context(
        self,
        *,
        headers: Headers,
        state_type_name: StateTypeName,
        context_type: type[ContextT],
        task: Optional[TaskEffect] = None,
    ) -> ContextT:
        """Create a Context object given the parameters."""
        # Toggle 'servicing' to indicate we are initializing the
        # servicing of an RPC which will, for example, permit the
        # construction of a context without raising an error.
        _servicing.set(Servicing.INITIALIZING)

        # Sanity check: we're handling the right type, right?
        if state_type_name != self._state_type_name:
            raise ValueError(
                f"Requested unexpected state type '{state_type_name}'; "
                f"this servicer is of type {self._state_type_name}"
            )

        context = context_type(
            channel_manager=self.channel_manager,
            headers=headers,
            state_type_name=state_type_name,
            app_internal_api_key_secret=self._app_internal_api_key_secret,
            task=task,
            effect_validation=self._effect_validation,
        )

        # Now toggle 'servicing' to indicate that we are servicing the
        # RPC which will, for example, forbid the construction of a
        # context by raising an error.
        _servicing.set(Servicing.YES)

        return context

    @contextmanager
    def use_context(
        self,
        *,
        headers: Headers,
        state_type_name: StateTypeName,
        context_type: type[ContextT],
        task: Optional[TaskEffect] = None,
    ) -> Iterator[ContextT]:
        """Context manager for ensuring that we reset the asyncio context
        variable to the previous context.
        """
        context: Optional[Context] = Context.get()
        try:
            yield self.create_context(
                headers=headers,
                state_type_name=state_type_name,
                context_type=context_type,
                task=task,
            )
        finally:
            if context is not None:
                Context.set(context)

    async def stop(self):
        """Stop the middleware background tasks.
        """
        await self.tasks_dispatcher.stop()

    def maybe_raise_effect_validation_retry(
        self,
        *,
        logger: Logger,
        idempotency_manager: IdempotencyManager,
        method_name: str,
        validating_effects: bool,
        context: Context,
    ) -> None:
        """If we're validating effects, explains that we are about to retry, and then raises.
        """
        if self._effect_validation == EffectValidation.DISABLED or validating_effects:
            # Effect validation is disabled, or we are in the second run of an effect
            # validation: either way, allow the method to complete.
            return

        is_non_root_in_nested = (
            # Is either an inner method in a transaction, or a nested transaction.
            (
                not isinstance(context, TransactionContext) and
                context.transaction_id is not None
            ) or
            (isinstance(context, TransactionContext) and context.nested) or
            # Is an inner method in a workflow.
            (
                not isinstance(context, WorkflowContext) and
                context.workflow_id is not None
            )
        )
        if is_non_root_in_nested:
            # When a method is nested (transactions/workflows), retry occurs
            # only at the top level. This is a non-root method below a nested
            # method, so don't retry.
            return

        # Effect validation is enabled, and this method needs to retry: compose
        # a message, log it, and then raise.
        message = (
            f"Re-running method {method_name} to validate effects. "
            f"See {DOCS_BASE_URL}/develop/side_effects for "
            "more information."
        )

        _log_message_for_effect_validation(
            effect_validation=self._effect_validation,
            identifier=method_name,
            timestamps=_has_ever_explained_effect_validation,
            logger=logger,
            message=message,
        )

        # Reset the `IdempotencyManager` so that we re-execute the
        # method as though it is being retried from scratch.
        idempotency_manager.reset()

        raise EffectValidationRetry()

    @abstractmethod
    async def dispatch(
        self,
        task: TaskEffect,
        *,
        only_validate: bool = False,
    ) -> TaskResponseOrError:
        """Abstract dispatch method; implemented by code generation for each
        of the service's task methods."""
        raise NotImplementedError

    @abstractmethod
    async def inspect(self, state_ref: StateRef) -> AsyncIterator[Message]:
        """Abstract method for handling an Inspect request; implemented by code
        generation for each of the services."""
        raise NotImplementedError
        yield  # Necessary for type checking.

    @abstractmethod
    async def react_query(
        self,
        headers: Headers,
        method: str,
        request_bytes: bytes,
    ) -> AsyncIterator[tuple[Optional[Message], list[uuid.UUID]]]:
        """Abstract method for handling a React request; implemented by code
        generation for each of the service's React compatible reader methods."""
        raise NotImplementedError
        yield  # Necessary for type checking.

    @abstractmethod
    async def react_mutate(
        self,
        headers: Headers,
        method: str,
        request_bytes: bytes,
    ) -> Message:
        """Abstract method for handling a React mutation; implemented by code
        generation for each of the service's React compatible mutator methods."""
        raise NotImplementedError

    @abstractmethod
    def add_to_server(self, server: grpc.aio.Server) -> None:
        raise NotImplementedError
