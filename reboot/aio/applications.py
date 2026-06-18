from __future__ import annotations

import asyncio
import colorama
import os
import reboot.aio.memoize
import reboot.aio.workflows
import reboot.application
import sys
import traceback
from log.log import get_logger
from mcp.server.fastmcp import FastMCP
from pathlib import Path
from rbt.v1alpha1.application.application_pb2 import ExamplePrompt
from reboot.aio.auth.oauth_providers import (
    OAuthProviderByEnvironment,
    OAuthProviderSelector,
)
from reboot.aio.auth.oauth_server import OAuthServer
from reboot.aio.auth.token_verifiers import TokenVerifier
from reboot.aio.exceptions import InputError
from reboot.aio.external import ExternalContext, InitializeContext
from reboot.aio.http import NodeWebFramework, PythonWebFramework, WebFramework
from reboot.aio.internals.channel_manager import _ChannelManager
from reboot.aio.libraries import AbstractLibrary
from reboot.aio.reboot import Reboot
from reboot.aio.servers import ConfigServer
from reboot.aio.servicers import Serviceable, Servicer
from reboot.aio.tracing import function_span
from reboot.aio.types import ServerId, StateTypeName
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
    application_name,
    detect_run_environment,
    running_rbt_dev,
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
    ENVVAR_REBOOT_CRYPTO_ROOT_KEYS,
    ENVVAR_REBOOT_EXPECTED_VERSION,
    ENVVAR_REBOOT_LOCAL_ENVOY,
    ENVVAR_REBOOT_LOCAL_ENVOY_PORT,
    RBT_APPLICATION_EXIT_CODE_BACKWARDS_INCOMPATIBILITY,
)
from reboot.version import REBOOT_VERSION
from reboot.versioning import version_less_than
from typing import Any, Awaitable, Callable, NoReturn, Optional

logger = get_logger(__name__)

_MCP_PATH = "/mcp"


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


