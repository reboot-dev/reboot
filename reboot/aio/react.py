import asyncio
import grpc
import logging
import reboot.aio.placement
import time
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
from reboot.wait_for_tasks import wait_for_tasks
from typing import AsyncIterable, AsyncIterator, Optional

logger = get_logger(__name__)

# How many responses a query may run ahead of what its client has
# reported processing. Bigger means a client that keeps up sees state
# changes sooner, because the server doesn't wait to hear about the
# previous response before sending the next; it also means a client
# that can't keep up is further behind, since it works through what is
# already in flight before it sees current state. One is the most
# conservative choice and behaves like a strict request-per-response
# protocol.
#
# TODO: estimate this per client from observed throughput rather than
#       fixing it for everyone.
QUERY_RESPONSE_WINDOW = 10

# How long a response must wait for room before we say so, in the
# server's log and in the response itself. 100ms is about where a
# person stops experiencing an update as immediate and starts
# perceiving lag, so a client that waits longer than this is one whose
# user can see it waiting.
REPORTABLE_STALL_MILLISECONDS = 100


class _QueryWindow:
    """How much room a query has to send responses before it must hear
    from its client.

    Starts with `QUERY_RESPONSE_WINDOW` room; `take()` spends one and
    waits when there is none; `processed()` reports the last sequence
    number a client has fully processed and returns the room that
    accounts for.
    """

    def __init__(self):
        self._room = QUERY_RESPONSE_WINDOW
        self._has_room = asyncio.Event()
        self._has_room.set()
        # Sequence number of the next response to send, and of the
        # last one the client has reported processing. The client has
        # reported nothing until it does, hence -1.
        self.sequence_number = 0
        self._processed = -1

    def try_take(self) -> Optional[int]:
        """Returns the sequence number to send, or `None` when there is
        no room to send anything."""
        if self._room == 0:
            return None

        self._room -= 1

        if self._room == 0:
            self._has_room.clear()

        sequence_number = self.sequence_number
        self.sequence_number += 1
        return sequence_number

    async def take(self) -> int:
        """Waits for room and returns the sequence number to send."""
        while True:
            await self._has_room.wait()
            sequence_number = self.try_take()
            if sequence_number is not None:
                return sequence_number

    def processed(self, sequence_number: int) -> None:
        """Returns the room accounted for by a client reporting that it
        has processed everything up to `sequence_number`."""
        # A client can only have processed what we sent, and only ever
        # more than it last reported; anything else is a duplicate or
        # a retry, which returns no room rather than inventing any.
        sequence_number = min(sequence_number, self.sequence_number - 1)

        self._room += max(0, sequence_number - self._processed)

        if self._room > 0:
            self._has_room.set()

        self._processed = max(self._processed, sequence_number)


