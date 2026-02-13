from __future__ import annotations

import asyncio
import grpc
import log.log
import logging
import os
import rebootdev.aio.aborted
import rebootdev.aio.tracing
import traceback
from google.protobuf.descriptor import FileDescriptor
from grpc_health.v1 import health_pb2
from grpc_interceptor.server import AsyncServerInterceptor
from grpc_reflection.v1alpha import reflection
from opentelemetry.instrumentation.grpc import filters
from rbt.v1alpha1 import application_config_pb2, react_pb2, tasks_pb2
from rbt.v1alpha1.admin import export_import_pb2
from rbt.v1alpha1.inspect import inspect_pb2
from rbt.v1alpha1.rootpage import rootpage_pb2
from reboot.admin.export_import_servicer import ExportImportServicer
from reboot.aio.http import WebFramework
from reboot.aio.interceptors import (
    RebootContextInterceptor,
    UseApplicationIdInterceptor,
)
from reboot.aio.internals.health_servicer import HealthServicer
from reboot.aio.internals.tasks_servicer import TasksServicer
from reboot.aio.react import ReactServicer
from reboot.controller.application_config import (
    application_config_spec_from_routables,
)
from reboot.controller.settings import (
    ENVVAR_REBOOT_CONFIG_SERVER_PORT,
    ENVVAR_REBOOT_MODE,
    ENVVAR_REBOOT_REPLICA_INDEX,
    REBOOT_MODE_CONFIG,
)
from reboot.inspect.servicer import InspectServicer
from reboot.rootpage.servicer import RootPageServicer
from rebootdev.admin.export_import_converters import ExportImportItemConverters
from rebootdev.aio.auth.token_verifiers import TokenVerifier
from rebootdev.aio.backoff import Backoff
from rebootdev.aio.contexts import EffectValidation
from rebootdev.aio.exceptions import InputError
from rebootdev.aio.external import InitializeContext
from rebootdev.aio.internals.channel_manager import _ChannelManager
from rebootdev.aio.internals.contextvars import use_application_id
from rebootdev.aio.internals.middleware import Middleware
from rebootdev.aio.internals.tasks_cache import TasksCache
from rebootdev.aio.placement import PlacementClient, UnknownApplicationError
from rebootdev.aio.resolvers import ActorResolver
from rebootdev.aio.servicers import (
    ConfigServicer,
    RebootServiceable,
    Routable,
    Serviceable,
)
from rebootdev.aio.state_managers import StateManager
from rebootdev.aio.tracing import (
    TraceLevel,
    aio_server_interceptors,
    function_span,
    span,
)
from rebootdev.aio.types import (
    ApplicationId,
    RoutableAddress,
    ServerId,
    ServiceName,
    StateTypeName,
)
from rebootdev.nodejs.python import should_print_stacktrace
from rebootdev.settings import GRPC_SERVER_OPTIONS
from typing import Awaitable, Callable, Optional

logger = log.log.get_logger(__name__)
# TODO(rjh): some mechanism where developers can configure the Reboot log
# level per-module or globally. For now, default to `WARNING`: we have warnings
# in this file that we expect users to want to see.
logger.setLevel(logging.WARNING)


class InstantiateError(InputError):
    pass


