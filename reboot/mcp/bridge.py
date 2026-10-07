"""Experimental MCP transport for the existing frontend React protocol.

One process owns each app's ephemeral subscription registry. A lost registry
requires a frontend reconnect; it is never treated as an empty successful read.
"""
import asyncio
import base64
import hashlib
import uuid
from collections import deque
from dataclasses import replace
from google.protobuf.json_format import MessageToJson
from google.rpc.status_pb2 import Status
from grpc import StatusCode
from grpc.aio import AioRpcError
from mcp.server.fastmcp import Context, FastMCP
from rbt.v1alpha1.react_pb2 import (
    MutateRequest,
    MutateResponse,
    QueryRequest,
    QueryResponse,
)
from rbt.v1alpha1.react_pb2_grpc import ReactStub
from reboot.aio.headers import Headers
from reboot.aio.types import StateRef, StateTypeName
from reboot.mcp.context import get_reboot_context

QUERY_TOOL = 'reboot_internal_query'
MUTATE_TOOL = 'reboot_internal_mutate'
MAX_BYTES = 8 * 1024 * 1024


def encode_base64(data: bytes) -> str:
    return base64.b64encode(data).decode('ascii')


def decode_base64(data: str) -> bytes:
    if len(data) > MAX_BYTES:
        raise ValueError('bridge request too large')
    return base64.b64decode(data, validate=True)


def grpc_error_status_json(error: AioRpcError) -> str:
    for key, value in error.trailing_metadata() or ():
        if key == 'grpc-status-details-bin':
            return MessageToJson(Status.FromString(value))
    return MessageToJson(
        Status(code=error.code().value[0], message=error.details() or '')
    )


class BridgeSession:

    def __init__(self, owner: str):
        self.owner = owner
        self.condition = asyncio.Condition()
        self.tasks: dict[str, asyncio.Task] = {}
        self.requests: dict[str, tuple[str, str, str]] = {}
        self.events: deque[dict] = deque()
        self.sequence = 0
        self.acknowledged = 0
        self.delivered = 0
        self.bytes = 0
        self.closed = False
        self.polling = False
        self.lease: asyncio.TimerHandle | None = None

    async def enqueue_response(self, query_id: str, response: QueryResponse):
        payload = encode_base64(response.SerializeToString())
        async with self.condition:
            if self.closed:
                return
            if len(self.events
                  ) >= 512 or self.bytes + len(payload) > MAX_BYTES:
                self.closed = True
                self.condition.notify_all()
                self._closing = asyncio.create_task(self.close())
                return
            self.sequence += 1
            self.events.append(
                dict(
                    sequence=self.sequence, queryId=query_id, payload=payload
                )
            )
            self.bytes += len(payload)
            self.condition.notify_all()

    async def forward_query_responses(self, query_id: str, query_stream):
        try:
            async for response in query_stream:
                await self.enqueue_response(query_id, response)
            # A reactive stream ending is a disconnect, not a successful idle.
            await self.enqueue_response(
                query_id,
                QueryResponse(
                    status=MessageToJson(
                        Status(code=14, message='Bridge query stream ended')
                    )
                )
            )
        except AioRpcError as error:
            await self.enqueue_response(
                query_id, QueryResponse(status=grpc_error_status_json(error))
            )
        finally:
            query_stream.cancel()

    async def close(self):
        if self.lease is not None:
            self.lease.cancel()
        async with self.condition:
            self.closed = True
            self.condition.notify_all()
        for task in self.tasks.values():
            task.cancel()
        await asyncio.gather(*self.tasks.values(), return_exceptions=True)
        self.events.clear()

    async def poll_responses(self, after: int, wait_ms: int) -> dict:
        if self.polling:
            return {'busy': True}
        self.polling = True
        try:
            async with self.condition:
                if not self.acknowledged <= after <= self.delivered:
                    return {'reset': True}
                self.acknowledged = after
                while self.events and self.events[0]['sequence'] <= after:
                    self.bytes -= len(self.events.popleft()['payload'])
                try:
                    await asyncio.wait_for(
                        self.condition.
                        wait_for(lambda: self.closed or bool(self.events)),
                        min(max(wait_ms, 1), 10000) / 1000
                    )
                except asyncio.TimeoutError:
                    return {'events': [], 'cursor': after}
                if self.closed:
                    return {'reset': True}
                events = list(self.events)[:64]
                self.delivered = max(self.delivered, events[-1]['sequence'])
                return {'events': events, 'cursor': events[-1]['sequence']}
        finally:
            self.polling = False


