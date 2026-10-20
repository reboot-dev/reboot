"""Which CORS policy Envoy gives which route.

With `oauth=`, only the OAuth server's paths (`OAUTH_PATH_PREFIX`)
honor the session cookie cross-origin, so only they get a
credentialed, exact-match policy built from `allowed_origins`. Every
other path answers any
origin without credentials, so a page on an origin the application
cannot list (an MCP host's sandbox) can still call with a bearer it
holds. Without `oauth=`, no route gets a policy of its own.
"""

import unittest
from envoy.config.route.v3 import route_components_pb2
from envoy.extensions.filters.http.cors.v3 import cors_pb2
from google.protobuf.descriptor_pb2 import FileDescriptorSet
from pathlib import Path
from reboot.aio.auth.allowed_origins import OAUTH_PATH_PREFIX
from reboot.aio.types import ApplicationId, ServerId
from reboot.routing import envoy_config
from reboot.routing.envoy_config import (
    CORS_HTTP_FILTER_NAME,
    ServerAddress,
    ServerInfo,
)
from typing import Optional

_TRUSTED_ORIGIN = "https://app.example.com"


def _routes(
    allowed_origins: Optional[list[str]],
) -> tuple[route_components_pb2.CorsPolicy, list[route_components_pb2.Route]]:
    """The public listener's virtual-host CORS policy and routes for
    an application with the given `allowed_origins`."""
    listeners = envoy_config.listeners(
        application_id=ApplicationId("testing"),
        servers=[
            ServerInfo(
                server_id=ServerId("testing-c0"),
                address=ServerAddress(
                    host="127.0.0.1",
                    grpc_port=50051,
                    websocket_port=50052,
                    http_port=50053,
                ),
                shards=[],
                on_this_replica=True,
            ),
        ],
        file_descriptor_set=FileDescriptorSet(),
        trusted_host="127.0.0.1",
        trusted_port=9992,
        public_port=9991,
        use_tls=False,
        certificate_path=Path("unused.crt"),
        key_path=Path("unused.key"),
        allowed_origins=allowed_origins,
        route_matches=[],
        frontend=None,
    )
    public = next(
        listener for listener in listeners if listener.name == "public"
    )
    http_connection_manager = (
        envoy_config.http_connection_manager_pb2.HttpConnectionManager()
    )
    public.filter_chains[0].filters[0].typed_config.Unpack(
        http_connection_manager
    )
    virtual_host = http_connection_manager.route_config.virtual_hosts[0]
    return virtual_host.cors, list(virtual_host.routes)


def _oauth_routes(
    routes: list[route_components_pb2.Route],
) -> list[route_components_pb2.Route]:
    return [r for r in routes if r.match.prefix == OAUTH_PATH_PREFIX]


def _route_cors_policy(
    route: route_components_pb2.Route,
) -> cors_pb2.CorsPolicy:
    policy = cors_pb2.CorsPolicy()
    route.typed_per_filter_config[CORS_HTTP_FILTER_NAME].Unpack(policy)
    return policy


class EnvoyCorsTest(unittest.TestCase):

    def test_virtual_host_answers_any_origin_without_credentials(self):
        """Whatever `allowed_origins` says, the virtual host's policy
        echoes any origin and never allows credentials: a page on an
        unknown origin can call RPCs with a bearer, and the browser
        hides from it any response the cookie authenticated."""
        for allowed_origins in (None, [], [_TRUSTED_ORIGIN]):
            with self.subTest(allowed_origins=allowed_origins):
                cors, _ = _routes(allowed_origins)
                self.assertFalse(cors.HasField("allow_credentials"))
                self.assertEqual(len(cors.allow_origin_string_match), 1)
                self.assertEqual(
                    cors.allow_origin_string_match[0].safe_regex.regex,
                    ".*",
                )
                self.assertIn("authorization", cors.allow_headers)

    def test_oauth_route_is_credentialed_and_exact_match(self):
        _, routes = _routes([_TRUSTED_ORIGIN])
        oauth_routes = _oauth_routes(routes)
        self.assertEqual(len(oauth_routes), 1)
        oauth_route = oauth_routes[0]

        # Envoy takes the first matching route, so the OAuth route must
        # precede the HTTP catch-all for the same cluster.
        catch_alls = [
            r for r in routes if r.match.prefix == "/" and
            r.route.cluster == oauth_route.route.cluster
        ]
        self.assertEqual(len(catch_alls), 1)
        self.assertLess(
            routes.index(oauth_route),
            routes.index(catch_alls[0]),
        )

        policy = _route_cors_policy(oauth_route)
        self.assertTrue(policy.allow_credentials.value)
        # Under test, as under `rbt dev run`, the policy also carries the
        # local-development origin regexes; only the exact matches come
        # from `allowed_origins`.
        exact = [m.exact for m in policy.allow_origin_string_match if m.exact]
        self.assertEqual(exact, [_TRUSTED_ORIGIN])
        # Never a wildcard alongside credentials.
        for matcher in policy.allow_origin_string_match:
            self.assertNotEqual(matcher.safe_regex.regex, ".*")
        self.assertIn("authorization", policy.allow_headers)

    def test_empty_allow_list_still_gets_oauth_route(self):
        """`allowed_origins=[]` is `oauth=` with same-origin-only
        sign-in: the credentialed route still exists and lists no exact
        origin, only the local-development regexes a test run adds."""
        _, routes = _routes([])
        oauth_routes = _oauth_routes(routes)
        self.assertEqual(len(oauth_routes), 1)
        policy = _route_cors_policy(oauth_routes[0])
        self.assertTrue(policy.allow_credentials.value)
        self.assertEqual(
            [m.exact for m in policy.allow_origin_string_match if m.exact],
            [],
        )

    def test_no_oauth_means_no_oauth_route(self):
        """`allowed_origins=None` is an application without `oauth=`:
        no cookie to protect, so no route carries a CORS policy of its
        own."""
        _, routes = _routes(None)
        self.assertEqual(_oauth_routes(routes), [])
        for route in routes:
            self.assertNotIn(
                CORS_HTTP_FILTER_NAME, route.typed_per_filter_config
            )

    def test_only_oauth_routes_see_cookies(self):
        """Every route but the OAuth server's removes `Cookie` from the
        request and `Set-Cookie` from the response, whatever a client
        sends; the session cookie is scoped to `OAUTH_PATH_PREFIX`."""
        for allowed_origins in (None, [], [_TRUSTED_ORIGIN]):
            with self.subTest(allowed_origins=allowed_origins):
                _, routes = _routes(allowed_origins)
                for route in routes:
                    oauth = route.match.prefix == OAUTH_PATH_PREFIX
                    self.assertEqual(
                        "cookie" in route.request_headers_to_remove,
                        not oauth,
                    )
                    self.assertEqual(
                        "set-cookie" in route.response_headers_to_remove,
                        not oauth,
                    )


if __name__ == "__main__":
    unittest.main()
