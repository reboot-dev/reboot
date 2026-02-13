import kubernetes_asyncio.client
from dataclasses import dataclass, field
from google.protobuf.descriptor_pb2 import FileDescriptorSet
from rbt.v1alpha1 import database_pb2, placement_planner_pb2
from rebootdev.aio.types import ApplicationId, RevisionNumber, ServiceName
from typing import Optional


@dataclass(kw_only=True)
class ServerSpec:
    """
    Data structure used internally in the Controller to represent a Server.

    This is separate from `placement_planner_pb2.Server` because not all of
    these fields need to be shared outside the controller.
    """
    # The id of the Server.
    id: str

    # The index of the replica that'll host this Server.
    replica_index: int

    # The id of the application that the Server is associated with.
    application_id: ApplicationId

    # List of service names that are served with the Server.
    service_names: list[ServiceName] = field(default_factory=list)

    # Shards owned by this Server.
    # TODO(rjh): rename this to `shard_infos` for consistency with other
    #            parts of the code.
    shards: list[database_pb2.ShardInfo]

    # The name of the container image that the Server is associated with.
    # This is currently only relevant when running on Kubernetes.
    container_image_name: Optional[str] = None

    # The Kubernetes namespace that the Server is associated with.
    # When running on Kubernetes this must be set to a non-empty string.
    namespace: Optional[str] = None

    # The metadata of the object that should own the resources created
    # for this server; When running on Kubernetes this must be set to
    # a non-empty value.
    owner_metadata: Optional[kubernetes_asyncio.client.V1ObjectMeta] = None

    # The file descriptor set of the Services that the Server is associated
    # with.
    file_descriptor_set: Optional[FileDescriptorSet] = None

    # This might become `addresses: Optional[
    #   list[placement_planner_pb2.ServerAddresses]]` in the future when we
    # support replicated servers.
    address: Optional[placement_planner_pb2.Server.Address] = None

    # The current revision number of the application running in this server.
    revision_number: RevisionNumber = RevisionNumber(0)

    # The version of Reboot that this server is running.
    reboot_version: str
