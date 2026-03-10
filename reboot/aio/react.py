import asyncio
import grpc
import logging
import reboot.aio.placement
import traceback
import uuid
import websockets
from google.protobuf.json_format import MessageToJson
from google.rpc import code_pb2, status_pb2
from grpc_health.v1 import health_pb2
from grpc_status import rpc_status
from log.log import get_logger, log_at_most_once_per
from rbt.v1alpha1 import react_pb2, react_pb2_grpc
from rbt.v1alpha1.errors_pb2 import Unavailable, UnknownService
from reboot.aio.aborted import Aborted, SystemAborted
from reboot.aio.headers import APPLICATION_ID_HEADER, STATE_REF_HEADER, Headers
from reboot.aio.internals.contextvars import use_application_id
from reboot.aio.internals.middleware import Middleware
from reboot.aio.types import (
    ApplicationId,
    StateRef,
    StateTypeName,
    StateTypeTag,
    state_type_tag_for_name,
)
from reboot.nodejs.python import should_print_stacktrace
from reboot.settings import EVERY_LOCAL_NETWORK_ADDRESS
from typing import AsyncIterable, AsyncIterator, Optional

logger = get_logger(__name__)


class ReactServicer(react_pb2_grpc.ReactServicer):
    """System service for serving requests from our code generated react
    readers.

    TODO(benh): make this more generic than just for react so that
    users and other system services (e.g., a read cache) can use this
    to get reactive/streaming reads without the user having to
    implement it themselves.
    """

    def __init__(
        self,
        application_id: ApplicationId,
        middleware_by_state_type_name: dict[StateTypeName, Middleware],
    ):
        self._application_id = application_id
        self._middleware_by_state_type_name = middleware_by_state_type_name
        self._middleware_by_state_type = {}
        self._state_name_by_state_tag: dict[str, StateTypeName] = {}

        for state_type_name, middleware in middleware_by_state_type_name.items(
        ):
            state_tag = state_type_tag_for_name(state_type_name)
            self._state_name_by_state_tag[state_tag] = state_type_name
            self._middleware_by_state_type[state_type_name] = middleware

        self._stop_websockets_serve = asyncio.Event()

    def _state_type_name_for_state_ref(
        self, state_ref: StateRef
    ) -> Optional[StateTypeName]:
        tag = state_ref.state_type_tag
        return self._state_name_by_state_tag.get(tag, None)

    async def start(self, websocket_port: Optional[int]) -> int:
        """Starts the websocket server and returns the port that it is
        listening on."""
        websocket_bound_port: asyncio.Future[int] = asyncio.Future()

        async def websockets_serve():
            logger = get_logger(f"{__name__}:websockets")

            # We set the log level to `ERROR` on this logger because websockets is chatty!
            logger.setLevel(logging.ERROR)

            async with websockets.serve(
                self.serve,
                EVERY_LOCAL_NETWORK_ADDRESS,
                websocket_port,
                logger=logger,
            ) as server:
                # server.sockets is of type Iterable[socket] but is not
                # guaranteed to be an indexable list.
                socket = next(iter(server.sockets))
                websocket_bound_port.set_result(socket.getsockname()[1])
                await self._stop_websockets_serve.wait()

        self._websockets_serve_task = asyncio.create_task(
            websockets_serve(),
            name=f'websockets_serve() in {__name__}',
        )

        await websocket_bound_port

        return websocket_bound_port.result()

    async def stop(self):
        self._stop_websockets_serve.set()
        try:
            await self._websockets_serve_task
        except:
            # We're trying to stop so no need to propagate any
            # exceptions.
            pass

    async def serve(self, websocket):
        # Actually serve within an asyncio task while also creating
        # asyncio tasks to detect (1) if the websocket was closed or
        # (2) if we are trying to stop serving all together so that we
        # ensure we propagate cancellation.
        done, pending = await asyncio.wait(
            [
                asyncio.create_task(self._serve(websocket)),
                asyncio.create_task(websocket.wait_closed()),
                asyncio.create_task(self._stop_websockets_serve.wait()),
            ],
            return_when=asyncio.FIRST_COMPLETED,
        )
        # It doesn't matter which task finished first; we need to cancel the
        # others:
        # * If serving the websocket finishes, we don't need to watch
        #   whether the websocket got closed or if we are trying to
        #   stop serving anymore.
        # * If we're trying to stop serving then we should cancel the call
        #   to `_serve()` and no longer care if the websocket gets closed.
        for task in pending:
            task.cancel()

    async def _serve(self, websocket):
        # Handle health check requests before parsing headers.
        if 'React/HealthCheck' in websocket.request.path:
            return await self._websocket_health_check(websocket)

        with use_application_id(self._application_id):
            try:
                application_id, state_ref = (
                    websocket.request.headers[APPLICATION_ID_HEADER],
                    StateRef.from_maybe_readable(
                        websocket.request.headers[STATE_REF_HEADER]
                    ),
                )

                assert self._application_id == application_id

                state_type_name = self._state_type_name_for_state_ref(
                    state_ref
                )

                if state_type_name is None:
                    log_at_most_once_per(
                        seconds=60,
                        log_method=logger.error,
                        message=_unknown_query_or_mutation_error_message(
                            is_query='React/Query' in websocket.request.path,
                            state_type=state_ref.state_type,
                        ),
                    )
                    return

                middleware = self._middleware_by_state_type[state_type_name]

                # TODO: be more conservative checking websocket path.
                if 'React/Query' in websocket.request.path:
                    return await self._websocket_query(
                        websocket,
                        application_id=application_id,
                        state_ref=state_ref,
                        middleware=middleware,
                    )
                else:
                    # TODO: don't assume this is a mutate, instead
                    # refactor the code to put something in the path
                    # like what we have for `React/Query`.
                    return await self._websocket_mutate(
                        websocket,
                        application_id=application_id,
                        state_ref=state_ref,
                        middleware=middleware,
                    )
            except asyncio.CancelledError:
                # It's pretty normal for a query to be
                # cancelled; it's not useful to print a stack
                # trace.
                raise
            except Aborted as aborted:
                # We handle the 'Aborted' error for a 'react_mutate' call
                # inside that method itself, so this 'Aborted' error can only
                # be from the 'react_query' method.
                await websocket.send(
                    react_pb2.QueryResponse(
                        status=MessageToJson(aborted.to_status()),
                    ).SerializeToString()
                )
            except websockets.exceptions.ConnectionClosedOK:
                # No real error here, browser users will come and go!
                pass
            except websockets.exceptions.ConnectionClosedError:
                # No real error here, browser users may get disconnected!
                pass
            except BaseException as exception:
                # Print the exception stack trace for easier
                # debugging. Note that we don't include the stack
                # trace in an error message for the same reason
                # that gRPC doesn't do so by default, see
                # https://github.com/grpc/grpc/issues/14897, but
                # since this should only get logged on the server
                # side it is safe.
                error_message = (
                    'Failed to execute '
                    f"{'query' if 'React/Query' in websocket.request.path else 'mutation'} "
                    'via websocket; '
                    f'{type(exception).__name__}: {exception}'
                )

                if should_print_stacktrace():
                    error_message += f'\n{traceback.format_exc()}'

                logger.error(error_message)

                # TODO: send a status which does not include any
                # details, just a message which we glean from the
                # raised exception.
                status = status_pb2.Status(
                    code=code_pb2.Code.UNKNOWN,
                    message=f'{type(exception).__name__}: {exception}',
                )

                responseType = (
                    react_pb2.QueryResponse if 'React/Query'
                    in websocket.request.path else react_pb2.MutateResponse
                )

                await websocket.send(
                    responseType(
                        status=MessageToJson(status),
                    ).SerializeToString()
                )

    async def _websocket_mutate(
        self,
        websocket,
        *,
        application_id: ApplicationId,
        state_ref: StateRef,
        middleware: Middleware,
    ):
        async for request_bytes in websocket:
            request = react_pb2.MutateRequest()
            request.ParseFromString(request_bytes)

            headers = Headers(
                application_id=application_id,
                state_ref=state_ref,
                idempotency_key=uuid.UUID(request.idempotency_key),
                bearer_token=request.bearer_token,
                # This request came in over a websocket, so this is a
                # frontend client calling, not another Reboot
                # application. Therefore there is no caller ID.
                caller_id=None,
            )

            # The 'react_mutate' method is the generated code and in
            # case there is an 'Aborted' error it will raise it, so we
            # need to catch it here to not break the websocket connection.
            try:
                response = await middleware.react_mutate(
                    headers,
                    request.method,
                    request.request,
                )
            except Aborted as aborted:
                await websocket.send(
                    react_pb2.MutateResponse(
                        status=MessageToJson(aborted.to_status()),
                    ).SerializeToString()
                )
            else:
                await websocket.send(
                    react_pb2.MutateResponse(
                        response=response.SerializeToString(),
                    ).SerializeToString()
                )

    async def _websocket_health_check(self, websocket):
        """
        Handle health check requests received via websocket.
        """
        response = health_pb2.HealthCheckResponse(
            status=health_pb2.HealthCheckResponse.SERVING,
        )
        await websocket.send(response.SerializeToString())

    async def _websocket_query(
        self,
        websocket,
        *,
        application_id: ApplicationId,
        state_ref: StateRef,
        middleware: Middleware,
    ):
        request_bytes = await websocket.recv()

        request = react_pb2.QueryRequest()
        request.ParseFromString(request_bytes)

        headers = Headers(
            application_id=application_id,
            state_ref=state_ref,
            bearer_token=request.bearer_token,
        )

        async def consume_heartbeats() -> AsyncIterator[None]:
            while True:
                _ = await websocket.recv()

        heartbeats_task = asyncio.create_task(consume_heartbeats())

        try:
            async for response in self._query(
                request=request,
                headers=headers,
                middleware=middleware,
            ):
                await websocket.send(response.SerializeToString())
        finally:
            heartbeats_task.cancel()
            await asyncio.gather(heartbeats_task, return_exceptions=True)

    def add_to_server(self, server: grpc.aio.Server) -> None:
        react_pb2_grpc.add_ReactServicer_to_server(self, server)

    async def _query(
        self,
        *,
        request: react_pb2.QueryRequest,
        headers: Headers,
        middleware: Middleware,
    ) -> AsyncIterable[react_pb2.QueryResponse]:
        async for (response, idempotency_keys) in middleware.react_query(
            headers,
            request.method,
            request.request,
        ):
            query_response = react_pb2.QueryResponse(
                idempotency_keys=[
                    str(idempotency_key)
                    for idempotency_key in idempotency_keys
                ],
            )

            # Leave the `response` empty if the `react_query` returned
            # `None`, so that the client can distinguish between a
            # `None` response and a response with an empty payload.
            if response is not None:
                query_response.response = response.SerializeToString()

            yield query_response

    async def Query(
        self,
        request: react_pb2.QueryRequest,
        grpc_context: grpc.aio.ServicerContext,
    ) -> AsyncIterable[react_pb2.QueryResponse]:
        """Implements the React.Query RPC that calls into the
        'Middleware.react' method for handling a single request."""

        # NOTE: we don't need `with use_application_id(...)` like we
        # do for websockets because this is a gRPC method and thus our
        # `UseApplicationIdInterceptor` will have already done it for
        # us.
        try:
            headers = Headers.from_grpc_context(grpc_context)

            state_ref = headers.state_ref

            state_type_name = self._state_type_name_for_state_ref(state_ref)

            if state_type_name is None:
                log_at_most_once_per(
                    seconds=60,
                    log_method=logger.error,
                    message=_unknown_query_or_mutation_error_message(
                        is_query=True,
                        state_type=state_ref.state_type,
                    ),
                )
                raise SystemAborted(UnknownService())

            middleware = self._middleware_by_state_type[state_type_name]

            # Confirm whether this is the right server to be serving this
            # request.
            try:
                assert headers.application_id is not None  # Guaranteed by `Headers`.
                authoritative_server = middleware.placement_client.server_for_actor(
                    headers.application_id,
                    state_ref,
                )
            except reboot.aio.placement.UnknownApplicationError:
                # It's possible that the user did indeed type an application ID
                # that doesn't exist, but it's also quite possible that this
                # request reached us before the placement planner had gossipped
                # out the information about which applications exist (we see
                # this e.g. after `rbt dev`'s chaos monkey restarts). For that
                # reason, abort with a retryable error.
                raise SystemAborted(
                    Unavailable(),
                    message=
                    f"Application '{headers.application_id}' not found. If you "
                    "are confident the application exists, this may be because "
                    "the system is still starting.",
                ) from None
            if authoritative_server != middleware.server_id:
                # This is NOT the correct server. Fail.
                await grpc_context.abort(
                    grpc.StatusCode.UNAVAILABLE,
                    f"Server '{middleware.server_id}' is not "
                    "authoritative for this request; server "
                    f"'{authoritative_server}' is.",
                )
                raise  # Unreachable but necessary for mypy.

            async for response in self._query(
                request=request,
                headers=headers,
                middleware=middleware,
            ):
                yield response
        except asyncio.CancelledError:
            # It's pretty normal for a query to be cancelled; it's not useful to
            # print a stack trace.
            raise
        except grpc.aio.BaseError:
            # If somewhere deeper in the call graph had a gRPC error
            # just let that propagate!
            raise
        except Aborted as aborted:
            # While we're aborting with a generic `Aborted` the client
            # can reconstruct the original `MyRequestAborted` error from
            # the details.
            await grpc_context.abort_with_status(
                rpc_status.to_status(aborted.to_status())
            )
        except BaseException as exception:
            # Don't print a stack trace for any common errors or user
            # errors that were raised that we turned into an
            # `Aborted`. We should have logged an error to make it
            # easier for a user to debug.
            #
            # As of the writing of this comment we know that if the
            # context status code is `ABORTED` then it must have been
            # from our `Aborted` because there aren't any other ways
            # for Reboot apps to abort an RPC because we don't give
            # them access to a `ServicerContext`. But even if we do,
            # if a user calls abort then that's similar to raising one
            # of their user errors and we probably don't need to print
            # a stack trace.
            if (
                grpc_context.code() != code_pb2.Code.ABORTED and
                not isinstance(exception, GeneratorExit)
            ):
                traceback.print_exc()

            raise exception

    async def WebSocketsConnection(
        self,
        request: react_pb2.WebSocketsConnectionRequest,
        grpc_context: grpc.aio.ServicerContext,
    ) -> react_pb2.WebSocketsConnectionResponse:
        await asyncio.Event().wait()
        # TODO(benh): use `assert_never` in Python > 3.11.
        assert False, 'Unreachable'


def _unknown_query_or_mutation_error_message(
    is_query: bool,
    state_type: StateTypeName | StateTypeTag,
) -> str:
    return (
        "A client attempted to perform a 'React' "
        f"{'query' if is_query else 'mutation'} "
        f"on an unknown state type '{state_type}'; "
        "Typical reasons for this are:\n"
        "  * is there a servicer missing in the `Application`?\n"
        "  * does the frontend code need to be regenerated, "
        "possibly because the package or name of the state "
        "type changed?\n"
        "  * is there a browser tab still running old frontend code?\n"
        "  * is there a browser tab running a different Reboot application's "
        "frontend?\n"
        "  (This message will only be logged once per minute)"
    )
