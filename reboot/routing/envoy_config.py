import enum
import math
import os
import rbt.v1alpha1.database_pb2 as database_pb2
from dataclasses import dataclass
from envoy.config.cluster.v3 import circuit_breaker_pb2, cluster_pb2
from envoy.config.core.v3 import address_pb2, base_pb2, protocol_pb2
from envoy.config.endpoint.v3 import endpoint_components_pb2, endpoint_pb2
from envoy.config.listener.v3 import listener_components_pb2, listener_pb2
from envoy.config.route.v3 import route_components_pb2, route_pb2
from envoy.extensions.filters.http.cors.v3 import cors_pb2
from envoy.extensions.filters.http.grpc_json_transcoder.v3 import (
    transcoder_pb2,
)
from envoy.extensions.filters.http.lua.v3 import lua_pb2
from envoy.extensions.filters.http.router.v3 import router_pb2
from envoy.extensions.filters.network.http_connection_manager.v3 import (
    http_connection_manager_pb2,
)
from envoy.extensions.transport_sockets.tls.v3 import common_pb2, tls_pb2
from envoy.extensions.upstreams.http.v3 import http_protocol_options_pb2
from envoy.type.matcher.v3 import regex_pb2, string_pb2
from google.protobuf import any_pb2
from google.protobuf.descriptor_pb2 import FileDescriptorSet
from google.protobuf.duration_pb2 import Duration
from google.protobuf.message import Message
from google.protobuf.wrappers_pb2 import UInt32Value
from pathlib import Path
from reboot.aio.headers import (
    APPLICATION_ID_HEADER,
    AUTHORIZATION_HEADER,
    CALLER_ID_HEADER,
    IDEMPOTENCY_KEY_HEADER,
    SERVER_ID_HEADER,
    STATE_REF_HEADER,
    WORKFLOW_ID_HEADER,
)
from reboot.aio.types import ApplicationId, ServerId
from reboot.helpers import get_path_prefixes_from_file_descriptor_set
from reboot.routing.filters.lua import (
    ADD_HEADER_X_REBOOT_APPLICATION_ID_TEMPLATE_FILENAME,
    COMPUTE_HEADER_X_REBOOT_SERVER_ID_TEMPLATE_FILENAME,
    MANGLED_HTTP_PATH_FILENAME,
    REMOVE_JSON_TRAILERS_FILENAME,
    load_lua,
    render_lua_template,
)
from reboot.run_environments import on_cloud
from reboot.settings import (
    ENVVAR_LOCAL_ENVOY_MODE,
    ENVVAR_RBT_DEV,
    ENVVAR_RBT_MCP_FRONTEND_HOST,
    MAX_GRPC_RESPONSE_SIZE_BYTES,
)
from urllib.parse import urlparse


@dataclass
class ServerAddress:
    host: str
    grpc_port: int
    websocket_port: int
    http_port: int


@dataclass
class ServerInfo:
    server_id: ServerId
    address: ServerAddress
    shards: list[database_pb2.ShardInfo]
    # Whether this server is running on the local replica.
    on_this_replica: bool


class ClusterKind(enum.Enum):
    GRPC = enum.auto()
    WEBSOCKET = enum.auto()
    HTTP = enum.auto()


ZERO_SECONDS = Duration()
ZERO_SECONDS.FromSeconds(0)

# MCP frontend routing configuration.
MCP_FRONTEND_CLUSTER_NAME = "mcp_frontend"


@dataclass
class McpFrontendConfig:
    """Configuration for MCP frontend host routing."""
    host: str
    port: int
    original_url: str


def _get_mcp_frontend_config() -> McpFrontendConfig | None:
    """Get MCP frontend host configuration from environment.

    Parses `RBT_MCP_FRONTEND_HOST` env var (e.g., "http://localhost:4444")
    to extract port for Envoy routing to web dev server.

    Returns None if not configured or not in dev mode.
    """
    if os.environ.get(ENVVAR_RBT_DEV) != "true":
        return None
    frontend_url = os.environ.get(ENVVAR_RBT_MCP_FRONTEND_HOST)
    if not frontend_url:
        return None

    parsed = urlparse(frontend_url)
    if not parsed.port:
        raise ValueError(
            f"RBT_MCP_FRONTEND_HOST must include a port; got '{frontend_url}'"
        )
    if not parsed.hostname:
        raise ValueError(
            f"RBT_MCP_FRONTEND_HOST must include a hostname; got '{frontend_url}'"
        )
    port = parsed.port
    host = parsed.hostname

    # For localhost-like hostnames, use the appropriate address based on
    # Envoy mode. Docker Envoy needs `host.docker.internal` to reach the
    # host machine; executable Envoy can use `localhost` directly.
    localhost_aliases = ("localhost", "127.0.0.1", "0.0.0.0")
    if host in localhost_aliases:
        envoy_mode = os.environ.get(ENVVAR_LOCAL_ENVOY_MODE, "docker")
        if envoy_mode == "docker":
            host = "host.docker.internal"
        else:
            host = "localhost"

    return McpFrontendConfig(host=host, port=port, original_url=frontend_url)


