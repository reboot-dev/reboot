import math
import time
from log.log import get_logger
from rbt.v1alpha1 import placement_planner_pb2
from reboot.aio.servers import ServiceServer
from reboot.controller.application_config import ApplicationConfig
from reboot.controller.shards import make_shard_infos
from rebootdev.aio.exceptions import InputError
from rebootdev.aio.types import ServiceName, StateTypeName
from rebootdev.naming import make_server_id
from typing import Iterable, Optional

logger = get_logger(__name__)

# The default number of servers must remain 1, to remain backwards
# compatible with existing applications - adding more servers is a
# breaking change.
DEFAULT_NUM_SERVERS = 1


def validate_num_servers(num_servers: int, description: str) -> None:
    if num_servers <= 0:
        raise InputError(
            f"'{description}' must be positive; got {num_servers}."
        )
    # The number of servers must be a power of 2, so that
    # scale-up/scale-down operations don't move too much data around.
    # See:
    #
    #  https://docs.google.com/presentation/d/1vvYh3dG9ToqkB8J9Mjd9EVlfnli_kFYTwLtCXlxQlf4/edit?slide=id.g37657b09413_0_15#slide=id.g37657b09413_0_15
    #
    if not math.log2(num_servers).is_integer():
        raise InputError(
            f"'{description}' must be a power of 2; got {num_servers}."
        )


