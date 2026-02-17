from __future__ import annotations

import asyncio
import base64
import dataclasses
import os
import pickle
import reboot.aio.tracing
import reboot.nodejs.python
import signal
import subprocess
import sys
import tempfile
import threading
import time
import traceback
from dataclasses import dataclass
from google.protobuf import json_format
from pathlib import Path
from rbt.v1alpha1 import database_pb2, placement_planner_pb2
from reboot.aio.auth.token_verifiers import TokenVerifier
from reboot.aio.contexts import EffectValidation
from reboot.aio.exceptions import InputError
from reboot.aio.http import WebFramework
from reboot.aio.internals.application_metadata import ApplicationMetadata
from reboot.aio.monitoring import monitor_event_loop
from reboot.aio.placement import PlanOnlyPlacementClient
from reboot.aio.resolvers import StaticResolver
from reboot.aio.servers import ServiceServer
from reboot.aio.servicers import Serviceable
from reboot.aio.state_managers import SidecarStateManager
from reboot.aio.types import ApplicationId, RoutableAddress, ServerId
from reboot.controller.servers import ServerSpec
from reboot.controller.settings import (
    ENVVAR_REBOOT_REPLICA_CONFIG,
    ENVVAR_REBOOT_REPLICA_INDEX,
)
from reboot.naming import ensure_valid_application_id
from reboot.routing.envoy_config import ServerAddress, ServerInfo
from reboot.run_environments import on_cloud
from reboot.server.local_envoy import LocalEnvoy
from reboot.server.local_envoy_factory import LocalEnvoyFactory
from reboot.settings import (
    ENVVAR_NODEJS_SERVER_BASE64_ARGS,
    ENVVAR_PYTHON_SERVER,
    ENVVAR_PYTHON_SERVER_BASE64_ARGS,
    ENVVAR_RBT_EFFECT_VALIDATION,
    ENVVAR_RBT_NODEJS,
    EVERY_LOCAL_NETWORK_ADDRESS,
)
from typing import Awaitable, Callable, Optional, Sequence


def get_deployment_name(server_id: ServerId) -> str:
    return f'{server_id}'


def get_service_name(server_id: ServerId) -> str:
    return f'{server_id}'


class ServerManager:

    def __init__(self):
        # Dict mapping server name to Server info.
        self.current_servers: dict[ServerId, ServerSpec] = {}

    async def _set_server(
        self,
        server: ServerSpec,
    ) -> placement_planner_pb2.Server.Address:
        """
        Make a server and returns its address. If a server with the same
        name already exists, overwrite it with the new config (if the config
        hasn't changed, this can and should be a no-op.)
        """
        raise NotImplementedError()

    async def _delete_server(
        self,
        server: ServerSpec,
    ) -> None:
        """Delete the given server from the system."""
        raise NotImplementedError()

    @reboot.aio.tracing.function_span()
    async def set_servers(
        self,
        planned_servers: Sequence[ServerSpec],
    ) -> list[placement_planner_pb2.Server]:
        """
        Takes a list of planned servers, makes it so that these servers
        exist in the real world, and returns a list of `Server` objects that
        contain the addresses of those running servers.
        """
        new_server_protos: list[placement_planner_pb2.Server] = []
        new_servers_dict: dict[ServerId, ServerSpec] = {}

        async def _set_server_task(server: ServerSpec):
            server_address = await self._set_server(server)

            # Add a new server, or update the existing server (if any).
            server_proto = placement_planner_pb2.Server(
                id=server.id,
                application_id=server.application_id,
                revision_number=server.revision_number,
                address=server_address,
                namespace=server.namespace or "",
                file_descriptor_set=server.file_descriptor_set,
                reboot_version=server.reboot_version,
            )
            new_server_protos.append(server_proto)
            new_servers_dict[server.id] = server

        set_server_tasks: list[asyncio.Task] = []

        for server in planned_servers:
            set_server_tasks.append(
                asyncio.create_task(_set_server_task(server))
            )

        # The result of task might be 'None' or an exception.
        exception_list = await asyncio.gather(
            *set_server_tasks,
            return_exceptions=True,
        )

        # If there was an exception, raise it. Note that there might be more than one
        # exception with different types, but the most likely case is that they are
        # all somewhat similar.
        for exception in exception_list:
            if exception is not None:
                raise exception

        # Go through and delete servers that are no longer part of the plan.
        delete_server_tasks = []

        for server_id, server in self.current_servers.items():
            if server_id not in new_servers_dict:
                delete_server_tasks.append(
                    asyncio.create_task(self._delete_server(server))
                )

        await asyncio.gather(*delete_server_tasks)

        self.current_servers = new_servers_dict
        return new_server_protos


