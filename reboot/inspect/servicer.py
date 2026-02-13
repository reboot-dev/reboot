import asyncio
import google
import grpc
import json
import os
import re
import traceback
from google.api.httpbody_pb2 import HttpBody
from google.protobuf.struct_pb2 import Struct
from log.log import get_logger
from pathlib import Path
from rbt.v1alpha1.inspect import inspect_pb2_grpc
from rbt.v1alpha1.inspect.inspect_pb2 import (
    GetStateRequest,
    GetStateResponse,
    GetStateTypesRequest,
    GetStateTypesResponse,
    ListStatesRequest,
    ListStatesResponse,
    StateInfo,
    WebDashboardRequest,
)
from reboot.aio.auth.admin_auth import (
    AdminAuthMixin,
    auth_metadata_from_metadata,
)
from reboot.controller.settings import ENVVAR_REBOOT_REPLICA_INDEX
from rebootdev.aio.headers import SERVER_ID_HEADER, Headers
from rebootdev.aio.internals.channel_manager import _ChannelManager
from rebootdev.aio.internals.middleware import Middleware
from rebootdev.aio.placement import PlacementClient
from rebootdev.aio.state_managers import StateManager
from rebootdev.aio.types import ApplicationId, ServerId, StateTypeName
from typing import AsyncIterator, Optional

logger = get_logger(__name__)


async def chunks_get_state(
    struct: Struct,
    *,
    chunk_size_bytes: int = int(1 * 1024 * 1024),
) -> AsyncIterator[GetStateResponse]:
    """
    Helper to chunk up `struct` into `chunk_size_bytes` chunks.
    
    This lets `GetState` responses avoid any max message size issues
    along the way, i.e., 4MB by default for gRPC, but also Envoy might
    not send more than 1MB.
    """
    data = struct.SerializeToString()
    total = (len(data) + chunk_size_bytes - 1) // chunk_size_bytes
    # Even if `data` is empty we still need to send 1 chunk so set
    # `total` to 1 which will just send an empty `data`.
    total = 1 if total == 0 else total
    for chunk in range(0, total):
        offset = chunk * chunk_size_bytes
        yield GetStateResponse(
            chunk=chunk,
            total=total,
            data=data[offset:offset + chunk_size_bytes],
        )


