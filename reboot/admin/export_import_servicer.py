import asyncio
import grpc
from google.protobuf import json_format, struct_pb2
from google.protobuf.message import Message
from rbt.v1alpha1 import database_pb2
from rbt.v1alpha1.admin import export_import_pb2_grpc
from rbt.v1alpha1.admin.export_import_pb2 import (
    ExportImportItem,
    ExportRequest,
    ImportResponse,
    ListServersRequest,
    ListServersResponse,
)
from reboot.admin.export_import_converters import ExportImportItemConverters
from reboot.aio.auth.admin_auth import (
    AdminAuthMixin,
    auth_metadata_from_metadata,
)
from reboot.aio.concurrently import concurrently
from reboot.aio.headers import SERVER_ID_HEADER
from reboot.aio.internals.channel_manager import _ChannelManager
from reboot.aio.internals.middleware import Middleware
from reboot.aio.placement import PlacementClient
from reboot.aio.state_managers import StateManager
from reboot.aio.types import ApplicationId, ServerId, StateRef, StateTypeName
from reboot.server.database import (
    SORTED_MAP_ENTRY_TYPE_NAME,
    SORTED_MAP_TYPE_NAME,
)
from reboot.wait_for_tasks import wait_for_tasks
from typing import AsyncGenerator, AsyncIterator, Optional

# Bound for the queues used by `Import()`: both the server-wide local
# queue and the per-remote forwarding queues. A bounded queue makes the
# routing loop block when a consumer falls behind, propagating back-
# pressure through gRPC's HTTP/2 flow control window to the client.
_QUEUE_MAX = 100


def _maybe_parse_if_backwards_compatible(
    struct: struct_pb2.Struct,
    message: Message,
) -> Message:
    """Parse `struct` into `message`, raising a clearer error when the
    imported types are not backwards compatible."""
    try:
        return json_format.ParseDict(
            json_format.MessageToDict(
                struct,
                preserving_proto_field_name=True,
            ),
            message,
        )
    except json_format.ParseError as error:
        raise ValueError(
            "Failed to parse import item, is it possible the types "
            f"being imported are not backwards compatible? ({error})"
        )


async def _drain_until_none(
    queue: asyncio.Queue,
) -> AsyncGenerator[ExportImportItem, None]:
    """Yield items from `queue` until a `None` item is reached."""
    while True:
        item = await queue.get()
        if item is None:
            return
        yield item


