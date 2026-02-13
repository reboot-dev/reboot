from __future__ import annotations

import asyncio
import grpc
import grpc.aio
import json
import math
import os
import rebootdev.aio.tracing
import shutil
import yaml
from abc import ABC, abstractmethod
from envoy.config.bootstrap.v3 import bootstrap_pb2
from envoy.config.core.v3 import base_pb2, config_source_pb2, grpc_service_pb2
from envoy.config.listener.v3 import listener_pb2
from envoy.service.discovery.v3 import ads_pb2_grpc
from google.protobuf.descriptor_pb2 import FileDescriptorSet
from google.protobuf.json_format import MessageToDict
from grpc_health.v1 import health_pb2, health_pb2_grpc
from pathlib import Path
from reboot.routing import envoy_config
from reboot.routing.envoy_config import ServerInfo
from reboot.routing.xds_server import AggregatedDiscoveryServiceServicer
from rebootdev.aio.headers import SERVER_ID_HEADER
from rebootdev.aio.types import ApplicationId, ServerId
from rebootdev.ssl.localhost import (
    LOCALHOST_CRT,
    LOCALHOST_CRT_DATA,
    LOCALHOST_KEY,
)
from typing import Optional

CONFIG_FILENAME = "envoy.yaml"
CERTIFICATE_FILENAME = "cert.pem"
KEY_FILENAME = "key.pem"

CERTIFICATE_FILENAME = "tls.crt"
KEY_FILENAME = "tls.key"