# Helper for packing an `Any`.
#
# TODO: replace with `from google.protobuf.any import pack` once we've
# upgraded to a version of protobuf that includes this.
def any_pack(message: Message) -> any_pb2.Any:
    any = any_pb2.Any()
    any.Pack(message)
    return any


def _shard_keyrange_starts(num_shards: int) -> list[int]:
    NUM_BYTE_VALUES = 256
    if num_shards > NUM_BYTE_VALUES:
        raise ValueError(
            f"'num_shards' must be less than or equal to "
            f"{NUM_BYTE_VALUES}; got {num_shards}."
        )
    if not math.log2(num_shards).is_integer():
        raise ValueError(
            f"'num_shards' must be a power of 2; got {num_shards}."
        )
    shard_size = NUM_BYTE_VALUES // num_shards
    # The first shard always begins at the very beginning of the key range.
    return [i * shard_size for i in range(0, num_shards)]


def _lua_any(source_code: str) -> any_pb2.Any:
    return any_pack(
        lua_pb2.Lua(
            default_source_code=base_pb2.DataSource(
                inline_string=source_code,
            ),
        )
    )


def _http_filter_add_header_x_reboot_application_id(
    application_id: ApplicationId
) -> http_connection_manager_pb2.HttpFilter:
    template_input = {
        'application_id': application_id,
    }
    filter_content = render_lua_template(
        ADD_HEADER_X_REBOOT_APPLICATION_ID_TEMPLATE_FILENAME, template_input
    )

    return http_connection_manager_pb2.HttpFilter(
        name="reboot.add_header_x_reboot_application_id",
        # TODO(rjh): can we replace this with a standard add-header filter?
        typed_config=_lua_any(filter_content)
    )


@dataclass
class RouteMapEntry:
    # The start of this shard's key range. Conceptually this represents several
    # `byte`s, but it's encoded as a Lua-safe string literal with escape
    # characters (e.g. "\x41\x00").
    shard_keyrange_start: str
    # The server ID that traffic matching this entry should get sent to.
    server_id: ServerId

    @classmethod
    def from_key_bytes(cls, first_key_bytes: bytes, server_id: str):
        lua_escaped_bytes = ''.join(f'\\x{b:02x}' for b in first_key_bytes)
        return cls(
            shard_keyrange_start=lua_escaped_bytes,
            server_id=server_id,
        )


def _http_filter_compute_header_x_reboot_server_id(
    servers: list[ServerInfo],
) -> http_connection_manager_pb2.HttpFilter:
    # We must give Lua the list of all of the shards sorted by their
    # first key, for ~efficient lookup.
    all_shards: list[database_pb2.ShardInfo] = [
        shard for server in servers for shard in server.shards
    ]
    all_shards.sort(key=lambda shard: shard.shard_first_key)

    server_id_by_shard_id = {
        shard.shard_id: server.server_id for server in servers
        for shard in server.shards
    }

    route_map = [
        RouteMapEntry.from_key_bytes(
            first_key_bytes=shard.shard_first_key,
            server_id=server_id_by_shard_id[shard.shard_id],
        ) for shard in all_shards
    ]

    server_ids = [server.server_id for server in servers]

    this_replica_server_ids = [
        server.server_id for server in servers if server.on_this_replica
    ]

    template_input = {
        'server_ids': server_ids,
        'this_replica_server_ids': this_replica_server_ids,
        'route_map': route_map,
    }
    filter_content = render_lua_template(
        COMPUTE_HEADER_X_REBOOT_SERVER_ID_TEMPLATE_FILENAME, template_input
    )
    return http_connection_manager_pb2.HttpFilter(
        name="reboot.compute_header_x_reboot_server_id",
        typed_config=_lua_any(filter_content),
    )


def _http_filter_mangled_http_path() -> http_connection_manager_pb2.HttpFilter:
    # The contents of the MANGLED_HTTP_PATH_FILENAME Lua file need to still be
    # wrapped in an `envoy_on_request` function, since `routing_filter.lua.j2`
    # also uses the same content.
    filter_content = (
        "function envoy_on_request(request_handle)\n"
        f"{load_lua(MANGLED_HTTP_PATH_FILENAME)}\n"
        "end\n"
    )
    return http_connection_manager_pb2.HttpFilter(
        name="reboot.mangled_http_path",
        typed_config=_lua_any(filter_content),
    )


