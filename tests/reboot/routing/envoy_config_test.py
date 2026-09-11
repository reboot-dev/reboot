import unittest
from envoy.config.route.v3 import route_pb2
from envoy.extensions.filters.network.http_connection_manager.v3 import (
    http_connection_manager_pb2,
)
from google.protobuf.descriptor_pb2 import FileDescriptorSet
from pathlib import Path
from reboot.aio.headers import CALLER_ID_HEADER
from reboot.aio.types import ApplicationId
from reboot.helpers import add_file_descriptor_to_file_descriptor_set
from reboot.routing.envoy_config import (
    ServerAddress,
    ServerInfo,
    listeners,
)
from tests.reboot import greeter_pb2


def _route_configuration(
    listener,
) -> route_pb2.RouteConfiguration:
    """The route configuration a listener serves."""
    filters = listener.filter_chains[0].filters
    assert len(filters) == 1, filters
    manager = http_connection_manager_pb2.HttpConnectionManager()
    filters[0].typed_config.Unpack(manager)
    return manager.route_config


class TestCallerIdRemoval(unittest.TestCase):
    """An `is_app_internal` authorizer believes `x-reboot-caller-id`
    because Envoy removes it from traffic whose caller IDs it does not
    trust. That removal used to be attached to a single route, so a
    request that matched any other one kept the header it arrived
    with."""

    def _listeners(self):
        file_descriptor_set = FileDescriptorSet()
        add_file_descriptor_to_file_descriptor_set(
            return_set=file_descriptor_set,
            file_descriptor=greeter_pb2.DESCRIPTOR,
            routable_service_names=None,
        )
        return listeners(
            application_id=ApplicationId("testing"),
            servers=[
                ServerInfo(
                    server_id="testing-c123456",
                    address=ServerAddress(
                        host="127.0.0.1",
                        grpc_port=1234,
                        websocket_port=1235,
                        http_port=1236,
                    ),
                    shards=[],
                    on_this_replica=True,
                ),
            ],
            file_descriptor_set=file_descriptor_set,
            trusted_host="127.0.0.1",
            trusted_port=9992,
            public_port=9991,
            use_tls=False,
            certificate_path=Path("certificate.pem"),
            key_path=Path("key.pem"),
            allowed_origins=None,
        )

    def test_an_untrusted_listener_removes_it_from_every_route(self) -> None:
        by_name = {listener.name: listener for listener in self._listeners()}
        public = _route_configuration(by_name["public"])

        # Whatever route a request matches, it cannot bring its own
        # caller ID in through the public port.
        self.assertIn(CALLER_ID_HEADER, public.request_headers_to_remove)
        self.assertGreater(len(public.virtual_hosts[0].routes), 1)
        for route in public.virtual_hosts[0].routes:
            self.assertNotIn(
                CALLER_ID_HEADER,
                route.request_headers_to_remove,
                "the removal belongs to the route configuration, so that "
                "it cannot be missing from a route added later",
            )

    def test_the_trusted_listener_keeps_it(self) -> None:
        by_name = {listener.name: listener for listener in self._listeners()}
        trusted = _route_configuration(by_name["trusted"])

        # The trusted port is how the application reaches itself, and
        # what it says about itself there is the whole point.
        self.assertNotIn(CALLER_ID_HEADER, trusted.request_headers_to_remove)


if __name__ == "__main__":
    unittest.main()