class LocalEnvoy(ABC):
    """
    Wrapper class for setting up a local Envoy outside of Kubernetes. Depending
    on the chosen subclass this may run Envoy in a Docker container, or as a
    standalone process.

    The user of this class is responsible for calling .start() and .stop().
    """

    def __init__(
        self,
        admin_listen_host: str,
        admin_port: int,  # May be 0.
        xds_listen_host: str,
        xds_connect_host: str,
        trusted_host: str,
        trusted_port: int,
        public_port: int,
        application_id: ApplicationId,
        file_descriptor_set: FileDescriptorSet,
        use_tls: bool,
        observed_dir: Path,
    ):
        self._admin_listen_host = admin_listen_host
        self._admin_port = admin_port
        self._xds_listen_host = xds_listen_host
        self._xds_connect_host = xds_connect_host
        self._trusted_host = trusted_host
        # Store the requested ports for use in xDS listener configs. These
        # may be 0 for dynamic allocation, and the xDS config should always
        # use these values (not the actual bound ports) to avoid Envoy
        # seeing the listener "move" to a different port.
        self._requested_trusted_port = trusted_port
        self._requested_public_port = public_port
        # The actual ports will be set by subclasses after discovering them.
        # For subclasses that don't use dynamic ports, these will equal the
        # requested ports.
        self._trusted_port = trusted_port
        self._public_port = public_port
        self._application_id = application_id
        self._file_descriptor_set = file_descriptor_set
        self._use_tls = use_tls
        self._observed_dir = observed_dir

        self._grpc_server = grpc.aio.server()
        self._register_xds_port()

        self._servicer = AggregatedDiscoveryServiceServicer(
            clusters=[],
            # Initialize our xDS servicer with `listeners` so that our
            # connecting Envoy at least gets a port it should listen
            # to, otherwise any Envoy connecting will have no
            # configuration at all.
            listeners=self._get_listeners_from_servers([]),
        )
        ads_pb2_grpc.add_AggregatedDiscoveryServiceServicer_to_server(
            self._servicer, self._grpc_server
        )

    def _register_xds_port(self):
        """
        Pick a port for the xDS server to listen on.

        Factored out as a separate method so that tests can override it.
        """
        self._xds_port = self._grpc_server.add_insecure_port(
            f"{self._xds_listen_host}:0"
        )

    @property
    @abstractmethod
    def public_port(self) -> int:
        raise NotImplementedError()

    @property
    @abstractmethod
    def trusted_port(self) -> int:
        raise NotImplementedError()

    @abstractmethod
    async def _start(self) -> None:
        raise NotImplementedError()

    @abstractmethod
    async def _stop(self) -> None:
        raise NotImplementedError()

    @rebootdev.aio.tracing.function_span()
    async def start(self) -> None:
        await self._grpc_server.start()
        await self._start()
        self._started = True

    async def stop(self) -> None:
        self._started = False
        await self._stop()
        await self._grpc_server.stop(0)
        await self._grpc_server.wait_for_termination()

    @rebootdev.aio.tracing.function_span()
    async def set_servers(self, servers: list[ServerInfo]):
        await self._servicer.set_config(
            clusters=envoy_config.clusters(
                application_id=self._application_id,
                servers=servers,
            ),
            listeners=self._get_listeners_from_servers(servers),
            # NOTE: when using a `LocalEnvoy` we're expecting only _one_
            # actual Envoy to be an XDS client and get the config. Ideally
            # when code calls `set_servers` it wants to know that
            # Envoy has gotten the config and thus we want to wait until
            # the XDS servicer has "set the config on at least one
            # client".
            #
            # If we don't by default "wait" for the Envoy to get the
            # config then it's possible that a test, running in the same
            # OS process, may block the main thread such that it starves
            # the event loop before the Envoy has connected and gotten the
            # configuration causing the test to "deadlock" because it
            # doesn't have an Envoy that it can route requests to.
            #
            # The downside of having to "wait" for the Envoy to get the
            # config is that it eliminates possible things we could do in
            # parallel during `rbt dev` application start up, which we
            # want to make as quick as possible.
            #
            # TODO: while this technically "resolves" #3908, we might
            # choose to resolve it differently in the future by changing
            # the architecture thus making waiting unnecessary.
            wait_until_at_least_one_client=True,
        )

    def _get_listeners_from_servers(
        self,
        servers: list[envoy_config.ServerInfo],
    ) -> list[listener_pb2.Listener]:
        return envoy_config.listeners(
            application_id=self._application_id,
            servers=servers,
            file_descriptor_set=self._file_descriptor_set,
            trusted_host=self._trusted_host,
            # Use the requested ports (which may be 0 for dynamic
            # allocation) rather than the actual bound ports. This
            # ensures the xDS listener config doesn't change when we
            # discover the actual ports; Envoy would reject the update
            # to explicit port numbers, since instead of a NOOP update
            # it sees those as defining new listeners asking for ports
            # that are already in use.
            trusted_port=self._requested_trusted_port,
            public_port=self._requested_public_port,
            use_tls=self._use_tls,
            certificate_path=self._observed_dir / CERTIFICATE_FILENAME,
            key_path=self._observed_dir / KEY_FILENAME,
        )

    def _generate_envoy_yaml(self) -> str:
        xds_cluster = envoy_config.xds_cluster(
            self._xds_connect_host,
            self._xds_port,
        )
        config = bootstrap_pb2.Bootstrap(
            node=base_pb2.Node(
                id="envoy_node",
                cluster="envoy_cluster",
            ),
            static_resources=bootstrap_pb2.Bootstrap.StaticResources(
                clusters=[xds_cluster],
            ),
            dynamic_resources=bootstrap_pb2.Bootstrap.DynamicResources(
                ads_config=config_source_pb2.ApiConfigSource(
                    api_type=config_source_pb2.ApiConfigSource.GRPC,
                    transport_api_version=config_source_pb2.ApiVersion.V3,
                    grpc_services=[
                        grpc_service_pb2.GrpcService(
                            envoy_grpc=grpc_service_pb2.GrpcService.EnvoyGrpc(
                                cluster_name=xds_cluster.name
                            )
                        )
                    ],
                ),
                lds_config=config_source_pb2.ConfigSource(
                    # Left to default (in fact has no fields), but important to
                    # set the oneof.
                    ads=config_source_pb2.AggregatedConfigSource(),
                ),
                cds_config=config_source_pb2.ConfigSource(
                    # Left to default (in fact has no fields), but important to
                    # set the oneof.
                    ads=config_source_pb2.AggregatedConfigSource(),
                )
            ),
        )

        # The admin interface is used for debugging and monitoring.
        config.admin.address.socket_address.address = self._admin_listen_host
        config.admin.address.socket_address.port_value = self._admin_port

        # If dumping directly from dict to YAML, the YAML library insists on
        # outputting `!!python/object/apply:collections.OrderedDict` annotations
        # for the `Any` fields in the proto. This is a workaround to avoid that.
        config_dict = json.loads(
            json.dumps(
                MessageToDict(
                    config,
                    preserving_proto_field_name=True,
                    # There are many fields we leave set to the default; we
                    # didn't use to spell (most of) them out in the hand-written
                    # YAML, so we also don't want to spell them out in the
                    # proto-generated YAML.
                    always_print_fields_with_no_presence=False,
                )
            )
        )
        return yaml.safe_dump(config_dict, sort_keys=True)

    def _write_envoy_dir(
        self,
        *,
        # The path at which this function should write the Envoy configuration.
        output_dir: Path,
        certificate: Optional[Path],
        key: Optional[Path],
    ) -> Path:
        """
        Generates a directory with all the required config needed to run
        Envoy.

        Returns the path to the generated 'envoy.yaml' file that should be
        passed to Envoy as a parameter.
        """

        # Our config depends on the appropriate SSL certificate being
        # available in the Envoy's config directory.
        if self._use_tls:
            shutil.copyfile(
                certificate or LOCALHOST_CRT,
                output_dir / CERTIFICATE_FILENAME,
            )
            shutil.copyfile(
                key or LOCALHOST_KEY,
                output_dir / KEY_FILENAME,
            )

        # Our config depends on the Lua SHA1 library being available at `sha1/`.
        source_dir = Path(os.path.dirname(__file__))
        sha1_source_dir = source_dir / "sha1" / "src" / "sha1"
        sha1_in_output_dir = output_dir / "sha1"
        shutil.copytree(sha1_source_dir, sha1_in_output_dir)

        envoy_yaml_contents = self._generate_envoy_yaml()

        envoy_yaml_in_output = output_dir / CONFIG_FILENAME
        envoy_yaml_in_output.write_text(envoy_yaml_contents)

        # If the files we've just created are bind-mounted into a Docker
        # container, they may be accessed by a different user than our current
        # one. Make sure they're readable. To not block ourselves from deleting
        # these files after Envoy is done, keep them writable for ourselves.
        #
        # TODO(rjh): rather than doing this work here, perhaps it would be less
        # brittle (i.e. no local fs changes) to use `docker create`+`docker cp`+
        # `docker start` instead of `docker run` in the Docker-specific local
        # envoy class.
        for root, dirs, files in os.walk(output_dir):
            os.chmod(root, 0o755)
            for dir_ in dirs:
                os.chmod(os.path.join(root, dir_), 0o755)
            for file_ in files:
                os.chmod(os.path.join(root, file_), 0o755)

        return self._observed_dir / CONFIG_FILENAME

    async def _wait_for_localhost_direct_grpc_health_check(
        self, server_id: ServerId
    ):
        # This method should only be called if the caller is confident that this
        # instance uses a `localhost.direct` SSL certificate.
        #
        # Using the 'dev' subdomain as a workaround for a gRPC
        # bug that produces log message error about not
        # matching the entry (*.localhost.direct) in the
        # certificate if we just use 'localhost.direct'. See
        # https://github.com/reboot-dev/mono/issues/2305
        target = f'dev.localhost.direct:{self.public_port}'
        metadata = ((SERVER_ID_HEADER, server_id),)
        while True:
            async with grpc.aio.secure_channel(
                target,
                grpc.ssl_channel_credentials(
                    root_certificates=LOCALHOST_CRT_DATA,
                ),
            ) as channel:
                stub = health_pb2_grpc.HealthStub(channel)
                request = health_pb2.HealthCheckRequest()
                try:
                    response = await stub.Check(request, metadata=metadata)
                    if response.status == health_pb2.HealthCheckResponse.SERVING:
                        break
                except grpc.aio.AioRpcError:
                    await asyncio.sleep(0.05)


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
