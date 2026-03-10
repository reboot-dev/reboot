from __future__ import annotations

import asyncio
import colorama
import os
import reboot.aio.memoize
import reboot.aio.workflows
import sys
import traceback
from log.log import get_logger
from mcp.server.fastmcp import FastMCP
from pathlib import Path
from reboot.aio.auth.token_verifiers import TokenVerifier
from reboot.aio.exceptions import InputError
from reboot.aio.external import InitializeContext
from reboot.aio.http import NodeWebFramework, PythonWebFramework, WebFramework
from reboot.aio.internals.channel_manager import _ChannelManager
from reboot.aio.libraries import AbstractLibrary
from reboot.aio.reboot import Reboot
from reboot.aio.servers import ConfigServer
from reboot.aio.servicers import Serviceable, Servicer
from reboot.aio.tracing import function_span
from reboot.aio.types import ServerId
from reboot.cli import terminal
from reboot.controller.server_managers import (
    run_nodejs_server_process,
    run_python_server_process,
)
from reboot.controller.settings import ENVVAR_REBOOT_MODE, REBOOT_MODE_CONFIG
from reboot.mcp.factories import create_mcp_factory
from reboot.nodejs.python import should_print_stacktrace
from reboot.run_environments import (
    InvalidRunEnvironment,
    RunEnvironment,
    detect_run_environment,
    within_nodejs_server,
    within_python_server,
)
from reboot.server.service_descriptor_validator import ProtoValidationError
from reboot.settings import (
    DEFAULT_SECURE_PORT,
    ENVVAR_RBT_NAME,
    ENVVAR_RBT_SERVERS,
    ENVVAR_RBT_STATE_DIRECTORY,
    ENVVAR_REBOOT_CLOUD_DATABASE_ADDRESS,
    ENVVAR_REBOOT_LOCAL_ENVOY,
    ENVVAR_REBOOT_LOCAL_ENVOY_PORT,
    RBT_APPLICATION_EXIT_CODE_BACKWARDS_INCOMPATIBILITY,
)
from typing import Awaitable, Callable, NoReturn, Optional

logger = get_logger(__name__)


def _handle_unknown_exception(
    exception: Exception,
    stack_trace: Optional[str] = None,
) -> None:
    """Pretty print stack trace and error message for an unknown exception. This
    includes informing the user how to best get in touch with us.
    """
    if should_print_stacktrace():
        if stack_trace is None:
            stack_trace = ''.join(traceback.format_exception(exception))

        # Emulate `traceback.print_exc()` by printing the
        # error to `sys.stderr`.
        print(stack_trace, file=sys.stderr)

    terminal.error(
        f'Caught unexpected `{type(exception).__name__}`: {exception}\n'
        '\n',
    )

    terminal.warn(
        'Please report this error, including any stack trace above, \n'
        'to the kind folks at Reboot - they\'ll be happy to help you out!\n'
        'You can get in touch via Discord: https://discord.gg/cRbdcS94Nr\n'
        '\n'
    )


def _handle_input_error(input_error: InputError) -> None:
    """Handle an input error."""
    # Special cases of rendering of InputError.
    if isinstance(input_error, ProtoValidationError):
        terminal.error(input_error.reason)
        for validation_error in input_error.validation_errors:
            # We indent the validation errors to make them easier to read; make
            # sure that also works when there are newlines.
            validation_error = validation_error.replace('\n', '\n  ')
            terminal.error(f'- {validation_error}')
        terminal.error('\n')
        return

    terminal.error(f'Caught `{type(input_error).__name__}`: {input_error}\n')


# Need to set `reboodev.aio.workflows.memoize` at run
# time. This unfortunately is necessary to break a circular
# dependency between generated code and functions in
# `workflows.py` which need to call `memoize` which also
# depends on generated code!
assert reboot.aio.workflows.memoize is None
assert reboot.aio.memoize.memoize is not None
reboot.aio.workflows.memoize = reboot.aio.memoize.memoize


class Library(AbstractLibrary):
    """
    Defines Application-dependent portion of the Library as well as
    any checks on subclasses.
    """

    def __init_subclass__(cls, **kwargs):
        # `name` checked here because this class expects its subclasses
        # to define it.
        super().__init_subclass__(**kwargs)
        if not hasattr(cls, 'name'):
            raise NotImplementedError(
                "Please set `name` as a class variable. For best practices, "
                "please define the name as a constant in your library module."
            )

    async def pre_run(self, application: Application) -> None:
        """
        Implement any library setup before the `Application` runs here.
        """
        pass


