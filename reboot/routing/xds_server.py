import asyncio
import time
import traceback
from dataclasses import dataclass
from envoy.config.cluster.v3 import cluster_pb2
from envoy.config.listener.v3 import listener_pb2
from envoy.service.discovery.v3 import ads_pb2_grpc, discovery_pb2
from google.protobuf import any_pb2
from log.log import get_logger
from rebootdev.settings import ENVOY_VERSION
from typing import AsyncIterator, Literal, Optional

logger = get_logger(__name__)

TYPE_CLUSTER = "type.googleapis.com/envoy.config.cluster.v3.Cluster"
TYPE_LISTENER = "type.googleapis.com/envoy.config.listener.v3.Listener"


class AggregatedDiscoveryServiceServicer(
    ads_pb2_grpc.AggregatedDiscoveryServiceServicer
):
    """
    The xDS protocol has four different transport variants: Basic, Incremental
    Basic, Aggregated Discovery Service (ADS), and Incremental ADS. For more
    info, see [1].

    Any of these variants can communicate the same information. We implement
    (only) ADS (the non-incremental version) here, because:

    1. Aggregated, because it is the only transport that can guarantee
       sequencing of cluster/listener updates (see below). This allows for
       no-downtime updates of Envoy configurations, for example when shifting
       traffic from one cluster to another. ADS allows us to guarantee that the
       new cluster is added and listeners are updated before the old cluster is
       removed.
    2. Non-incremental, because incremental updates are not worth the complexity
       in our use case. Our configurations are not that big, and all
       communication with clients is local to the host.

    ADS serves two kinds of resources:

    * Clusters are upstream backends that Envoy can route traffic to. In
      Reboot, these are the servers.
    * Listeners are the ports that Envoy listens on, and the rules that it
      applies to traffic arriving on those ports.

    Users of this class set the latest versions of these resources by calling
    `set_config`. This server takes care of streaming the latest versions of
    these resources to clients that want them.

    [1]
    https://www.envoyproxy.io/docs/envoy/latest/api-docs/xds_protocol#variants-of-the-xds-transport-protocol
    """

    @dataclass
    class ClientEntry:
        # Maps: type_url -> version_info last acknowledged by the client.
        version_info_by_type: dict[str, str]
        # If true: this client is no longer connected.
        disconnected: bool
        # An event that is set whenever any of the above fields change.
        changed: asyncio.Event

        # A set of type URLs for which the client has requested to be notified
        # of the latest version.
        requested_types: set[str]

        def set_version_info(self, type_url: str, version_info: str):
            self.version_info_by_type[type_url] = version_info
            self.changed.set()
            self.changed.clear()

        def set_disconnected(self):
            self.disconnected = True
            self.changed.set()
            self.changed.clear()

    def __init__(
        self,
        *,
        clusters: list[cluster_pb2.Cluster] = [],
        listeners: list[listener_pb2.Listener] = [],
    ):
        self._clusters = clusters
        self._listeners = listeners
        self._config_version = 1
        self._config_changed = asyncio.Event()
        self._clients: list[AggregatedDiscoveryServiceServicer.ClientEntry
                           ] = []
        self._client_added_events: list[asyncio.Event] = []

    async def _mark_config_changed(self):
        # The version number is a timestamp, to ensure that version numbers are
        # monotonically increasing even if this server restarts.
        self._config_version = time.time_ns()
        self._config_changed.set()
        self._config_changed.clear()
        await self._wait_until_all_clients_at_version(self._version_info())

    def _version_info(self) -> str:
        return f"v{self._config_version}"

    async def _wait_until_all_clients_at_version(self, version_info: str):
        for client in self._clients:
            while not client.disconnected and (
                # ASSUMPTION: all clients will (eventually) ask for both the
                #             cluster and listeners configs. This holds, since
                #             we know our Envoys request both.
                #
                # Clients are are not considered up to date until they have
                # requested both types of config...
                len(client.version_info_by_type) < 2
                # ... And acknowledged receipt of the latest version for both.
                or any(
                    client_version_info < version_info for client_version_info
                    in client.version_info_by_type.values()
                )
            ):
                await client.changed.wait()

    async def _wait_until_at_least_one_client(self):
        if len(self._clients) > 0:
            return

        event = asyncio.Event()
        self._client_added_events.append(event)
        try:
            await event.wait()
        finally:
            self._client_added_events.remove(event)

    async def set_config(
        self,
        *,
        clusters: list[cluster_pb2.Cluster],
        listeners: list[listener_pb2.Listener],
        wait_until_at_least_one_client: bool = False,
    ):
        """
        Set a new cluster and listener configuration on all clients.

        Blocks until all currently connected clients have applied the new
        configuration. Note that this does not guarantee that there are any
        currently-connected clients, but it does guarantee that after this
        method returns all current and future clients work with the new
        configuration.
        """
        self._clusters = clusters
        self._listeners = listeners

        if wait_until_at_least_one_client:
            await self._wait_until_at_least_one_client()

        await self._mark_config_changed()

    async def StreamAggregatedResources(
        self,
        request_iterator: AsyncIterator[discovery_pb2.DiscoveryRequest],
        context,
    ):
        """
        This is the implementation of the only method in the ADS protocol.

        We expect to get a stream of `DiscoveryRequest`s from the client. Each
        request asks for one of two "types" of config: the cluster
        configuration, or the listener configuration.

        Each request will have a `version_info` field that tells us whether the
        client has the latest version of the config, or whether they're out of
        date. Out-of-date requests are answered immediately. Up-to-date requests
        are answered only once the config changes.
        """
        next_request_task: Optional[asyncio.Task[discovery_pb2.DiscoveryRequest
                                                ]] = None
        config_changed_task: Optional[asyncio.Task[Literal[True]]] = None
        client_entry = self.ClientEntry(
            version_info_by_type={},
            changed=asyncio.Event(),
            disconnected=False,
            requested_types=set(),
        )
        self._clients.append(client_entry)

        # Trigger anyone waiting for a client to be added.
        for event in self._client_added_events:
            event.set()

        try:

            async def _one_request():
                # TODO(rjh): why do we need this method?
                return await anext(request_iterator)

            while True:
                # Wait for the next request to arrive, or for the config to
                # change.
                if next_request_task is None:
                    next_request_task = asyncio.create_task(_one_request())
                if config_changed_task is None:
                    config_changed_task = asyncio.create_task(
                        self._config_changed.wait()
                    )
                done, pending = await asyncio.wait(
                    [next_request_task, config_changed_task],
                    return_when=asyncio.FIRST_COMPLETED
                )

                if next_request_task.done():
                    request = await next_request_task
                    envoy_version = (
                        str(
                            request.node.user_agent_build_version.version.
                            major_number
                        ) + "." + str(
                            request.node.user_agent_build_version.version.
                            minor_number
                        ) + "." + str(
                            request.node.user_agent_build_version.version.patch
                        )
                    )
                    if envoy_version < ENVOY_VERSION:
                        logger.error(
                            f"Envoy version '{envoy_version}' is less than "
                            f"the minimum required version '{ENVOY_VERSION}'"
                        )
                    next_request_task = None
                    if request.type_url not in [TYPE_CLUSTER, TYPE_LISTENER]:
                        raise ValueError(
                            f"Request for unexpected 'type_url': '{request.type_url}'"
                        )
                    client_entry.set_version_info(
                        request.type_url, request.version_info
                    )
                    client_entry.requested_types.add(request.type_url)
                if config_changed_task.done():
                    await config_changed_task  # So we don't get "never awaited" warnings.
                    config_changed_task = None  # Mark this config change as consumed.

                latest_version = self._version_info()

                for type_url in [
                    # Always send the clusters first, then the listeners.
                    # Listeners will get rejected if they reference a cluster
                    # that doesn't exist.
                    TYPE_CLUSTER,
                    TYPE_LISTENER,
                ]:
                    if type_url not in client_entry.requested_types:
                        # The client hasn't sent us a request for this type, or
                        # if it did so previously we've answered it previously.
                        # Don't send any further updates until it asks for them.
                        continue
                    client_version = client_entry.version_info_by_type[type_url
                                                                      ]
                    if client_version >= latest_version:
                        # The client already has the latest version of this type.
                        # Don't send it again.
                        continue

                    response = discovery_pb2.DiscoveryResponse()
                    response.version_info = self._version_info()
                    response.type_url = type_url

                    if type_url == TYPE_CLUSTER:
                        for cluster in self._clusters:
                            cluster_any = any_pb2.Any()
                            cluster_any.Pack(cluster)
                            response.resources.append(cluster_any)

                    if type_url == TYPE_LISTENER:
                        for listener in self._listeners:
                            listener_any = any_pb2.Any()
                            listener_any.Pack(listener)
                            response.resources.append(listener_any)

                    yield response

                    # The request has been satisfied. Don't send this type again
                    # until the client explicitly requests it again.
                    client_entry.requested_types.remove(type_url)

        except StopAsyncIteration:
            # The client disconnected. That's fine.
            pass

        except asyncio.CancelledError:
            # The server is shutting down. That's fine.
            pass

        except:
            logger.error("There was an error in the ADS server:")
            traceback.print_exc()
            raise

        finally:
            # Remove ourselves from the list of clients, so that current and
            # future callers to `_wait_until_all_clients_at_version` don't wait
            # forever.
            self._clients.remove(client_entry)
            client_entry.set_disconnected()

            if next_request_task is not None:
                next_request_task.cancel()
                try:
                    await next_request_task
                except asyncio.CancelledError:
                    pass
                except StopAsyncIteration:
                    pass
            if config_changed_task is not None:
                config_changed_task.cancel()
                try:
                    await config_changed_task
                except asyncio.CancelledError:
                    pass
                except StopAsyncIteration:
                    pass

    async def DeltaAggregatedResources(
        self,
        request_iterator: AsyncIterator[discovery_pb2.DeltaDiscoveryRequest],
        context,
    ):
        """
        This method implements incremental ADS; we do not support that.
        """
        logger.error("UNSUPPORTED call to 'DeltaAggregatedResources'!")
        raise NotImplementedError()
