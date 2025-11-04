import dataclasses
import grpc
import grpc_status._async as rpc_status
import uuid
from contextlib import asynccontextmanager
from google.protobuf.message import Message
from grpc.aio import AioRpcError
from log.log import get_logger
from rebootdev.aio.aborted import Aborted
from rebootdev.aio.backoff import Backoff
from rebootdev.aio.contexts import Context, Participants, ReaderContext
from rebootdev.aio.headers import IDEMPOTENCY_KEY_HEADER, Headers
from rebootdev.aio.idempotency import IdempotencyManager
from rebootdev.aio.internals.channel_manager import _ChannelManager
from rebootdev.aio.internals.contextvars import get_application_id
from rebootdev.aio.types import (
    ApplicationId,
    GrpcMetadata,
    ServiceName,
    StateRef,
    StateTypeName,
)
from typing import (
    Any,
    AsyncIterable,
    AsyncIterator,
    Awaitable,
    Callable,
    Generator,
    Generic,
    Optional,
    TypeVar,
)

CallT = TypeVar('CallT', bound=grpc.Call)
ResponseT = TypeVar('ResponseT', bound=Message)
RequestT = TypeVar('RequestT', bound=Message)

logger = get_logger(__name__)


class UnaryRetriedCall(Generic[ResponseT]):
    """
    Helper for making an RPC call, and retrying if there's a retryable
    error.

    The built-in gRPC retry mechanism unfortunately only supports up to
    5 retries before giving up [1]; that's not sufficient for the use
    case of a Reboot application. This wrapper therefore implements
    custom retry logic.

    This must be done in a helper object wrapped around a gRPC `call`
    object, because while there are only a few places in our generated
    code where we _create_ a `Call` object, there are many places where
    we `await` them - and most of those places are not suitable for
    in-place retry logic.

    [1] https://github.com/grpc/proposal/blob/master/A6-client-retries.md#validation-of-retrypolicy
    """

    def __init__(
        self,
        *,
        # In some places in the generated code we must create a `call`
        # object to decide whether or not to even make the call; in
        # those cases, the already-created `call` object can be passed,
        # so it can be used to make the first call.
        call: Optional[Awaitable[ResponseT]],
        # What follows is information that's needed to create subsequent
        # `call` objects (for retries, or if no `call` was provided in
        # the first place).
        stub_method: Callable[...,
                              Awaitable[ResponseT] | AsyncIterable[ResponseT]],
        method_name: str,
        request: Message,
        metadata: GrpcMetadata,
        # When something went _fatally_ wrong, an error of the following
        # type is raised.
        aborted_type: type[Aborted],
    ) -> None:
        self._call: Optional[Awaitable[ResponseT]] = call
        self._stub_method = stub_method
        self._method_name = method_name
        self._request = request
        self._metadata = metadata
        self._aborted_type = aborted_type

    async def trailing_metadata(self) -> GrpcMetadata:
        """Return the trailing metadata from the call."""
        if self._call is None:
            raise RuntimeError(
                "Cannot get trailing metadata before the call has been made"
            )
        return await self._call.trailing_metadata( # type: ignore[attr-defined]
        )

    def __await__(self) -> Generator[Any, None, ResponseT]:
        return self._call_with_retries().__await__()

    def _should_retry(self, error: grpc.aio.AioRpcError) -> bool:
        # For now, the only retriable error is UNAVAILABLE.
        return error.code() == grpc.StatusCode.UNAVAILABLE

    async def _call_with_retries(self) -> ResponseT:
        backoff = Backoff()
        while True:
            if self._call is None:
                new_call = self._stub_method(
                    self._request, metadata=self._metadata
                )
                assert isinstance(new_call, Awaitable)
                self._call = new_call
            try:
                return await self._call
            except grpc.aio.AioRpcError as error:
                if self._should_retry(error):
                    # Retry this, with some backoff.
                    logger.debug(
                        f"Unary call to '{self._method_name}' encountered "
                        f"retryable error: {error}; will retry..."
                    )
                    await backoff()
                    # We need to create a fresh call object for the
                    # retry.
                    self._call = None
                    continue

                # Because the `self._call` is not necessarily the `call`
                # that was passed to us, the outer try/except blocks may
                # not correctly spot and handle an error. We therefore
                # do that here.
                status = (
                    await rpc_status.from_call(self._call)
                ) if self._call is not None else None

                if status is not None:
                    raise self._aborted_type.from_status(status) from None

                raise self._aborted_type.from_grpc_aio_rpc_error(
                    error
                ) from None

        raise RuntimeError("This is unreachable")