@function_span()
async def run_application_initializer(
    *,
    application_id: ApplicationId,
    context: InitializeContext,
    initialize: Callable[[InitializeContext], Awaitable[None]],
) -> None:
    """Runs the initialize function for an application.

    param application_id: the application ID for the application.
    param context: the `InitializeContext` used for initialization.
    param initialize: the initialize function for the application.
    """

    # When there are multiple replicas, only the first replica (with
    # index 0) runs the initializer. While it is _technically_ OK to run
    # the initializer in every replica (because idempotency ensures the
    # work is still only done once), it would be surprising to customers
    # that log messages, or use an `.always()`.
    #
    # We choose to have the _first_ replica run the initializer (vs any
    # other) because:
    # 1. During rolling updates it'll be the last replica to be updated,
    #    which ensures that all replicas have the latest code before we
    #    execute the latest initializer.
    # 2. It's easiest and most obvious.
    #
    # TODO(rjh): this approach is simple and robust for now, but we may
    #            want to eventually reconsider the first-replica
    #            approach, because...
    #            * During scale-up operations the first replica is
    #              updated before new replicas are added, which means
    #              the initializer is likely to run while the new
    #              replicas aren't available yet. This is safe, because
    #              there will be no replicas with old code around, but
    #              may cause temporary errors that confuse the customer.
    #            * The assumption that at initialize-time there will be
    #              no replicas with old code prevents us from using
    #              the "Parallel" stateful set rollout strategy, which
    #              would save a lot of time during scale-ups in
    #              particular.
    replica_index = int(os.environ.get(ENVVAR_REBOOT_REPLICA_INDEX, "0"))
    if replica_index != 0:
        return

    # NOTE: we retry on all failures just like a `workflow` method
    # because the intent of running initialize is that it
    # "idempotently converges" and so it's better for errors to be
    # logged and seen by developers over and over than for them to
    # fail once and then a user have to figure out that their
    # `initialize` (or libraries' `initialize`) failed way earlier
    # and that's why something else later isn't working.

    backoff = Backoff()

    # Need to set the application ID asyncio context variable so
    # `initialize` can make calls to other servicers.
    with use_application_id(application_id):
        while True:
            try:
                # Make it extra clear that the following spans are due
                # to application initialization by having a span called
                # "initialize" that wraps the call to the initializer
                # method.
                with span(
                    state_name=None,
                    span_name=context.name,
                    level=TraceLevel.CUSTOMER,
                ):
                    # Wrap the call to `initialize` in a `function_span`
                    # (normally used as a decorator) so that it is
                    # traced using the name that the developer gave it.
                    # E.g. if the developer writes
                    # `Application(initialize=foo)`, then the span
                    # they'll see on their dashboard will be called
                    # `foo()`.
                    await function_span(
                        level=TraceLevel.CUSTOMER,
                    )(initialize)(context)
                break
            except InputError:
                # TODO: revisit why we think we might get an
                # `InputError` from running `initialize`?
                #
                # It makes sense that we'd want to propagate an error
                # that can only be fixed by the developer changing
                # their input, but what about running `initialize`
                # depends on that input?
                raise
            except Exception as exception:
                if should_print_stacktrace():
                    traceback.print_exc()

                exception_str = f"{exception}"
                logger.warning(
                    f"{context.name} for application '{application_id}' failed "
                    f"with {type(exception).__name__}{': ' + exception_str if len(exception_str) > 0 else ''}; "
                    "will retry after backoff ..."
                )

                await backoff()

                # The next run of initialize is a completely new
                # context (which may idempotently re-do some parts of
                # the previous attempt).
                context.reset()


class Server:
    """Server is currently an internal only abstraction. Users should use
    `Application` instead.
    """

    def __init__(
        self,
        listen_address: RoutableAddress,
        *,
        interceptors: Optional[list[AsyncServerInterceptor]] = None,
    ):
        if type(self) == Server:
            # Invariant is that constructor does not get called
            # directly; otherwise `type(self)` will be a
            # `ServiceServer` or `ConfigServer`.
            raise ValueError(
                'Do not construct `Server` directly; use, e.g. `ServiceServer` '
                'or `ConfigServer`.'
            )

        grpc_server = grpc.aio.server(
            options=GRPC_SERVER_OPTIONS,
            interceptors=(interceptors or []) + aio_server_interceptors(
                # We run a lot of health checks; they're not interesting to
                # trace and they'll spam our output. Suppress them.
                filter_=filters.negate(filters.health_check())
            )
        )

        try:
            host, port = listen_address.split(':')
        except ValueError:
            host = listen_address

        port = grpc_server.add_insecure_port(listen_address)
        # TODO: Resolve the address (if possible) to a routable address.
        # The address 0.0.0.0 means listen on all network interfaces (there
        # could be more/many/ambiguity). It would be nice to resolve it into
        # something we can use in a test (like 127.0.0.1).
        address = f'{host}:{port}'
        self._grpc_server: grpc.aio.server = grpc_server
        self._listen_address: RoutableAddress = address

    async def wait(self):
        await self._grpc_server.wait_for_termination()

    def port(self) -> int:
        """Return port of gRPC server."""
        # Note: Formatting of the address string is done through the factory
        # method. There should be no case in which this is undefined or results
        # in an index or type error.
        return int(self._listen_address.split(':')[-1])

    async def start(self):
        """Start server."""
        # Note: In the future we might have pre/post start hooks here for
        # servicers.
        await self._grpc_server.start()

    async def stop(self, gracetime: Optional[float] = None):
        """Stop grpc server."""
        # Note: In the future we might have pre/post stop hooks here for
        # servicers.
        await self._grpc_server.stop(grace=gracetime)

    async def run(self):
        try:
            await self.start()
            await self.wait()
        except BaseException as e:
            logger.error('Failed to start (or wait on) server', exc_info=e)
            # Contract: it is safe to call `stop()` even when `start()` has not
            #           completed successfully and therefore some parts of our
            #           server may not have started yet. Calling `stop()` on a
            #           not-started resource should be treated as a no-op.
            await self.stop()
            raise


