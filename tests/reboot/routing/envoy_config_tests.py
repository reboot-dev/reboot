"""The routes Envoy gets for the paths the web framework answers."""

import unittest
from envoy.config.listener.v3 import listener_pb2
from envoy.config.route.v3 import route_components_pb2
from envoy.extensions.filters.network.http_connection_manager.v3 import (
    http_connection_manager_pb2,
)
from envoy.type.matcher.v3 import regex_pb2
from google.protobuf.descriptor_pb2 import FileDescriptorSet
from pathlib import Path
from reboot.aio.http import PythonWebFramework
from reboot.aio.types import ApplicationId, ServerId
from reboot.routing import envoy_config
from reboot.routing.envoy_config import ServerAddress, ServerInfo


def _public_routes(listeners: list[listener_pb2.Listener]):
    """The `(match, cluster)` of every route on the public listener."""
    (listener,) = [
        listener for listener in listeners if listener.name == "public"
    ]
    manager = http_connection_manager_pb2.HttpConnectionManager()
    listener.filter_chains[0].filters[0].typed_config.Unpack(manager)
    (virtual_host,) = manager.route_config.virtual_hosts
    return [
        (route.match, route.route.cluster) for route in virtual_host.routes
    ]


def _listeners(
    route_matches: list[route_components_pb2.RouteMatch],
    frontend: envoy_config.FrontendConfig | None = None,
) -> list[listener_pb2.Listener]:
    return envoy_config.listeners(
        application_id=ApplicationId("testing"),
        servers=[
            ServerInfo(
                server_id=ServerId("testing"),
                address=ServerAddress(
                    host="127.0.0.1",
                    grpc_port=1,
                    websocket_port=2,
                    http_port=3,
                ),
                shards=[],
                on_this_replica=True,
            ),
        ],
        file_descriptor_set=FileDescriptorSet(),
        trusted_host="127.0.0.1",
        trusted_port=0,
        public_port=9991,
        use_tls=False,
        certificate_path=Path("cert"),
        key_path=Path("key"),
        allowed_origins=None,
        route_matches=route_matches,
        frontend=frontend,
    )


class EnvoyConfigTest(unittest.TestCase):

    def test_route_matches_are_routed_ahead_of_the_catch_all(self) -> None:
        listeners = _listeners(
            [
                route_components_pb2.RouteMatch(prefix="/mcp"),
                route_components_pb2.RouteMatch(path="/__/probe"),
                route_components_pb2.RouteMatch(
                    safe_regex=regex_pb2.RegexMatcher(regex="^/users/[^/]+$"),
                ),
            ]
        )

        routes = _public_routes(listeners)
        # The routes to the HTTP port: the paths given, in order and
        # as given (a prefix, an exact path, or a regex), then the
        # catch-all, all to the same cluster.
        http = [
            (match, cluster) for match, cluster in routes if "http" in cluster
        ]
        self.assertEqual(
            [
                (
                    match.prefix,
                    match.path,
                    match.safe_regex.regex,
                    match.headers[0].name,
                ) for match, _ in http
            ],
            [
                ("/mcp", "", "", "x-reboot-server-id"),
                ("", "/__/probe", "", "x-reboot-server-id"),
                ("", "", "^/users/[^/]+$", "x-reboot-server-id"),
                ("/", "", "", "x-reboot-server-id"),
            ],
        )
        self.assertEqual(len({cluster for _, cluster in http}), 1)
        # The catch-all is the last route of all.
        self.assertEqual(routes[-1][0].prefix, "/")

    def test_web_app_gives_the_catch_all_to_the_dev_server(self) -> None:
        routes = _public_routes(
            _listeners(
                [route_components_pb2.RouteMatch(prefix="/mcp")],
                frontend=envoy_config.frontend_config(
                    "http://localhost:5173",
                    web_app=True,
                ),
            )
        )

        # `/__/frontend/` first, the application's paths to its HTTP
        # port, then `/` and everything else to the dev server; the
        # HTTP port has no catch-all of its own.
        self.assertEqual(routes[0][0].prefix, "/__/frontend/")
        self.assertEqual(routes[0][1], envoy_config.FRONTEND_CLUSTER_NAME)
        http = [
            (match, cluster) for match, cluster in routes if "http" in cluster
        ]
        self.assertEqual([match.prefix for match, _ in http], ["/mcp"])
        self.assertEqual(routes[-1][0].prefix, "/")
        self.assertEqual(routes[-1][1], envoy_config.FRONTEND_CLUSTER_NAME)

    def test_without_web_app_the_http_port_keeps_the_catch_all(self) -> None:
        routes = _public_routes(
            _listeners(
                [],
                frontend=envoy_config.frontend_config(
                    "http://localhost:5173",
                    web_app=False,
                ),
            )
        )

        self.assertEqual(routes[0][0].prefix, "/__/frontend/")
        self.assertEqual(routes[-1][0].prefix, "/")
        self.assertIn("http", routes[-1][1])


class PythonWebFrameworkPathsTest(unittest.TestCase):

    def test_route_matches(self) -> None:
        web_framework = PythonWebFramework()

        async def nothing(*args, **kwargs) -> None:
            pass

        web_framework.http.get("/health")(nothing)
        web_framework.http.get("/users/{id}/orders")(nothing)
        web_framework.http.get("/files/{name:path}")(nothing)
        web_framework.http.mount("/mcp", app=nothing)

        # In any order: they all route to the one cluster.
        self.assertCountEqual(
            web_framework.route_matches(),
            [
                # Reboot's own.
                route_components_pb2.RouteMatch(
                    safe_regex=regex_pb2.RegexMatcher(
                        regex="^/__/rootpage/.*$"
                    ),
                ),
                route_components_pb2.RouteMatch(path="/__/probe"),
                # A mount is a prefix; path parameters make a regex
                # matching exactly what FastAPI matches, never a
                # prefix that would take a web app's own URLs too.
                route_components_pb2.RouteMatch(prefix="/mcp"),
                route_components_pb2.RouteMatch(path="/health"),
                route_components_pb2.RouteMatch(
                    safe_regex=regex_pb2.RegexMatcher(
                        regex="^/users/[^/]+/orders$",
                    ),
                ),
                route_components_pb2.RouteMatch(
                    safe_regex=regex_pb2.RegexMatcher(regex="^/files/.*$"),
                ),
            ],
        )


if __name__ == "__main__":
    unittest.main()