class Stub:
    """Common base class for generated reboot stubs.
    """
    # TODO: Do we add injection for channels and/or interceptors for M1?
    _channel_manager: _ChannelManager
    _headers: Headers

    _idempotency_manager: IdempotencyManager

    # Context that was used to create this stub.
    _context: Optional[Context]

    def __init__(
        self,
        *,
        channel_manager: _ChannelManager,
        idempotency_manager: IdempotencyManager,
        state_ref: StateRef,
        context: Optional[Context],
        bearer_token: Optional[str],
        app_internal_authorization: Optional[str],
    ):
        self._channel_manager = channel_manager
        self._idempotency_manager = idempotency_manager
        self._context = context

        application_id: Optional[ApplicationId] = None

        workflow_id: Optional[uuid.UUID] = None
        transaction_ids: Optional[list[uuid.UUID]] = None
        transaction_coordinator_state_type: Optional[StateTypeName] = None
        transaction_coordinator_state_ref: Optional[StateRef] = None

        if context is not None:
            # This assert is trivially true - for now. It's here to remind us
            # that we need to be careful: we shouldn't blindly hand the internal
            # API key secret out in headers when we start sending traffic
            # outside our own application.
            assert application_id is None
            application_id = context.application_id
            app_internal_authorization = context._app_internal_api_key_secret

            workflow_id = context.workflow_id
            transaction_ids = context.transaction_ids
            transaction_coordinator_state_type = context.transaction_coordinator_state_type
            transaction_coordinator_state_ref = context.transaction_coordinator_state_ref
        else:
            # When we're creating a `Stub` via an `ExternalContext`,
            # we use the application ID from the asyncio context
            # variable, if present.
            application_id = get_application_id()

        # NOTE: when running tests via `reboot.aio.tests.Reboot`
        # we won't always know our application ID.

        self._headers = Headers(
            application_id=application_id,
            state_ref=state_ref,
            workflow_id=workflow_id,
            transaction_ids=transaction_ids,
            transaction_coordinator_state_type=
            transaction_coordinator_state_type,
            transaction_coordinator_state_ref=transaction_coordinator_state_ref,
            bearer_token=bearer_token,
            app_internal_authorization=app_internal_authorization,
        )

    def _should_call_retry_unavailable(
        self, call: Awaitable | AsyncIterable,
        request_or_requests: Message | AsyncIterable[Message]
    ) -> bool:
        if isinstance(call, AsyncIterable):
            # This is a server-streaming call.
            #
            # It is NOT safe to retry server-streaming calls,
            # even if they can only be readers. Unlike
            # _reactive_ reader calls, streaming reader
            # responses can have ~any semantic the developer
            # wants, and it isn't safe to simply restart the
            # response stream from the beginning.
            #
            # We therefore do NOT implement transparent retry
            # logic for this call.
            return False
        if isinstance(request_or_requests, AsyncIterable):
            # This is a client-streaming call.
            #
            # It is NOT safe to retry client-streaming calls,
            # since the `request_or_requests` is an iterable and
            # may have already been (partially) consumed by the
            # time a retry would be attempted.
            #
            # We therefore do NOT implement transparent retry
            # logic for this call.
            return False

        # This is a unary call. It is _safe_ to retry, but should we?
        # Retries are done at the root of the DAG, so only at the root
        # will we consider retrying. Even at the root, it depends on the
        # type of DAG root we have:
        # 1. Workflows retry failures by restarting the whole workflow.
        #    That is, we will NOT retry individual calls.
        # 2. `ExternalContext`s. These are the only place where we retry
        #    individual calls.
        #
        # If and ONLY if we're in an `ExternalContext`, the `_context`
        # is None, because `ExternalContext` is the only context type
        # that doesn't inherit from `Context`.
        return self._context is None

    @asynccontextmanager
    async def _call(
        self,
        state_type_name: StateTypeName,
        service_name: ServiceName,
        method: str,
        stub_method: Callable[...,
                              Awaitable[ResponseT] | AsyncIterable[ResponseT]],
        request_or_requests: RequestT | AsyncIterable[RequestT],
        *,
        unary: bool,
        reader: bool,
        response_type: type[ResponseT],
        aborted_type: type[Aborted],
        metadata: Optional[GrpcMetadata] = None,
        idempotency_key: Optional[uuid.UUID] = None,
        bearer_token: Optional[str] = None,
    ) -> AsyncIterator[Awaitable[ResponseT] | AsyncIterable[ResponseT]]:
        """Helper for making an RPC, handling any user-defined errors, and
        doing so correctly depending on whether or not we are reactive
        or in a transaction.
        """
        if metadata is None:
            metadata = ()

        # TODO(benh): maybe just overwrite the idempotency key instead
        # of checking for its existence?
        if any(t[0] == IDEMPOTENCY_KEY_HEADER for t in metadata):
            raise ValueError(
                f"Do not set '{IDEMPOTENCY_KEY_HEADER}' metadata yourself"
            )

        if (
            idempotency_key is None and
            not isinstance(self._context, ReaderContext)
        ):
            # There isn't a user-provided idempotency key, and the
            # method is not inherently idempotent (i.e., a reader).
            #
            # We may perform transparent retries on this call. That
            # means it needs to be idempotent, and for non-readers that
            # means we need an idempotency key. So even if the user or
            # idempotency manager didn't provide an idempotency key, we
            # generate one now. Keys generated here don't need to be
            # reproducible, they just need to be unique.
            idempotency_key = uuid.uuid4()

        if idempotency_key is not None:
            metadata += ((IDEMPOTENCY_KEY_HEADER, str(idempotency_key)),)

        headers = self._headers

        if bearer_token is not None:
            headers = dataclasses.replace(
                headers,
                bearer_token=bearer_token,
            )

        metadata += headers.to_grpc_metadata()

        call: Awaitable[ResponseT] | AsyncIterable[ResponseT]
        try:
            # Check if we should execute this call reactively.
            if (
                self._context is not None and
                self._context.react is not None and unary and reader
            ):
                # This code path only applies for _transitive_ reactive
                # reader calls; calls that are made directly via
                # `WeakReference.reactively()` are handled elsewhere.
                # This code path handles a reader call made from within
                # a context that is already reactive, and that therefore
                # (implicitly) must be reactive themselves.
                #
                # Reactive calls are only supported for unary readers,
                # i.e., we only have a single request, and we won't be
                # in a transaction.
                #
                # This type of reactive call is _not_ the root of a DAG,
                # and so is NOT retried on error (even if the error is
                # retryable).
                assert not isinstance(request_or_requests, AsyncIterable)
                assert self._context.transaction_id is None

                call, response = await self._context.react.call(
                    state_type_name=state_type_name,
                    state_ref=self._headers.state_ref,
                    service_name=service_name,
                    method=method,
                    request=request_or_requests,
                    response_type=response_type,
                    metadata=metadata,
                )

                yield response
            elif self._context is not None and self._context.transaction_id is not None:
                async with self._call_transactionally(
                    stub_method,
                    request_or_requests,
                    aborted_type=aborted_type,
                    metadata=metadata,
                ) as call:
                    yield call
            else:
                call = stub_method(request_or_requests, metadata=metadata)
                if self._should_call_retry_unavailable(
                    call, request_or_requests
                ):
                    assert isinstance(call, Awaitable)
                    assert isinstance(request_or_requests, Message)
                    # This is not a reactive call.
                    assert (
                        self._context is None or self._context.react is None or
                        not unary or not reader
                    )
                    # This is not a transaction.
                    assert (
                        self._context is None or
                        self._context.transaction_id is None
                    )
                    yield UnaryRetriedCall(
                        call=call,
                        stub_method=stub_method,
                        method_name=method,
                        request=request_or_requests,
                        metadata=metadata,
                        aborted_type=aborted_type,
                    )
                else:
                    yield call

        except AioRpcError as error:
            status = (
                await rpc_status.from_call(call)
            ) if call is not None else None

            if status is not None:
                raise aborted_type.from_status(status) from None

            raise aborted_type.from_grpc_aio_rpc_error(error) from None
        finally:
            # NOTE: to ensure that a caller can read their writes in a
            # reactive setting we need to invalidate any reactive
            # readers. There is still the possibility if someone is
            # concurrently reading while writing that they'll get a
            # stale response but that is possible regardless due to
            # the inherent non-determinism of concurrent calls.
            if (
                self._context is not None and
                self._context.react is not None and not reader
            ):

                self._context.react.invalidate(
                    service_name=service_name,
                    state_ref=self._headers.state_ref,
                )

    @asynccontextmanager
    async def _call_transactionally(
        self,
        stub_method: Callable[..., CallT],
        request_or_requests: RequestT | AsyncIterable[RequestT],
        *,
        aborted_type: type[Aborted],
        metadata: GrpcMetadata,
    ) -> AsyncIterator[CallT]:
        """Helper for making an unreactive RPC and properly tracking it if it
        is part of a transaction.
        """
        assert self._context is not None
        assert self._context.transaction_id is not None

        self._context.outstanding_rpcs += 1

        call: Optional[CallT] = None

        try:
            call = stub_method(request_or_requests, metadata=metadata)
            assert call is not None
            yield call
        except AioRpcError as error:
            status = (
                await rpc_status.from_call(call)
            ) if call is not None else None

            aborted = (
                aborted_type.from_status(status) if status is not None else
                aborted_type.from_grpc_aio_rpc_error(error)
            )

            if not aborted_type.is_from_backend_and_safe(aborted):
                # TODO(benh): considering stringifying the exception to
                # include in the error we raise when doing the prepare
                # stage of two phase commit.
                self._context.transaction_must_abort = True

            raise aborted
        except:
            # TODO(benh): considering stringifying the exception to
            # include in the error we raise when doing the prepare
            # stage of two phase commit.
            self._context.transaction_must_abort = True

            raise
        finally:
            if call is not None:
                participants = Participants.from_grpc_metadata(
                    await call.trailing_metadata()
                )
                self._context.participants.union(participants)

            self._context.outstanding_rpcs -= 1