class PlanMaker:
    """
    Logic to construct a placement Plan based on a set of currently valid
    ApplicationConfigs. Designed to be extendable for different Plan structures.
    """

    last_version: Optional[int] = None

    def make_plan(
        self,
        application_configs: Iterable[ApplicationConfig],
    ) -> placement_planner_pb2.Plan:
        """
        Construct a Plan for servers that will serve the given list of
        ApplicationConfigs.
        """
        applications: list[placement_planner_pb2.Plan.Application] = []
        for application_config in application_configs:
            application_id = application_config.application_id()
            assert application_config.spec.HasField('replicas')
            assert application_config.spec.HasField('servers')

            # The number of servers specified in the ApplicationConfig
            # is per-replica. Compute the _total_ number of servers in
            # the application.
            num_replicas = application_config.spec.replicas
            num_servers = application_config.spec.servers * num_replicas
            validate_num_servers(
                num_servers,
                f"ApplicationConfig(name='{application_id}'): "
                "spec.servers * spec.replicas",
            )

            # NOTE: We are deliberately using a `list` here instead of a `set`
            # to avoid issues with change of ordering. Some tests rely on the
            # ordering and `set` order elements internally by hash value, which
            # is not stable between platforms.
            unique_service_names: list[ServiceName] = []
            state_type_and_service_name_pairs: list[tuple[StateTypeName,
                                                          ServiceName]] = []
            for state in application_config.spec.states:
                state_type_name = StateTypeName(state.state_type_full_name)
                for service_full_name in state.service_full_names:
                    service_name = ServiceName(service_full_name)
                    if service_name in unique_service_names:
                        logger.warning(
                            "Service name '%s' is duplicated in application '%s'",
                            service_name,
                            application_id,
                        )
                        continue
                    # Ignore system services which exist on every server.
                    if service_name in ServiceServer.SYSTEM_SERVICE_NAMES:
                        continue
                    unique_service_names.append(service_name)
                    state_type_and_service_name_pairs.append(
                        (state_type_name, service_name)
                    )
            for legacy_grpc_service_full_name in application_config.spec.legacy_grpc_service_full_names:
                legacy_grpc_service_name = ServiceName(
                    legacy_grpc_service_full_name
                )
                if legacy_grpc_service_name in unique_service_names:
                    logger.warning(
                        "Service name '%s' is duplicated in application '%s'",
                        legacy_grpc_service_name,
                        application_id,
                    )
                    continue
                # Ignore system services which exist on every server.
                if legacy_grpc_service_name in ServiceServer.SYSTEM_SERVICE_NAMES:
                    continue
                unique_service_names.append(legacy_grpc_service_name)
                state_type_and_service_name_pairs.append(
                    (
                        StateTypeName(
                            ""
                        ),  # Legacy gRPC service names have no state name.
                        legacy_grpc_service_name
                    )
                )

            shards = make_shard_infos()
            assert len(shards) % num_servers == 0, (
                "The number of shards must divide evenly over the number of "
                "servers"
            )

            def server_index_for_shard(shard_index: int) -> int:
                # This mapping formula is chosen to keep the
                # shard->server assignment maximally stable
                # during scale-up/scale-down operations. See:
                #
                #  https://docs.google.com/presentation/d/1vvYh3dG9ToqkB8J9Mjd9EVlfnli_kFYTwLtCXlxQlf4/edit?slide=id.g37657b09413_0_15#slide=id.g37657b09413_0_15
                #
                return shard_index % num_servers

            def server_id_for_shard(shard_index: int) -> str:
                return make_server_id(
                    application_id=application_id,
                    server_index=server_index_for_shard(shard_index),
                )

            assert num_servers % num_replicas == 0, (
                "The number of servers must divide evenly over the number of "
                "replicas"
            )

            def replica_index_for_shard(shard_index: int) -> int:
                server_index = server_index_for_shard(shard_index)
                num_servers_per_replica = num_servers // num_replicas
                # This mapping formula is chosen to keep the
                # server->replica assignment maximally stable during
                # scale-up/scale-down operations.
                #
                # Since the total number of servers is defined as a
                # multiple of the number of replicas we assume that
                # doubling or halving the number of replicas will also
                # double or halve the number of servers. Therefore, we
                # want higher-numbered servers to be assigned to
                # higher-numbered replicas, so that as we add/remove
                # replicas, we're also adding/removing exactly those
                # servers assigned to them, keeping the lower-numbered
                # replicas+servers where they are.
                #
                # Note that this contrasts with how we do shard->server
                # assignment, since the number of shards stays constant
                # as the total number of servers changes.
                #
                #  See:
                #
                #  https://docs.google.com/presentation/d/1vvYh3dG9ToqkB8J9Mjd9EVlfnli_kFYTwLtCXlxQlf4/edit?slide=id.g37657b09413_0_15#slide=id.g37657b09413_0_15
                #
                return server_index // num_servers_per_replica

            applications.append(
                placement_planner_pb2.Plan.Application(
                    id=application_id,
                    services=[
                        placement_planner_pb2.Plan.Application.Service(
                            full_name=service_name,
                            state_type_full_name=state_type_name,
                        ) for state_type_name, service_name in
                        state_type_and_service_name_pairs
                    ],
                    shards=[
                        placement_planner_pb2.Plan.Application.Shard(
                            # The ID must be unique across all shards in the
                            # system, so we prefix it with the application ID.
                            # By using a shard index suffix with 9 digits we can
                            # have up to 1 billion shards per application, which
                            # should be a comfortable overkill.
                            id=shard.shard_id,
                            server_id=server_id_for_shard(shard_index),
                            replica_index=replica_index_for_shard(shard_index),
                            range=placement_planner_pb2.Plan.Application.Shard.
                            KeyRange(first_key=shard.shard_first_key),
                        ) for shard_index, shard in enumerate(shards)
                    ]
                )
            )

        return placement_planner_pb2.Plan(
            version=self.get_version(),
            applications=applications,
        )

    def get_version(self) -> int:
        """
        Return a valid version number that is (expected to be) greater than
        whatever was previously returned or used.
        We use a timestamp (in ns from epoch) to ensure that version numbers
        increase, and further verify that time has not somehow gone backwards.
        """
        timestamp = time.time_ns()
        if self.last_version is not None and timestamp <= self.last_version:
            raise RuntimeError(
                f'Time is not moving forward as expected! '
                f'New timestamp {timestamp} is not after '
                f'old timestamp {self.last_version}.'
            )
        self.last_version = timestamp
        return timestamp
