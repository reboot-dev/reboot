import asyncio
import grpc.aio
import unittest
from envoy.config.cluster.v3 import cluster_pb2
from envoy.config.core.v3 import base_pb2
from envoy.config.listener.v3 import listener_pb2
from envoy.service.discovery.v3 import ads_pb2_grpc, discovery_pb2
from google.protobuf import any_pb2
from reboot.routing.xds_server import (
    TYPE_CLUSTER,
    TYPE_LISTENER,
    AggregatedDiscoveryServiceServicer,
    ConfigRejected,
    ServerError,
)
from reboot.settings import ENVOY_VERSION


def _envoy_node() -> base_pb2.Node:
    """A `Node` advertising our pinned Envoy version, so the servicer
    doesn't log a version-mismatch error."""
    node = base_pb2.Node()
    major, minor, patch = ENVOY_VERSION.split(".")
    node.user_agent_build_version.version.major_number = int(major)
    node.user_agent_build_version.version.minor_number = int(minor)
    node.user_agent_build_version.version.patch = int(patch)
    return node


def _cluster_from_any(cluster_any: any_pb2.Any) -> cluster_pb2.Cluster:
    cluster = cluster_pb2.Cluster()
    cluster_any.Unpack(cluster)
    return cluster


def _listener_from_any(listener_any: any_pb2.Any) -> listener_pb2.Listener:
    listener = listener_pb2.Listener()
    listener_any.Unpack(listener)
    return listener