async def _run_server_process(
    *,
    application_id: ApplicationId,
    server_id: ServerId,
    shards: list[database_pb2.ShardInfo],
    address: str,
    database_address: str,
    serviceables: list[Serviceable],
    web_framework: WebFramework,
    placement_planner_address: RoutableAddress,
    envoy_trusted_address: Optional[str],
    token_verifier: Optional[TokenVerifier],
    fifo: Path,
    effect_validation: EffectValidation,
):
    """Helper that runs an instance of a server in its own process.
    """
    placement_client: Optional[PlanOnlyPlacementClient] = None
    state_manager: Optional[SidecarStateManager] = None
    server: Optional[ServiceServer] = None

    # Since we've just started a new process, we must start any tracers.
    reboot.aio.tracing.start(server_id=server_id)

    # This is the entrypoint for a server process; we monitor
    # its event loop.
    monitor_event_loop_task = asyncio.create_task(
        monitor_event_loop(server_id=server_id)
    )
    try:
        placement_client = PlanOnlyPlacementClient(placement_planner_address)
        await placement_client.start()

        resolver = StaticResolver(envoy_trusted_address)

        state_manager = SidecarStateManager(
            database_address=database_address,
            serviceables=serviceables,
            shards=shards,
            placement_client=placement_client,
            application_id=application_id,
        )

        # Pass a port of 0 to allow the Server to pick its own
        # (unused) port.
        server = ServiceServer(
            application_id=application_id,
            server_id=server_id,
            serviceables=serviceables,
            web_framework=web_framework,
            listen_address=address,
            token_verifier=token_verifier,
            state_manager=state_manager,
            placement_client=placement_client,
            actor_resolver=resolver,
            effect_validation=effect_validation,
        )

        await server.start()

        # If the server doesn't have an Envoy to talk to, it must be the
        # only server in the application. In that case it should always
        # talk to itself directly.
        if envoy_trusted_address is None:
            resolver.update(f'localhost:{server.port()}')

        # Communicate the ports back to the caller.
        #
        # NOTE: we want to send a tuple of ports _or_ an exception
        # (see below) which we can do via `pickle`, but since we won't
        # know the size of the data we first encode the data into
        # Base64 and then append a '\n' to demarcate the "end".

        fifo.write_text(
            base64.b64encode(
                pickle.dumps(
                    (
                        server.port(),
                        server.websocket_port(),
                        server.http_port(),
                    )
                ),
            ).decode('utf-8') + '\n'
        )
    except Exception as e:
        # NOTE: passing exceptions across a process will lose the trace
        # information so we pass it as an argument to `InputError`.
        stack_trace = ''.join(traceback.format_exception(e))

        # If we already have an `InputError`, just attach the stack to
        # it here.
        if isinstance(e, InputError):
            e.stack_trace = stack_trace

        if on_cloud():
            # Emulate `traceback.print_exc()` by printing the
            # error to `sys.stderr`.
            print(stack_trace, file=sys.stderr)

        # We failed to communicate a port to the caller, so instead we'll
        # communicate the error back to the caller.
        fifo.write_text(
            # See comment above for why we are pickling + Base64 encoding.
            base64.b64encode(
                pickle.dumps(
                    e if isinstance(e, InputError) else InputError(
                        reason=f"Failed to start server {server_id}",
                        causing_exception=e,
                        stack_trace=stack_trace,
                    )
                )
            ).decode('utf-8') + '\n'
        )

        # NOTE: we don't re-raise the error here as it adds a lot
        # of cruft to the output and may get interleaved with
        # other output making it hard to parse.
    else:
        # TODO(benh): catch other errors and propagate them back
        # to the error as well.
        await server.wait()
    finally:
        if server is not None:
            await server.stop()
            await server.wait()

        if state_manager is not None:
            await state_manager.shutdown_and_wait()

        if placement_client is not None:
            await placement_client.stop()

        monitor_event_loop_task.cancel()

        try:
            await monitor_event_loop_task
        except asyncio.CancelledError:
            pass


async def run_nodejs_server_process(
    *,
    serviceables: list[Serviceable],
    web_framework: WebFramework,
    token_verifier: Optional[TokenVerifier],
):
    """Entry point for a nodejs based server subprocess.

    We extract pickled args to pass to `_run_server_process` from
    the environment, and then send the assigned ports back to the
    parent process via nodejs IPC that comes as part of using their
    `fork()` primitive (not to be confused with an POSIX `fork`, this
    does not "clone" but creates a full child process.

    NOTE: We do not attempt to pickle any user-defined TypeScript types:
    instead, we allow them to be re-created in the subprocess, and then
    be passed as arguments to this method. See #2911 about reducing
    complexity here.
    """
    base64_args = os.getenv(ENVVAR_NODEJS_SERVER_BASE64_ARGS)

    assert base64_args is not None

    args = pickle.loads(base64.b64decode(base64_args.encode()))

    # We must load the server info from a file, since it was too big
    # to fit in an environment variable. See comment in
    # `_launch_nodejs_subprocess_server`.
    server_info = database_pb2.ServerInfo()
    server_info_file = args.pop('server_info_file')
    with open(server_info_file, 'rb') as f:
        server_info.ParseFromString(f.read())
    args['shards'] = list(server_info.shard_infos)

    await _run_server_process(
        serviceables=serviceables,
        web_framework=web_framework,
        token_verifier=token_verifier,
        **args,
    )


