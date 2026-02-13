import asyncio
import grpc
from rbt.v1alpha1 import database_pb2, tasks_pb2, tasks_pb2_grpc
from reboot.aio.auth.admin_auth import (
    AdminAuthMixin,
    auth_metadata_from_metadata,
)
from rebootdev.aio.headers import SERVER_ID_HEADER, Headers
from rebootdev.aio.internals.channel_manager import _ChannelManager
from rebootdev.aio.internals.middleware import Middleware
from rebootdev.aio.internals.tasks_cache import TasksCache
from rebootdev.aio.placement import PlacementClient
from rebootdev.aio.state_managers import StateManager
from rebootdev.aio.types import (
    ApplicationId,
    ServerId,
    StateRef,
    StateTypeName,
)
from rebootdev.server.database import NonexistentTaskId
from typing import Optional


class TasksServicer(
    AdminAuthMixin,
    tasks_pb2_grpc.TasksServicer,
):

    def __init__(
        self,
        state_manager: StateManager,
        cache: TasksCache,
        placement_client: PlacementClient,
        channel_manager: _ChannelManager,
        application_id: ApplicationId,
        server_id: ServerId,
        middleware_by_state_type_name: dict[StateTypeName, Middleware],
    ):
        super().__init__()

        self._cache = cache
        self._state_manager = state_manager
        self._placement_client = placement_client
        self._channel_manager = channel_manager
        self._application_id = application_id
        self._server_id = server_id
        self._middleware_by_state_type_name = middleware_by_state_type_name

    def add_to_server(self, server: grpc.aio.Server) -> None:
        tasks_pb2_grpc.add_TasksServicer_to_server(self, server)

    async def Wait(
        self,
        request: tasks_pb2.WaitRequest,
        grpc_context: grpc.aio.ServicerContext,
    ) -> tasks_pb2.WaitResponse:
        """Implementation of Tasks.Wait()."""
        state_type_name = StateTypeName(request.task_id.state_type)
        middleware = self._middleware_by_state_type_name.get(state_type_name)
        if middleware is None:
            raise ValueError(f"Unknown state type: '{state_type_name}'")

        headers = Headers.from_grpc_context(grpc_context)
        task_id_state_ref = StateRef.from_maybe_readable(
            request.task_id.state_ref
        )
        if task_id_state_ref != headers.state_ref:
            await grpc_context.abort(
                grpc.StatusCode.INVALID_ARGUMENT,
                f"Task ID '{request.task_id}' state ref '{task_id_state_ref}' "
                f"does not match routed state ref '{headers.state_ref}'.",
            )

        # Confirm whether this is the right server to be serving this
        # request.
        authoritative_server = self._placement_client.server_for_actor(
            self._application_id, task_id_state_ref
        )
        if authoritative_server != self._server_id:
            # This is NOT the correct server. Fail.
            await grpc_context.abort(
                grpc.StatusCode.UNAVAILABLE,
                f"Server '{self._server_id}' is not authoritative for "
                f"requests to '{headers.state_ref}'; server "
                f"'{authoritative_server}' is.",
            )
            raise  # Unreachable but necessary for mypy.

        cached_response = await self._cache.get(request.task_id)

        if cached_response is not None:
            response_or_error = tasks_pb2.TaskResponseOrError()
            response_or_error.ParseFromString(cached_response)
            return tasks_pb2.WaitResponse(response_or_error=response_or_error)

        # Task is not cached; try and load it via the state manager.
        try:
            sidecar_response_and_task: Optional[tuple[
                tasks_pb2.TaskResponseOrError, database_pb2.Task]] = (
                    await
                    self._state_manager.load_task_response(request.task_id)
                )
        except NonexistentTaskId:
            await grpc_context.abort(code=grpc.StatusCode.NOT_FOUND)
        else:
            # Invariant: 'response' must not be 'None'.
            #
            # Explanation: For an unknown task_id,
            # load_task_response() will raise, so to get here, task_id
            # must belong to a valid, but evicted, task. We only evict
            # tasks from our cache if they have completed, and
            # completed tasks are required to have a response stored
            # (although that response may itself be empty).
            assert sidecar_response_and_task is not None
            sidecar_response_or_error, sidecar_task = sidecar_response_and_task

            # Cache the task response for temporal locality.
            self._cache.put_with_response_or_error(
                request.task_id,
                sidecar_response_or_error,
                sidecar_task.timestamp,
                sidecar_task.status,
                sidecar_task.method,
                sidecar_task.iteration,
            )

            return tasks_pb2.WaitResponse(
                response_or_error=sidecar_response_or_error
            )

    async def _aggregate_all_tasks(
        self,
        grpc_context: grpc.aio.ServicerContext,
    ) -> tasks_pb2.ListTasksResponse:

        async def call_other_server(
            server_id: ServerId,
            list_pending_tasks_responses: list[tasks_pb2.ListTasksResponse],
        ):
            """
            Calls 'ListTasks' on the given server and appends the
            response to 'list_pending_tasks_responses'.
            """
            channel = self._channel_manager.get_channel_to(
                self._placement_client.address_for_server(server_id)
            )
            stub = tasks_pb2_grpc.TasksStub(channel)
            metadata = auth_metadata_from_metadata(grpc_context) + (
                (SERVER_ID_HEADER, server_id),
            )
            response = await stub.ListTasks(
                tasks_pb2.ListTasksRequest(only_server_id=server_id),
                metadata=metadata,
            )
            list_pending_tasks_responses.append(response)

        list_pending_tasks_responses: list[tasks_pb2.ListTasksResponse] = []

        server_ids = self._placement_client.known_servers(self._application_id)

        await asyncio.gather(
            *(
                call_other_server(
                    server_id,
                    list_pending_tasks_responses,
                ) for server_id in server_ids
            )
        )

        result = tasks_pb2.ListTasksResponse()
        for response in list_pending_tasks_responses:
            result.tasks.extend(response.tasks)

        return result

    async def ListTasks(
        self,
        request: tasks_pb2.ListTasksRequest,
        grpc_context: grpc.aio.ServicerContext,
    ) -> tasks_pb2.ListTasksResponse:
        """Implementation of Tasks.ListTasks()."""
        await self.ensure_admin_auth_or_fail(grpc_context)

        if not request.HasField("only_server_id"):
            # Give all pending tasks across all servers.
            return await self._aggregate_all_tasks(grpc_context)
        elif request.only_server_id == self._server_id:
            return tasks_pb2.ListTasksResponse(
                tasks=self._cache.get_tasks(),
            )

        # This is NOT the correct server. Fail.
        await grpc_context.abort(
            grpc.StatusCode.UNAVAILABLE,
            f"Server '{self._server_id}' cannot serve requests for "
            f"server '{request.only_server_id}'.",
        )
        raise  # Unreachable but necessary for mypy.

    async def ListTasksStream(
        self,
        request: tasks_pb2.ListTasksRequest,
        grpc_context: grpc.aio.ServicerContext,
    ):
        await self.ensure_admin_auth_or_fail(grpc_context)

        # Poll for changes in the task list, and send a streamed
        # response whenever a change is detected.
        #
        # TODO(rjh): it would be nicer to actually watch for changes
        #            here, instead of polling - however, that's a bigger
        #            refactor, given that we must watch across all
        #            servers.
        last_tasks_json: Optional[list[str]] = None
        while True:
            response = await self.ListTasks(request, grpc_context)

            current_tasks = response.tasks
            current_tasks_json = [
                task.SerializeToString() for task in current_tasks
            ]
            current_tasks_json.sort()

            if current_tasks_json != last_tasks_json:
                yield tasks_pb2.ListTasksResponse(tasks=current_tasks)
                last_tasks_json = current_tasks_json

            await asyncio.sleep(0.2)

    async def CancelTask(
        self,
        request: tasks_pb2.CancelTaskRequest,
        grpc_context: grpc.aio.ServicerContext,
    ) -> tasks_pb2.CancelTaskResponse:
        """Implementation of Tasks.CancelTask()."""
        await self.ensure_admin_auth_or_fail(grpc_context)

        headers = Headers.from_grpc_context(grpc_context)
        task_id_state_ref = StateRef.from_maybe_readable(
            request.task_id.state_ref
        )
        if task_id_state_ref != headers.state_ref:
            await grpc_context.abort(
                grpc.StatusCode.INVALID_ARGUMENT,
                f"Task ID '{request.task_id}' state ref '{task_id_state_ref}' "
                f"does not match routed state ref '{headers.state_ref}'.",
            )

        # Confirm whether this is the right server to be serving this
        # request.
        state_type_name = StateTypeName(request.task_id.state_type)
        middleware = self._middleware_by_state_type_name.get(state_type_name)
        if middleware is None:
            raise ValueError(f"Unknown state type: '{state_type_name}'")
        authoritative_server = self._placement_client.server_for_actor(
            self._application_id, task_id_state_ref
        )
        if authoritative_server != self._server_id:
            # This is NOT the correct server. Fail.
            await grpc_context.abort(
                grpc.StatusCode.UNAVAILABLE,
                f"Server '{self._server_id}' is not authoritative for "
                f"requests to '{headers.state_ref}'; server "
                f"'{authoritative_server}' is.",
            )
            raise  # Unreachable but necessary for mypy.

        return await middleware.tasks_dispatcher.cancel_task(
            request.task_id.task_uuid
        )