def _http_filter_remove_json_trailers(
) -> http_connection_manager_pb2.HttpFilter:
    filter_content = load_lua(REMOVE_JSON_TRAILERS_FILENAME)
    return http_connection_manager_pb2.HttpFilter(
        name="reboot.remove_json_trailers",
        typed_config=_lua_any(filter_content),
    )


def _http_filter_cors() -> http_connection_manager_pb2.HttpFilter:
    # TODO(rjh): set the `cors` policy here, instead of in `VirtualHost`; the
    #            latter is deprecated. Share code with `network_managers.py`.
    return http_connection_manager_pb2.HttpFilter(
        name="envoy.filters.http.cors",
        typed_config=any_pack(cors_pb2.Cors()),
    )


GRPC_JSON_TRANSCODER_HTTP_FILTER_NAME = "envoy.filters.http.grpc_json_transcoder"

# For those routes where we don't need the transcoding filter we have
# an empty configuration so it never activates (without this it has
# been shown to confuse the traffic).
EMPTY_GRPC_JSON_TRANSCODER_CONFIG = any_pack(
    transcoder_pb2.GrpcJsonTranscoder(
        # This field's presence is required (the listener will be rejected
        # without it), but we can leave it empty.
        proto_descriptor_bin=b"",
    )
)


def _http_filter_grpc_json_transcoder(
    file_descriptor_set: FileDescriptorSet,
) -> http_connection_manager_pb2.HttpFilter:
    return http_connection_manager_pb2.HttpFilter(
        name=GRPC_JSON_TRANSCODER_HTTP_FILTER_NAME,
        typed_config=any_pack(
            # ATTENTION: if you update any of this, also update the matching
            #            values in `envoy_filter_generator.py` method
            #            `generate_transcoding_filter`.
            # TODO(rjh): either obsolete `generate_transcoding_filter`,
            #            or use it, or share settings at least.
            transcoder_pb2.GrpcJsonTranscoder(
                convert_grpc_status=True,
                print_options=transcoder_pb2.GrpcJsonTranscoder.PrintOptions(
                    add_whitespace=True,
                    always_print_enums_as_ints=False,
                    always_print_primitive_fields=True,
                    preserve_proto_field_names=False,
                ),
                # The gRPC backend would be unhappy to receive
                # non-gRPC `application/json` traffic and would reply
                # with a `503`, which is not a good user experience
                # and not helpful in debugging. In addition, we've
                # observed that that interaction between Envoy and
                # gRPC triggers a bug in one of those two that will
                # cause subsequent valid requests to fail.
                #
                # See: https://github.com/reboot-dev/mono/issues/3074.
                #
                # Instead, simply (correctly) reject invalid
                # `application/json` traffic with a 404.
                request_validation_options=(
                    transcoder_pb2.GrpcJsonTranscoder.RequestValidationOptions(
                        reject_unknown_method=True,
                    )
                ),
                services=[
                    f"{file_descriptor_proto.package}.{service.name}"
                    for file_descriptor_proto in file_descriptor_set.file
                    for service in file_descriptor_proto.service
                ],
                proto_descriptor_bin=file_descriptor_set.SerializeToString(),
            )
        )
    )


def _http_filter_router() -> http_connection_manager_pb2.HttpFilter:
    return http_connection_manager_pb2.HttpFilter(
        name="envoy.filters.http.router",
        typed_config=any_pack(router_pb2.Router()),
    )