class ServiceServer(Server):

    class ReactRoutable(Routable):
        """Helper "routable" that can be provided to gRPC to route to the
        `ReactServicer` system service that we run manually."""

        def service_names(self) -> list[ServiceName]:
            # TODO(benh): get from react_pb2.DESCRIPTOR.
            return [ServiceName('rbt.v1alpha1.React')]

        def state_type_name(self) -> None:
            # This service acts as a legacy gRPC service.
            return None

        def file_descriptor(self) -> FileDescriptor:
            return react_pb2.DESCRIPTOR.services_by_name['React'].file

    class InspectRoutable(Routable):
        """Helper "routable" that can be provided to gRPC to route to the
        `InspectServicer` system service that we run manually."""

        def service_names(self) -> list[ServiceName]:
            # TODO(benh): get from inspect_pb2.DESCRIPTOR.
            return [ServiceName('rbt.v1alpha1.inspect.Inspect')]

        def state_type_name(self) -> None:
            # This service acts as a legacy gRPC service.
            return None

        def file_descriptor(self) -> FileDescriptor:
            return inspect_pb2.DESCRIPTOR.services_by_name['Inspect'].file

    class RootPageRoutable(Routable):
        """Helper "routable" that can be provided to gRPC to route to the
        `RootPageServicer` system service that we run manually."""

        def service_names(self) -> list[ServiceName]:
            # TODO(benh): get from rootpage_pb2.DESCRIPTOR.
            return [ServiceName('rbt.v1alpha1.rootpage.RootPage')]

        def state_type_name(self) -> None:
            # This service acts as a legacy gRPC service.
            return None

        def file_descriptor(self) -> FileDescriptor:
            return rootpage_pb2.DESCRIPTOR.services_by_name['RootPage'].file

    class ExportImportRoutable(Routable):
        """Helper "routable" that can be provided to gRPC to route to the
        `ExportImportServicer` system service that we run manually."""

        def service_names(self) -> list[ServiceName]:
            # TODO(benh): get from export_import_pb2.DESCRIPTOR.
            return [ServiceName('rbt.v1alpha1.admin.ExportImport')]

        def state_type_name(self) -> None:
            # This service acts as a legacy gRPC service.
            return None

        def file_descriptor(self) -> FileDescriptor:
            return export_import_pb2.DESCRIPTOR.services_by_name['ExportImport'
                                                                ].file

    class TasksRoutable(Routable):
        """Helper "routable" that can be provided to gRPC to route to the
        `TasksServicer` system service that we run manually."""

        def service_names(self) -> list[ServiceName]:
            # TODO(benh): get from tasks_pb2.DESCRIPTOR.
            return [ServiceName('rbt.v1alpha1.Tasks')]

        def state_type_name(self) -> None:
            # This service acts as a legacy gRPC service.
            return None

        def file_descriptor(self) -> FileDescriptor:
            return tasks_pb2.DESCRIPTOR.services_by_name['Tasks'].file

    class HealthRoutable(Routable):
        """
        Helper "routable" that makes the gRPC health check servicer reachable
        via HTTP transcoding.
        """

        def service_names(self) -> list[ServiceName]:
            return [ServiceName('grpc.health.v1.Health')]

        def state_type_name(self) -> None:
            # This service acts as a legacy gRPC service.
            return None

        def file_descriptor(self) -> FileDescriptor:
            return health_pb2.DESCRIPTOR.services_by_name['Health'].file

    ROUTABLES: list[Routable] = [
        ReactRoutable(),
        InspectRoutable(),
        RootPageRoutable(),
        ExportImportRoutable(),
        TasksRoutable(),
        HealthRoutable(),
    ]

    SYSTEM_SERVICE_NAMES = [
        service_name for r in ROUTABLES for service_name in r.service_names()
    ]

    _websocket_port: Optional[int]

    def __init__(
        self,
        *,
        application_id: ApplicationId,
        server_id: ServerId,
        serviceables: list[Serviceable],
        web_framework: WebFramework,
        listen_address: RoutableAddress,
        websocket_port: Optional[int] = None,
        http_port: Optional[int] = None,
        token_verifier: Optional[TokenVerifier],
        state_manager: StateManager,
        placement_client: PlacementClient,
        actor_resolver: ActorResolver,
        effect_validation: EffectValidation,
    ):
        self._actor_resolver = actor_resolver

        # Construct our _ChannelManager first so that we can use it to construct
        # an Interceptor to pass to our superclass.
        self._channel_manager = _ChannelManager(
            self._actor_resolver,
            # Communication between actors does not use a secure channel,
            # since it doesn't go through the gateway, which is where SSL
            # termination happens. In production infrastructure it is assumed
            # that this intra-Reboot traffic is secured otherwise, e.g. via Istio
            # sidecars providing mTLS.
            secure=False,
        )

        self._application_id = application_id

        self._server_id = server_id

        super().__init__(
            listen_address,
            interceptors=[
                RebootContextInterceptor(
                    channel_manager=self._channel_manager,
                    application_id=self._application_id,
                ),
                UseApplicationIdInterceptor(self._application_id),
            ],
        )

        self._web_framework = web_framework

        self._ready = asyncio.Event()

        self._websocket_port = websocket_port

        self._http_port = http_port

        self._state_manager = state_manager

        self._placement_client = placement_client

        # Keep track of our middleware so that we can use it to manually
        # dispatch recovered tasks.
        self._middleware_by_state_type_name: dict[StateTypeName,
                                                  Middleware] = {}

        # Construct shared tasks cache.
        tasks_cache = TasksCache()

        # Now start serving the serviceables.
        converters = ExportImportItemConverters()
        for serviceable in serviceables:
            if isinstance(serviceable, RebootServiceable):
                try:
                    # Wrapping in a try block so that we can catch and re-raise
                    # TypeError (when some of the methods of servicer are not
                    # defined) as InstantiateError and error our a better
                    # message to a user.
                    #
                    # Reboot servicers get middleware. Requests are passed to the
                    # middleware, which will pass them on to the user code.
                    servicer, _ = serviceable.instantiate()
                except TypeError as e:
                    raise InstantiateError(
                        reason="Failed to instantiate servicer",
                        causing_exception=e,
                    )
                # TODO: https://github.com/reboot-dev/mono/issues/2421
                middleware = servicer.create_middleware(  # type: ignore[attr-defined]
                    application_id=self._application_id,
                    server_id=self._server_id,
                    state_manager=self._state_manager,
                    placement_client=placement_client,
                    channel_manager=self._channel_manager,
                    tasks_cache=tasks_cache,
                    token_verifier=token_verifier,
                    effect_validation=effect_validation,
                    ready=self._ready,
                )
                middleware.add_to_server(self._grpc_server)
                self._middleware_by_state_type_name[middleware.state_type_name
                                                   ] = middleware
                converters.add(
                    servicer.__state_type_name__,
                    servicer.__state_type__,
                )
            else:
                # Legacy gRPC servicers don't get middleware. Requests are
                # passed to the user code directly.
                legacy_grpc_servicer, add_to_server = serviceable.instantiate()
                assert add_to_server is not None
                add_to_server(legacy_grpc_servicer, self._grpc_server)

        # Construct 'Inspect' system service for the Reboot servicers.
        #
        # Invariant: `self._middleware_by_state_type_name` has been fully
        # constructed at this point.
        self._inspect_servicer = InspectServicer(
            self._application_id,
            self._server_id,
            self._state_manager,
            placement_client,
            self._channel_manager,
            self._middleware_by_state_type_name,
        )
        self._inspect_servicer.add_to_server(self._grpc_server)

        # Construct 'RootPage' system service.
        self._rootpage_servicer = RootPageServicer()
        self._rootpage_servicer.add_to_server(self._grpc_server)

        # Construct 'ExportImport' system service for the Reboot servicers.
        self._export_import_servicer = ExportImportServicer(
            self._application_id,
            self._server_id,
            self._state_manager,
            placement_client,
            self._channel_manager,
            converters,
            self._middleware_by_state_type_name,
        )
        self._export_import_servicer.add_to_server(self._grpc_server)

        # Construct and add 'React' system service for the Reboot servicers.
        #
        # Invariant: `self._middleware_by_state_type_name` has been fully
        # constructed at this point.
        self._react_servicer = ReactServicer(
            self._application_id,
            self._middleware_by_state_type_name,
        )
        self._react_servicer.add_to_server(self._grpc_server)

        # Add the custom gRPC health checking servicer to every server. See:
        # https://grpc.io/docs/guides/health-checking/
        self._health_servicer = HealthServicer()
        self._health_servicer.add_to_server(self._grpc_server)

        # Construct and add 'Tasks' system service.
        self._tasks_servicer = TasksServicer(
            self._state_manager,
            tasks_cache,
            placement_client,
            self._channel_manager,
            self._application_id,
            self._server_id,
            self._middleware_by_state_type_name,
        )
        self._tasks_servicer.add_to_server(self._grpc_server)

        # Add StateManager system services (i.e., to serve transaction
        # coordinators and participants).
        state_manager.add_to_server(self._grpc_server)

        # We also need the service names later so we know once the
        # channel manager is ready for use.
        self._service_names = [
            service_name for s in serviceables
            for service_name in s.service_names()
        ]

        # We use the reflection service to make this server more debugable. See:
        # https://github.com/grpc/grpc/blob/master/doc/python/server_reflection.md
        reflection.enable_server_reflection(
            tuple(
                self._service_names + [ServiceName("grpc.health.v1.Health")]
            ),
            self._grpc_server,
        )

    @rebootdev.aio.tracing.function_span()
    async def start(self):
        # Recover past state (if any).
        await self._state_manager.recover(
            application_id=self._application_id,
            channel_manager=self._channel_manager,
            middleware_by_state_type_name=self._middleware_by_state_type_name,
        )

        # Once recovery is complete, we can start serving traffic.
        await super().start()

        # And also start serving web framework traffic if requested.
        self._http_port = await self._web_framework.start(
            self._server_id,
            self._http_port,
            self._channel_manager,
        )

        # And also start serving React traffic.
        self._websocket_port = await self._react_servicer.start(
            self._websocket_port
        )

        # Now we can start passing health checks.
        self._health_servicer.start(self._websocket_port)

        async def wait_for_placement_client_then_ready():
            """
            Helper that waits for the placement client to have at least
            our local servicers before setting `ready`, at which point
            tasks can be dispatched and requests can be served.
            """
            while True:
                try:
                    known_service_names = self._placement_client.known_service_names(
                        self._application_id
                    )
                    if all(
                        service_name in known_service_names
                        for service_name in self._service_names
                    ):
                        break
                    await self._placement_client.wait_for_change()
                except UnknownApplicationError:
                    # If the placement client does not yet know about our
                    # application, just wait for it to learn about it.
                    await self._placement_client.wait_for_change()

            self._ready.set()

        # NOTE: we're holding on to this task so that it does not get
        # destroyed while it is still pending.
        self._wait_for_placement_client_then_ready_task = (
            asyncio.create_task(
                wait_for_placement_client_then_ready(),
                name=f'wait_for_placement_client_then_ready() in {__name__}',
            )
        )

    async def stop(self, gracetime: Optional[float] = None):
        # Stop any background tasks running in the middleware.
        for middleware in self._middleware_by_state_type_name.values():
            await middleware.stop()

        # Stop serving React traffic.
        await self._react_servicer.stop()

        # Stop serving web framework traffic.
        await self._web_framework.stop(self._server_id)

        # Stop serving traffic.
        await super().stop(gracetime=gracetime)

    def websocket_port(self) -> int:
        """Return port of React websocket server."""
        if self._websocket_port is None:
            raise RuntimeError(
                'Must call `start()` before trying to get websocket port'
            )

        return self._websocket_port

    def http_port(self) -> int:
        """Return port where we are serving the web framework."""
        if self._http_port is None:
            raise RuntimeError(
                'Must call `start()` before trying to get HTTP port'
            )

        return self._http_port


class ConfigServer(Server):

    def __init__(
        self,
        serviceables: list[Serviceable],
    ):
        server_port = os.environ.get(ENVVAR_REBOOT_CONFIG_SERVER_PORT)
        if server_port is None:
            raise EnvironmentError(
                f'{ENVVAR_REBOOT_CONFIG_SERVER_PORT} not found. Must be present '
                f'when {ENVVAR_REBOOT_MODE} is `{REBOOT_MODE_CONFIG}`.'
            )

        listen_address = f'0.0.0.0:{server_port}'

        super().__init__(listen_address, interceptors=[])
        routables = serviceables + ServiceServer.ROUTABLES

        application_config = application_config_pb2.ApplicationConfig(
            spec=application_config_spec_from_routables(
                routables, replicas=None, servers=None
            )
        )

        ConfigServicer.add_to_server(self._grpc_server, application_config)