class ExportImportServicer(
    AdminAuthMixin,
    export_import_pb2_grpc.ExportImportServicer,
):

    def __init__(
        self,
        application_id: ApplicationId,
        server_id: ServerId,
        state_manager: StateManager,
        placement_client: PlacementClient,
        channel_manager: _ChannelManager,
        serializers: ExportImportItemConverters,
        middleware_by_state_type_name: dict[StateTypeName, Middleware],
    ):
        super().__init__()

        self._application_id = application_id
        self._server_id = server_id
        self._state_manager = state_manager
        self._placement_client = placement_client
        self._channel_manager = channel_manager
        self._serializers = serializers
        self._middleware_by_state_type_name = middleware_by_state_type_name
        # Concurrent `Import()` RPCs on this server do not each start
        # their own processing loop; instead they all feed the single
        # `_local_queue`, drained by the one loop running in
        # `_local_processor`. That loop is created by the first active
        # `Import()` RPC and torn down — via a `None` item, which will
        # be set as the last element in the queue by the last active
        # `Import()` RPC — when the last one finishes.
        # `_active_imports` counts how many are in flight.
        self._local_queue: Optional[asyncio.Queue] = None
        self._local_processor: Optional[asyncio.Task[None]] = None
        self._active_imports = 0

    def add_to_server(self, server: grpc.aio.Server) -> None:
        export_import_pb2_grpc.add_ExportImportServicer_to_server(self, server)

    async def ListServers(
        self,
        request: ListServersRequest,
        grpc_context: grpc.aio.ServicerContext,
    ) -> ListServersResponse:
        await self.ensure_admin_auth_or_fail(grpc_context)

        return ListServersResponse(
            server_ids=self._placement_client.known_servers(
                self._application_id
            ),
        )

    async def Export(
        self,
        request: ExportRequest,
        grpc_context: grpc.aio.ServicerContext,
    ) -> AsyncIterator[ExportImportItem]:
        await self.ensure_admin_auth_or_fail(grpc_context)

        if request.server_id != self._server_id:
            await grpc_context.abort(
                grpc.StatusCode.NOT_FOUND,
                "This process does not host that server.",
            )
            raise RuntimeError('This code is unreachable')

        # If SORTED_MAP_TYPE_NAME is installed, additionally export
        # SORTED_MAP_ENTRY_TYPE_NAME (see #2983). We use a list here rather
        # than a set so that we export in a deterministic order.
        state_types = list(self._serializers.state_types)
        if SORTED_MAP_TYPE_NAME in state_types:
            state_types.append(SORTED_MAP_ENTRY_TYPE_NAME)

        for state_type_name in state_types:
            async for item in self._state_manager.export_items(
                state_type_name
            ):
                active_field_name = item.WhichOneof("item")
                if active_field_name == "actor":
                    if state_type_name == SORTED_MAP_ENTRY_TYPE_NAME:
                        yield ExportImportItem(
                            state_type=state_type_name,
                            state_ref=item.actor.state_ref,
                            sorted_map_entry=item.actor.state,
                        )
                    else:
                        state = self._serializers.state_to_struct(
                            item.actor.state,
                            state_type_name,
                        )
                        yield ExportImportItem(
                            state_type=state_type_name,
                            state_ref=item.actor.state_ref,
                            state=state,
                        )
                elif active_field_name == "task":
                    yield ExportImportItem(
                        state_type=state_type_name,
                        state_ref=item.task.task_id.state_ref,
                        task=json_format.ParseDict(
                            json_format.MessageToDict(
                                item.task,
                                preserving_proto_field_name=True,
                            ),
                            struct_pb2.Struct(),
                        ),
                    )
                else:
                    assert active_field_name == "idempotent_mutation"
                    yield ExportImportItem(
                        state_type=state_type_name,
                        state_ref=item.idempotent_mutation.state_ref,
                        idempotent_mutation=json_format.ParseDict(
                            json_format.MessageToDict(
                                item.idempotent_mutation,
                                preserving_proto_field_name=True,
                            ),
                            struct_pb2.Struct(),
                        ),
                    )

    async def _handle_local_item(self, item: ExportImportItem) -> None:
        """Apply an import item that belongs to this server directly."""
        state_type_name = StateTypeName(item.state_type)
        state_ref = StateRef(item.state_ref)

        active_field_name = item.WhichOneof("item")
        if active_field_name == "state":
            await self._state_manager.import_actor(
                state_type_name,
                state_ref,
                self._serializers.state_from_struct(
                    item.state,
                    state_type_name,
                ),
                # While importing it is safe to allow concurrent writes
                # without additional DB synchronization, in case of
                # error, the import should be re-run.
                sync=False,
            )
        elif active_field_name == "sorted_map_entry":
            await self._state_manager.import_sorted_map_entry(
                state_type_name,
                state_ref,
                item.sorted_map_entry,
                self._serializers,
                # While importing it is safe to allow concurrent writes
                # without additional DB synchronization, in case of
                # error, the import should be re-run.
                sync=False,
            )
        elif active_field_name == "task":
            middleware = self._middleware_by_state_type_name.get(
                state_type_name
            )
            if middleware is None:
                raise ValueError(
                    f"Unrecognized state type: {item.state_type!r}"
                )

            await self._state_manager.import_task(
                state_type_name,
                state_ref,
                _maybe_parse_if_backwards_compatible(
                    item.task,
                    database_pb2.Task(),
                ),
                middleware,
                # While importing it is safe to allow concurrent writes
                # without additional DB synchronization, in case of
                # error, the import should be re-run.
                sync=False,
            )
        else:
            assert active_field_name == "idempotent_mutation"
            await self._state_manager.import_idempotent_mutation(
                state_type_name,
                state_ref,
                _maybe_parse_if_backwards_compatible(
                    item.idempotent_mutation,
                    database_pb2.IdempotentMutation(),
                ),
                # While importing it is safe to allow concurrent writes
                # without additional DB synchronization, in case of
                # error, the import should be re-run.
                sync=False,
            )

    async def _process_local(self, queue: asyncio.Queue) -> None:
        """Apply local import items from `queue`.

        This is the single point at which this server applies imported
        state: concurrent `Import()` RPCs all feed `queue`, and this one
        loop drains it. It finishes once the `None` item — put by
        the last active `Import()` RPC — is dequeued.
        """
        await concurrently(
            self._handle_local_item,
            for_each=_drain_until_none(queue),
            # The import path sets `sync=False` so writes are non-
            # blocking and items can be processed concurrently.
            # `limit=50` was chosen empirically: higher values caused
            # write contention on DB writes, lower values left
            # throughput on the table.
            limit=50,
            adaptive=False,
        )

    async def Import(
        self,
        requests: AsyncIterator[ExportImportItem],
        grpc_context: grpc.aio.ServicerContext,
    ) -> ImportResponse:
        await self.ensure_admin_auth_or_fail(grpc_context)

        async def _forward(
            server_id: ServerId,
            queue: asyncio.Queue,
        ) -> None:
            """Stream all queued items to `server_id` in one RPC."""
            channel = self._channel_manager.get_channel_to(
                self._placement_client.address_for_server(server_id)
            )
            stub = export_import_pb2_grpc.ExportImportStub(channel)
            metadata = auth_metadata_from_metadata(grpc_context) + (
                (SERVER_ID_HEADER, server_id),
            )
            await stub.Import(
                _drain_until_none(queue),
                metadata=metadata,
            )

        # Join this server's single local-import processing loop,
        # starting it if this is the first concurrent `Import()` RPC. We
        # capture the queue and task in locals because the shared
        # references are cleared by whichever RPC finishes last.
        if self._local_queue is None:
            self._local_queue = asyncio.Queue(maxsize=_QUEUE_MAX)
            self._local_processor = asyncio.create_task(
                self._process_local(self._local_queue)
            )
        local_queue = self._local_queue
        local_processor = self._local_processor
        assert local_processor is not None
        self._active_imports += 1

        remote_queues: dict[ServerId, asyncio.Queue] = {}
        remote_tasks: list[asyncio.Task[None]] = []
        interrupted = True
        try:
            async for request in requests:
                server_id = self._placement_client.server_for_actor(
                    self._application_id,
                    StateRef(request.state_ref),
                )
                if server_id == self._server_id:
                    await local_queue.put(request)
                else:
                    if server_id not in remote_queues:
                        queue: asyncio.Queue = asyncio.Queue(
                            maxsize=_QUEUE_MAX
                        )
                        remote_queues[server_id] = queue
                        remote_tasks.append(
                            asyncio.create_task(_forward(server_id, queue))
                        )
                    await remote_queues[server_id].put(request)

            # Tell this RPC's forwarders no more items are coming.
            for queue in remote_queues.values():
                await queue.put(None)

            interrupted = False
        finally:
            # Always release our slot, even on error or cancellation, so
            # a failed `Import()` can't wedge future ones. The last
            # active import tears down the shared loop; we clear the
            # shared refs FIRST so the next `Import()` starts a fresh
            # loop no matter what happens to the old processor.
            self._active_imports -= 1
            last = self._active_imports == 0
            if last:
                self._local_queue = None
                self._local_processor = None

            if interrupted:
                # Failed or cancelled: abandon our own forwarders, whose
                # streams are incomplete, and if we were the last active
                # import stop the now-orphaned processor. The failed
                # import is expected to be re-run.
                await wait_for_tasks(remote_tasks, cancel=True)
                if last:
                    # Cancel the _this_ server processor to stop it
                    # immediately.
                    await wait_for_tasks([local_processor], cancel=True)
            else:
                # Healthy path. Let the processor drain what we queued.
                if last:
                    await local_queue.put(None)

        # Wait for the shared loop to finish applying every item and
        # for all forwarding RPCs to complete.
        await asyncio.gather(local_processor, *remote_tasks)

        return ImportResponse()