def _routes_for_server(
    application_id: ApplicationId,
    server: ServerInfo,
    kind: ClusterKind,
    file_descriptor_set: FileDescriptorSet,
    trust_caller_id: bool,
) -> list[route_components_pb2.Route]:
    # Every server gets routes to the websocket port, the gRPC
    # port, and the HTTP "catchall" port as described below.
    #
    # See corresponding routes for Istio in
    # reboot/controller/network_managers.py.

    cluster_name = _cluster_name(
        application_id=application_id,
        server_id=server.server_id,
        kind=kind,
    )

    server_header_matcher = route_components_pb2.HeaderMatcher(
        name=SERVER_ID_HEADER,
        string_match=string_pb2.StringMatcher(
            exact=server.server_id,
        ),
    )

    if kind == ClusterKind.GRPC:
        return [
            # This route sends all traffic with the
            # 'x-reboot-server-id' header and the 'content-type:
            # application/grpc' header to the gRPC port.
            route_components_pb2.Route(
                match=route_components_pb2.RouteMatch(
                    prefix="/",
                    headers=[
                        server_header_matcher,
                        route_components_pb2.HeaderMatcher(
                            name="content-type",
                            string_match=string_pb2.StringMatcher(
                                exact="application/grpc",
                            ),
                        ),
                    ],
                    grpc=route_components_pb2.RouteMatch.GrpcRouteMatchOptions(
                    ),
                ),
                route=route_components_pb2.RouteAction(
                    cluster=cluster_name,
                    max_stream_duration=route_components_pb2.RouteAction.
                    MaxStreamDuration(grpc_timeout_header_max=ZERO_SECONDS)
                ),
                request_headers_to_remove=(
                    # If we don't trust the caller ID header, remove it
                    # so that the upstream server can't be misled.
                    [CALLER_ID_HEADER] if not trust_caller_id else []
                ),
            ),
            # This route sends all traffic with the
            # 'x-reboot-server-id' header and an exact path of '/'
            # to the gRPC port because currently that is what serves
            # '/'.
            route_components_pb2.Route(
                match=route_components_pb2.RouteMatch(
                    path="/",
                    headers=[server_header_matcher],
                    grpc=route_components_pb2.RouteMatch.GrpcRouteMatchOptions(
                    ),
                ),
                route=route_components_pb2.RouteAction(
                    cluster=cluster_name,
                    max_stream_duration=route_components_pb2.RouteAction.
                    MaxStreamDuration(grpc_timeout_header_max=ZERO_SECONDS)
                ),
            ),
        ] + [
            # These routes send all traffic with the
            # 'x-reboot-server-id' header and a prefix path from
            # the file descriptor set of the application to the gRPC
            # port (where it will get gRPC-JSON transcoded).
            route_components_pb2.Route(
                match=route_components_pb2.RouteMatch(
                    prefix=prefix,
                    headers=[server_header_matcher],
                ),
                route=route_components_pb2.RouteAction(
                    cluster=cluster_name,
                    max_stream_duration=route_components_pb2.RouteAction.
                    MaxStreamDuration(grpc_timeout_header_max=ZERO_SECONDS)
                ),
            ) for prefix in get_path_prefixes_from_file_descriptor_set(
                file_descriptor_set,
            )
            # We skip over the path '/' because we cover it above as
            # an exact path not a prefix here otherwise it would catch
            # everything which we don't want because we want
            # everything else to be caught below for the HTTP port.
            if prefix != "/"
        ]

    elif kind == ClusterKind.HTTP:
        return [
            route_components_pb2.Route(
                match=route_components_pb2.RouteMatch(
                    prefix="/",
                    headers=[server_header_matcher],
                ),
                route=route_components_pb2.RouteAction(
                    cluster=cluster_name,
                    # Set `max_stream_duration` to 0 to disable the timeout for this route.
                    max_stream_duration=route_components_pb2.RouteAction.
                    MaxStreamDuration(grpc_timeout_header_max=ZERO_SECONDS)
                ),
                typed_per_filter_config={
                    GRPC_JSON_TRANSCODER_HTTP_FILTER_NAME:
                        EMPTY_GRPC_JSON_TRANSCODER_CONFIG,
                },
            )
        ]

    assert kind == ClusterKind.WEBSOCKET

    return [
        route_components_pb2.Route(
            match=route_components_pb2.RouteMatch(
                prefix="/",
                headers=[
                    route_components_pb2.HeaderMatcher(
                        name="upgrade",
                        string_match=string_pb2.StringMatcher(
                            exact="websocket",
                        ),
                    ),
                    server_header_matcher,
                ],
            ),
            route=route_components_pb2.RouteAction(
                cluster=cluster_name,
                # TODO: should we also include a `max_stream_duration`
                # here or are the websocket pings sufficient to keep
                # the connection from getting closed?
            ),
            typed_per_filter_config={
                GRPC_JSON_TRANSCODER_HTTP_FILTER_NAME:
                    EMPTY_GRPC_JSON_TRANSCODER_CONFIG,
            },
        )
    ]


def _mcp_frontend_routes() -> list[route_components_pb2.Route]:
    """Routes for web dev server assets ("/__/web/**").

    MCP Apps use a double iframe: the outer `srcdoc` contains an inner
    `<iframe src="/__/web/ui/...">`. This route proxies those requests
    to the web dev server. Envoy handles WebSocket upgrades (for Hot Module Replacement)
    transparently.

    Returns empty list if MCP frontend is not configured.
    """
    config = _get_mcp_frontend_config()
    if config is None:
        return []

    # Route for web dev server assets: "/__/web/**".
    # Dev server is configured with `base: "/__/web/"` so paths match directly.
    web_route = route_components_pb2.Route(
        match=route_components_pb2.RouteMatch(
            prefix="/__/web/",
        ),
        route=route_components_pb2.RouteAction(
            cluster=MCP_FRONTEND_CLUSTER_NAME,
        ),
        typed_per_filter_config={
            GRPC_JSON_TRANSCODER_HTTP_FILTER_NAME:
                EMPTY_GRPC_JSON_TRANSCODER_CONFIG,
        },
    )

    return [web_route]


