import asyncio
import os
import reboot.aio.tracing
import shutil
import tempfile
import uuid
from dataclasses import dataclass
from log.log import get_logger
from pathlib import Path
from rbt.v1alpha1 import database_pb2
from reboot.aio.auth.token_verifiers import TokenVerifier
from reboot.aio.caller_id import CallerID
from reboot.aio.contexts import EffectValidation
from reboot.aio.exceptions import InputError
from reboot.aio.external import ExternalContext, InitializeContext
from reboot.aio.http import WebFramework
from reboot.aio.internals.application_metadata import ApplicationMetadata
from reboot.aio.internals.channel_manager import _ChannelManager
from reboot.aio.libraries import AbstractLibrary
from reboot.aio.monitoring import monitor_event_loop
from reboot.aio.placement import PlanOnlyPlacementClient
from reboot.aio.resolvers import StaticResolver
from reboot.aio.servers import run_application_initializer
from reboot.aio.servicers import Serviceable, Servicer
from reboot.aio.tracing import function_span
from reboot.aio.types import ApplicationId, ServerId, ServiceName, StateRef
from reboot.controller.application_config import ApplicationConfig
from reboot.controller.application_config_trackers import (
    LocalApplicationConfigTracker,
)
from reboot.controller.config_extractor import LocalConfigExtractor
from reboot.controller.placement_planner import PlacementPlanner
from reboot.controller.plan_makers import make_shard_infos
from reboot.controller.server_managers import LocalServerManager
from reboot.controller.servers import ServerSpec
from reboot.controller.settings import ENVVAR_REBOOT_APPLICATION_ID
from reboot.naming import get_local_application_id
from reboot.run_environments import on_cloud
from reboot.server.database import DatabaseServer, DatabaseServerFailed
from reboot.settings import (
    ENVVAR_LOCAL_ENVOY_MODE,
    ENVVAR_LOCAL_ENVOY_USE_TLS,
    ENVVAR_REBOOT_CLOUD_DATABASE_ADDRESS,
)
from typing import Awaitable, Callable, Optional, Sequence, overload

# The default number of servers run by a Reboot instance (including in
# unit tests).
#
# Picked so that we don't get a huge amount of load on the system, but
# are more likely to discover any multi-server-related bugs in unit
# tests. We accept that we have to start a `LocalEnvoy` to proxy between
# these servers; the additional time spend helps our customers (and
# maintainers) ensure correctness. Customers can opt out of by passing
# `servers=1` when they create their `Reboot` instance.
#
# Note that this does NOT determine the number of servers in a Reboot
# Cloud setting; that gets its `ApplicationConfig` from elsewhere.
DEFAULT_NUM_SERVERS = 4

DEFAULT_APPLICATION_NAME = "Reboot"

logger = get_logger(__name__)


@dataclass(kw_only=True)
class ApplicationRevision:
    config: ApplicationConfig


