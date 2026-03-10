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
)
from reboot.settings import ENVOY_VERSION


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
        # Discovery requests should carry version info to prevent error logs
        # from the xDS server.
        node = base_pb2.Node()
        envoy_version_parts = ENVOY_VERSION.split(".")
        node.user_agent_build_version.version.major_number = int(
            envoy_version_parts[0]
        )
        node.user_agent_build_version.version.minor_number = int(
            envoy_version_parts[1]
        )
        node.user_agent_build_version.version.patch = int(
            envoy_version_parts[2]
        )

        # A client begins by asking for the clusters.
        call = self._client.StreamAggregatedResources()
        await call.write(
            discovery_pb2.DiscoveryRequest(node=node, type_url=TYPE_CLUSTER)
        )
        response = await call.read()
        self.assertEqual(response.type_url, TYPE_CLUSTER)

        # The client will immediately circle back and ask for the next version
        # of the clusters, but there will be no response until the server has a
        # new version to give.
        await call.write(
            discovery_pb2.DiscoveryRequest(
                node=node,
                type_url=TYPE_CLUSTER,
                version_info=response.version_info,
            )
        )
        response_task = asyncio.create_task(call.read())
        self.assertFalse(response_task.done())

        # The client will then ask for the listeners.
        await call.write(
            discovery_pb2.DiscoveryRequest(node=node, type_url=TYPE_LISTENER)
        )
        response = await response_task
        self.assertEqual(response.type_url, TYPE_LISTENER)

        # Like with the clusters, the client will immediately go listen for
        # changes on the listeners, but won't hear anything (yet).
        await call.write(
            discovery_pb2.DiscoveryRequest(
                node=node,
                type_url=TYPE_LISTENER,
                version_info=response.version_info,
            )
        )
        response_task = asyncio.create_task(call.read())
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


if __name__ == '__main__':
    unittest.main()