def _mcp_frontend_cluster() -> cluster_pb2.Cluster | None:
    """Cluster for MCP frontend host (web dev server).

    Returns None if MCP frontend is not configured.
    """
    config = _get_mcp_frontend_config()
    if config is None:
        return None

    return cluster_pb2.Cluster(
        name=MCP_FRONTEND_CLUSTER_NAME,
        type=cluster_pb2.Cluster.STRICT_DNS,
        lb_policy=cluster_pb2.Cluster.ROUND_ROBIN,
        common_http_protocol_options=protocol_pb2.HttpProtocolOptions(
            idle_timeout=ZERO_SECONDS,
        ),
        dns_lookup_family=cluster_pb2.Cluster.V4_ONLY,
        # Frontend is HTTP/1.1 (WebSockets not compatible with HTTP/2).
        load_assignment=endpoint_pb2.ClusterLoadAssignment(
            cluster_name=MCP_FRONTEND_CLUSTER_NAME,
            endpoints=[
                endpoint_components_pb2.LocalityLbEndpoints(
                    lb_endpoints=[
                        endpoint_components_pb2.LbEndpoint(
                            endpoint=endpoint_components_pb2.Endpoint(
                                address=address_pb2.Address(
                                    socket_address=address_pb2.SocketAddress(
                                        address=config.host,
                                        port_value=config.port,
                                    )
                                )
                            )
                        )
                    ],
                )
            ],
        ),
    )


def _mcp_frontend_error_filters(
) -> list[http_connection_manager_pb2.HttpFilter]:
    """Lua filter that replaces envoy's raw 503 for the
    `/__/web/` dev-server route with a friendly HTML page.

    Returns an empty list if MCP frontend is not configured.
    """
    config = _get_mcp_frontend_config()
    if config is None:
        return []

    # The error page shown when envoy can't reach the Vite
    # dev server.
    error_html = (
        '<!DOCTYPE html>'
        '<html lang="en"><head><meta charset="UTF-8">'
        '<meta name="viewport" '
        'content="width=device-width, initial-scale=1.0">'
        '<style>'
        'body{font-family:ui-monospace,SFMono-Regular,Menlo,'
        'monospace;background:#1a1a2e;color:#eee;display:flex;'
        'align-items:center;justify-content:center;'
        'min-height:100vh;margin:0}'
        '.c{text-align:center;padding:2rem}'
        'h2{color:#f87171}'
        'code{background:#0f0f1a;padding:.2rem .5rem;'
        'border-radius:4px;color:#fbbf24}'
        '</style></head><body><div class="c">'
        '<h2>Dev server not reachable</h2>'
        "<p>Couldn't reach the dev web server at "
        '<code>__FRONTEND_URL__</code>.</p>'
        '<p style="margin-top:1rem;opacity:.7">'
        'Is the dev web server running?</p>'
        '</div>'
        '<script>'
        # Send a `size-changed` postMessage so the
        # dev-loader relay (proxy.py) resizes the
        # wrapper to fit this error page.
        'window.parent.postMessage({'
        'jsonrpc:"2.0",'
        'method:"ui/notifications/size-changed",'
        'params:{height:document.body.scrollHeight}'
        '},"*");'
        '</script>'
        '</body></html>'
    ).replace('__FRONTEND_URL__', config.original_url)

    # Lua filter: tag `/__/web/` requests in `envoy_on_request`
    # via dynamic metadata, then intercept 503 responses and
    # replace the body.
    lua_source = (
        'function envoy_on_request(request_handle)\n'
        '  local p = request_handle:headers():get(":path")'
        ' or ""\n'
        '  if string.sub(p, 1, 8) == "/__/web/" then\n'
        '    request_handle:streamInfo():dynamicMetadata()'
        ':set("reboot", "mcp_frontend_request", "1")\n'
        '  end\n'
        'end\n'
        '\n'
        'function envoy_on_response(response_handle)\n'
        '  local md = response_handle:streamInfo()'
        ':dynamicMetadata():get("reboot")\n'
        '  if md and md["mcp_frontend_request"] == "1" and\n'
        '     response_handle:headers():get(":status")'
        ' == "503" then\n'
        '    response_handle:headers():replace(\n'
        '      "content-type", "text/html; charset=utf-8")\n'
        '    response_handle:body():setBytes([=[\n' + error_html + '\n'
        '    ]=])\n'
        '  end\n'
        'end\n'
    )

    return [
        http_connection_manager_pb2.HttpFilter(
            name="reboot.mcp_frontend_error_page",
            typed_config=_lua_any(lua_source),
        )
    ]