class Reboot:

    def __init__(
        self,
        *,
        application_name: Optional[str] = None,
        state_directory: Optional[Path] = None,
        # When starting a new server, we don't want to start tracing
        # in that process for the 'Reboot' class.
        # A separate tracing context will be started in the
        # 'server_managers.py'.
        initialize_tracing: bool = True,
        # Create subprocesses for gRPC servers by default, but if we
        # are running tests, we will implicitly override this to run
        # in-process, since there is no good way to run subprocesses
        # gRPC servers with the properly initialized `Application` in a
        # unit test.
        in_process: bool = False,
    ):
        """
        state_directory: directory below which applications will store state.
        """
        self._local_envoy_tls: Optional[bool] = None
        self._local_envoy_picked_port: Optional[int] = None
        self._channel_manager: Optional[_ChannelManager] = None

        self._application_name = application_name or DEFAULT_APPLICATION_NAME
        application_id = os.environ.get(ENVVAR_REBOOT_APPLICATION_ID)
        if application_id is None:
            self._application_id = get_local_application_id(
                self._application_name
            )
        else:
            self._application_id = ApplicationId(application_id)

        if initialize_tracing:
            reboot.aio.tracing.start(process_name=self._application_name)

        self._in_process = in_process

        # If the external world provides us with a sidecar server, use
        # it. Else, create one ourselves.
        self._database_server: Optional[DatabaseServer] = None
        database_address = os.environ.get(ENVVAR_REBOOT_CLOUD_DATABASE_ADDRESS)
        if database_address is None:
            # Create a sidecar server that all server state managers
            # will use. Note that we are at this point NOT on Reboot
            # Cloud, so this sidecar will persist data to local disk.

            if state_directory is None:
                # There is no external sidecar, and there's no state
                # directory. The only time that's OK is if the customer
                # has indicated that this run of their application
                # doesn't need to persist state across restarts, i.e.
                # they didn't pass an application name.
                assert application_name is None

                # We create a single temporary directory that we put
                # each application's subdirectories within to make it
                # easier to clean up all of them. Note that we
                # explicitly _do not_ want to clean up each state
                # manager's directory after deleting its corresponding
                # server because it is possible that the same
                # server (i.e., a server with the same name) will
                # be (re)created in the future and it needs its
                # directory!
                self._tmp_directory = tempfile.TemporaryDirectory()
                state_directory = Path(self._tmp_directory.name)

            sidecar_directory = os.path.join(
                state_directory,
                # Give the database the name that's backwards compatible
                # with apps created back when we still called
                # databases "partitions".
                'p000000',
            )

            # The directory might already exist when we're bringing back
            # up a application after a failure/restart.
            os.makedirs(sidecar_directory, exist_ok=True)

            try:
                self._database_server = DatabaseServer(
                    sidecar_directory,
                    database_pb2.ServerInfo(shard_infos=make_shard_infos()),
                )
                database_address = self._database_server.address
            except DatabaseServerFailed as e:
                if (
                    'Failed to instantiate service' in str(e) and
                    '/LOCK:' in str(e)
                ):
                    raise InputError(
                        reason=(
                            "Failed to start sidecar server.\n"
                            "Did you start another instance of `rbt dev run` "
                            "in another terminal?"
                        ), causing_exception=e
                    )
                raise e

        assert database_address is not None

        self._application_metadata = ApplicationMetadata(
            application_id=self._application_id,
            database_address=database_address,
        )

        self._server_manager = LocalServerManager(
            application_metadata=self._application_metadata,
            database_address=database_address,
        )
        self._config_tracker = LocalApplicationConfigTracker()
        self._config_extractor = LocalConfigExtractor(self._application_id)

        self._placement_planner = PlacementPlanner(
            self._config_tracker,
            self._server_manager,
            # Let the PlacementPlanner choose its own port locally, in
            # case we are running multiple PlacementPlanners on the
            # same host (for example, running multiple unit tests in
            # parallel).
            '127.0.0.1:0'
        )

    async def start(self):
        # Monitor the "parent" event loop; this is in addition to
        # similar monitoring that gets set up for the server processes.
        # This can't be started any earlier than now, because this is
        # the first `async` method called on this object, and therefore
        # is the first time we're confident the event loop is running.
        self._monitor_event_loop_task = asyncio.create_task(
            monitor_event_loop()
        )
        await self._placement_planner.start()

        self._server_manager.register_placement_planner_address(
            self._placement_planner.address()
        )

        self._placement_client = PlanOnlyPlacementClient(
            self._placement_planner.address()
        )
        await self._placement_client.start()

    def create_external_context(
        self,
        *,
        name: str,
        bearer_token: Optional[str] = None,
        idempotency_seed: Optional[uuid.UUID] = None,
        idempotency_required: bool = False,
        idempotency_required_reason: Optional[str] = None,
        app_internal: bool = False,
    ) -> ExternalContext:
        """ Create an `ExternalContext` for use in tests.

        app_internal: When true, the context is being used to
          represent a client internal to the application: essentially, to mock
          traffic from another servicer in the same application. A
          per-application secret will be passed as a header in the call.
        """
        caller_id: Optional[CallerID] = None
        if app_internal:
            caller_id = CallerID(application_id=self._application_id)

        assert self._channel_manager is not None, (
            "Reboot.up() must be called before creating an ExternalContext"
        )
        return ExternalContext(
            name=name,
            channel_manager=self._channel_manager,
            bearer_token=bearer_token,
            idempotency_seed=idempotency_seed,
            idempotency_required=idempotency_required,
            idempotency_required_reason=idempotency_required_reason,
            caller_id=caller_id,
        )

    def create_initialize_context(
        self,
        *,
        name: str,
        bearer_token: Optional[str] = None,
        idempotency_seed: Optional[uuid.UUID] = None,
    ) -> InitializeContext:
        """ Create an `ExternalContext` for use in tests.

        app_internal: When true, the context is being used to
          represent a client internal to the application: essentially, to mock
          traffic from another servicer in the same application. A
          per-application secret will be passed as a header in the call.
        """
        # Initializers are application-internal code, and should
        # identify themselves as such.
        caller_id = CallerID(application_id=self._application_id)
        assert self._channel_manager is not None, (
            "Reboot.up() must be called before creating an InitializeContext"
        )
        return InitializeContext(
            name=name,
            channel_manager=self._channel_manager,
            bearer_token=bearer_token,
            idempotency_seed=idempotency_seed,
            idempotency_required=True,
            idempotency_required_reason=
            'Calls to mutators from within your initialize function must use idempotency',
            caller_id=caller_id,
        )

    @overload
    async def up(
        self,
        *,
        revision: Optional[ApplicationRevision] = None,
    ) -> ApplicationRevision:
        ...

    @overload
    async def up(
        self,
        *,
        servicers: list[type[Servicer]],
        # A legacy gRPC servicer type can't be more specific than `type`,
        # because legacy gRPC servicers (as generated by the gRPC `protoc`
        # plugin) do not share any common base class other than `object`.
        legacy_grpc_servicers: Optional[list[type]] = None,
        libraries: Sequence[AbstractLibrary] = [],
        web_framework: WebFramework,
        token_verifier: Optional[TokenVerifier] = None,
        initialize: Optional[Callable[[InitializeContext],
                                      Awaitable[None]]] = None,
        initialize_bearer_token: Optional[str] = None,
        local_envoy: Optional[bool] = None,
        local_envoy_port: int = 0,
        local_envoy_tls: Optional[bool] = None,
        servers: Optional[int] = None,
        effect_validation: Optional[EffectValidation] = None,
    ) -> ApplicationRevision:
        ...

    @function_span()
    async def up(
        self,
        *,
        servicers: Optional[list[type[Servicer]]] = None,
        # A legacy gRPC servicer type can't be more specific than `type`,
        # because legacy gRPC servicers (as generated by the gRPC `protoc`
        # plugin) do not share any common base class other than `object`.
        legacy_grpc_servicers: Optional[list[type]] = None,
        libraries: Sequence[AbstractLibrary] = [],
        web_framework: Optional[WebFramework] = None,
        token_verifier: Optional[TokenVerifier] = None,
        initialize: Optional[Callable[[InitializeContext],
                                      Awaitable[None]]] = None,
        initialize_bearer_token: Optional[str] = None,
        local_envoy: Optional[bool] = None,
        local_envoy_port: int = 0,
        local_envoy_tls: Optional[bool] = None,
        servers: Optional[int] = None,
        effect_validation: Optional[EffectValidation] = None,
        revision: Optional[ApplicationRevision] = None,
    ) -> ApplicationRevision:
        """
        Bring up this in-memory Reboot application.

        Callers may specify a list of servicers to bring up, or they may provide
        an `ApplicationRevision` produced by a previous call to `up()` to restore
        the application to a previous revision.

        Making multiple calls to `up()` is supported, but only if `down()` is
        called in between. The different `up()` calls can use different
        configurations, allowing tests to modify an application's configuration.

        local_envoy: If True, bring up a LocalEnvoy proxy for our Reboot
        services.

        local_envoy_port: port on which to connect to Envoy, defaults to 0
        (picked dynamically by the OS).

        effect_validation: sets EffectValidation for these servicers. By
        default, effect validation is:
          1. Enabled in unit tests, but controllable by this argument.
          2. Enabled in `rbt dev run`, but controllable via the
             `--effect-validation` flag.
          3. Disabled in production.

        servers: the number of servers to create.
        """
        if len(await self._config_tracker.get_application_configs()) > 0:
            raise ValueError(
                "This application is already up; if you'd like to update it "
                "call `down()` before calling `up()` again"
            )

        if revision is not None:
            if revision.config.application_id() != self._application_id:
                raise ValueError(
                    "Revision config is for a different application than the one "
                    "run by this Reboot instance"
                )

            if servicers is not None or legacy_grpc_servicers is not None:
                raise ValueError(
                    "Only pass one of ('servicers' and/or 'legacy_grpc_servicers') "
                    "or 'revision'"
                )

            if servers is not None:
                raise ValueError(
                    "Passing 'servers' is not valid when passing 'revision'"
                )

        if servicers is None and legacy_grpc_servicers is None and revision is None:
            raise ValueError(
                "One of 'servicers', 'legacy_grpc_servicers', or 'revision' must "
                "be passed"
            )

        if servicers is not None and web_framework is None:
            raise ValueError(
                "Expecting 'web_framework' when passing 'servicers'"
            )

        servers = (
            servers or
            (revision.config.spec.servers if revision is not None else None) or
            DEFAULT_NUM_SERVERS
        )
        if servers > 1:
            if local_envoy is not None and not local_envoy:
                raise ValueError(
                    "Setting `servers>1` requires `local_envoy=True` (or you "
                    "may leave `local_envoy` unset, so it can default to "
                    "`True`)"
                )
            local_envoy = True
        elif local_envoy is None:
            # If there's only a single server, default to not using
            # local envoy - that saves time in customer unit tests.
            local_envoy = False

        if local_envoy:
            # 'Reboot' is part of 'Application', which users will call to run
            # the backend, so we don't want to override the environment variable
            # if it's already set by 'rbt dev run' or 'rbt serve'.
            if os.environ.get(ENVVAR_LOCAL_ENVOY_MODE) is None:
                if shutil.which('envoy') is not None:
                    # We prefer to use the locally-installed Envoy,
                    # since that uses fewer resources and more closely
                    # resembles production (Cloud) usage.
                    os.environ[ENVVAR_LOCAL_ENVOY_MODE] = 'executable'
                elif shutil.which('docker') is not None:
                    # If an executable Envoy isn't available, use a
                    # Docker container instead.
                    os.environ[ENVVAR_LOCAL_ENVOY_MODE] = 'docker'
                else:
                    raise ValueError(
                        "You must have either Envoy or Docker installed to run "
                        "Reboot with `local_envoy=True`. Neither was found."
                    )

            tls_envvar = os.environ.get(ENVVAR_LOCAL_ENVOY_USE_TLS)
            if local_envoy_tls is not None:
                if tls_envvar is not None:
                    raise ValueError(
                        "Local envoy TLS setting was provided from both env "
                        f"var ('{ENVVAR_LOCAL_ENVOY_USE_TLS}') and parameter "
                        "('local_envoy_tls'); please set only one of these"
                    )
            else:
                if tls_envvar is not None:
                    local_envoy_tls = tls_envvar.lower() == "true"
                else:
                    # No TLS preference given; default to not using TLS.
                    local_envoy_tls = False

            assert local_envoy_tls is not None
            self._local_envoy_tls = local_envoy_tls

            if (
                local_envoy_port <= 0 and
                self._local_envoy_picked_port is not None
            ):
                # If we had a port that was picked by Envoy in a
                # previous run, and the user didn't specify differently,
                # reuse that port. This is useful in tests, because it
                # allows a previous `ExternalContext` to stay valid
                # between simulated restarts of the backend. Reusing the
                # port is safe, since odds of the ephemeral port having
                # already been reused are very low; see:
                #   https://dataplane.org/analysis/ephemeralports.html
                local_envoy_port = self._local_envoy_picked_port

        # Determine "serviceables" from the set of servicers and
        # legacy gRPC servicers after first deduplicating the
        # servicers and legacy gRPC servicers. We deduplicate because
        # we'll often have libraries depending on libraries depending
        # on servicers and it's not reasonable to expect the user to
        # deduplicate the list themselves.
        servicers = list(set(servicers)) if servicers is not None else None
        legacy_grpc_servicers = list(
            set(legacy_grpc_servicers)
        ) if legacy_grpc_servicers is not None else None

        serviceables: list[Serviceable] = []

        for servicer in servicers or []:
            serviceables.append(Serviceable.from_servicer_type(servicer))
        for legacy_grpc_servicer in legacy_grpc_servicers or []:
            serviceables.append(
                Serviceable.from_servicer_type(legacy_grpc_servicer)
            )

        # To ensure we only use `serviceables` at this point and
        # prevent accidentally using `servicers` or
        # `legacy_grpc_servicers` we delete them (which mypy should
        # also catch).
        del servicers
        del legacy_grpc_servicers

        if len(serviceables) > 0:
            # We can only host each service once in a Reboot application.
            service_names: set[ServiceName] = set()
            for serviceable in serviceables:
                for service_name in serviceable.service_names():
                    if service_name in service_names:
                        raise ValueError(
                            f"Servicer '{service_name}' was requested twice"
                        )

            assert web_framework is not None

            self._server_manager.register_revision(
                serviceables=serviceables,
                web_framework=web_framework,
                token_verifier=token_verifier,
                in_process=self._in_process,
                local_envoy=local_envoy,
                local_envoy_port=local_envoy_port,
                local_envoy_use_tls=self._local_envoy_tls or False,
                effect_validation=effect_validation,
            )

            config = self._config_extractor.config_from_serviceables(
                serviceables,
                servers=servers,
            )
            await self._application_metadata.validate_schema_backwards_compatibility(
                config
            )
            revision = ApplicationRevision(config=config)

        assert revision is not None

        # This addition will trigger a new plan being made: then, wait for it
        # to have been observed.
        await self._config_tracker.add_config(revision.config)
        await self._wait_for_local_plan_sync()

        trusted_address: Optional[str] = None
        if local_envoy:
            # Record the port this application is running on, so that if
            # we restart the application it can be restarted on the same
            # port.
            self._local_envoy_picked_port = self.envoy_port()
            trusted_address = f"localhost:{self.envoy_trusted_port()}"
        else:
            # The only way we support multi-server applications is to
            # have a local Envoy proxy in front of them. There is no
            # local Envoy, ergo we must have only one server.
            assert servers == 1
            launched_servers = self._server_manager.launched_servers()
            assert len(launched_servers) == 1, (
                f"Expected exactly one launched server, found: "
                f"{launched_servers}"
            )

            # We can route to the one server directly.
            launched_server = next(iter(launched_servers.values()))
            trusted_address = f"{launched_server.address.host}:{launched_server.address.port}"

        # A channel manager for use in e.g. unit tests.
        resolver = StaticResolver(trusted_address)
        if self._channel_manager is None:
            self._channel_manager = _ChannelManager(
                resolver,
                # Not using a secure channel, since the trusted port doesn't
                # do TLS.
                secure=False,
            )
        else:
            # The channel manager may already be in use by existing
            # contexts, so update it instead of replacing it.
            self._channel_manager.update_resolver(resolver)

        # Handle library initializers.
        for library in libraries:
            await run_application_initializer(
                application_id=revision.config.application_id(),
                initialize=library.initialize,
                context=self.create_initialize_context(
                    name=f"initialize for library '{library.name}'",
                    bearer_token=initialize_bearer_token,
                    # We pass a `seed` so that we can
                    # re-execute `initialize` idempotently!
                    idempotency_seed=uuid.uuid5(
                        uuid.NAMESPACE_DNS,
                        f"{library.name}.{revision.config.application_id()}.rbt.cloud"
                        if on_cloud() else f"{library.name}.anonymous.rbt.dev",
                    ),
                )
            )

        # Handle the initialize function if present.
        if initialize is not None:
            await run_application_initializer(
                application_id=revision.config.application_id(),
                initialize=initialize,
                context=self.create_initialize_context(
                    name='initialize',
                    bearer_token=initialize_bearer_token,
                    # We pass a `seed` so that we can
                    # re-execute `initialize` idempotently!
                    idempotency_seed=uuid.uuid5(
                        uuid.NAMESPACE_DNS,
                        f"{revision.config.application_id()}.rbt.cloud"
                        if on_cloud() else 'anonymous.rbt.dev',
                    ),
                )
            )

        return revision

    def url(self, path: str = '') -> str:
        """A URL to use to connect to the running Reboot application.

        This method is only supported when `up(..., local_envoy=True)`.
        """
        if self._local_envoy_tls:
            return self.https_localhost_direct_url(path)

        return self.http_localhost_url(path)

    def https_localhost_direct_url(self, path: str = '') -> str:
        assert self._local_envoy_tls
        return f"https://{self.localhost_direct_endpoint()}{path}"

    def localhost_direct_endpoint(self) -> str:
        """Returns the Envoy proxy endpoint."""
        assert self._local_envoy_tls
        return f'dev.localhost.direct:{self.envoy_port()}'

    def http_localhost_url(self, path: str = '') -> str:
        assert not self._local_envoy_tls
        return f'http://localhost:{self.envoy_port()}{path}'

    def envoy_port(self) -> int:
        """Returns the Envoy proxy port."""
        envoy = self._server_manager.local_envoy

        if envoy is None:
            raise ValueError(
                "No local Envoy was launched; did you forget to pass "
                "'local_envoy=True'?"
            )

        return envoy.public_port

    def envoy_trusted_port(self) -> int:
        """
        Returns the Envoy proxy trusted port.

        This port is intended only for local, trusted traffic. It
        never uses TLS.
        """
        envoy = self._server_manager.local_envoy

        if envoy is None:
            raise ValueError(
                "No local Envoy was launched; did you forget to pass "
                "'local_envoy=True'?"
            )

        return envoy.trusted_port

    @reboot.aio.tracing.function_span()
    async def _wait_for_local_plan_sync(self) -> None:
        """Waits for our placement client to have seen the most recent plan.

        NOTE: This is not equivalent to having waited for _all_ clients to have
        seen the most recent version, but should be sufficient for most tests.
        """
        plan_version = self._placement_planner.current_version
        assert plan_version is not None
        await self._placement_client.wait_for_version(plan_version)

    async def unique_servers(
        self,
        state_ref_1: StateRef,
        state_ref_2: StateRef,
    ) -> tuple[ServerId, ServerId]:
        """Given two StateRefs, look up their unique owning servers.

        Fails if both StateRefs are owned by the same server.
        """
        application_configs = await self._config_tracker.get_application_configs(
        )
        if len(application_configs) != 1:
            # TODO: See https://github.com/reboot-dev/mono/issues/3356.
            raise ValueError(
                "Only supported when a single application is running."
            )
        application_id = next(iter(application_configs.keys()))
        server_id_1 = self._placement_client.server_for_actor(
            application_id,
            state_ref_1,
        )
        server_id_2 = self._placement_client.server_for_actor(
            application_id,
            state_ref_2,
        )
        assert server_id_1 != server_id_2, (
            f"{state_ref_1=} and {state_ref_2=} are hosted by the same server: "
            f"{server_id_1}"
        )
        return server_id_1, server_id_2

    async def server_stop(self, server_id: ServerId) -> ServerSpec:
        return await self._server_manager.server_stop(server_id)

    async def server_start(self, server: ServerSpec) -> None:
        # Restart the server.
        await self._server_manager.server_start(server)
        # TODO: We need to poke the ConfigTracker to tell the
        # PlacementPlanner to make a new plan after a server has changed
        # addresses. See https://github.com/reboot-dev/mono/issues/3356
        # about removing some of this complexity for local runs.
        await self._config_tracker.refresh()
        await self._wait_for_local_plan_sync()

    async def stop(self) -> None:
        """Bring down all servicers and shut down the Reboot instance such
        that no more servicers can be brought up. """
        try:
            await self.down()
        finally:
            try:
                await self._placement_client.stop()
            finally:
                try:
                    await self._placement_planner.stop()
                finally:
                    # Stop the local Envoy if one was started. This is
                    # critical for test isolation - the Envoy has a
                    # grpc.aio server that must be stopped before the
                    # event loop closes.
                    await self._server_manager.stop_local_envoy()

        if self._database_server is not None:
            # Shutdown the sidecar server. We only do this during
            # `.stop()` (which is permanent), not during `.down()`
            # (which can be undone via a subsequent `.up()`), since we
            # don't currently have any logic to restart a
            # `DatabaseServer`.
            await self._database_server.shutdown_and_wait()

    @reboot.aio.tracing.function_span()
    async def down(self) -> None:
        """Bring down this Reboot application."""
        # Delete all configs so that the PlacementPlanner will bring down
        # all servers.
        assert len(await self._config_tracker.get_application_configs()) <= 1
        await self._config_tracker.delete_all_configs()
        await self._wait_for_local_plan_sync()
        reboot.aio.tracing.force_flush()