class InspectServicer(
    AdminAuthMixin,
    inspect_pb2_grpc.InspectServicer,
):

    def __init__(
        self,
        application_id: ApplicationId,
        server_id: ServerId,
        state_manager: StateManager,
        placement_client: PlacementClient,
        channel_manager: _ChannelManager,
        middleware_by_state_type_name: dict[StateTypeName, Middleware],
    ):
        super().__init__()
        self._application_id = application_id
        self._server_id = server_id
        self._replica_index = int(
            os.environ.get(ENVVAR_REBOOT_REPLICA_INDEX, "0")
        )
        self._state_manager = state_manager
        self._placement_client = placement_client
        self._channel_manager = channel_manager
        self._middleware_by_state_type_name = middleware_by_state_type_name

    def add_to_server(self, server: grpc.aio.Server) -> None:
        inspect_pb2_grpc.add_InspectServicer_to_server(self, server)

    async def GetStateTypes(
        self,
        request: GetStateTypesRequest,
        grpc_context: grpc.aio.ServicerContext,
    ) -> AsyncIterator[GetStateTypesResponse]:
        await self.ensure_admin_auth_or_fail(grpc_context)

        # Return the state types that we know about. These are the same
        # for every server, so it doesn't matter which one answers.
        response = GetStateTypesResponse()
        for state_type_name in self._middleware_by_state_type_name:
            response.state_types.append(state_type_name)
        yield response

        # Sleep forever, so that the connection stays open and the
        # client can notice when the application restarts (meaning the
        # state types may have changed).
        await asyncio.Event().wait()

    async def _aggregate_states(
        self,
        request: ListStatesRequest,
        grpc_context: grpc.aio.ServicerContext,
    ) -> AsyncIterator[ListStatesResponse]:
        """
        Aggregate states from all servers for the given state type.
        """
        # ASSUMPTION: the list of known servers is stable.
        parts: dict[ServerId, list[StateInfo]] = {}
        parts_changed = asyncio.Event()

        async def call_other_server(server_id: ServerId):
            """
            Calls `ListStates` on the given server, and updates its
            entry in `parts` every time a new response is sent.
            """
            channel = self._channel_manager.get_channel_to(
                self._placement_client.address_for_server(server_id)
            )
            stub = inspect_pb2_grpc.InspectStub(channel)

            server_request = ListStatesRequest()
            server_request.CopyFrom(request)
            server_request.only_server_id = server_id
            metadata = auth_metadata_from_metadata(grpc_context) + (
                (SERVER_ID_HEADER, server_id),
            )
            async for response in stub.ListStates(
                server_request,
                metadata=metadata,
            ):
                parts[server_id] = list(response.state_infos)
                parts_changed.set()

        # In the background, ask all of the servers about their part
        # of the total set of states.
        server_ids = self._placement_client.known_servers(self._application_id)
        tasks = [
            asyncio.create_task(
                call_other_server(server_id),
                name=f'call_other_server({server_id}, ...) in {__name__}',
            ) for server_id in server_ids
        ]

        all_tasks = tasks
        try:
            while True:
                # Every time any of the parts change, recompute the total view
                # of all states. However we simultaneously also watch `tasks`,
                # so we hear if there's a failure gathering any of the parts.
                parts_changed_task = asyncio.create_task(
                    parts_changed.wait(),
                    name=f'parts_changed.wait() in {__name__}',
                )

                all_tasks = [parts_changed_task] + tasks

                done, pending = await asyncio.wait(
                    all_tasks, return_when=asyncio.FIRST_COMPLETED
                )

                # The `tasks` will never finish without an exception,
                # so if `parts_changed_task` is not the _only_ thing
                # in `done` then an exception must have been raised
                # and we should use `asyncio.gather(...)` to get it to
                # propagate.
                if parts_changed_task not in done or len(done) != 1:
                    await asyncio.gather(*tasks)

                assert parts_changed_task.done()
                parts_changed.clear()

                # Only send an overview once we've heard from all
                # servers; we try to avoid sending incomplete
                # results so clients are easier to write.
                if len(parts) < len(server_ids):
                    continue

                # Assemble an overview of all states from the parts.
                state_infos: list[StateInfo] = [
                    state_info for part in parts.values()
                    for state_info in part
                ]

                yield ListStatesResponse(state_infos=state_infos)

        finally:
            for task in all_tasks:
                if not task.done():
                    task.cancel()
            # We need to explicitly `await` or call `.result()` on
            # each task otherwise we'll get 'Task exception was never
            # retrieved'.
            for task in all_tasks:
                try:
                    await task
                except:
                    # We'll let what ever other exception has been
                    # raised propagate instead of this exception which
                    # might just be `CancelledError` from us
                    # cancelling the task.
                    pass

    async def ListStates(
        self,
        request: ListStatesRequest,
        grpc_context: grpc.aio.ServicerContext,
    ) -> AsyncIterator[ListStatesResponse]:
        await self.ensure_admin_auth_or_fail(grpc_context)

        middleware: Optional[Middleware] = (
            self._middleware_by_state_type_name.get(request.state_type)
        )
        if middleware is None:
            await grpc_context.abort(
                grpc.StatusCode.NOT_FOUND,
                f"Unknown state type '{request.state_type}'"
            )
            raise RuntimeError('This code is unreachable')  # For mypy.

        # If this call is not for any specific server, act as an
        # aggregator.
        if request.only_server_id == "":
            async for response in self._aggregate_states(
                request,
                grpc_context,
            ):
                yield response
            return

        # If this call is specifically _not_ for this server, we've been
        # misrouted.
        if request.only_server_id != self._server_id:
            raise RuntimeError(
                f"Server {self._server_id} can't answer requests for "
                f"{request.only_server_id}"
            )

        # This call _is_ specifically for this server; return the
        # local view of the states.
        try:
            async for actors in self._state_manager.actors(
                state_type=request.state_type
            ):
                response = ListStatesResponse(
                    state_infos=[
                        StateInfo(
                            state_id=actor.id,
                            server_id=self._server_id,
                            replica_index=self._replica_index,
                        ) for actor in actors
                    ]
                )
                yield response

        except Exception as e:
            logger.error(
                f"Failed to list states: {type(e).__name__}: {e}\n" +
                traceback.format_exc()
            )
            await grpc_context.abort(grpc.StatusCode.INTERNAL)
            raise RuntimeError('This code is unreachable')  # For mypy.

    async def GetState(
        self,
        request: GetStateRequest,
        grpc_context: grpc.aio.ServicerContext,
    ) -> AsyncIterator[GetStateResponse]:
        await self.ensure_admin_auth_or_fail(grpc_context)

        # Parse the state ref from the x-reboot-state-ref header.
        headers = Headers.from_grpc_context(grpc_context)
        state_ref = headers.state_ref

        # Extract state type from the state ref to get the middleware.
        # To do this we first need to find the middleware that matches
        # the state ref. State refs MAY use a state _tag_ rather than a
        # state type name, so we can't simply do a dictionary lookup.
        middleware: Optional[Middleware] = None
        for state_type_name, candidate_middleware in self._middleware_by_state_type_name.items(
        ):
            if state_ref.matches_state_type(state_type_name):
                middleware = candidate_middleware
                break

        if middleware is None:
            await grpc_context.abort(
                grpc.StatusCode.NOT_FOUND,
                "Unknown state type for state reference "
                f"'{state_ref.to_friendly_str()}'",
            )
            raise RuntimeError('This code is unreachable')  # For mypy.

        # Stream state updates continuously.
        try:
            async for state in middleware.inspect(state_ref):
                # Convert the state to JSON and then to a Struct.
                state_json = json.loads(
                    google.protobuf.json_format.MessageToJson(
                        state,
                        preserving_proto_field_name=True,
                        ensure_ascii=True,
                    )
                )

                struct = Struct()
                struct.update(state_json)

                # Chunk and yield the response for this state update.
                async for chunk in chunks_get_state(struct):
                    yield chunk

        except Exception:
            await grpc_context.abort(
                grpc.StatusCode.NOT_FOUND,
                f"Unknown state reference '{state_ref.to_friendly_str()}'",
            )
            raise RuntimeError('This code is unreachable')  # For mypy.

    async def WebDashboard(
        self,
        request: WebDashboardRequest,
        grpc_context: grpc.aio.ServicerContext,
    ) -> HttpBody:
        file = request.file or 'index.html'

        # Some files that may be requested by the browser are simply not
        # there. No need to print warnings about it.
        KNOWN_ABSENT_FILENAMES = [
            'bundle.css.map',
        ]
        if file in KNOWN_ABSENT_FILENAMES:
            await grpc_context.abort(grpc.StatusCode.NOT_FOUND)
            raise RuntimeError('This code is unreachable')

        # Some paths are rewritten to `index.html`; these are the
        # different routes presented by our single-page app.
        REWRITE_PATHS = {
            r'^tasks$': 'index.html',
            # Match 'states' and anything under 'states/'.
            r'^states($|/)': 'index.html',
        }
        for pattern, target in REWRITE_PATHS.items():
            if re.match(pattern, file):
                file = target
                break

        # The following files are expected to be served by this
        # endpoint; they should be served with the appropriate content
        # type.
        CONTENT_TYPE_BY_FILE = {
            'index.html': 'text/html',
            'bundle.js': 'text/javascript',
            'bundle.js.map': 'application/json',
            'bundle.css': 'text/css',
        }
        if file not in CONTENT_TYPE_BY_FILE:
            logger.warning(f"Request for unexpected file: '{file}'")
            await grpc_context.abort(grpc.StatusCode.NOT_FOUND)
            raise RuntimeError('This code is unreachable')

        path = Path(os.path.join(os.path.dirname(__file__), file))
        return HttpBody(
            content_type=f'{CONTENT_TYPE_BY_FILE[file]}; charset=utf-8',
            data=path.read_text().encode('utf-8'),
        )
