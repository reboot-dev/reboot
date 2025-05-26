from __future__ import annotations

import asyncio
import grpc
import logging
from grpc.aio._base_channel import (
    StreamStreamMultiCallable,
    StreamUnaryMultiCallable,
    UnaryStreamMultiCallable,
    UnaryUnaryMultiCallable,
)
from log.log import get_logger
from rbt.v1alpha1.errors_pb2 import UnknownService
from rebootdev.aio.aborted import SystemAborted
from rebootdev.aio.resolvers import ActorResolver
from rebootdev.aio.tracing import aio_client_interceptors
from rebootdev.aio.types import (
    RoutableAddress,
    ServiceName,
    StateRef,
    StateTypeName,
)
from rebootdev.settings import GRPC_CLIENT_OPTIONS
from rebootdev.ssl.localhost import LOCALHOST_CRT_DATA, is_localhost
from typing import Optional

logger = get_logger(__name__)


class _ChannelManager:
    """Internal class for providing a grpc channel for a given service name and
    actor id.

    The channel manager is constructed and used internally and should never be
    created by the user.
    """
    _resolver: ActorResolver

    def __init__(self, resolver: ActorResolver, secure: bool):
        """
            resolver: gives addresses for each service/actor.
            secure: whether to use SSL when constructing channels.
        """
        self._resolver = resolver
        self._secure = secure

        self._channels_by_address: dict[RoutableAddress, grpc.aio.Channel] = {}

    def get_channel_to(self, address: RoutableAddress) -> grpc.aio.Channel:
        if (
            address not in self._channels_by_address or
            self._channels_by_address[address].get_state()
            == grpc.ChannelConnectivity.SHUTDOWN
        ):
            self._channels_by_address[address] = self._create_channel(address)

        return self._channels_by_address[address]

    def get_channel_to_state(
        self,
        state_type_name: StateTypeName,
        state_ref: StateRef,
        unresolvable_state_log_level: int = logging.ERROR,
    ) -> grpc.aio.Channel:
        """Returns a channel for the address provided by the resolver.

        If a channel for the given service name and actor id already exists,
        that channel will be returned. Otherwise, a new channel will be created
        and stored for future use.
        We additionally check that the address for the service has not changed.
        """

        address: Optional[RoutableAddress] = self._resolver.resolve_actor(
            state_ref
        )

        if address is None:
            logger.log(
                unresolvable_state_log_level,
                f"Failed to resolve state type '{state_type_name}'; "
                "did you bring up a servicer for it in your `Application`?",
            )
            raise SystemAborted(UnknownService())

        return self.get_channel_to(address)

    def get_channel_to_legacy_grpc_service(
        self,
        legacy_grpc_service_name: ServiceName,
        unresolvable_service_log_level: int = logging.ERROR,
    ) -> grpc.aio.Channel:
        """Similar to `get_channel_to_state`, but routes to a legacy gRPC service"""
        address: Optional[RoutableAddress
                         ] = self._resolver.resolve_legacy_grpc_service(
                             legacy_grpc_service_name
                         )

        if address is None:
            logger.log(
                unresolvable_service_log_level,
                "Failed to resolve legacy gRPC service "
                f"'{legacy_grpc_service_name}'; did you bring up a servicer "
                "for it in your `Application`?",
            )
            raise SystemAborted(UnknownService())

        return self.get_channel_to(address)

    def _create_channel(
        self,
        address: RoutableAddress,
    ) -> grpc.aio.Channel:
        """
        Creates a channel for the given address.
        """
        result: Optional[grpc.aio.Channel] = None
        if self._secure:
            result = grpc.aio.secure_channel(
                target=address,
                options=GRPC_CLIENT_OPTIONS,
                credentials=grpc.ssl_channel_credentials(
                    root_certificates=LOCALHOST_CRT_DATA
                    if is_localhost(address) else None,
                ),
                interceptors=aio_client_interceptors(),
            )
        else:
            result = grpc.aio.insecure_channel(
                target=address,
                options=GRPC_CLIENT_OPTIONS,
                interceptors=aio_client_interceptors(),
            )

        # We return an `UnclosableChannel` that prevents accidental
        # closing of a shared channel.
        return UnclosableChannel(result)


class UnclosableChannel(grpc.aio.Channel):
    """
    A wrapper around a regular `Channel` that makes attempts to close the
    channel a NOOP. That is important in allowing us to do channel reuse; there
    may be multiple stubs using the same channel at the same time, just because
    one of them is done with the channel doesn't mean it's safe to close.
    """

    # TODO(rjh): consider implementing some form of reference counting to allow
    #            us to close channels that are truly not being used anymore.

    def __init__(self, wrapped_channel: grpc.aio.Channel):
        self._wrapped_channel = wrapped_channel

    async def __aenter__(self) -> UnclosableChannel:
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb) -> None:
        # Despite one user not using this channel anymore, we will keep this
        # channel open - others may be using it also.
        pass

    async def close(self, grace: Optional[float] = None) -> None:
        # Despite one user not using this channel anymore, we will keep this
        # channel open - others may be using it also.
        pass

    async def channel_ready(self) -> None:
        await self._wrapped_channel.channel_ready()

    def get_state(
        self, try_to_connect: bool = False
    ) -> grpc.ChannelConnectivity:
        return self._wrapped_channel.get_state(try_to_connect)

    async def wait_for_state_change(
        self, last_observed_state: grpc.ChannelConnectivity
    ) -> None:
        return await self._wrapped_channel.wait_for_state_change(
            last_observed_state
        )

    def unary_unary(self, *args, **kwargs) -> UnaryUnaryMultiCallable:
        return self._wrapped_channel.unary_unary(*args, **kwargs)

    def unary_stream(self, *args, **kwargs) -> UnaryStreamMultiCallable:
        return self._wrapped_channel.unary_stream(*args, **kwargs)

    def stream_unary(self, *args, **kwargs) -> StreamUnaryMultiCallable:
        return self._wrapped_channel.stream_unary(*args, **kwargs)

    def stream_stream(self, *args, **kwargs) -> StreamStreamMultiCallable:
        return self._wrapped_channel.stream_stream(*args, **kwargs)