class NodeAdaptorLibrary(Library):
    """Parent class for any Node libraries."""

    name = "TO_BE_OVERWRITTEN"
    _requirements: list[str]
    _servicers: list[type[Servicer]]
    _initialize: Optional[Callable[[InitializeContext], Awaitable[None]]]

    def __init_subclass__(cls, **kwargs):
        # Make sure `name` got overwritten by the subclass.
        # `NodeAdaptorLibrary.name` needs to be defined for Library's subclass
        # to accept it, but we want to make sure subclasses overwrite it.
        super().__init_subclass__(**kwargs)
        if cls.name == NodeAdaptorLibrary.name:
            raise NotImplementedError(
                "Please set `name` as a class variable. For best practices, "
                "please define the name as a constant in your library module."
            )

    def requirements(self) -> list[str]:
        return self._requirements

    def servicers(self) -> list[type[Servicer]]:
        return self._servicers

    async def initialize(self, context: InitializeContext) -> None:
        if self._initialize:
            await self._initialize(context)


class Application:
    """Entry point for all Reboot applications."""

    def __init__(
        self,
        *,
        servicers: Optional[list[type[Servicer]]] = None,
        # A legacy gRPC servicer type can't be more specific than `type`,
        # because legacy gRPC servicers (as generated by the gRPC `protoc`
        # plugin) do not share any common base class other than `object`.
        legacy_grpc_servicers: Optional[list[type]] = None,
        libraries: Optional[list[Library]] = None,
        initialize: Optional[Callable[[InitializeContext],
                                      Awaitable[None]]] = None,
        initialize_bearer_token: Optional[str] = None,
        token_verifier: Optional[TokenVerifier] = None,
    ):
        """
        :param servicers: the types of Reboot-powered servicers that this
                          Application will serve.
        :param legacy_grpc_servicers: the types of legacy gRPC servicers (not
                                      using Reboot libraries) that this
                                      Application will serve.

        :param libraries: the libraries this Application will use.

        :param initialize: will be called after the Application's servicers have
                       started for the first time, so that it can perform
                       initialization logic (e.g., creating some well-known
                       actors, loading some data, etc.). It must do so in the
                       context of the given InitializeContext.

        :param initialize_bearer_token: a Bearer token that will be used to construct
            the `InitializeContext` passed to `initialize`. If none is provided,
            the `InitializeContext` will be constructed without a Bearer token,
            and have app-internal privileges instead.

        :param token_verifier: a TokenVerifier that will be used to verify
            authorization bearer tokens passed to the application.

        TODO(benh): update the initialize function to be run in a transaction
        and ensure that the transaction has finished before serving any other
        calls on the servicers.
        """
        # Get all libraries including required dependent libraries.
        if libraries is not None:
            # Check for dupes.
            library_names = set(library.name for library in libraries)
            if len(library_names) != len(libraries):
                raise ValueError(
                    "The `libraries` parameter contains multiple libraries "
                    "with the same name. Please check that you only include each "
                    "library once in `libraries`."
                )

            # Verify we have all the requirements for libraries.
            requirements_names = set(
                requirement for library in libraries
                for requirement in library.requirements()
            )
            needed_requirements = requirements_names - library_names

            if len(needed_requirements) > 0:
                raise ValueError(
                    "Missing required libraries: "
                    f"{', '.join(needed_requirements)}"
                    "Please add these libraries and pass them to the "
                    "`libraries` parameter."
                )

            # Sort libraries by name for guaranteed ordering.
            libraries = sorted(libraries, key=lambda library: library.name)

            # Add the library servicers to the list of servicers.
            library_servicers = [
                servicer for library in libraries
                for servicer in library.servicers()
            ]
            if servicers is not None:
                servicers.extend(library_servicers)
            else:
                servicers = library_servicers

        if servicers is not None and len(servicers) == 0:
            raise ValueError("'servicers' can't be an empty list")

        # Runtime type checks, in case the type annotation didn't get checked
        # statically.
        for servicer in servicers or []:
            if not isinstance(servicer, type):
                raise ValueError(
                    "The `servicers` parameter contains a "
                    f"'{type(servicer).__name__}' object, but was expecting "
                    f"only classes. Try passing `{type(servicer).__name__}` "
                    f"instead of `{type(servicer).__name__}(...)`"
                )
            if not issubclass(servicer, Servicer):
                raise ValueError(
                    "The `servicers` parameter contains "
                    f"'{servicer.__name__}', which is not a Reboot servicer. "
                    "If it is a legacy gRPC servicer it should be passed in "
                    "via the `legacy_grpc_servicers` parameter instead"
                )
        for servicer in legacy_grpc_servicers or []:
            if not isinstance(servicer, type):
                raise ValueError(
                    "The `legacy_grpc_servicers` parameter contains a "
                    f"'{type(servicer).__name__}' object, but was expecting "
                    f"only classes. Try passing `{type(servicer).__name__}` "
                    f"instead of `{type(servicer).__name__}(...)`"
                )
            if issubclass(servicer, Servicer):
                raise ValueError(
                    "The `legacy_grpc_servicers` parameter contains "
                    f"'{servicer.__name__}', which is a Reboot servicer, not "
                    "a legacy gRPC servicer. It should be passed in via the "
                    "`servicers` parameter instead"
                )

        # Deduplicate the servicers and legacy gRPC servicers. In the context of
        # a complex set of servicers-depending-on-servicers it's not reasonable
        # to expect the user to deduplicate the list themselves.
        self._libraries = libraries
        self._servicers = list(
            set(servicers)
        ) if servicers is not None else None
        del servicers  # To avoid accidental use of the original list.
        self._legacy_grpc_servicers = list(
            set(legacy_grpc_servicers)
        ) if legacy_grpc_servicers is not None else None
        del legacy_grpc_servicers  # To avoid accidental use of the original list.
        self._initialize = initialize
        self._token_verifier = token_verifier
        self._initialize_bearer_token = initialize_bearer_token

        # NOTE: we override with `NodeWebFramework` in `NodeApplication`.
        self._web_framework: WebFramework = PythonWebFramework()

        # Mount MCP.
        self._mount_mcp(self._servicers or [])

        self._rbt: Optional[Reboot] = None

        self._directory: Optional[Path] = None

        self._run_environment: Optional[RunEnvironment] = None

        try:
            self._run_environment = detect_run_environment()
        except InvalidRunEnvironment:
            # Bail out.
            #
            # We might be running tests, in which case the test will
            # manually call `Reboot.up` to create a cluster.
            #
            # If this is being run without `rbt dev` or `rbt serve`
            # the user will be given a helpful error message at
            # run-time and the application will exit with a non-0 exit
            # code without a distracting stack trace.
            return

        if (
            self._run_environment == RunEnvironment.RBT_CLOUD and
            os.environ.get(ENVVAR_REBOOT_MODE) == REBOOT_MODE_CONFIG
        ):
            # This application is running on Reboot Cloud, and is
            # running in "config mode" rather than as a serving
            # server. Don't initialize the Reboot instance; the
            # config server that we'll start later doesn't need it.
            return

        if within_nodejs_server() or within_python_server():
            # We don't need to bring up a Reboot cluster when running a
            # Node.js or Python server; this process is one server in the
            # cluster!
            return

        self._name: Optional[str] = os.environ.get(ENVVAR_RBT_NAME)

        state_directory: Optional[str] = os.environ.get(
            ENVVAR_RBT_STATE_DIRECTORY
        )
        self._state_directory = (
            None if state_directory is None else Path(state_directory)
        )

        # NOTE: we construct a 'Reboot' instance here so that it can
        # perform any process wide initialization as early as possible.
        self._rbt = Reboot(
            application_name=self._name,
            state_directory=self._state_directory,
            # Don't initialize tracing for the 'Reboot' instance, if
            # we're starting a server.
            # A separate tracing context for that process will be
            # started in 'server_managers.py'.
            initialize_tracing=not within_nodejs_server(),
        )

    @property
    def libraries(self):
        return (self._libraries or [])

    @property
    def servicers(self):
        # Always include `memoize` servicers.
        return (self._servicers or []) + reboot.aio.memoize.servicers()

    @property
    def legacy_grpc_servicers(self):
        return self._legacy_grpc_servicers or []

    @property
    def token_verifier(self):
        return self._token_verifier

    @property
    def initialize(
        self,
    ) -> Optional[Callable[[InitializeContext], Awaitable[None]]]:
        return self._initialize

    @property
    def web_framework(self) -> WebFramework:
        return self._web_framework

    @property
    def http(self) -> PythonWebFramework.HTTP:
        # This should only get called by Python applications, and thus
        # we should have constructed the web framework.
        assert isinstance(self._web_framework, PythonWebFramework)
        return self._web_framework.http

    def has_http_routes_or_mounts(self) -> bool:
        return len(self.http._api_routes) > 0 or len(self.http._mounts) > 0

    def _mount_mcp(
        self,
        servicers: list[type[Servicer]],
    ) -> None:
        """Mount MCP from servicers.

        Called from `__init__` after the web framework is
        created. Auto-registers MCP from servicers that have
        MCP tools defined. Always mounts `/mcp` even if no
        servicers have tools — the server will accept
        connections and explain what's missing.
        """
        auto_construct_state_type_full_names: list[str] = []
        new_session_hooks = []

        # Find auto-construct info.
        for servicer_cls in servicers:
            if servicer_cls._is_auto_construct:
                auto_construct_state_type_full_names.append(
                    servicer_cls.__state_type_name__
                )
                new_session_hooks.append(servicer_cls._auto_construct)

        if len(auto_construct_state_type_full_names) > 1:
            state_type_names = (
                "'" + "', '".join(auto_construct_state_type_full_names) + "'"
            )
            raise ValueError(
                f"Multiple auto-construct state types ({state_type_names}) are "
                "defined in this application's API. Only one auto-constructed "
                "state type per application is currently supported."
            )

        auto_construct_state_type_full_name = (
            auto_construct_state_type_full_names[0]
            if len(auto_construct_state_type_full_names) == 1 else None
        )

        # Create MCP server and register all servicers'
        # tools/resources.
        server = FastMCP(name="reboot-mcp")
        for servicer_cls in servicers:
            servicer_cls._add_mcp(server, auto_construct_state_type_full_name)

        # The `type: ignore` is needed because `create_mcp_factory`
        # returns a closure, and mypy can't verify Protocol conformance
        # on closures (the closure is structurally compatible with
        # `HTTPASGIApp` at runtime).
        self.http.mount(
            "/mcp",
            factory=create_mcp_factory(  # type: ignore[arg-type]
                server=server,
                new_session_hooks=new_session_hooks,
            ),
        )

    @function_span()
    async def _rbt_start_and_up_and_initialize(self) -> None:
        assert self._rbt is not None
        assert self._run_environment is not None

        await self._rbt.start()

        local_envoy: bool = os.environ.get(
            ENVVAR_REBOOT_LOCAL_ENVOY,
            'false',
        ).lower() == 'true'

        local_envoy_port: int = int(
            os.environ.get(
                ENVVAR_REBOOT_LOCAL_ENVOY_PORT, str(DEFAULT_SECURE_PORT)
            )
        )

        servers = os.environ.get(ENVVAR_RBT_SERVERS, None)

        assert servers is not None, (
            'Expecting server count from `rbt dev` or `rbt serve`'
        )

        await self._rbt.up(
            servicers=self.servicers,
            libraries=self.libraries,
            legacy_grpc_servicers=self.legacy_grpc_servicers,
            web_framework=self.web_framework,
            token_verifier=self.token_verifier,
            initialize=self._initialize,
            initialize_bearer_token=self._initialize_bearer_token,
            local_envoy=local_envoy,
            local_envoy_port=local_envoy_port,
            servers=int(servers),
        )

    def _get_serviceables(self) -> list[Serviceable]:
        """Helper for converting servicers and legacy gRPC servicers into
        serviceables.
        """
        serviceables: list[Serviceable] = []

        for servicer in self.servicers:
            serviceables.append(Serviceable.from_servicer_type(servicer))

        for legacy_grpc_servicer in self.legacy_grpc_servicers:
            serviceables.append(
                Serviceable.from_servicer_type(legacy_grpc_servicer)
            )

        if len(serviceables) == 0:
            raise ValueError("No servicers were provided to the Application")

        return serviceables

    async def run(self) -> NoReturn:
        """Runs the application, and does not return unless the application fails.

        Does 'sys.exit' in case of failure.
        """
        # Before running, do any pre-run library set up.
        for library in self.libraries:
            await library.pre_run(self)

        colorama.init()

        if within_python_server():
            # We're running as a Python server subprocess.
            try:
                await run_python_server_process(
                    serviceables=self._get_serviceables(),
                    web_framework=self._web_framework,
                    token_verifier=self._token_verifier,
                )
            except Exception as e:
                logger.error(f"Unexpected error while starting: {e}")
                logger.error("Stack trace:", exc_info=True)
                sys.exit(1)

            sys.exit(0)

        if self._run_environment is None:
            # We can't detect the run environment. Assume that the user
            # is trying to run the application locally, but doing it in
            # a way we don't support. Give a helpful error message
            # pointing them to `rbt dev|serve run`.
            terminal.error(
                "Please use 'rbt dev run' or 'rbt serve run' to run your "
                "application locally",
            )
            sys.exit(1)

        if self._run_environment == RunEnvironment.RBT_CLOUD:
            # TODO(rjh): we could have more sanity checks, like...
            #   * make sure we have an `envoy` binary.
            #   * [...]?
            #
            # We want these checks to happen in the config pod already,
            # so that in case of issues we can fail the config pod
            # rather than failing a serving server.

            # On Reboot Cloud, we may need to run as a "config server",
            # rather than as a serving server.
            if os.environ.get(ENVVAR_REBOOT_MODE) == REBOOT_MODE_CONFIG:
                try:
                    server = ConfigServer(
                        serviceables=self._get_serviceables(),
                    )
                    server_run_task = asyncio.create_task(
                        server.run(),
                        name=f'server.run() in {__name__}',
                    )
                    # Wait forever, or at least until the server gets
                    # shut down.
                    await server_run_task

                    sys.exit(0)
                except InputError as e:
                    _handle_input_error(e)
                    sys.exit(1)
                except Exception as e:
                    logger.error(f"Unexpected error while starting: {e}")
                    # An unexpected error, by definition, is something
                    # that we didn't see coming. It may have been caused
                    # by the user's code. Help them (and us, if they
                    # file a bug report) debug it by printing the stack
                    # trace.
                    logger.error("Stack trace:", exc_info=True)
                    sys.exit(1)

            # We're not in config mode. Double-check that a few required
            # environment variables are set.
            try:
                os.environ[ENVVAR_REBOOT_CLOUD_DATABASE_ADDRESS]
                # TODO: add more required environment variables here.
            except KeyError as e:
                terminal.error(
                    f"Environment variable '{e.args[0]}' is not set. "
                    "This should be set automatically by Reboot Cloud. "
                    "Please contact your administrator."
                )
                sys.exit(1)

        # We're going to run a normal Reboot application with one or
        # more serving servers.
        try:
            await self._rbt_start_and_up_and_initialize()
        except InputError as e:
            _handle_input_error(e)
            if isinstance(e, ProtoValidationError):
                sys.exit(RBT_APPLICATION_EXIT_CODE_BACKWARDS_INCOMPATIBILITY)
        except Exception as e:
            _handle_unknown_exception(e)
        else:
            # Wait forever unless we get cancelled!
            #
            # TODO(benh): have 'rbt.up()' return a tuple of (revision,
            # future) so we can watch the future and if that ever
            # fails we should exit and return an error to the user.
            #
            # TODO(benh): also have 'rbt.up()' fail the future that it
            # returns to us if the local envoy that got started
            # happened to fail.
            forever = asyncio.Event()
            await forever.wait()
        finally:
            assert self._rbt is not None
            await self._rbt.stop()

        sys.exit(1)


