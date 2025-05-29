import dataclasses
import grpc
import grpc_status._async as rpc_status
import uuid
from contextlib import asynccontextmanager
from google.protobuf.message import Message
from grpc.aio import AioRpcError
from rebootdev.aio.aborted import Aborted
from rebootdev.aio.contexts import Context, Participants
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
    AsyncIterable,
    AsyncIterator,
    Awaitable,
    Callable,
    Optional,
    TypeVar,
)

CallT = TypeVar('CallT', bound=grpc.Call)
ResponseT = TypeVar('ResponseT', bound=Message)
RequestT = TypeVar('RequestT', bound=Message)


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
            #
            # Reactive calls are only supported for unary readers, i.e.,
            # we only have a single request, no idempotency key, and we
            # won't be in a transaction.
            if (
                self._context is not None and
                self._context.react is not None and unary and reader
            ):
                assert not isinstance(request_or_requests, AsyncIterable)
                assert idempotency_key is None
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
                    state_type_name=state_type_name,
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