class LegacyGrpcChannel(grpc.aio.Channel):
    """An implementation of a `grpc.aio.Channel` that asks a `_ChannelManager` to
    give it a channel for every new service it is asked to connect to. It
    therefore wraps what may be many channels, or may be several copies of the
    same channel, picking the right one based on the service name.
    """

    def __init__(self, channel_manager: _ChannelManager):
        self._channel_manager = channel_manager
        self._borrowed_channels: dict[str, grpc.aio.Channel] = {}

    async def __aenter__(self) -> LegacyGrpcChannel:
        # We do not open any channels until we are asked about a particular
        # service.
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb) -> None:
        """When exiting our context, close all of the channels we ever
        opened."""
        await self.close()

    async def channel_ready(self) -> None:
        """A LegacyGrpcChannel is ready when all of its wrapped channels are
        ready.

        This method blocks until all the wrapped channels are ready.
        """
        await asyncio.gather(
            *[
                channel.channel_ready()
                for channel in self._borrowed_channels.values()
            ]
        )

    async def close(self, grace: Optional[float] = None) -> None:
        """Close all of the borrowed channels we ever opened."""
        await asyncio.gather(
            *[
                channel.close(grace)
                for channel in self._borrowed_channels.values()
            ]
        )

    def _get_channel_for_method(
        self, method_full_name: str
    ) -> grpc.aio.Channel:
        legacy_service_name = method_full_name.split('/')[1]
        return self._get_channel_for_service(legacy_service_name)

    def _get_channel_for_service(
        self, legacy_service_name: str
    ) -> grpc.aio.Channel:
        """Given a method name, get the channel for the service that that
        method is in, asking the _ChannelManager for it if we don't already know
        about it."""
        if legacy_service_name in self._borrowed_channels:
            return self._borrowed_channels[legacy_service_name]

        channel = self._channel_manager.get_channel_to_legacy_grpc_service(
            ServiceName(legacy_service_name),
        )
        self._borrowed_channels[legacy_service_name] = channel
        return channel

    def get_state(
        self, try_to_connect: bool = False
    ) -> grpc.ChannelConnectivity:
        # It's not clear how to implement this method when wrapping multiple
        # channels. Since this method is part of an experimental gRPC API, it's
        # OK for us to omit an implementation for the time being.
        raise NotImplementedError('Use alternative `get_state_for_service`')

    def get_state_for_service(
        self,
        # TODO(rjh): consider alternatives to `service_name` that can't be typo'd.
        service_name: ServiceName,
        try_to_connect: bool = False
    ) -> grpc.ChannelConnectivity:
        return self._get_channel_for_service(service_name
                                            ).get_state(try_to_connect)

    async def wait_for_state_change(
        self,
        last_observed_state: grpc.ChannelConnectivity,
    ) -> None:
        # It's not clear how to implement this method when wrapping multiple
        # channels. Since this method is part of an experimental gRPC API, it's
        # OK for us to omit an implementation for the time being.
        raise NotImplementedError(
            'Use alternative `wait_for_state_change_for_service`'
        )

    async def wait_for_state_change_for_service(
        self,
        # TODO(rjh): consider alternatives to `service_name` that can't be typo'd.
        service_name: ServiceName,
        last_observed_state: grpc.ChannelConnectivity,
    ) -> None:
        return self._get_channel_for_service(
            service_name
        ).wait_for_state_change(last_observed_state)

    def unary_unary(
        self,
        method: str,
        *args,
        **kwargs,
    ) -> UnaryUnaryMultiCallable:
        """See:
        https://grpc.github.io/grpc/python/grpc_asyncio.html#grpc.aio.Channel.unary_unary"""
        return self._get_channel_for_method(method).unary_unary(
            method, *args, **kwargs
        )

    def unary_stream(
        self,
        method: str,
        *args,
        **kwargs,
    ) -> UnaryStreamMultiCallable:
        """See:
        https://grpc.github.io/grpc/python/grpc_asyncio.html#grpc.aio.Channel.unary_stream"""
        return self._get_channel_for_method(method).unary_stream(
            method, *args, **kwargs
        )

    def stream_unary(
        self,
        method: str,
        *args,
        **kwargs,
    ) -> StreamUnaryMultiCallable:
        """See:
        https://grpc.github.io/grpc/python/grpc_asyncio.html#grpc.aio.Channel.stream_unary"""
        return self._get_channel_for_method(method).stream_unary(
            method, *args, **kwargs
        )

    def stream_stream(
        self,
        method: str,
        *args,
        **kwargs,
    ) -> StreamStreamMultiCallable:
        """See:
        https://grpc.github.io/grpc/python/grpc_asyncio.html#grpc.aio.Channel.stream_stream"""
        return self._get_channel_for_method(method).stream_stream(
            method, *args, **kwargs
        )