class NodeApplication(Application):
    """Entry point for all Node.js based Reboot applications."""

    def __init__(
        self,
        *,
        servicers: Optional[list[type[Servicer]]] = None,
        libraries: Optional[list[Library]] = None,
        web_framework_start: Callable[
            [ServerId, Optional[int], _ChannelManager],
            Awaitable[int],
        ],
        web_framework_stop: Callable[[ServerId], Awaitable[None]],
        initialize: Optional[Callable[[InitializeContext],
                                      Awaitable[None]]] = None,
        initialize_bearer_token: Optional[str] = None,
        token_verifier: Optional[TokenVerifier] = None,
    ):
        super().__init__(
            servicers=servicers,
            libraries=libraries,
            initialize=initialize,
            initialize_bearer_token=initialize_bearer_token,
            token_verifier=token_verifier,
        )

        self._web_framework = NodeWebFramework(
            start=web_framework_start,
            stop=web_framework_stop,
        )

    def _mount_mcp(
        self,
        servicers: list[type[Servicer]],
    ) -> None:
        # MCP is not supported for Node.js applications.
        pass

    @property
    def http(self) -> NoReturn:
        raise RuntimeError(
            "`.http` property should not be accessed for a Node.js application"
        )

    async def run(self) -> NoReturn:
        if not within_nodejs_server():
            await super().run()
        else:
            # Still want to run library pre-run in server mode.
            # Only run libraries that are not `NodeAdaptorLibrary` because Node
            # libraries get run in TypeScript.
            for library in self.libraries:
                if not isinstance(library, NodeAdaptorLibrary):
                    await library.pre_run(self)

        colorama.init()

        try:
            await run_nodejs_server_process(
                serviceables=self._get_serviceables(),
                web_framework=self._web_framework,
                token_verifier=self._token_verifier,
            )
        except Exception as e:
            logger.error(f"Unexpected error while starting: {e}")
            # An unexpected error, by definition, is something that we didn't
            # see coming. It may have been caused by the user's code. Help them
            # (and us, if they file a bug report) debug it by printing the stack
            # trace.
            logger.error("Stack trace:", exc_info=True)
            sys.exit(1)

        sys.exit(0)