class _SuppressInvalidHandshakeFilter(logging.Filter):
    """Drop spurious `opening handshake failed` logs from non-WebSocket
    probes (e.g., HEAD requests or half-open TCP connections from a
    devcontainer/Codespaces port forwarder) so they don't appear during
    normal operation or shutdown. The `websockets` library logs every
    failed handshake at `ERROR` with a full stack trace; legitimate
    clients never produce `InvalidMessage`, so it's safe to filter."""

    def filter(self, record: logging.LogRecord) -> bool:
        if record.exc_info is not None:
            exception = record.exc_info[1]
            if isinstance(exception, websockets.exceptions.InvalidMessage):
                return False
        return True


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

        # Windows, keyed by query ID, for the queries served over a
        # streaming transport; the websocket path keeps its windows on
        # the connection instead.
        self._query_windows: dict[str, _QueryWindow] = {}

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

            # Also filter out `opening handshake failed` errors from
            # clients that aren't speaking WebSocket (e.g., HEAD probes
            # or half-open connections from a port forwarder).
            logger.addFilter(_SuppressInvalidHandshakeFilter())

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
        # The task stops on its own once the event above is set, so
        # pass `cancel=False`. Any `CancelledError` raised here is
        # this task's own cancellation and is propagated.
        await wait_for_tasks([self._websockets_serve_task], cancel=False)

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

        # When the WebSocket closes, cancel the query task so that
        # `reactively()` sessions are cleaned up. Without this,
        # `_query()` blocks indefinitely waiting for the next state
        # change, and the `reactively()` session is never cleaned up.
        query_task = asyncio.current_task()
        assert query_task is not None

        # This query's window, if the client asked for one. The
        # websocket identifies the query, so unlike the streaming
        # transport there is nothing to key on.
        window = _QueryWindow() if request.client_continues_query else None

        async def consume_requests():
            try:
                while True:
                    request_bytes = await websocket.recv()

                    # Everything the client sends after its initial
                    # request either continues the query or is a
                    # heartbeat; a heartbeat is an empty
                    # `QueryRequest`, which continues nothing.
                    continuation = react_pb2.QueryRequest()
                    continuation.ParseFromString(request_bytes)

                    if window is not None and continuation.HasField(
                        'continue_query_sequence_number'
                    ):
                        window.processed(
                            continuation.continue_query_sequence_number
                        )
            except Exception:
                # WebSocket closed (or errored); cancel the main query
                # task to unblock `_query()` and trigger cleanup.
                query_task.cancel()

        requests_task = asyncio.create_task(consume_requests())

        try:
            async for response in self._windowed_query(
                request=request,
                headers=headers,
                middleware=middleware,
                query_id=str(uuid.uuid4()),
                window=window,
            ):
                await websocket.send(response.SerializeToString())
        finally:
            requests_task.cancel()
            await asyncio.gather(requests_task, return_exceptions=True)

    def add_to_server(self, server: grpc.aio.Server) -> None:
        react_pb2_grpc.add_ReactServicer_to_server(self, server)

    def _middleware_for(self, headers: Headers) -> Middleware:
        """Returns the middleware for the state that the given headers
        address, after confirming that this server is authoritative for
        that state."""
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
            raise SystemAborted(
                Unavailable(),
                message=f"Server '{middleware.server_id}' is not "
                "authoritative for this request; server "
                f"'{authoritative_server}' is.",
            )

        return middleware

    async def ContinueQuery(
        self,
        request: react_pb2.ContinueQueryRequest,
        grpc_context: grpc.aio.ServicerContext,
    ) -> react_pb2.ContinueQueryResponse:
        """Implements the React.ContinueQuery RPC that lets a client
        tell us which responses from `Query` it has processed, which
        returns that much room to that query's window."""
        try:
            # Confirm that we are the server that produced the
            # responses.
            self._middleware_for(Headers.from_grpc_context(grpc_context))
        except Aborted as aborted:
            await grpc_context.abort_with_status(
                rpc_status.to_status(aborted.to_status())
            )

        # Look the window up rather than take it: the `Query` call
        # owns it and removes it when it ends.
        window = self._query_windows.get(request.query_id)

        if window is None:
            # There are several valid reasons why we may not know this
            # query:
            # 1. The server may have restarted and lost its memory of
            #    it. The client's `Query` call will have been broken by
            #    that same restart, and it gets a fresh query once it
            #    reconnects.
            # 2. The query may have ended between the client sending
            #    this and us receiving it.
            # Either way there is no window left to return room to.
            return react_pb2.ContinueQueryResponse()

        window.processed(request.sequence_number)

        return react_pb2.ContinueQueryResponse()

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

    async def _windowed_query(
        self,
        *,
        request: react_pb2.QueryRequest,
        headers: Headers,
        middleware: Middleware,
        query_id: str,
        window: Optional[_QueryWindow],
    ) -> AsyncIterator[react_pb2.QueryResponse]:
        """Produces the responses of `_query()`, each stamped with the
        query it belongs to and the room it is sent under.

        Asks for states as fast as they are produced even while there
        is no room to send one. A state that arrives while we are
        waiting for room is merged into the response we are holding,
        so the response we send once there is room carries the latest
        state and says how long it waited and how many updates it
        stood in for.
        """
        responses = self._query(
            request=request,
            headers=headers,
            middleware=middleware,
        ).__aiter__()

        if window is None:
            # A client that reports nothing back has no room to wait
            # for; it gets responses as fast as we produce them.
            async for response in responses:
                yield response
            return

        # The response we have asked for but have no room for yet, and
        # the room we are waiting on. Both outlive an iteration of the
        # loop below: dropping an ask for a response would lose the
        # state that ask is waiting for.
        asked: Optional[asyncio.Future] = None
        room: Optional[asyncio.Future] = None

        try:
            while True:
                if asked is None:
                    asked = asyncio.ensure_future(anext(responses, None))

                response = await asked
                asked = None

                if response is None:
                    return

                sequence_number = window.try_take()

                if sequence_number is None:
                    stalled_at = time.monotonic()
                    skipped = 0
                    room = asyncio.ensure_future(window.take())

                    while True:
                        if asked is None:
                            asked = asyncio.ensure_future(
                                anext(responses, None)
                            )

                        await asyncio.wait(
                            [room, asked],
                            return_when=asyncio.FIRST_COMPLETED,
                        )

                        if asked.done():
                            update = asked.result()
                            asked = None

                            if update is None:
                                # What we hold is the last response of
                                # this query; it still needs room.
                                sequence_number = await room
                                break

                            skipped += 1

                            # `MergeFrom` is exactly what one response
                            # standing in for two means: the newer
                            # state replaces the one we hold, an
                            # update that carries no state of its own
                            # leaves that state alone, and we keep the
                            # idempotency keys of both, since a
                            # mutation reported once must not be lost
                            # because the response reporting it was
                            # merged away.
                            response.MergeFrom(update)

                        if room.done():
                            sequence_number = room.result()
                            break

                    room = None

                    stall_milliseconds = round(
                        (time.monotonic() - stalled_at) * 1000
                    )

                    response.stall_milliseconds = stall_milliseconds
                    response.skipped_updates = skipped

                    if stall_milliseconds > REPORTABLE_STALL_MILLISECONDS:
                        logger.info(
                            "A client of a reactive query to "
                            f"`{request.method}` skipped {skipped} updates "
                            f"because it fell {stall_milliseconds}ms behind"
                        )

                response.query_id = query_id
                response.sequence_number = sequence_number

                yield response
        finally:
            for future in (asked, room):
                if future is not None:
                    future.cancel()

    async def Query(
        self,
        request: react_pb2.QueryRequest,
        grpc_context: grpc.aio.ServicerContext,
    ) -> AsyncIterable[react_pb2.QueryResponse]:
        """Implements the React.Query RPC that calls into the
        'Middleware.react' method for handling a single request."""

        # gRPC-asyncio does NOT automatically cancel the server-side
        # asyncio task when the client disconnects from a
        # server-streaming RPC. Without cancellation, the
        # `reactively()` session inside `react_query()` hangs forever
        # waiting for state changes, leaking memory.
        #
        # Register a done callback on the gRPC context so that when
        # the RPC terminates for any reason (client disconnect, server
        # abort, etc.) we cancel this task, propagating `CancelledError`
        # into `reactively()` and triggering its `finally` cleanup.
        #
        # See https://github.com/grpc/grpc/issues/28999.
        query_task = asyncio.current_task()
        assert query_task is not None

        def done_callback(_) -> None:
            query_task.cancel()

        grpc_context.add_done_callback(done_callback)

        # NOTE: we don't need `with use_application_id(...)` like we
        # do for websockets because this is a gRPC method and thus our
        # `UseApplicationIdInterceptor` will have already done it for
        # us.
        try:
            headers = Headers.from_grpc_context(grpc_context)

            middleware = self._middleware_for(headers)

            query_id = str(uuid.uuid4())
            window: Optional[_QueryWindow] = None

            if request.client_continues_query:
                window = _QueryWindow()
                self._query_windows[query_id] = window

            try:
                async for response in self._windowed_query(
                    request=request,
                    headers=headers,
                    middleware=middleware,
                    query_id=query_id,
                    window=window,
                ):
                    yield response
            finally:
                # This `finally` covers the whole loop, so that
                # closing this generator while it is suspended in a
                # `yield` still takes the window out of a dictionary
                # that lives as long as the service.
                if window is not None:
                    del self._query_windows[query_id]
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
