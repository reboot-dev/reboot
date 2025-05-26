import asyncio
import random
import rebootdev.aio.tracing
from abc import ABC, abstractmethod
from log.log import get_logger
from rebootdev.aio.placement import PlacementClient
from rebootdev.aio.servicers import Servicer
from rebootdev.aio.types import (
    ApplicationId,
    RoutableAddress,
    ServiceName,
    StateRef,
    StateTypeTag,
    state_type_tag_for_name,
)
from typing import Iterable, Optional

logger = get_logger(__name__)


class ActorResolver(ABC):
    """Abstract base class for a resolver able to resolve an actor id and
    service name into a routable address.
    """

    @abstractmethod
    def resolve_actor(self, state_ref: StateRef) -> Optional[RoutableAddress]:
        """Get routable address for actor."""
        # This function is not allowed to block.
        # ISSUE(#1178): This function is deliberately not async.
        pass

    def resolve(self, state_ref: StateRef) -> Optional[RoutableAddress]:
        """Get routable address for actor."""
        return self.resolve_actor(state_ref)

    @abstractmethod
    def resolve_legacy_grpc_service(
        self,
        legacy_grpc_service_name: ServiceName,
    ) -> Optional[RoutableAddress]:
        """Get routable address for a legacy gRPC service."""
        # This function is not allowed to block.
        # ISSUE(#1178): This function is deliberately not async.
        pass

    @abstractmethod
    async def wait_for_service_names(
        self,
        service_names: Iterable[ServiceName],
    ):
        """Returns once the resolver knows about all the service names, which
        may be immediately.
        """
        pass

    async def wait_for_servicers(self, servicers: Iterable[type[Servicer]]):
        """Syntactic sugar for wait_for_service_names that takes `Servicer`s.
        """
        service_names = [
            service_name for servicer in servicers
            for service_name in servicer.__service_names__
        ]

        await self.wait_for_service_names(service_names)


class NoResolver(ActorResolver):
    """
    A resolver that can never resolve any actors.
    """

    def resolve_actor(self, state_ref: StateRef) -> Optional[RoutableAddress]:
        return None

    def resolve_legacy_grpc_service(
        self,
        legacy_grpc_service_name: ServiceName,
    ) -> Optional[RoutableAddress]:
        return None

    async def wait_for_service_names(
        self,
        service_names: Iterable[ServiceName],
    ):
        for service_name in service_names:
            # We'll never be able to resolve these services. Block forever.
            await asyncio.Event().wait()


class DirectResolver(ActorResolver):
    """
    A resolver that listens directly to a PlacementPlanner to learn about actors
    and their addresses.

    Primarily expected to be useful in unit tests, where more sophisticated (and
    scalable) mechanisms like using an Envoy routing filter are unavailable.

    ISSUE(https://github.com/reboot-dev/mono/issues/3225): DirectResolver may
         only be used in environments where every `ServiceName` is unique across
         all applications, notably unit tests and single-application
         deployments.
    """

    def __init__(self, placement_client: PlacementClient):
        self._placement_client = placement_client

    def application_id_by_service_name(
        self
    ) -> dict[ServiceName, ApplicationId]:
        # ASSUMPTION: DirectResolver is only used in environments where every
        #             `ServiceName` is unique to a SINGLE application. See
        #             classdoc above.
        result: dict[ServiceName, ApplicationId] = {}
        for application_id in self._placement_client.known_application_ids():
            for service_name in self._placement_client.known_service_names(
                application_id
            ):
                assert service_name not in result, "ASSUMPTION (see comment) violated"
                result[service_name] = application_id

        return result

    def application_id_by_state_type_tag(
        self
    ) -> dict[StateTypeTag, ApplicationId]:
        # ASSUMPTION: DirectResolver is only used in environments where every
        #             `StateTypeName` is unique to a SINGLE application. See
        #             classdoc above.
        result: dict[StateTypeTag, ApplicationId] = {}
        for application_id in self._placement_client.known_application_ids():
            for state_type_name in self._placement_client.known_state_type_names(
                application_id
            ):
                state_type_tag = state_type_tag_for_name(state_type_name)
                assert state_type_tag not in result, "ASSUMPTION (see comment) violated"
                result[state_type_tag] = application_id

        return result

    def resolve_actor(self, state_ref: StateRef) -> Optional[RoutableAddress]:
        # Determine the application ID based on the `StateRef`.
        #
        # ASSUMPTION: DirectResolver is only used in environments where every
        #             state type is unique to a SINGLE application. See classdoc
        #             above.
        application_id = self.application_id_by_state_type_tag().get(
            state_ref.state_type_tag
        )
        if application_id is None:
            return None

        return self._placement_client.address_for_actor(
            application_id, state_ref
        )

    def resolve_legacy_grpc_service(
        self,
        legacy_grpc_service_name: ServiceName,
    ) -> Optional[RoutableAddress]:
        # Determine the application ID based on the `ServiceName`.
        #
        # ASSUMPTION: DirectResolver is only used in environments where every
        #             service name is unique to a SINGLE application. See classdoc
        #             above.
        application_id = self.application_id_by_service_name(
        ).get(legacy_grpc_service_name)
        if application_id is None:
            return None

        # Route to a random consensus in this application.
        consensuses = self._placement_client.known_consensuses(application_id)
        return self._placement_client.address_for_consensus(
            random.choice(consensuses)
        )

    async def wait_for_service_names(
        self,
        service_names: Iterable[ServiceName],
    ):
        """Override of `ActorResolver.wait_for_service_names`."""
        while True:
            known_service_names = self.application_id_by_service_name().keys()
            if all(
                service_name in known_service_names
                for service_name in service_names
            ):
                break
            await self._placement_client.wait_for_change()

    async def wait_for_change(self):
        await self._placement_client.wait_for_change()

    @rebootdev.aio.tracing.function_span()
    async def start(self):
        await self._placement_client.start()

    async def stop(self):
        await self._placement_client.stop()


class StaticResolver(ActorResolver):
    """A resolver that always returns the same address for all actors."""

    def __init__(self, address: RoutableAddress):
        self.address = address

    def resolve_actor(self, state_ref: StateRef) -> Optional[RoutableAddress]:
        return self.address

    def resolve_legacy_grpc_service(
        self,
        legacy_grpc_service_name: ServiceName,
    ) -> Optional[RoutableAddress]:
        return self.address

    async def wait_for_service_names(
        self, service_names: Iterable[ServiceName]
    ):
        return