async def run_python_server_process(
    *,
    serviceables: list[Serviceable],
    web_framework: WebFramework,
    token_verifier: Optional[TokenVerifier],
):
    """Entry point for a Python based server subprocess.

    We extract pickled args to pass to `_run_server_process`
    from the environment. User-defined types (serviceables,
    web_framework, token_verifier) are re-created by
    re-running the user's `main.py`, not pickled.
    """
    base64_args = os.getenv(ENVVAR_PYTHON_SERVER_BASE64_ARGS)

    assert base64_args is not None

    args = pickle.loads(base64.b64decode(base64_args.encode()))

    # Load the server info from a file, since it was too
    # big to fit in an environment variable. See comment in
    # `_launch_python_subprocess_server`.
    server_info = database_pb2.ServerInfo()
    server_info_file = args.pop('server_info_file')
    with open(server_info_file, 'rb') as f:
        server_info.ParseFromString(f.read())
    args['shards'] = list(server_info.shard_infos)

    await _run_server_process(
        serviceables=serviceables,
        web_framework=web_framework,
        token_verifier=token_verifier,
        **args,
    )


@reboot.aio.tracing.function_span()
async def get_subprocess_server_ports_via_fifo(fifo: Path):
    # Open the FIFO for reading in non-blocking mode to not block the
    # event loop, which would prevent the subprocess from starting.
    #
    # Not using 'aiofiles' there, because we've seen issues with it when reading
    # from FIFOs in parallel.
    fifo_fd = os.open(fifo, os.O_RDONLY | os.O_NONBLOCK)
    buffer = b''

    while True:
        try:
            chunk = os.read(fifo_fd, 1024)
            if chunk:
                buffer += chunk
                if b'\n' in chunk:
                    break
            else:
                # Wait for an other process to write to the FIFO.
                await asyncio.sleep(0.1)
        except BlockingIOError:
            # Wait for an other process to write to the FIFO.
            await asyncio.sleep(0.1)

    os.close(fifo_fd)

    ports_or_error: tuple[int, int, int] | InputError = pickle.loads(
        base64.b64decode(buffer.strip())
    )

    if isinstance(ports_or_error, InputError):
        raise ports_or_error

    # If we didn't get an error, we must have gotten the ports.
    return ports_or_error


@dataclass(
    frozen=True,
    kw_only=True,
)
class RegisteredRevision:
    """Helper class encapsulating properties for a "revision" of the app,
    meant to mimic the revisions we (intend to) expose to developers."""
    serviceables: list[Serviceable]
    web_framework: WebFramework
    in_process: bool
    local_envoy: bool
    local_envoy_port: int
    local_envoy_use_tls: bool
    token_verifier: Optional[TokenVerifier]
    effect_validation: Optional[EffectValidation]


@dataclass(
    frozen=True,
    kw_only=True,
)
class LaunchedServer:
    """Helper class for a launched server."""
    server: ServerSpec
    address: placement_planner_pb2.Server.Address
    websocket_address: placement_planner_pb2.Server.Address
    http_address: placement_planner_pb2.Server.Address

    @dataclass(
        frozen=True,
        kw_only=True,
    )
    class InProcess:
        """Encapsulates everything created for an "in process" server."""
        service_server: ServiceServer
        placement_client: PlanOnlyPlacementClient
        state_manager: SidecarStateManager

    @dataclass(
        frozen=True,
        kw_only=True,
    )
    class Subprocess:
        """Encapsulates everything created for a "subprocess" server."""
        # Callback for stopping this subprocess.
        stop: Callable[[], Awaitable[None]]

        # Indicator that we are attempting to stop the subprocess.
        stopping: asyncio.Event

    @dataclass(
        frozen=True,
        kw_only=True,
    )
    class Stopped:
        """A server that is currently stopped."""

    @dataclass(
        frozen=True,
        kw_only=True,
    )
    class DifferentReplica:
        """A server that's running on a different replica."""

    async def stop(self) -> LaunchedServer:
        if isinstance(self.state, LaunchedServer.DifferentReplica):
            # This replica isn't authoritative for this server. Do
            # nothing.
            pass
        elif isinstance(self.state, LaunchedServer.Subprocess):
            self.state.stopping.set()
            await self.state.stop()
        elif isinstance(self.state, LaunchedServer.InProcess):
            await self.state.service_server.stop()
            await self.state.service_server.wait()

            await self.state.placement_client.stop()

            # NOTE: need to explicitly shutdown+wait the state manager so that
            # another state manager can be brought up immediately for the same
            # server (e.g., as part of a server restart) without conflict.
            await self.state.state_manager.shutdown_and_wait()
        else:
            assert isinstance(self.state, LaunchedServer.Stopped)

        return dataclasses.replace(self, state=LaunchedServer.Stopped())

    def stopped(self) -> bool:
        return isinstance(self.state, LaunchedServer.Stopped)

    state: InProcess | Subprocess | Stopped | DifferentReplica