class TestCase(unittest.IsolatedAsyncioTestCase):

    async def asyncSetUp(self):
        self._grpc_server = grpc.aio.server()
        port = self._grpc_server.add_insecure_port("127.0.0.1:0")
        self._address = f"127.0.0.1:{port}"

        self._servicer = AggregatedDiscoveryServiceServicer()
        ads_pb2_grpc.add_AggregatedDiscoveryServiceServicer_to_server(
            self._servicer, self._grpc_server
        )

        await self._grpc_server.start()

        channel = grpc.aio.insecure_channel(self._address)
        self._client = ads_pb2_grpc.AggregatedDiscoveryServiceStub(channel)

    async def asyncTearDown(self):
        await self._grpc_server.stop(0)
        await self._grpc_server.wait_for_termination()

    async def test_basic(self):
        node = _envoy_node()

        # A client asks for the clusters first; the server never
        # withholds clusters, so it answers immediately.
        call = self._client.StreamAggregatedResources()
        await call.write(
            discovery_pb2.DiscoveryRequest(node=node, type_url=TYPE_CLUSTER)
        )
        response = await call.read()
        self.assertEqual(response.type_url, TYPE_CLUSTER)

        # The client circles back to listen for the next version of the
        # clusters; there is no response until the config changes.
        await call.write(
            discovery_pb2.DiscoveryRequest(
                node=node,
                type_url=TYPE_CLUSTER,
                version_info=response.version_info,
            )
        )
        response_task = asyncio.create_task(call.read())
        await asyncio.sleep(0.1)
        self.assertFalse(response_task.done())

        # The client then asks for the listeners and gets them: the
        # clusters they reference are already known to it.
        await call.write(
            discovery_pb2.DiscoveryRequest(node=node, type_url=TYPE_LISTENER)
        )
        response = await response_task
        self.assertEqual(response.type_url, TYPE_LISTENER)

        # Likewise, the client listens for the next version of the
        # listeners and hears nothing until the config changes.
        await call.write(
            discovery_pb2.DiscoveryRequest(
                node=node,
                type_url=TYPE_LISTENER,
                version_info=response.version_info,
            )
        )
        response_task = asyncio.create_task(call.read())
        await asyncio.sleep(0.1)
        self.assertFalse(response_task.done())

        # When we make a change to the config, the client will be informed.
        set_config_task = asyncio.create_task(
            self._servicer.set_config(
                clusters=[cluster_pb2.Cluster(name="test_basic_cluster")],
                listeners=[listener_pb2.Listener(name="test_basic_listener")],
            )
        )

        # Cluster information is always sent before listener information.
        response = await response_task
        self.assertEqual(TYPE_CLUSTER, response.type_url)
        self.assertEqual(1, len(response.resources))
        response_cluster = _cluster_from_any(response.resources[0])
        self.assertEqual(response_cluster.name, "test_basic_cluster")

        response = await call.read()
        self.assertEqual(TYPE_LISTENER, response.type_url)
        self.assertEqual(1, len(response.resources))
        listener = _listener_from_any(response.resources[0])
        self.assertEqual(listener.name, "test_basic_listener")

        # Until the client acknowledges the new config version, `set_config`
        # does not return.
        self.assertFalse(set_config_task.done())

        # Clients acknowledge new versions of the clusters and listeners
        # separately.
        await call.write(
            discovery_pb2.DiscoveryRequest(
                node=node,
                type_url=TYPE_CLUSTER,
                version_info=response.version_info,
            )
        )
        # The `set_config` call only returns when both the clusters and the
        # listeners have been acknowledged as updated. Sleep a little moment to
        # increase the odds of detecting if this is not the case.
        await asyncio.sleep(0.1)
        self.assertFalse(set_config_task.done())
        await call.write(
            discovery_pb2.DiscoveryRequest(
                node=node,
                type_url=TYPE_LISTENER,
                version_info=response.version_info,
            )
        )
        await set_config_task

        # If the client disconnects before acknowledging a new config version,
        # that client does not block the completion of a `set_config` call.
        set_config_task = asyncio.create_task(
            self._servicer.set_config(
                clusters=[
                    cluster_pb2.Cluster(name="test_disconnecting_cluster")
                ],
                listeners=[
                    listener_pb2.Listener(name="test_disconnecting_listener")
                ],
            )
        )
        response = await call.read()
        self.assertEqual(response.type_url, TYPE_CLUSTER)
        # Disconnect the client without acknowledging the new config version.
        del call
        # The `set_config` call still completes.
        await set_config_task

    async def test_rejection_fails_in_flight_set_config(self):
        # A connected Envoy that NACKs a config update makes the
        # in-flight `set_config` fail, rather than blocking forever
        # waiting for an acknowledgement that will never come. This
        # matters for `rbt dev run`, where there may never be a
        # subsequent `set_config` to surface the rejection.
        node = _envoy_node()
        call = self._client.StreamAggregatedResources()

        # Bring the fake Envoy up to date with the server's initial
        # (empty) config, so it counts as a connected, up-to-date client.
        await call.write(
            discovery_pb2.DiscoveryRequest(node=node, type_url=TYPE_CLUSTER)
        )
        await call.write(
            discovery_pb2.DiscoveryRequest(node=node, type_url=TYPE_LISTENER)
        )
        cluster_response = await call.read()
        listener_response = await call.read()
        await call.write(
            discovery_pb2.DiscoveryRequest(
                node=node,
                type_url=TYPE_CLUSTER,
                version_info=cluster_response.version_info,
            )
        )
        await call.write(
            discovery_pb2.DiscoveryRequest(
                node=node,
                type_url=TYPE_LISTENER,
                version_info=listener_response.version_info,
            )
        )

        # Start a config update; it blocks until every connected Envoy
        # has acknowledged the new version.
        set_config_task = asyncio.create_task(
            self._servicer.set_config(
                clusters=[cluster_pb2.Cluster(name="some_cluster")],
                listeners=[listener_pb2.Listener(name="some_listener")],
            )
        )

        # The fake Envoy receives the new config and rejects it. Setting
        # `error_detail` marks the request as a NACK rather than an ACK;
        # its contents don't matter.
        await call.read()
        await call.read()
        nack = discovery_pb2.DiscoveryRequest(
            node=node,
            type_url=TYPE_LISTENER,
            version_info=listener_response.version_info,
        )
        nack.error_detail.message = "this test says no"
        await call.write(nack)

        # The in-flight `set_config` fails with the rejection.
        with self.assertRaises(ConfigRejected) as context:
            await set_config_task
        self.assertIn("this test says no", context.exception.envoy_message)

    async def test_unsupported_envoy_version_is_fatal(self):
        # An Envoy older than the version we require is also fatal, so a
        # version mismatch crashes the process rather than only logging.
        node = base_pb2.Node()
        node.user_agent_build_version.version.major_number = 1
        node.user_agent_build_version.version.minor_number = 0
        node.user_agent_build_version.version.patch = 0

        call = self._client.StreamAggregatedResources()
        await call.write(
            discovery_pb2.DiscoveryRequest(node=node, type_url=TYPE_CLUSTER)
        )

        fatal_error = await self._wait_for_fatal_error()
        self.assertNotIsInstance(fatal_error, ConfigRejected)
        self.assertIn("is less than the minimum required", str(fatal_error))

    async def test_listener_requested_first_is_served_after_cluster(self):
        # Envoy requests CDS and LDS independently and may ask for the
        # listeners first, but it rejects a listener that routes to a
        # cluster it doesn't have yet. The server must therefore hold
        # back every response until both have been requested, then send
        # clusters before listeners regardless of request order.
        node = _envoy_node()
        call = self._client.StreamAggregatedResources()

        # The client asks for the listeners first. The server must NOT
        # answer yet: it hasn't been asked for the clusters.
        await call.write(
            discovery_pb2.DiscoveryRequest(node=node, type_url=TYPE_LISTENER)
        )
        response_task = asyncio.create_task(call.read())
        await asyncio.sleep(0.5)
        self.assertFalse(response_task.done())

        # Once the client also asks for the clusters, the server answers
        # both, with the clusters first even though the listeners were
        # requested first.
        await call.write(
            discovery_pb2.DiscoveryRequest(node=node, type_url=TYPE_CLUSTER)
        )
        first = await response_task
        self.assertEqual(first.type_url, TYPE_CLUSTER)
        second = await call.read()
        self.assertEqual(second.type_url, TYPE_LISTENER)

    async def test_listener_not_served_ahead_of_new_clusters(self):
        # A config update can add a cluster that a new listener routes
        # to. Envoy rejects a listener whose cluster it doesn't have yet
        # ("unknown cluster ..."), so the new listener must not be served
        # until the client has been sent the new clusters — even when the
        # client happens to re-subscribe to listeners before clusters.
        node = _envoy_node()
        call = self._client.StreamAggregatedResources()

        # Bring the client up to date at the initial version.
        await call.write(
            discovery_pb2.DiscoveryRequest(node=node, type_url=TYPE_CLUSTER)
        )
        cluster_response = await call.read()
        await call.write(
            discovery_pb2.DiscoveryRequest(node=node, type_url=TYPE_LISTENER)
        )
        listener_response = await call.read()

        # A config update adds a cluster (and a listener routing to it).
        set_config_task = asyncio.create_task(
            self._servicer.set_config(
                clusters=[cluster_pb2.Cluster(name="new_cluster")],
                listeners=[listener_pb2.Listener(name="new_listener")],
            )
        )

        # The client re-subscribes to listeners first (acking the old
        # version). The server must NOT send the new listener yet: it
        # hasn't sent this client the new clusters.
        await call.write(
            discovery_pb2.DiscoveryRequest(
                node=node,
                type_url=TYPE_LISTENER,
                version_info=listener_response.version_info,
            )
        )
        response_task = asyncio.create_task(call.read())
        await asyncio.sleep(0.5)
        self.assertFalse(response_task.done())

        # Once the client re-subscribes to clusters, the server sends the
        # new clusters first, then releases the new listener.
        await call.write(
            discovery_pb2.DiscoveryRequest(
                node=node,
                type_url=TYPE_CLUSTER,
                version_info=cluster_response.version_info,
            )
        )
        first = await response_task
        self.assertEqual(first.type_url, TYPE_CLUSTER)
        second = await call.read()
        self.assertEqual(second.type_url, TYPE_LISTENER)

        # Acknowledge both so the in-flight `set_config` can complete.
        await call.write(
            discovery_pb2.DiscoveryRequest(
                node=node,
                type_url=TYPE_CLUSTER,
                version_info=first.version_info,
            )
        )
        await call.write(
            discovery_pb2.DiscoveryRequest(
                node=node,
                type_url=TYPE_LISTENER,
                version_info=second.version_info,
            )
        )
        await set_config_task

    async def _wait_for_fatal_error(self) -> ServerError:
        # No timeout here: a hang is caught by Bazel's test timeout, and
        # an explicit timeout would only add flakes on slow machines.
        while self._servicer.fatal_error is None:
            await asyncio.sleep(0.01)
        return self._servicer.fatal_error


if __name__ == '__main__':
    unittest.main()