def register_app_bridge_tools(
    server: FastMCP, state_types: list[StateTypeName]
) -> None:
    existing = {tool.name for tool in server._tool_manager.list_tools()}
    if existing.intersection({QUERY_TOOL, MUTATE_TOOL}):
        raise ValueError('Reboot MCP bridge tool names are reserved')
    allowed = set(state_types)
    sessions: dict[str, BridgeSession] = {}

    def route_to_state(
        ctx, state_type: str, state_ref: str, token: str | None
    ):
        name = StateTypeName(state_type)
        ref = StateRef.from_maybe_readable(state_ref)
        if name not in allowed or not ref.matches_state_type(name):
            raise ValueError('unknown or mismatched bridge state type')
        context = get_reboot_context(ctx)
        channel = context.channel_manager.get_channel_to_state(name, ref)
        headers = Headers(
            application_id=None,
            state_ref=ref,
            bearer_token=token or context.bearer_token,
            caller_id=None,
        )
        return ReactStub(channel), headers

    @server.tool(name=QUERY_TOOL, meta={'ui': {'visibility': ['app']}})
    async def query(
        ctx: Context,
        session_id: str,
        operation: str,
        query_id: str = '',
        state_type: str = '',
        state_ref: str = '',
        payload: str = '',
        cursor: int = 0,
        wait_ms: int = 10000,
    ) -> dict:
        uuid.UUID(session_id)
        context = get_reboot_context(ctx)
        owner = hashlib.sha256((context.bearer_token or
                                '').encode()).hexdigest()
        session = sessions.get(session_id)
        if session is None:
            if operation != 'open':
                return {'reset': True}
            if len(sessions) >= 128:
                return {'busy': True}
            session = BridgeSession(owner)
            sessions[session_id] = session
        if session.owner != owner:
            return {'reset': True}
        if session.closed:
            return {'reset': True}

        async def remove_session():
            if sessions.get(session_id) is session:
                del sessions[session_id]
                await session.close()

        if session.lease is not None:
            session.lease.cancel()
        session.lease = asyncio.get_running_loop().call_later(
            60, lambda: asyncio.create_task(remove_session())
        )

        if operation == 'open':
            uuid.UUID(query_id)
            specification = (state_type, state_ref, payload)
            if query_id in session.requests:
                if session.requests[query_id] != specification:
                    raise ValueError(
                        'query ID reused with different arguments'
                    )
                return {'opened': True}
            if len(session.tasks) >= 128:
                return {'busy': True}
            request = QueryRequest.FromString(decode_base64(payload))
            stub, headers = route_to_state(
                ctx, state_type, state_ref, request.bearer_token
            )
            query_stream = stub.Query(
                request, metadata=headers.to_grpc_metadata()
            )
            session.requests[query_id] = specification
            session.tasks[query_id] = asyncio.create_task(
                session.forward_query_responses(query_id, query_stream)
            )
            return {'opened': True}
        if operation == 'poll':
            return await session.poll_responses(cursor, wait_ms)
        if operation == 'close':
            if not query_id:
                await remove_session()
            else:
                task = session.tasks.pop(query_id, None)
                session.requests.pop(query_id, None)
                if task is not None:
                    task.cancel()
                    await asyncio.gather(task, return_exceptions=True)
            return {'closed': True}
        raise ValueError('unknown bridge query operation')

    @server.tool(name=MUTATE_TOOL, meta={'ui': {'visibility': ['app']}})
    async def mutate(
        ctx: Context, state_type: str, state_ref: str, payload: str
    ) -> dict:
        request = MutateRequest.FromString(decode_base64(payload))
        stub, headers = route_to_state(
            ctx, state_type, state_ref, request.bearer_token
        )
        headers = replace(
            headers, idempotency_key=uuid.UUID(request.idempotency_key)
        )
        try:
            response = await stub.Mutate(
                request, metadata=headers.to_grpc_metadata(), timeout=10
            )
            return {'payload': encode_base64(response.SerializeToString())}
        except AioRpcError as error:
            if error.code() in (
                StatusCode.UNAVAILABLE,
                StatusCode.DEADLINE_EXCEEDED,
                StatusCode.CANCELLED,
                StatusCode.UNKNOWN,
                StatusCode.INTERNAL,
            ):
                return {'retry': True}
            return {
                'payload':
                    encode_base64(
                        MutateResponse(status=grpc_error_status_json(error)
                                      ).SerializeToString()
                    )
            }