class LocalServerManager(ServerManager):

    def __init__(
        self,
        application_metadata: ApplicationMetadata,
        database_address: str,
    ):
        super().__init__()

        # Information on latest registered revision, if any.
        self._revision: Optional[RegisteredRevision] = None

        # Map of launched servers, indexed by server name.
        self._launched_servers: dict[ServerId, LaunchedServer] = {}

        # The LocalEnvoy that routes to the servers.
        self._local_envoy: Optional[LocalEnvoy] = None

        # Address of the sidecar server.
        self._database_address = database_address

        # Manages per-Application metadata, and the locations of the state directories.
        self._application_metadata = application_metadata

        # Placement planner address must be set later because there is
        # a cycle where PlacementPlanner depends on ServerManager,
        # so we won't know the address to give to the
        # LocalServerManager until after the PlacementPlanner has
        # been created.
        self._placement_planner_address: Optional[RoutableAddress] = None

        # What is the index of the replica that this manager is
        # managing? Where are the other replicas?
        replica_index_str = os.environ.get(ENVVAR_REBOOT_REPLICA_INDEX)
        replica_config_json = os.environ.get(ENVVAR_REBOOT_REPLICA_CONFIG)
        assert (
            # Either we have both a replica index and a replica config
            # (e.g. Reboot Cloud), or we have neither (e.g. `rbt dev
            # run`; indicating this is the only replica).
            (replica_index_str is None and replica_config_json is None) or (
                replica_index_str is not None and
                replica_config_json is not None
            )
        )
        self._replica_index = (
            int(replica_index_str) if replica_index_str is not None else 0
        )
        self._replica_config: Optional[placement_planner_pb2.ReplicaConfig
                                      ] = None
        if replica_config_json is not None:
            self._replica_config = placement_planner_pb2.ReplicaConfig()
            json_format.Parse(
                replica_config_json,
                self._replica_config,
                # For forwards-compatibility with newer fields.
                ignore_unknown_fields=True,
            )

    def __del__(self):
        """Custom destructor in order to avoid the temporary directory being
        deleted _before_ the servers have been shutdown.
        """

        async def stop_all_servers():
            stop_all_servers_tasks = []

            for launched_server in self._launched_servers.values():
                stop_all_servers_tasks.append(launched_server.stop())

            await asyncio.gather(*stop_all_servers_tasks)

        # This destructor cannot be async, but the `launched_server` code is
        # all async, so we need to go through this little hoop to run its
        # shutdown procedure.
        try:
            current_event_loop = asyncio.get_running_loop()
            # If the above doesn't raise, then this synchronous method is being
            # called from an async context.
            # Since we have a running event loop, we must call the async
            # function on that loop rather than via asyncio.run().
            _ = current_event_loop.create_task(
                stop_all_servers(),
                name=f'stop_all_servers() in {__name__}',
            )
        except RuntimeError:
            # We're in a fully synchronous context. Call the async function via
            # asyncio.run().
            asyncio.run(stop_all_servers())

    @property
    def local_envoy(self) -> Optional[LocalEnvoy]:
        return self._local_envoy

    def _envoy_trusted_address(self) -> Optional[str]:
        if self._local_envoy is None:
            return None

        return f'localhost:{self._local_envoy.trusted_port}'

    def register_placement_planner_address(
        self, placement_planner_address: RoutableAddress
    ):
        """Register the placement planner address so that we can bring up new
        servers that can create resolvers that get actor routes from
        the placement planner.

        NOTE: this must be called _before_ a server can be created.
        Unfortunately we can't pass the address into the constructor because
        there is a cycle where PlacementPlanner depends on ServerManager,
        so we won't know the address to give to the LocalServerManager until
        after the PlacementPlanner has been created.
        """
        self._placement_planner_address = placement_planner_address

    def register_revision(
        self,
        *,
        serviceables: list[Serviceable],
        web_framework: WebFramework,
        token_verifier: Optional[TokenVerifier],
        in_process: bool,
        local_envoy: bool,
        local_envoy_port: int,
        local_envoy_use_tls: bool,
        effect_validation: Optional[EffectValidation],
    ):
        """Save the given serviceable definitions so that we can bring up
        corresponding objects if and when a Server requires them."""
        self._revision = RegisteredRevision(
            serviceables=serviceables,
            web_framework=web_framework,
            in_process=in_process,
            local_envoy=local_envoy,
            local_envoy_port=local_envoy_port,
            local_envoy_use_tls=local_envoy_use_tls,
            token_verifier=token_verifier,
            effect_validation=effect_validation,
        )

    @reboot.aio.tracing.function_span()
    async def set_servers(
        self,
        planned_servers: Sequence[ServerSpec],
    ) -> list[placement_planner_pb2.Server]:
        # Before we start any servers, make sure Envoy is running (if
        # requested for this application); servers need a port to route
        # to.
        if len(planned_servers) > 0:
            application_id = planned_servers[0].application_id
            assert all(
                server.application_id == application_id
                for server in planned_servers
            ), "All servers must have the same application_id"

            await self._ensure_envoy_if_needed(application_id)

        # First update the servers.
        result = await super().set_servers(planned_servers)

        # Now update the Envoy that's routing to the servers.
        await self._configure_envoy()

        return result

    def launched_servers(self) -> dict[ServerId, LaunchedServer]:
        return self._launched_servers

    async def stop_local_envoy(self):
        """Stop the local Envoy instance, if any."""
        if self._local_envoy is not None:
            await self._local_envoy.stop()
            self._local_envoy = None

    @reboot.aio.tracing.function_span()
    async def _delete_server(
        self,
        server: ServerSpec,
    ) -> None:
        """Stop the process or server corresponding to the given Server and delete it
        from our internal records.
        If there is no such process or server, do nothing."""

        if server.replica_index != self._replica_index:
            # This server is managed by a different replica; nothing to
            # do here.
            return

        await self._stop_server(server)

        self._launched_servers.pop(server.id, None)

    async def _stop_server(
        self,
        server: ServerSpec,
    ) -> None:
        """Stop the process or server corresponding to the given Server.
        If there is no such process or server, do nothing."""
        launched_server = self._launched_servers.get(server.id, None)

        if launched_server is None:
            return

        self._launched_servers[server.id] = await launched_server.stop()

    @reboot.aio.tracing.function_span()
    async def _set_server(
        self,
        server: ServerSpec,
    ) -> placement_planner_pb2.Server.Address:
        """Start a gRPC server, in the same process or a separate process,
        serving all the services in the given Server, and return
        its address.
        """
        # If this is an "update" to an existing server, don't do
        # anything (assuming there is not anything to be done, which
        # locally should always be the case).
        launched_server = self._launched_servers.get(server.id, None)

        if launched_server is not None:
            assert launched_server.server == server
            return launched_server.address

        if server.replica_index != self._replica_index:
            # This server is meant to be run on a different replica;
            # simply return the address of that replica.
            assert self._replica_config is not None
            assert len(self._replica_config.replicas) > server.replica_index, (
                f"Server '{server.id}' is assigned to replica index "
                f"{server.replica_index}, but there are only "
                f"{len(self._replica_config.replicas)} replicas "
                f"configured:\n{self._replica_config.replicas}"
            )
            address = self._replica_config.replicas[server.replica_index
                                                   ].address
            self._launched_servers[server.id] = LaunchedServer(
                server=server,
                # All traffic for other replicas goes to the same
                # address, where the receiving Envoy will split the
                # traffic out into the appropriate ports for that
                # replica.
                address=address,
                websocket_address=address,
                http_address=address,
                state=LaunchedServer.DifferentReplica(),
            )
            return address

        return await self._start_server(server)

    @reboot.aio.tracing.function_span()
    async def _start_server(
        self,
        server: ServerSpec,
    ) -> placement_planner_pb2.Server.Address:
        """Start a gRPC server, in the same process or a separate process,
        serving all the services in the given Server, and return
        its address.
        """

        # Ok, this isn't an update, we want to create a server!
        assert self._placement_planner_address is not None

        assert self._revision is not None, (
            "Application should have been brought up already"
        )

        application_id = ensure_valid_application_id(server.application_id)

        assert application_id == self._application_metadata.application_id, (
            "Only one application is supported per instance."
        )

        effect_validation = self._revision.effect_validation or EffectValidation[
            os.getenv(ENVVAR_RBT_EFFECT_VALIDATION, "ENABLED").upper()]

        async def launch():
            assert self._revision is not None

            host = EVERY_LOCAL_NETWORK_ADDRESS

            if not self._revision.in_process:
                return await self._launch_subprocess_server(
                    host,
                    server,
                    self._revision.serviceables,
                    self._revision.web_framework,
                    self._revision.token_verifier,
                    effect_validation,
                )
            else:
                return await self._launch_in_process_server(
                    host,
                    server,
                    self._revision.serviceables,
                    self._revision.web_framework,
                    self._revision.token_verifier,
                    effect_validation,
                )

        launched_server = await launch()

        self._launched_servers[server.id] = launched_server

        return launched_server.address

    async def server_stop(self, server_id: ServerId) -> ServerSpec:
        """Temporarily shuts down the given server id, for tests."""
        assert self._local_envoy is not None, (
            "Can only stop servers when `local_envoy=True`."
        )

        launched_server = self._launched_servers.get(server_id, None)
        if launched_server is None:
            raise ValueError(
                f"No running server with the id `{server_id}`. "
                f"Running servers: {list(self._launched_servers.keys())}"
            )
        await self._stop_server(launched_server.server)
        return launched_server.server

    async def server_start(self, server: ServerSpec) -> None:
        """Start a server that was previously stopped by `server_stop`."""
        assert self._local_envoy is not None, (
            "Can only restart servers when `local_envoy=True`."
        )

        # Relaunch.
        await self._start_server(server)
        # And reconfigure envoy, since the server will be on a new port.
        await self._configure_envoy()

    @reboot.aio.tracing.function_span()
    async def _launch_in_process_server(
        self,
        host: str,
        server: ServerSpec,
        serviceables: list[Serviceable],
        web_framework: WebFramework,
        token_verifier: Optional[TokenVerifier],
        effect_validation: EffectValidation,
    ) -> LaunchedServer:
        assert self._placement_planner_address is not None

        placement_client = PlanOnlyPlacementClient(
            self._placement_planner_address
        )
        await placement_client.start()

        trusted_envoy_address = self._envoy_trusted_address()
        resolver = StaticResolver(address=trusted_envoy_address)

        application_id = ensure_valid_application_id(server.application_id)

        state_manager = SidecarStateManager(
            database_address=self._database_address,
            serviceables=serviceables,
            shards=server.shards,
            placement_client=placement_client,
            application_id=application_id,
        )

        service_server = ServiceServer(
            application_id=application_id,
            server_id=server.id,
            serviceables=serviceables,
            web_framework=web_framework,
            listen_address=f'{host}:0',
            token_verifier=token_verifier,
            state_manager=state_manager,
            placement_client=placement_client,
            actor_resolver=resolver,
            effect_validation=effect_validation,
        )

        await service_server.start()

        port = service_server.port()
        websocket_port = service_server.websocket_port()
        http_port = service_server.http_port()

        # The server should now be reachable at the address of the
        # server we started in the subprocess.
        address = placement_planner_pb2.Server.Address(host=host, port=port)
        websocket_address = placement_planner_pb2.Server.Address(
            host=host, port=websocket_port
        )
        http_address = placement_planner_pb2.Server.Address(
            host=host, port=http_port
        )

        # If the server's resolver doesn't have a local Envoy to talk
        # to, it must be the only server in the application. In that
        # case it should always talk to itself directly.
        if trusted_envoy_address is None:
            resolver.update(f"localhost:{port}")

        return LaunchedServer(
            server=server,
            address=address,
            websocket_address=websocket_address,
            http_address=http_address,
            state=LaunchedServer.InProcess(
                service_server=service_server,
                placement_client=placement_client,
                state_manager=state_manager,
            ),
        )

    async def _stop_server_process(self, pid: int) -> None:
        # Perform a graceful termination by first doing 'terminate'
        # followed after a grace period by 'kill'
        loop = asyncio.get_running_loop()
        try:
            # Try and send a SIGTERM to the process, or if it has
            # already exited a `ProcessLookupError` will be raised
            # which we catch below.
            await loop.run_in_executor(
                None,
                os.kill,
                pid,
                signal.SIGTERM,
            )

            retries = 0

            while retries < 3:
                # Check if the process is still running, raises
                # `ProcessLookupError` that we catch below if it has
                # exited or been killed.
                await loop.run_in_executor(None, os.kill, pid, 0)
                retries += 1
                await asyncio.sleep(1)

            # Send a SIGKILL to the process, which can not be trapped,
            # or if it has already exited a `ProcessLookupError` will
            # be raised which we catch below.
            await loop.run_in_executor(None, os.kill, pid, signal.SIGKILL)

            # Waiting forever is safe because kill can not be trapped!
            while True:
                # Check if the process is still running, raises
                # `ProcessLookupError` that we catch below if it has
                # exited or been killed.
                await loop.run_in_executor(None, os.kill, pid, 0)
                await asyncio.sleep(1)
        except ProcessLookupError:
            # Process exited or was killed.
            return

    async def _launch_subprocess_server(
        self,
        host: str,
        server: ServerSpec,
        serviceables: list[Serviceable],
        web_framework: WebFramework,
        token_verifier: Optional[TokenVerifier],
        effect_validation: EffectValidation,
    ) -> LaunchedServer:
        if os.getenv(ENVVAR_RBT_NODEJS, "false").lower() == "true":
            return await self._launch_nodejs_subprocess_server(
                host,
                server,
                effect_validation,
            )
        else:
            return await self._launch_python_subprocess_server(
                host,
                server,
                effect_validation,
            )

    async def _launch_nodejs_subprocess_server(
        self,
        host: str,
        server: ServerSpec,
        effect_validation: EffectValidation,
    ) -> LaunchedServer:
        # We use a fifo to report back the ports as type `int` on
        # which the process is running. It may also report an error of
        # type `InputError`.
        tmp_directory = tempfile.TemporaryDirectory()
        tmp_directory_path = Path(tmp_directory.name)
        fifo = tmp_directory_path / 'fifo'
        os.mkfifo(fifo)

        # The list of shards is potentially large, and we want to
        # avoid issues with command line length limits, so we store
        # these in a temporary file that the nodejs subprocess can
        # read.
        server_info = database_pb2.ServerInfo(
            shard_infos=server.shards,
        )
        server_info_file = tmp_directory_path / 'server_info.bin'
        with open(server_info_file, 'wb') as f:
            f.write(server_info.SerializeToString())

        args = {
            'application_id': server.application_id,
            'server_id': server.id,
            'server_info_file': str(server_info_file),
            'address': f'{host}:0',
            'database_address': self._database_address,
            'placement_planner_address': self._placement_planner_address,
            'envoy_trusted_address': self._envoy_trusted_address(),
            'fifo': fifo,
            'effect_validation': effect_validation,
        }

        pid = await reboot.nodejs.python.launch_subprocess_server(
            # NOTE: Base64 encoding returns bytes that we then need
            # "decode" into a string to pass into nodejs.
            base64.b64encode(pickle.dumps(args)).decode('utf-8')
        )

        pid_int = int(pid)

        port, websocket_port, http_port = await get_subprocess_server_ports_via_fifo(
            fifo
        )

        # Watch the process to see if it exits prematurely so that we
        # can try and provide some better debugging for end users. We
        # use a 'stopping' event to differentiate when we initiated
        # the stop vs when the process exits on its own.
        stopping = asyncio.Event()

        # The process may still fail after it started. We can't communicate that
        # directly to the user through a raised exception on the user's thread,
        # but we can at least do our best to notice and report it in a separate
        # thread.
        def watch():
            _, status = os.waitpid(pid_int, 0)
            if not stopping.is_set():
                # Since we can't easily determine whether or not `process`
                # has exited because it was stopped via a user doing
                # Ctrl-C or due to an error, we sleep for 1 second before
                # reporting this error and aborting ourselves so in the
                # event it was Ctrl-C hopefully we'll no longer exist.
                #
                # These semantics differs than with a Python subprocess
                # server because we can easily see if we have been
                # signaled because nodejs owns the signal handlers.
                time.sleep(1)
                print(
                    f"Process for server '{server.id}' has "
                    f"prematurely exited with status code '{status}'",
                    file=sys.stderr,
                )
                # TODO(benh): is there any place we can propagate this
                # failure instead of just terminating the process?
                os.kill(os.getpid(), signal.SIGTERM)

        threading.Thread(target=watch, daemon=True).start()

        # The server should now be reachable at the address of the
        # server we started in the subprocess.
        address = placement_planner_pb2.Server.Address(host=host, port=port)
        websocket_address = placement_planner_pb2.Server.Address(
            host=host, port=websocket_port
        )
        http_address = placement_planner_pb2.Server.Address(
            host=host, port=http_port
        )

        async def stop():
            await self._stop_server_process(pid_int)

        return LaunchedServer(
            server=server,
            address=address,
            websocket_address=websocket_address,
            http_address=http_address,
            state=LaunchedServer.Subprocess(
                stop=stop,
                stopping=stopping,
            ),
        )

    @reboot.aio.tracing.function_span()
    async def _launch_python_subprocess_server(
        self,
        host: str,
        server: ServerSpec,
        effect_validation: EffectValidation,
    ) -> LaunchedServer:
        # We use a fifo to report back the ports as type
        # `int` on which the process is running. It may also
        # report an error of type `InputError`.
        tmp_directory = tempfile.TemporaryDirectory()
        tmp_directory_path = Path(tmp_directory.name)
        fifo = tmp_directory_path / 'fifo'
        os.mkfifo(fifo)

        # The list of shards is potentially large, and we
        # want to avoid issues with environment variable
        # size limits, so we store these in a temporary file
        # that the subprocess can read.
        server_info = database_pb2.ServerInfo(
            shard_infos=server.shards,
        )
        server_info_file = (tmp_directory_path / 'server_info.bin')
        with open(server_info_file, 'wb') as f:
            f.write(server_info.SerializeToString())

        args = {
            'application_id': server.application_id,
            'server_id': server.id,
            'server_info_file': str(server_info_file),
            'address': f'{host}:0',
            'database_address': self._database_address,
            'placement_planner_address': self._placement_planner_address,
            'envoy_trusted_address': self._envoy_trusted_address(),
            'fifo': fifo,
            'effect_validation': effect_validation,
        }

        env = os.environ.copy()
        env[ENVVAR_PYTHON_SERVER] = 'true'
        env[ENVVAR_PYTHON_SERVER_BASE64_ARGS] = (
            base64.b64encode(pickle.dumps(args)).decode('utf-8')
        )

        # Re-run the user's main.py in a new process, with
        # env vars set to trigger server subprocess mode.
        # We could run each server in a separate thread with its own
        # event loop to isolate them from the main event loop, but
        # unfortunately gRPC has a bug in that architecture right now.
        # See https://github.com/grpc/grpc/pull/41483.
        # We could revisit that approach once that bug is fixed and we
        # upgrade gRPC library.
        process = subprocess.Popen(
            [sys.executable] + sys.argv,
            env=env,
        )

        pid = process.pid

        # Watch the process to see if it exits prematurely
        # so that we can try and provide some better
        # debugging for end users. We use a 'stopping' event
        # to differentiate when we initiated the stop vs
        # when the process exits on its own.
        stopping = asyncio.Event()

        def watch():
            status = process.wait()

            if not stopping.is_set() and status != 0:
                print(
                    f"Process for server '{server.id}' has "
                    f"prematurely exited with status code '{status}'",
                    file=sys.stderr,
                )
                # TODO(benh): is there any place we can propagate this
                # failure instead of just terminating the process?
                os.kill(os.getpid(), signal.SIGTERM)

        threading.Thread(target=watch, daemon=True).start()

        port, websocket_port, http_port = (
            await get_subprocess_server_ports_via_fifo(fifo)
        )

        # The server should now be reachable at the address
        # of the server we started in the subprocess.
        address = placement_planner_pb2.Server.Address(host=host, port=port)
        websocket_address = placement_planner_pb2.Server.Address(
            host=host, port=websocket_port
        )
        http_address = placement_planner_pb2.Server.Address(
            host=host, port=http_port
        )

        async def stop():
            await self._stop_server_process(pid)

        return LaunchedServer(
            server=server,
            address=address,
            websocket_address=websocket_address,
            http_address=http_address,
            state=LaunchedServer.Subprocess(
                stop=stop,
                stopping=stopping,
            ),
        )

    @reboot.aio.tracing.function_span()
    async def _ensure_envoy_if_needed(self, application_id: ApplicationId):
        """
        Starts the Envoy if it's needed, and hasn't been started yet.

        The Envoy will start with an empty set of servers, i.e. it'll be
        listening on all its ports but rejecting every request. Call
        `_configure_envoy` to give it servers to route to.
        """
        if self._local_envoy is not None:
            # Already done!
            return

        # Invariant: before `_ensure_envoy_if_needed` is called,
        # `register_revision` is called; that's how we learn whether
        # Envoy should be configured.
        assert self._revision is not None, (
            "`register_revision()` must be called before "
            "`_ensure_envoy_if_needed()`"
        )

        if not self._revision.local_envoy:
            # No Envoy will be started.
            return

        user_serviceables = self._revision.serviceables
        self._local_envoy = LocalEnvoyFactory.create(
            public_port=self._revision.local_envoy_port,
            use_tls=self._revision.local_envoy_use_tls,
            application_id=application_id,
            # NOTE: we also tell `LocalEnvoy` to proxy traffic for all
            # of the `Routable`s that the `ServiceServer` declares
            # (i.e., system services).
            routables=user_serviceables + ServiceServer.ROUTABLES,
        )

        await self._local_envoy.start()

    @reboot.aio.tracing.function_span()
    async def _configure_envoy(self):
        if self._local_envoy is None:
            # There is no Envoy to configure. We're done.
            return

        # Make a list of servers that have been launched, and which
        # ports they're running on. If the application has just started
        # or is shutting down there might be none.
        server_infos: list[ServerInfo] = []
        for launched_server in self._launched_servers.values():
            server_infos.append(
                ServerInfo(
                    server_id=launched_server.server.id,
                    address=ServerAddress(
                        host=launched_server.address.host,
                        grpc_port=launched_server.address.port,
                        websocket_port=launched_server.websocket_address.port,
                        http_port=launched_server.http_address.port,
                    ),
                    shards=launched_server.server.shards,
                    on_this_replica=not isinstance(
                        launched_server.state, LaunchedServer.DifferentReplica
                    ),
                )
            )

        if len(server_infos) == 0:
            # No reason to launch an Envoy. We're done.
            return

        await self._local_envoy.set_servers(server_infos)


