from abc import ABC, abstractmethod
from log.log import get_logger
from rebootdev.aio.types import RoutableAddress, ServiceName, StateRef
from typing import Optional

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


class StaticResolver(ActorResolver):
    """A resolver that always returns the same address for all actors."""

    def __init__(self, address: Optional[RoutableAddress]):
        self.address = address

    def update(self, address: RoutableAddress):
        self.address = address

    def resolve_actor(self, state_ref: StateRef) -> Optional[RoutableAddress]:
        assert self.address is not None
        return self.address

    def resolve_legacy_grpc_service(
        self,
        legacy_grpc_service_name: ServiceName,
    ) -> Optional[RoutableAddress]:
        assert self.address is not None
        return self.address
