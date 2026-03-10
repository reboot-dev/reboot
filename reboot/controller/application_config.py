import kubernetes_asyncio.client
from rbt.v1alpha1 import application_config_pb2
from reboot.aio.servicers import Routable
from reboot.aio.types import ServiceName
from reboot.helpers import generate_proto_descriptor_set
from reboot.naming import ApplicationId
from reboot.version import REBOOT_VERSION
from typing import Optional, Protocol, Sequence


class ApplicationConfig(Protocol):
    """
    A protocol expanding on `application_config_pb2.ApplicationConfig`.

    We want to use a Python object instead of the generated proto object
    directly because we want to add some extra methods. Unfortunately
    protobuf doesn't permit extending generated classes, so instead we
    define a protocol that has the same `.spec` field as the generated
    protobuf class, and also has the extra methods we want. 
    """

    Spec: type[application_config_pb2.ApplicationConfig.Spec
              ] = (application_config_pb2.ApplicationConfig.Spec)

    spec: application_config_pb2.ApplicationConfig.Spec

    def application_id(self) -> ApplicationId:
        ...

    def namespace(self) -> Optional[str]:
        ...

    def kubernetes_metadata(
        self
    ) -> Optional[kubernetes_asyncio.client.V1ObjectMeta]:
        ...


class LocalApplicationConfig:
    # Satisfies `ApplicationConfig` Protocol.

    Spec = application_config_pb2.ApplicationConfig.Spec

    def __init__(
        self,
        application_id: ApplicationId,
        spec: application_config_pb2.ApplicationConfig.Spec,
    ):
        self._application_id = application_id
        self.spec = spec

    def application_id(self) -> ApplicationId:
        return self._application_id

    def namespace(self) -> Optional[str]:
        return None

    def kubernetes_metadata(
        self
    ) -> Optional[kubernetes_asyncio.client.V1ObjectMeta]:
        return None


def application_config_spec_from_routables(
    routables: Sequence[Routable],
    replicas: Optional[int],
    servers: Optional[int],
) -> application_config_pb2.ApplicationConfig.Spec:
    """Create an ApplicationConfig spec from routables."""
    file_descriptor_set = generate_proto_descriptor_set(
        routables=list(routables)
    )

    all_service_names: list[ServiceName] = []
    legacy_grpc_service_full_names: list[ServiceName] = []
    states: list[application_config_pb2.ApplicationConfig.Spec.State] = []
    for r in routables:
        all_service_names.extend(r.service_names())

        state_type_name = r.state_type_name()
        if state_type_name is None:
            # This routable isn't associated with a state type. That means
            # it's a legacy gRPC servicer.
            assert len(r.service_names()) == 1
            legacy_grpc_service_full_names.extend(r.service_names())
            continue

        states.append(
            application_config_pb2.ApplicationConfig.Spec.State(
                state_type_full_name=state_type_name,
                service_full_names=r.service_names(),
            )
        )

    return application_config_pb2.ApplicationConfig.Spec(
        file_descriptor_set=file_descriptor_set.SerializeToString(),
        service_names=all_service_names,
        legacy_grpc_service_full_names=legacy_grpc_service_full_names,
        states=states,
        replicas=replicas,
        servers=servers,
        reboot_version=REBOOT_VERSION,
    )