def check_expected_version() -> None:
    """Refuse to run with a `reboot` library that does not match the
    `rbt` CLI that spawned this application.

    The `rbt` CLI sets `REBOOT_EXPECTED_VERSION` to its own version
    on the environment of any application it runs. The CLI and the
    `reboot` library are released in lockstep and must match exactly;
    a mismatch means one of the two is out of date, which in the case
    of a coding agent also means that its plugin with instructions
    doesn't match. When the variable is absent (e.g. under `pytest`,
    or when the application is run without `rbt`) there is no
    expectation to enforce.
    """
    expected_version = os.environ.get(ENVVAR_REBOOT_EXPECTED_VERSION)
    if expected_version is None or expected_version == REBOOT_VERSION:
        return

    library_is_older: Optional[bool] = None
    try:
        library_is_older = version_less_than(REBOOT_VERSION, expected_version)
    except ValueError:
        # We can't tell which side is newer, but it is still a
        # mismatch; fail with a direction-less message below.
        pass

    message = (
        f"This application depends on `reboot` {REBOOT_VERSION}, but it "
        f"is being run by an `rbt` CLI at version {expected_version}; "
        "these versions must match. "
    )
    if library_is_older is True:
        # The application is behind the CLI: upgrade the application.
        message += (
            "Coding agents: run the Reboot `upgrade` skill to upgrade this "
            "application. Humans: see https://docs.reboot.dev/upgrade."
        )
    elif library_is_older is False:
        # The CLI is behind the application: update the CLI (which,
        # for coding agents, ships with the Reboot plugin).
        message += (
            "Your `rbt` is older than this application. Coding agents: "
            "ask the user to update the Reboot plugin (re-run `curl "
            "-fsSL https://reboot.dev/install.sh | bash`) and restart "
            "their agent session. Humans: upgrade your `rbt` install; "
            "see https://docs.reboot.dev/upgrade."
        )
    else:
        message += "See https://docs.reboot.dev/upgrade."

    terminal.fail(message)


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
        oauth: Optional[OAuthProviderSelector] = None,
        title: Optional[str] = None,
        description: Optional[str] = None,
        example_prompts: Optional[list[ExamplePrompt]] = None,
    ):
        """
        :param servicers: the types of Reboot-powered servicers that
            this Application will serve.
        :param legacy_grpc_servicers: the types of legacy gRPC servicers
            (not using Reboot libraries) that this Application will
            serve.
        :param libraries: the libraries this Application will use.
        :param initialize: will be called after the Application's
            servicers have started for the first time, so that it can
            perform initialization logic (e.g., creating some well-known
            actors, loading some data, etc.). It must do so in the
            context of the given InitializeContext.
        :param initialize_bearer_token: a Bearer token that will be used
            to construct the `InitializeContext` passed to `initialize`.
            If none is provided, the `InitializeContext` will be
            constructed without a Bearer token, and have app-internal
            privileges instead.
        :param token_verifier: a TokenVerifier that will be used to
            verify authorization bearer tokens passed to the
            application.
        :param oauth: an `OAuthProviderSelector` (e.g.
            `OAuthProviderByEnvironment(dev=Development(),
            prod=Google(...))`) that chooses the OAuth provider for
            authenticating MCP clients. It is resolved (and a
            `TokenVerifier` created automatically) only when the
            application has a `User`-typed auto-construct servicer. `None`
            is equivalent to `OAuthProviderByEnvironment(dev=None,
            prod=None)`. Mutually exclusive with `token_verifier`.
        :param title: a human-readable name for the application.
            Defaults to `application_name()` if unset.
        :param description: a human-readable description of the
            application.
        :param example_prompts: a list of `ExamplePrompt` instances
            for using this application in a chat client.

        TODO(benh): update the initialize function to be run in a
        transaction and ensure that the transaction has finished before
        serving any other calls on the servicers.
        """
        if oauth is not None and token_verifier is not None:
            # TODO(rjh): support _adding_ a token verifier, rather than
            #            demanding this is the only one.
            raise ValueError(
                "`oauth` and `token_verifier` are mutually "
                "exclusive. When `oauth` is set, a "
                "`TokenVerifier` is created automatically."
            )

        # NOTE: `oauth` is an `OAuthProviderSelector`, resolved lazily in
        # `_mount_mcp` only when the app needs a provider to identify
        # users (it has a `User`-typed auto-construct servicer and no
        # `token_verifier`). `oauth=None` is treated as
        # `OAuthProviderByEnvironment(dev=None, prod=None)` there, so an
        # app that needs OAuth but never configured one fails to start.

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
                    f"{', '.join(needed_requirements)}. "
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
        self._oauth = oauth
        self._title = title
        self._description = description
        self._example_prompts = example_prompts or []

        # Validate MCP configuration eagerly at construction time so
        # errors are raised consistently regardless of run environment.
        seen_tools: dict[str, str] = {}
        for servicer_cls in self._servicers or []:
            for tool_name in servicer_cls._mcp_tool_names():
                if tool_name in seen_tools:
                    raise ValueError(
                        f"Duplicate MCP tool name '{tool_name}' registered"
                        f" by both '{seen_tools[tool_name]}' and "
                        f"'{servicer_cls.__name__}'. Use the `name` "
                        "parameter in `Tool()` to give one of them a "
                        "distinct name."
                    )
                seen_tools[tool_name] = servicer_cls.__name__

        # NOTE: we override with `NodeWebFramework` in `NodeApplication`.
        self._web_framework: WebFramework = PythonWebFramework()

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
            # This application is running on Reboot Cloud in "config
            # mode" rather than as a serving server. Don't initialize
            # the Reboot instance or mount the MCP server; the config
            # server that we'll start later doesn't need them.
            return

        # We'll be serving. Mount MCP's HTTP endpoints.
        self._mount_mcp(self._servicers or [])

        if within_nodejs_server() or within_python_server():
            # We don't need to bring up a Reboot cluster when running a
            # Node.js or Python server; this process is one server in the
            # cluster!
            return

        state_directory: Optional[str] = os.environ.get(
            ENVVAR_RBT_STATE_DIRECTORY
        )
        self._state_directory = (
            None if state_directory is None else Path(state_directory)
        )

        # NOTE: we construct a 'Reboot' instance here so that it can
        # perform any process wide initialization as early as possible.
        #
        # We pass the raw `ENVVAR_RBT_NAME` value (which may be `None`)
        # rather than `application_name()`: `Reboot` relies on a `None`
        # name to know that this run is unnamed and therefore may use a
        # throwaway temporary state directory. `application_name()`
        # falls back to a non-`None` default, which would violate that
        # invariant. The human-facing default name is applied to
        # `title` below instead.
        self._rbt = Reboot(
            application_name=os.environ.get(ENVVAR_RBT_NAME),
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
        # Always include `memoize` servicers and `ApplicationServicer`
        # for storing runtime information about the application.
        return (
            (self._servicers or []) + reboot.aio.memoize.servicers() +
            reboot.application.servicers()
        )

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
        auto_construct_state_type_full_names: list[StateTypeName] = []
        new_session_hooks: list[Callable[
            [ExternalContext, Optional[str]],
            Awaitable[None],
        ]] = []
        per_request_hooks: list[Callable[
            [ExternalContext, Optional[str], Any],
            Awaitable[None],
        ]] = []

        # Wire up auto-construction of states for every authenticated user.
        for servicer_cls in servicers:
            if servicer_cls._is_auto_construct:
                auto_construct_state_type_full_names.append(
                    servicer_cls.__state_type_name__
                )

                async def maybe_auto_construct_based_on_user_id(
                    context: ExternalContext,
                    user_id: Optional[str],
                    # Capture by value to avoid the closure-in-a-loop
                    # pitfall.
                    _cls=servicer_cls,
                ):
                    if user_id is None:
                        # We can't auto-construct if there's no user ID.
                        return
                    await _cls._auto_construct(context, state_id=user_id)

                new_session_hooks.append(maybe_auto_construct_based_on_user_id)

        # Record MCP connections made into this application — but only
        # in dev mode.
        if running_rbt_dev():
            # We dedupe so we can skip the RPC entirely for the
            # overwhelmingly-common case of repeated calls on an
            # established connection.
            seen_connections: set[tuple[str, str]] = set()

            async def record_connection(
                context: ExternalContext,
                user_id: Optional[str],
                request,
            ) -> None:
                forwarded_host = (
                    request.headers.get("x-forwarded-host") or
                    request.headers.get("host") or None
                )
                user_agent = request.headers.get("user-agent") or None
                if forwarded_host is None or user_agent is None:
                    # A connection is only meaningful if we have both
                    # `forwarded_host` and `user_agent`; skip if
                    # either is absent.
                    return
                connection = (forwarded_host, user_agent)
                if connection in seen_connections:
                    return
                seen_connections.add(connection)
                await reboot.application.ref().record_connection(
                    context,
                    forwarded_host=forwarded_host,
                    user_agent=user_agent,
                )

            # NOTE: even though we have session hooks we want to check
            # for connections per-request because (a) MCP is dropping
            # sessions and (b) after an expunge we will still want to
            # track which clients have connected and the only way to
            # do that is by looking at each request.
            per_request_hooks.append(record_connection)

        # Create MCP server and register all servicers' tools/resources.
        server = FastMCP(name="reboot-mcp")
        for servicer_cls in servicers:
            servicer_cls._add_mcp(server, auto_construct_state_type_full_names)

        # Create the OAuth server (if configured) before mounting the
        # MCP factory so we can pass it the `MCPSDKOAuthTokenVerifier` -
        # if we didn't have that in place, expired tokens wouldn't be
        # caught until our `OAuthTokenVerifier`, and those errors are
        # (to the MCP SDK) merely internal server errors - they wouldn't
        # produce the 401 error code needed to trigger a token refresh.
        mcp_sdk_token_verifier = None
        oauth_server = None
        # Resolve an OAuth provider only when the app needs one to
        # identify users — it has a `User`-typed auto-construct servicer
        # and isn't already authenticating via a `token_verifier`. The
        # selector's `get()` raises if no provider is configured for the
        # current environment (`oauth=None` is treated as a selector with
        # no provider for any environment).
        if (
            auto_construct_state_type_full_names and
            self._token_verifier is None
        ):
            selector = self._oauth or OAuthProviderByEnvironment(
                dev=None,
                prod=None,
            )
            provider = selector.get()
            # A provider that stores the identity provider's tokens
            # (`store_tokens=True`) persists them via the `oauth` library
            # (which encrypts them via `ciphertext`); require the developer
            # to have mounted them.
            if provider.stores_tokens:
                self._require_oauth_libraries()
            oauth_server = OAuthServer(
                provider=provider,
                protected_resources=[_MCP_PATH],
            )
            self._token_verifier = oauth_server.token_verifier
            mcp_sdk_token_verifier = oauth_server.mcp_sdk_token_verifier
            oauth_server.mount_routes(self.http)

        # The `type: ignore` is needed because `create_mcp_factory`
        # returns a closure, and mypy can't verify Protocol conformance
        # on closures (the closure is structurally compatible with
        # `HTTPASGIApp` at runtime).
        self.http.mount(
            _MCP_PATH,
            factory=create_mcp_factory(  # type: ignore[arg-type]
                server=server,
                new_session_hooks=new_session_hooks,
                per_request_hooks=per_request_hooks,
                token_verifier=mcp_sdk_token_verifier,
            ),
        )

    def _require_oauth_libraries(self) -> None:
        """Fail fast if an OAuth provider with `store_tokens=True` is used
        without the `oauth` (and its `ciphertext`) library mounted — they
        encrypt and persist the identity provider's tokens.
        """
        # Imported lazily: both libraries import `reboot.aio.applications`,
        # so a module-level import would be circular.
        from reboot.std.ciphertext.v1.ciphertext import CIPHERTEXT_LIBRARY_NAME
        from reboot.std.oauth.v1.oauth import OAUTH_LIBRARY_NAME
        names = {library.name for library in (self._libraries or [])}
        if OAUTH_LIBRARY_NAME in names and CIPHERTEXT_LIBRARY_NAME in names:
            return
        raise InputError(
            reason=(
                "An OAuth provider with `store_tokens=True` needs the "
                "`oauth` and `ciphertext` libraries to encrypt and persist "
                "the identity provider's tokens, but they aren't all "
                "mounted. Add them to your `Application`, e.g. "
                "`Application(..., libraries=[oauth_library(), "
                "ciphertext_library(), ordered_map_library()])` (import "
                "`oauth_library` from `reboot.std.oauth.v1.oauth` and "
                "`ciphertext_library` from "
                "`reboot.std.ciphertext.v1.ciphertext`)."
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

        async def initialize(context: InitializeContext) -> None:
            # Construct/refresh the `Application` singleton on every
            # boot so we get latest values (`title`, `description`,
            # etc.), hence `.always()`. An `InitializeContext` is
            # app-internal, which is what `Application.initialize`'s
            # authorizer requires.
            await reboot.application.ref().always().initialize(
                context,
                title=self._title or application_name(),
                description=self._description,
                port=local_envoy_port,
                mcp=any(
                    servicer._mcp_tool_names()
                    for servicer in (self._servicers or [])
                ),
                example_prompts=self._example_prompts,
            )

            if self._initialize is not None:
                await self._initialize(context)

        await self._rbt.up(
            servicers=self.servicers,
            libraries=self.libraries,
            legacy_grpc_servicers=self.legacy_grpc_servicers,
            web_framework=self.web_framework,
            token_verifier=self.token_verifier,
            initialize=initialize,
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

    def _require_crypto_root_keys(self) -> None:
        """Fail fast (clean exit, no stack trace) on a serving path if the
        Reboot-managed cryptographic root keys aren't set. Every serving
        Reboot application needs them: libraries derive keys from them (the
        MCP OAuth server its JWT signing key, `reboot.std.ciphertext` its
        key-encryption key, ...), and they must be identical across all
        server processes. Config pods (`REBOOT_MODE_CONFIG`) only validate
        configuration and never serve, so they never call this.
        """
        if not os.environ.get(ENVVAR_REBOOT_CRYPTO_ROOT_KEYS):
            terminal.fail(
                f"The '{ENVVAR_REBOOT_CRYPTO_ROOT_KEYS}' environment "
                "variable is not set. Every Reboot application needs "
                "cryptographic root keys, shared across all of its "
                "servers. Under `rbt dev` and on Reboot Cloud they are "
                "set automatically; for `rbt serve` you must set an "
                "environment variable yourself"
            )

    async def run(self) -> NoReturn:
        """Runs the application, and does not return unless the application fails.

        Does 'sys.exit' in case of failure.
        """
        # Refuse to run with a `reboot` library that doesn't match the
        # `rbt` CLI that spawned us.
        check_expected_version()

        # Before running, do any pre-run library set up.
        for library in self.libraries:
            await library.pre_run(self)

        colorama.init()

        if within_python_server():
            # We're running as a Python server subprocess — a serving
            # path, so it requires the OAuth signing secret.
            self._require_crypto_root_keys()
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
        # more serving servers — a serving path, so it requires the
        # OAuth signing secret.
        self._require_crypto_root_keys()
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
