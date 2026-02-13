import asyncio
import grpc
import rebootdev.aio.tracing
from concurrent import futures
from google.protobuf.descriptor_pb2 import FileDescriptorSet
from log.log import ERROR, get_logger
from rbt.v1alpha1 import (
    database_pb2,
    placement_planner_pb2,
    placement_planner_pb2_grpc,
)
from reboot.controller.application_config import ApplicationConfig
from reboot.controller.application_config_trackers import (
    ApplicationConfigTracker,
)
from reboot.controller.plan_makers import PlanMaker
from reboot.controller.server_managers import ServerManager
from reboot.controller.servers import ServerSpec
from rebootdev.aio.types import RevisionNumber, ServerId
from rebootdev.naming import ApplicationId
from typing import AsyncGenerator, Awaitable, Callable, Optional

logger = get_logger(__name__)
# TODO(rjh, benh): set up a logging system that allows us to increase
# the verbosity level of the logs by environment variable.
logger.setLevel(ERROR)


class PlacementPlanner(placement_planner_pb2_grpc.PlacementPlannerServicer):

    def __init__(
        self,
        config_tracker: ApplicationConfigTracker,
        server_manager: ServerManager,
        address: str,
    ) -> None:
        self.plan_maker = PlanMaker()
        self.config_tracker = config_tracker
        self.server_manager = server_manager
        # Use pubsub queues to be sure to notify all plan listeners whenever
        # there's a new plan.
        self.listener_queues: set[asyncio.Queue[
            placement_planner_pb2.ListenForPlanResponse]] = set()

        # Public set of callbacks that are called with the new PlanWithLocations
        # whenever one becomes available. Clients that want callbacks should add
        # their callbacks directly to this set.
        self.plan_change_callbacks: set[
            Callable[[placement_planner_pb2.ListenForPlanResponse],
                     Awaitable[None]]] = set()

        self._address = address

        self._server: Optional[grpc.aio.server] = None
        self._host: Optional[str] = None
        self._port: Optional[int] = None
        self._started = False

        # Get notified when we need a new plan, either because the set of
        # ApplicationConfigs has changed or because servers have moved.
        self.config_tracker.on_configs_change(self.make_plan)

        self.current_version: Optional[int] = None
        self.current_plan_with_servers: Optional[
            placement_planner_pb2.ListenForPlanResponse] = None

    async def start(self) -> None:
        """
        Start a gRPC server at the given address to host the ListenForPlan
        endpoint.
        """
        self._server = grpc.aio.server(
            futures.ThreadPoolExecutor(max_workers=10)
        )

        placement_planner_pb2_grpc.add_PlacementPlannerServicer_to_server(
            self, self._server
        )

        self._host = self._address.split(':')[0]
        self._port = self._server.add_insecure_port(self._address)

        await self.make_plan()
        await self._server.start()
        self._started = True
        logger.info(f"PlacementPlanner server started on port {self._port}")

    def port(self) -> int:
        assert self._port is not None, "must call `start()` before `port()`!"
        return self._port

    def address(self) -> str:
        assert self._host is not None, "must call `start()` before `address()`!"
        return f'{self._host}:{self.port()}'

    async def stop(self) -> None:
        """Stop the gRPC server that was started."""
        if self._started:
            assert self._server is not None
            await self._server.stop(grace=None)
            logger.info('PlacementPlanner server stopped')

    @rebootdev.aio.tracing.function_span()
    async def make_plan(self) -> None:
        """
        Generate a new placement plan based on the currently valid set of
        ApplicationConfigs, update cluster resources to match the updated plan,
        and send the updated plan information out to all subscribed listeners.
        """
        application_configs: dict[
            ApplicationId, ApplicationConfig
        ] = await self.config_tracker.get_application_configs()
        logger.info(
            f'Making new plan based on {len(application_configs)} application '
            f'configs: {list(application_configs.keys())}'
        )

        new_plan = self.plan_maker.make_plan(application_configs.values())

        ###
        # Create the servers before disseminating the plan and the
        # information about the servers together.
        #
        # TODO(rjh, stuhood): instead of creating servers here, disseminate
        #                     the plan (including info about the servers
        #                     that are _planned_ to exist), and have that
        #                     trigger a different process that creates the
        #                     servers? Think: Kubernetes-style design, with
        #                     many controllers working together to refine
        #                     high-level information into finer-grained
        #                     information and actions.

        # Combine the Plan and the ApplicationConfigs into Servers.
        servers: dict[ServerId, ServerSpec] = {}
        for application in new_plan.applications:
            assert application.id != ""
            application_config = application_configs[application.id]
            file_descriptor_set = FileDescriptorSet()
            file_descriptor_set.ParseFromString(
                application_config.spec.file_descriptor_set
            )
            server_ids = set(shard.server_id for shard in application.shards)
            replica_indexes = {
                shard.server_id: shard.replica_index
                for shard in application.shards
            }
            for server_id in server_ids:
                servers[server_id] = ServerSpec(
                    id=server_id,
                    replica_index=replica_indexes[server_id],
                    shards=[
                        database_pb2.ShardInfo(
                            shard_id=shard.id,
                            shard_first_key=shard.range.first_key,
                        )
                        for shard in application.shards
                        if shard.server_id == server_id
                    ],
                    container_image_name=application_config.spec.
                    container_image_name,
                    namespace=application_config.namespace(),
                    owner_metadata=application_config.kubernetes_metadata(),
                    service_names=application_config.spec.service_names,
                    file_descriptor_set=file_descriptor_set,
                    application_id=application.id,
                    revision_number=RevisionNumber(
                        application_config.spec.revision_number
                    ),
                    reboot_version=application_config.spec.reboot_version,
                )

        logger.info(
            f'Plan version {new_plan.version} servers: {servers.keys()}'
        )

        server_protos = await self.server_manager.set_servers(
            list(servers.values()),
        )

        # It's possible that we got fewer `server_protos` back than
        # the number of `servers` we put in, because the
        # ServerManager isn't authoritative for servers that use
        # shared sidecars (that's handled by `ApplicationManager`)
        assert len(server_protos) <= len(servers)

        self.current_version = new_plan.version
        self.current_plan_with_servers = placement_planner_pb2.ListenForPlanResponse(
            plan=new_plan,
            servers=server_protos,
        )

        for queue in self.listener_queues:
            await queue.put(self.current_plan_with_servers)

        # Execute all callbacks for everyone.
        await asyncio.gather(
            *[
                callback(self.current_plan_with_servers)
                for callback in self.plan_change_callbacks
            ]
        )

        logger.info(f'Plan version {new_plan.version} active')

    async def ListenForPlan(
        self, request: placement_planner_pb2.ListenForPlanRequest, context
    ) -> AsyncGenerator[placement_planner_pb2.ListenForPlanResponse, None]:
        """
        Serve the current plan immediately, then send an update every time a
        new plan is generated.
        """
        queue: asyncio.Queue[placement_planner_pb2.ListenForPlanResponse
                            ] = asyncio.Queue()
        self.listener_queues.add(queue)

        if self.current_plan_with_servers is not None:
            # Clients should immediately get the current plan.
            await queue.put(self.current_plan_with_servers)

        while True:
            next_response = await queue.get()
            try:
                yield next_response
            except GeneratorExit:
                # When the client disconnects, we will eventually get a
                # GeneratorExit thrown. We should clean up the state associated
                # with this client before returning.
                self.listener_queues.remove(queue)
                return