class FakeServerManager(ServerManager):
    """The FakeServerManager doesn't actually start any servers. It will just
    reply with a made-up address for any server that is requested.
    """

    @staticmethod
    def hostname_for_server(server_id: ServerId) -> str:
        return f'hostname-for-{server_id}'

    @staticmethod
    def first_port() -> int:
        return 1337

    def __init__(self):
        super().__init__()
        # Assign predictable ports to servers in order of arrival, and keep
        # them stable as long as the server exists. These predictable ports
        # are useful to tests.
        self.port_by_server_id: dict[ServerId, int] = {}
        self.next_port = self.first_port()

        # Track the servers that exist, also useful for tests.
        self.servers: dict[ServerId, ServerSpec] = {}

    def address_for_server(
        self,
        server_id: str,
    ) -> placement_planner_pb2.Server.Address:
        port = self.port_by_server_id.get(server_id) or self.next_port
        if port == self.next_port:
            self.port_by_server_id[server_id] = port
            self.next_port += 1

        return placement_planner_pb2.Server.Address(
            host=self.hostname_for_server(server_id),
            port=port,
        )

    @reboot.aio.tracing.function_span()
    async def _set_server(
        self,
        server: ServerSpec,
    ) -> placement_planner_pb2.Server.Address:
        self.servers[server.id] = server
        return self.address_for_server(server.id)

    @reboot.aio.tracing.function_span()
    async def _delete_server(
        self,
        server: ServerSpec,
    ) -> None:
        del self.servers[server.id]
        del self.port_by_server_id[server.id]
