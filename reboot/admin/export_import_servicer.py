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
from reboot.aio.auth.admin_auth import (
    AdminAuthMixin,
    auth_metadata_from_metadata,
)
from rebootdev.admin.export_import_converters import ExportImportItemConverters
from rebootdev.aio.internals.channel_manager import _ChannelManager
from rebootdev.aio.internals.middleware import Middleware
from rebootdev.aio.placement import PlacementClient
from rebootdev.aio.state_managers import StateManager
from rebootdev.aio.types import (
    ApplicationId,
    ServerId,
    StateRef,
    StateTypeName,
)
from rebootdev.server.database import (
    SORTED_MAP_ENTRY_TYPE_NAME,
    SORTED_MAP_TYPE_NAME,
)
from typing import AsyncIterator


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

    async def Import(
        self,
        requests: AsyncIterator[ExportImportItem],
        grpc_context: grpc.aio.ServicerContext,
    ) -> ImportResponse:
        await self.ensure_admin_auth_or_fail(grpc_context)

        async def _remote_iterator(
            item: ExportImportItem,
        ) -> AsyncIterator[ExportImportItem]:
            yield item

        def _maybe_parse_if_backwards_compatible(
            struct: struct_pb2.Struct,
            message: Message,
        ):
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

        async def _handle_item(
            server_id: ServerId,
            item: ExportImportItem,
        ) -> None:
            if server_id != self._server_id:
                channel = self._channel_manager.get_channel_to(
                    self._placement_client.address_for_server(server_id)
                )
                export_import = export_import_pb2_grpc.ExportImportStub(
                    channel
                )
                await export_import.Import(
                    _remote_iterator(item),
                    metadata=auth_metadata_from_metadata(grpc_context),
                )
                return

            # This item belongs to this server, so we handle it
            # directly.
            assert server_id == self._server_id

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
                )
            elif active_field_name == "sorted_map_entry":
                await self._state_manager.import_sorted_map_entry(
                    state_type_name,
                    state_ref,
                    item.sorted_map_entry,
                    self._serializers,
                )
            elif active_field_name == "task":
                middleware = self._middleware_by_state_type_name.get(
                    state_type_name
                )
                if middleware is None:
                    raise ValueError(
                        "Unrecognized state type: {item.state_type!r}"
                    )

                await self._state_manager.import_task(
                    state_type_name,
                    state_ref,
                    _maybe_parse_if_backwards_compatible(
                        item.task,
                        database_pb2.Task(),
                    ),
                    middleware,
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
                )

        # Handle each request/item which may require sending it to the
        # appropriate server.
        #
        # TODO: optimize this later if it turns out that we need to
        # run this concurrently.
        async for request in requests:
            server_id = self._placement_client.server_for_actor(
                self._application_id,
                StateRef(request.state_ref),
            )
            await _handle_item(server_id, request)

        return ImportResponse()