def _filter_http_connection_manager(
    application_id: ApplicationId,
    servers: list[ServerInfo],
    file_descriptor_set: FileDescriptorSet,
    trust_caller_id: bool,
) -> listener_components_pb2.Filter:
    http_connection_manager = http_connection_manager_pb2.HttpConnectionManager(
        stat_prefix="grpc_json",
        stream_idle_timeout=ZERO_SECONDS,
        upgrade_configs=[
            http_connection_manager_pb2.HttpConnectionManager.UpgradeConfig(
                upgrade_type="websocket",
            ),
        ],
        # This is the configuration for a _local_ envoy. It will never
        # have a trusted (mTLS) connection with a peer. However, it may
        # sit behind other proxies that DO have mTLS connections. Don't
        # drop the `x-forwarded-client-cert` header if it exists.
        forward_client_cert_details=(
            http_connection_manager_pb2.HttpConnectionManager.
            ForwardClientCertDetails.ALWAYS_FORWARD_ONLY
        ),
        # TODO(rjh): this is a duration; but leaving out is the same as 0s, presumably?
        # stream_idle_timeout="0s",
        codec_type=http_connection_manager_pb2.HttpConnectionManager.AUTO,
        route_config=route_pb2.RouteConfiguration(
            name="local_route",
            virtual_hosts=[
                route_components_pb2.VirtualHost(
                    name="local_service",
                    domains=["*"],
                    # TODO(rjh): setting the `cors` policy here is deprecated,
                    #            instead we should set it directly on the
                    #            `envoy.filters.http.cors` filter in the filter
                    #            chain.
                    cors=route_components_pb2.CorsPolicy(
                        allow_origin_string_match=[
                            string_pb2.StringMatcher(
                                safe_regex=regex_pb2.RegexMatcher(
                                    # TODO(rjh): deprecated; can remove?
                                    google_re2=regex_pb2.RegexMatcher.
                                    GoogleRE2(),
                                    regex="\\*",
                                ),
                            )
                        ],
                        allow_methods="GET, PUT, DELETE, POST, OPTIONS",
                        allow_headers=
                        f"{APPLICATION_ID_HEADER},{STATE_REF_HEADER},{SERVER_ID_HEADER},{IDEMPOTENCY_KEY_HEADER},{WORKFLOW_ID_HEADER},keep-alive,user-agent,cache-control,content-type,content-transfer-encoding,x-accept-content-transfer-encoding,x-accept-response-streaming,x-user-agent,grpc-timeout,{AUTHORIZATION_HEADER}",
                        max_age="1728000",
                        expose_headers="grpc-status,grpc-message",
                    ),
                    routes=(
                        # MCP frontend routes (if configured) must come
                        # first since they match specific prefixes.
                        _mcp_frontend_routes() + [
                            route for server in servers for kind in [
                                # Always list the route for the websocket
                                # first, since its matching is more specific.
                                ClusterKind.WEBSOCKET,
                                ClusterKind.GRPC,
                                ClusterKind.HTTP,
                            ] for route in _routes_for_server(
                                application_id=application_id,
                                server=server,
                                kind=kind,
                                file_descriptor_set=file_descriptor_set,
                                trust_caller_id=trust_caller_id,
                            )
                        ]
                    ),
                ),
            ],
        ),
        http_filters=[
            # Add the remove json trailers filter first so it's the last to
            # process responses (after transcoding and all other filters).
            # Response filters are processed in reverse order.
            _http_filter_remove_json_trailers(),
            _http_filter_add_header_x_reboot_application_id(application_id),
            # Before picking a server, we need to possibly de-mangle the path
            # to extract any relevant headers.
            _http_filter_mangled_http_path(),
            _http_filter_compute_header_x_reboot_server_id(servers),
            # Define CORS filter before the gRPC-JSON transcoding
            # filter, because otherwise perfectly-fine CORS requests
            # get rejected by the gRPC-JSON transcoding filter.
            _http_filter_cors(),
            # The gRPC-JSON transcoder filter comes before routing,
            # but note that we also need to override it for websocket
            # routes via a per-route config because otherwise it has
            # been shown to confuse traffic.
            _http_filter_grpc_json_transcoder(
                file_descriptor_set=file_descriptor_set,
            ),
        ] +
        # Friendly error page when the MCP web dev server
        # is unreachable (only active when configured).
        _mcp_frontend_error_filters() + [
            _http_filter_router(),
        ]
    )

    return listener_components_pb2.Filter(
        name="envoy.filters.network.http_connection_manager",
        typed_config=any_pack(http_connection_manager),
    )


def _tls_socket(
    certificate_path: Path, key_path: Path
) -> base_pb2.TransportSocket:
    return base_pb2.TransportSocket(
        name="envoy.transport_sockets.tls",
        typed_config=any_pack(
            tls_pb2.DownstreamTlsContext(
                common_tls_context=tls_pb2.CommonTlsContext(
                    alpn_protocols=["h2"],
                    tls_certificates=[
                        common_pb2.TlsCertificate(
                            certificate_chain=base_pb2.DataSource(
                                filename=str(certificate_path),
                            ),
                            private_key=base_pb2.DataSource(
                                filename=str(key_path),
                            ),
                        ),
                    ],
                    validation_context=common_pb2.CertificateValidationContext(
                        trusted_ca=base_pb2.DataSource(
                            filename=str(certificate_path),
                        ),
                    ),
                ),
            )
        ),
    )


def listeners(
    application_id: ApplicationId,
    servers: list[ServerInfo],
    file_descriptor_set: FileDescriptorSet,
    trusted_host: str,
    trusted_port: int,  # 0 = pick any free port.
    public_port: int,
    use_tls: bool,
    certificate_path: Path,
    key_path: Path,
) -> list[listener_pb2.Listener]:

    @dataclass
    class ListenerConfig:
        name: str
        host: str
        port: int
        use_tls: bool
        trust_caller_id: bool

    listeners = [
        # The public listener takes traffic from anywhere (which may
        # be TLS-encrypted) on the port specified by the user.
        ListenerConfig(
            name="public",
            host="0.0.0.0",
            port=public_port,
            use_tls=use_tls,
            # On the Reboot Cloud, proxies ensure that the caller ID is
            # set truthfully. Outside Reboot Cloud we can't trust public
            # traffic to not be lying about its caller ID.
            trust_caller_id=on_cloud(),
        ),
        # The trusted port takes traffic only from the local application
        # - no TLS is needed, nor supported.
        ListenerConfig(
            name="trusted",
            host=trusted_host,
            port=trusted_port,
            use_tls=False,
            trust_caller_id=True,
        ),
    ]

    return [
        listener_pb2.Listener(
            name=listener.name,
            address=address_pb2.Address(
                socket_address=address_pb2.SocketAddress(
                    address=listener.host,
                    port_value=listener.port,
                ),
            ),
            filter_chains=[
                listener_components_pb2.FilterChain(
                    filters=[
                        _filter_http_connection_manager(
                            application_id=application_id,
                            servers=servers,
                            file_descriptor_set=file_descriptor_set,
                            trust_caller_id=listener.trust_caller_id,
                        ),
                    ],
                    transport_socket=_tls_socket(certificate_path, key_path)
                    if listener.use_tls else None,
                )
            ],
            # See: https://github.com/reboot-dev/mono/issues/3944.
            per_connection_buffer_limit_bytes=UInt32Value(
                value=MAX_GRPC_RESPONSE_SIZE_BYTES
            ),
        ) for listener in listeners
    ]


def _cluster_name(
    application_id: ApplicationId, server_id: ServerId, kind: ClusterKind
) -> str:
    # There are two forms the `ServerId`s can take here, neither of which may
    # be what you might expect:
    #
    # A) If there are multiple servers, server IDs are of the shape
    #    `[application-id]-[server-id]`, e.g. `foo-c123456`.
    #
    # B) If there is only a single server, the server ID is the
    #    application ID.
    #
    # This is a leftover of how local server management and Kubernetes
    # server management used to overlap.
    #
    # TODO(rjh): sanify the 'application_id' and 'server_id' relationship.
    #            We'd expect a server ID to be e.g. `c123456`.
    assert (
        server_id.startswith(f"{application_id}-") or
        server_id == application_id
    ), f"invalid server ID '{server_id}'"

    if kind == ClusterKind.GRPC:
        return f"{server_id}_grpc"

    elif kind == ClusterKind.HTTP:
        return f"{server_id}_http"

    else:
        assert (kind == ClusterKind.WEBSOCKET)
        return f"{server_id}_websocket"


def _cluster(
    application_id: ApplicationId,
    server_id: ServerId,
    host: str,
    port: int,
    kind: ClusterKind,
) -> cluster_pb2.Cluster:
    cluster_name = _cluster_name(application_id, server_id, kind)
    return cluster_pb2.Cluster(
        name=cluster_name,
        type=cluster_pb2.Cluster.STRICT_DNS,
        lb_policy=cluster_pb2.Cluster.ROUND_ROBIN,
        common_http_protocol_options=protocol_pb2.HttpProtocolOptions(
            idle_timeout=ZERO_SECONDS,
        ),
        dns_lookup_family=cluster_pb2.Cluster.V4_ONLY,
        # Setting empty HTTP2 protocol options is required to encourage Envoy to
        # use HTTP2 when talking to the upstream, so we MUST set this for gRPC
        # traffic - and for gRPC traffic ONLY, because websockets are NOT HTTP2.
        # TODO(rjh): this field is deprecated; migrate to
        #            `typed_extension_protocol_options`:
        #            https://github.com/envoyproxy/envoy/blob/45e0325f8d7ddf64a396798803a3fb7e6717257a/api/envoy/config/cluster/v3/cluster.proto#L927
        http2_protocol_options=protocol_pb2.Http2ProtocolOptions()
        if kind == ClusterKind.GRPC else None,
        load_assignment=endpoint_pb2.ClusterLoadAssignment(
            cluster_name=cluster_name,
            endpoints=[
                endpoint_components_pb2.LocalityLbEndpoints(
                    lb_endpoints=[
                        endpoint_components_pb2.LbEndpoint(
                            endpoint=endpoint_components_pb2.Endpoint(
                                address=address_pb2.Address(
                                    socket_address=address_pb2.SocketAddress(
                                        address=host,
                                        port_value=port,
                                    )
                                )
                            )
                        )
                    ],
                )
            ],
        ),
        # "Disable" all circuit breakers; they don't make much sense when all
        # traffic will flow to the host we're already on. Follows the pattern
        # suggested here: Follows the pattern suggested here:
        #   https://www.envoyproxy.io/docs/envoy/latest/faq/load_balancing/disable_circuit_breaking
        circuit_breakers=circuit_breaker_pb2.CircuitBreakers(
            thresholds=[
                circuit_breaker_pb2.CircuitBreakers.Thresholds(
                    priority=base_pb2.RoutingPriority.DEFAULT,
                    max_connections=UInt32Value(value=1000000000),
                    max_pending_requests=UInt32Value(value=1000000000),
                    max_requests=UInt32Value(value=1000000000),
                    max_retries=UInt32Value(value=1000000000),
                ),
                circuit_breaker_pb2.CircuitBreakers.Thresholds(
                    priority=base_pb2.RoutingPriority.HIGH,
                    max_connections=UInt32Value(value=1000000000),
                    max_pending_requests=UInt32Value(value=1000000000),
                    max_requests=UInt32Value(value=1000000000),
                    max_retries=UInt32Value(value=1000000000),
                ),
            ]
        ),
        # See: https://github.com/reboot-dev/mono/issues/3944.
        per_connection_buffer_limit_bytes=UInt32Value(
            value=MAX_GRPC_RESPONSE_SIZE_BYTES
        ),
    )


def clusters(
    application_id: ApplicationId,
    servers: list[ServerInfo],
) -> list[cluster_pb2.Cluster]:
    result: list[cluster_pb2.Cluster] = []

    # Add MCP frontend cluster if configured.
    frontend_cluster = _mcp_frontend_cluster()
    if frontend_cluster is not None:
        result.append(frontend_cluster)

    for server in servers:
        # Every server serves both a gRPC and a WebSocket endpoint, on
        # different ports. They are therefore different clusters to Envoy.
        for kind in [
            ClusterKind.GRPC, ClusterKind.HTTP, ClusterKind.WEBSOCKET
        ]:
            result.append(
                _cluster(
                    application_id=application_id,
                    server_id=server.server_id,
                    host=server.address.host,
                    port=(
                        server.address.grpc_port
                        if kind == ClusterKind.GRPC else (
                            server.address.http_port if kind ==
                            ClusterKind.HTTP else server.address.websocket_port
                        )
                    ),
                    kind=kind,
                )
            )

    return result


def xds_cluster(
    host: str,
    port: int,
) -> cluster_pb2.Cluster:
    return cluster_pb2.Cluster(
        name="xds_cluster",
        type=cluster_pb2.Cluster.STRICT_DNS,
        dns_lookup_family=cluster_pb2.Cluster.V4_ONLY,
        load_assignment=endpoint_pb2.ClusterLoadAssignment(
            cluster_name="xds_cluster", endpoints=[
                endpoint_components_pb2.LocalityLbEndpoints(
                    lb_endpoints=[
                        endpoint_components_pb2.LbEndpoint(
                            endpoint=endpoint_components_pb2.Endpoint(
                                address=address_pb2.Address(
                                    socket_address=address_pb2.SocketAddress(
                                        address=host,
                                        port_value=port,
                                    )
                                )
                            )
                        )
                    ],
                )
            ]
        ),
        typed_extension_protocol_options={
            "envoy.extensions.upstreams.http.v3.HttpProtocolOptions":
                any_pack(
                    http_protocol_options_pb2.HttpProtocolOptions(
                        explicit_http_config=http_protocol_options_pb2.
                        HttpProtocolOptions.ExplicitHttpConfig(
                            # We must set this field explicitly (even to
                            # its default), since it's part of a oneof.
                            http2_protocol_options=protocol_pb2.
                            Http2ProtocolOptions(),
                        )
                    )
                )
        },
    )
