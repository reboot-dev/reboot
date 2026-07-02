from __future__ import annotations

import asyncio
import colorama
import inspect
import os
import reboot.aio.memoize
import reboot.aio.workflows
import reboot.application
import sys
import traceback
from collections import OrderedDict
from log.log import get_logger
from mcp.server.fastmcp import FastMCP
from pathlib import Path
from rbt.v1alpha1.application.application_pb2 import ExamplePrompt
from reboot.aio.auth.oauth_providers import OAuthProviderSelector
from reboot.aio.auth.oauth_server import OAuthServer
from reboot.aio.auth.token_verifiers import (
    CompoundTokenVerifier,
    TokenVerifier,
)
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
from reboot.cli.common import terminal
from reboot.controller.server_managers import (
    run_nodejs_server_process,
    run_python_server_process,
)
from reboot.controller.settings import ENVVAR_REBOOT_MODE, REBOOT_MODE_CONFIG
from reboot.mcp.factories import create_mcp_factory
from reboot.mcp.ui import find_project_root_from
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
    ENVVAR_RBT_FRONTEND_DIST_PATH,
    ENVVAR_RBT_FRONTEND_HOST,
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
from starlette.staticfiles import StaticFiles
from typing import Any, Awaitable, Callable, NoReturn, Optional
from urllib.parse import urlparse

logger = get_logger(__name__)

_MCP_PATH = "/mcp"

# Cap on the per-instance cache of user ids that `_post_authenticate`
# has already handled. Eviction is harmless: the next JWT mint for an
# evicted user re-runs the idempotent auto-construct calls.
_POST_AUTHENTICATED_USER_IDS_LIMIT = 16_384


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
        allowed_origins: Optional[list[str]] = None,
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
            application. May be combined with `oauth`: the OAuth
            server's verifier runs first, and any token it has no
            opinion on (i.e. anything that is not a Reboot-minted
            access JWT) falls through to this verifier. A
            Reboot-minted access JWT that fails verification (e.g.
            one that has expired) is rejected outright, without
            falling through. The MCP endpoint (`/mcp`) accepts only
            Reboot-minted access JWTs; tokens verified by this
            verifier authenticate Reboot RPCs, not `/mcp`.
        :param oauth: an `OAuthProviderSelector` (e.g.
            `OAuthProviderByEnvironment(dev=Development(),
            prod=Google(...))`) that chooses the OAuth provider for
            authenticating users. Works for both MCP chat clients
            and browser SPAs. Resolved (and a `TokenVerifier` created
            automatically) whenever it is set, even for an app with
            nothing to auto-construct. May be combined with
            `token_verifier`; see there for the ordering semantics.
        :param allowed_origins: exact-match list of HTTP origins
            (`scheme://host[:port]`, e.g.
            `"https://app.example.com"`) that browsers are allowed
            to talk to this backend from when the request needs to
            carry credentials (the OAuth session cookie or, post
            sign-in, the bearer JWT minted by `/__/oauth/whoami`).
            The backend's own origin is always trusted on top of
            this list, so same-origin browser clients work no matter
            what; `allowed_origins` only ever *widens* trust to
            additional, cross-origin SPAs. An explicit empty list
            (`[]`) means *no* cross-origin credentialed traffic; only
            same-origin browser clients can sign in or call RPCs. An
            app with neither `oauth=...`
            nor `allowed_origins` keeps serving permissive CORS (any
            origin): without browser credentials there is nothing an
            allow-list would protect.

            Two environment-driven defaults sit on top of this:

            - **Dev (`rbt dev run`)**: `http://localhost(:*)?` and
              `http://127.0.0.1(:*)?` are allowed automatically, so
              a Vite/webpack/parcel dev server on any port works
              without ceremony.

            - **Prod with `oauth=...`**: omitting `allowed_origins`
              entirely (leaving it at the default `None`) is a
              hard error at construction time. Pass `[]` explicitly
              to opt into same-origin-only browser auth; pass the
              SPA's real origin to enable cross-origin sign-in. The
              default-None case almost always means "the developer
              forgot", and we'd rather raise loudly than silently
              CORS-block every sign-in attempt in production.
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
        # NOTE: `oauth` is an `OAuthProviderSelector`, resolved lazily
        # in `_mount_oauth` whenever it is configured, mounting the
        # OAuth server even for an app with nothing to auto-construct.
        # An app with a `User`-typed auto-construct servicer but no
        # `oauth=` fails to start: a `token_verifier=` authenticates
        # requests but never auto-constructs those users.

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
        self._oauth_server: Optional[OAuthServer] = None
        # Bounded LRU (keys only; values are a placeholder `None`) of
        # users for whom `_post_authenticate` has already run. Kept
        # per-instance rather than on the class so a fresh `Reboot()` +
        # state store per test method doesn't inherit a stale "already
        # authenticated" flag from a sibling test.
        self._post_authenticated_user_ids: OrderedDict[str,
                                                       None] = (OrderedDict())
        # `allowed_origins=None` (the default) is meaningfully
        # distinct from `allowed_origins=[]` (an explicit choice).
        # The default tells us the developer hasn't thought about
        # cross-origin CORS yet — which is fine in dev (we'll fill
        # in `http://localhost(:*)?` automatically downstream) and
        # for MCP-only / same-origin deployments, but in prod with
        # `oauth=...` it's almost always a forgotten config.
        # Reject loudly there so production never silently 403s
        # every cross-origin sign-in attempt; in dev, warn so the
        # gap is caught before `rbt cloud up`.
        if (
            oauth is not None and
            oauth.requires_allowed_origins_in_production() and
            allowed_origins is None
        ):
            if not running_rbt_dev():
                raise InputError(
                    reason=(
                        "`Application(oauth=...)` requires "
                        "`allowed_origins=[...]` to be set explicitly "
                        "in production. List the SPA's origin (e.g. "
                        "`['https://app.example.com']`), or pass an "
                        "empty list `allowed_origins=[]` to opt into "
                        "same-origin-only browser auth. The default "
                        "(`None`) is forbidden in production because "
                        "almost every `oauth=` app has a browser SPA "
                        "and a missing `allowed_origins` silently "
                        "blocks every cross-origin sign-in. In dev "
                        "(`rbt dev run`) the default is honored — "
                        "`http://localhost(:*)?` is allowed "
                        "automatically. See the "
                        "`Application.allowed_origins` docstring for "
                        "the JWT-exfiltration argument behind the "
                        "exact-match requirement."
                    ),
                )
            logger.warning(
                "`Application(oauth=...)` is running without "
                "`allowed_origins=[...]`. Under `rbt dev run` that "
                "works — `http://localhost(:*)?` is allowed "
                "automatically — but the same configuration will fail "
                "to deploy to production. Before `rbt cloud up`, list "
                "the SPA's origin (e.g. `['https://app.example.com']`), "
                "or pass an empty list `allowed_origins=[]` to opt "
                "into same-origin-only browser auth."
            )
        # `None` — kept distinct from an empty list — means the
        # application has no credentialed browser traffic to protect
        # (neither `oauth=` nor `allowed_origins`), and CORS stays
        # permissive. Once the app has either, the exact-match
        # allow-list (possibly empty) applies.
        self._allowed_origins: Optional[list[str]] = (
            None if allowed_origins is None and oauth is None else
            list(allowed_origins or [])
        )
        # Light validation: surface obvious typos at construction
        # rather than waiting for a browser to silently fail a CORS
        # preflight at runtime.
        for origin in self._allowed_origins or []:
            if not isinstance(origin, str):
                raise ValueError(
                    "`allowed_origins` must be a list of strings; "
                    f"got entry of type {type(origin).__name__}"
                )
            if not (
                origin.startswith("http://") or origin.startswith("https://")
            ):
                raise ValueError(
                    f"`allowed_origins` entry {origin!r} must be a full "
                    "origin starting with 'http://' or 'https://' (e.g. "
                    "'https://app.example.com'); paths, wildcards, and "
                    "bare hostnames are not accepted"
                )
            if origin.endswith("/"):
                raise ValueError(
                    f"`allowed_origins` entry {origin!r} must not have "
                    "a trailing slash (CORS `Origin` headers never carry "
                    "one)"
                )
            # Reject anything beyond `scheme://host[:port]` — a path,
            # query, or fragment would slip past validation but never
            # match the browser's `Origin: scheme://host[:port]` header
            # at Envoy's exact-match CORS filter, producing a silent
            # cross-origin block with no diagnostic.
            parsed = urlparse(origin)
            if parsed.path not in ("", "/") or parsed.query or parsed.fragment:
                raise ValueError(
                    f"`allowed_origins` entry {origin!r} must be just "
                    "an origin (`scheme://host[:port]`) — no path, "
                    "query string, or fragment. CORS `Origin` headers "
                    "never carry them, so an entry with a path would "
                    "never match."
                )
        self._title = title or application_name()
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

        config_mode = False
        try:
            self._run_environment = detect_run_environment()
            config_mode = (
                self._run_environment == RunEnvironment.RBT_CLOUD and
                os.environ.get(ENVVAR_REBOOT_MODE) == REBOOT_MODE_CONFIG
            )
        except InvalidRunEnvironment:
            # Not serving: either a unit test (which will call
            # `Reboot.up` to bring up a cluster) or an app run without
            # `rbt dev` / `rbt serve` (which gets a helpful run-time
            # error and exits). The serving setup below is deferred.
            self._run_environment = None

        # A Reboot Cloud config server validates configuration and never
        # serves, so it mounts neither the OAuth server nor the MCP
        # factory. Remember the mode so the serve-time mount (in `run()`
        # and, for tests, `Reboot.up`) can skip it.
        self._config_mode = config_mode
        # Guards `_mount_oauth_and_mcp` so the serve paths (entry
        # process, server subprocess `run()`, and the test harness's
        # repeatable `up()`) mount at most once per `Application`.
        self._mounted = False

        if self._run_environment is None or config_mode:
            return

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

    def _auto_construct_state_type_full_names(self) -> list[StateTypeName]:
        """The state type names of this application's auto-construct
        servicers — those whose state is constructed on demand for an
        authenticated user — in servicer order.
        """
        return [
            servicer_cls.__state_type_name__
            for servicer_cls in (self._servicers or [])
            if servicer_cls._is_auto_construct
        ]

    def _validate_configuration(self) -> None:
        """The serve-time OAuth validation a config pod runs: a config
        pod never mounts the OAuth server, so enforce here what
        mounting would have enforced, failing the config pod fast
        rather than letting a misconfigured app roll out to serving
        pods.
        """
        self._require_oauth_for_auto_construct()
        if self._oauth is not None:
            # Mounting resolves the selector for the current
            # environment, so resolve it here too: a selector with no
            # provider for this environment (e.g. `prod=None`) fails
            # the config pod with the selector's actionable message.
            self._oauth.get()

    def _require_oauth_for_auto_construct(self) -> None:
        """Fail fast if the application has auto-construct servicers but
        no `Application(oauth=...)`.

        Auto-construction brings a user's state into being the first
        time that user is seen, and a user is only ever identified by
        signing in through the OAuth flow — so an OAuth provider is what
        makes those states constructable. A `token_verifier=`
        authenticates incoming requests but never triggers
        auto-construction, so it can't take the place of `oauth=`.
        """
        if self._oauth is not None:
            return
        if not self._auto_construct_state_type_full_names():
            return
        raise InputError(
            reason=(
                "This application has auto-construct servicers but no "
                "`Application(oauth=...)`. Their states are constructed for a "
                "user the first time that user signs in through the OAuth "
                "flow, so an OAuth provider is what identifies the users to "
                "construct. A `token_verifier=` authenticates requests but "
                "never auto-constructs, so it can't take the place of `oauth=` "
                "here. Configure `oauth=...`, e.g. "
                "`Application(oauth=OAuthProviderByEnvironment(dev=..., "
                "prod=...))`."
            )
        )

    def _mount_oauth_and_mcp(self) -> None:
        """Bring up the OAuth server (if the app needs one to identify
        users) and then the MCP factory. Order matters: OAuth first,
        so `_mount_mcp` can read `self._oauth_server`.

        Idempotent: calling this multiple times will still only mount
        once.
        """
        if self._mounted:
            return
        # Mark as mounted before doing the work: a partial mount (e.g.
        # `_mount_oauth` succeeds and wraps `_token_verifier`, then
        # `_mount_mcp` raises) must not be retried into a second OAuth
        # server or duplicate routes on the same `Application`.
        self._mounted = True

        # Auto-construction only ever happens through the OAuth sign-in
        # flow, so an application with auto-construct servicers must
        # configure `oauth=`; fail fast here if it hasn't.
        self._require_oauth_for_auto_construct()

        auto_construct_state_type_full_names = self._mount_oauth(
            self._servicers or []
        )
        self._mount_mcp(
            self._servicers or [],
            auto_construct_state_type_full_names,
        )

    def _mount_oauth(
        self,
        servicers: list[type[Servicer]],
    ) -> list[StateTypeName]:
        """Mount the OAuth Authorization Server when the app has an
        `Application(oauth=...)` provider configured, regardless of
        whether anything auto-constructs.

        Kept separate from `_mount_mcp` so that browser-only apps (a
        standalone SPA with no MCP servicers) get the OAuth server
        too; the access JWTs it issues authenticate both the MCP and
        the web surface.

        Returns the state type names that auto-construct per user.
        """
        auto_construct_state_type_full_names = (
            self._auto_construct_state_type_full_names()
        )
        # Resolve an OAuth provider whenever `Application(oauth=...)` is
        # configured, regardless of whether anything auto-constructs —
        # an app adopting Reboot auth for its web surface shouldn't have
        # to introduce a `User` type just to get a login flow. The
        # selector's `get()` still raises if the configured provider has
        # nothing for the current environment (e.g. a prod arm left
        # unset).
        if self._oauth is not None:
            provider = self._oauth.get()
            # A provider that stores the identity provider's tokens
            # (`store_tokens=True`) persists them via the `oauth`
            # library (which encrypts them via `ciphertext`); require
            # the developer to have mounted them.
            if provider.stores_tokens:
                self._require_oauth_libraries()
            oauth_server = OAuthServer(
                provider=provider,
                protected_resources=[_MCP_PATH],
                application_title=self._title,
                auto_construct_state_type_full_names=(
                    auto_construct_state_type_full_names
                ),
                post_authenticate=self._post_authenticate,
            )
            self._oauth_server = oauth_server
            if self._token_verifier is not None:
                # Compose with the user's own verifier: the OAuth
                # server's verifier runs first, definitively rejecting
                # invalid Reboot-minted access JWTs (e.g. expired ones),
                # while tokens of any other shape fall through to the
                # user's verifier.
                self._token_verifier = CompoundTokenVerifier(
                    [oauth_server.token_verifier, self._token_verifier]
                )
            else:
                self._token_verifier = oauth_server.token_verifier
            oauth_server.mount_routes(self.http)
        return auto_construct_state_type_full_names

    async def _post_authenticate(
        self,
        context: ExternalContext,
        user_id: str,
    ) -> None:
        """Materialize per-user auto-construct state the first time a
        user authenticates. Safe and cheap to call again for the same
        user.

        `context` is app-internal: materializing the state is a Writer
        call (`User.Create(...)`) that the authorizer permits from
        trusted app code (auto-construct `User` types allow
        app-internal callers).
        """
        # Idempotent across both calls and processes: an instance-
        # level cache makes repeat hits free within one `Application`
        # lifetime, and Reboot's storage-layer idempotency makes the
        # construct durable across processes. The cache is
        # deliberately a per-instance attribute, not a class
        # attribute, so a fresh `Reboot()` + state store per test
        # method doesn't inherit a stale "already authenticated" flag
        # from a sibling test.
        if user_id in self._post_authenticated_user_ids:
            self._post_authenticated_user_ids.move_to_end(user_id)
            return
        # Fan out across all auto-construct servicers in parallel —
        # every JWT mint blocks on this, so a serial loop would add N
        # RPC RTTs to first-time sign-in for an app with N auto-
        # construct state types.
        await asyncio.gather(
            *(
                servicer_cls._auto_construct(context, state_id=user_id)
                for servicer_cls in (self._servicers or [])
                if servicer_cls._is_auto_construct
            )
        )
        self._post_authenticated_user_ids[user_id] = None
        # Evict least-recently-authenticated entries beyond the cap; an
        # evicted user's next mint just redoes the (idempotent, cheap)
        # auto-construct calls.
        while (
            len(self._post_authenticated_user_ids)
            > _POST_AUTHENTICATED_USER_IDS_LIMIT
        ):
            self._post_authenticated_user_ids.popitem(last=False)

    def _mount_mcp(
        self,
        servicers: list[type[Servicer]],
        auto_construct_state_type_full_names: list[StateTypeName],
    ) -> None:
        """Mount the `/mcp` endpoint, registering MCP tools and
        resources from any servicers that declare them. `/mcp` is
        always mounted, even when no servicer has tools — the server
        accepts connections and explains what's missing.

        Reads `self._oauth_server` (set up by `_mount_oauth`) for the
        MCP-SDK token verifier, so the OAuth server must already be in
        place.
        """

        per_request_hooks: list[Callable[
            [ExternalContext, Optional[str], Any],
            Awaitable[None],
        ]] = []

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

            # Check for connections on every request rather than once
            # per session: (a) MCP is dropping sessions, and (b) after
            # an expunge we still want to track which clients have
            # connected, which we can only observe per-request.
            per_request_hooks.append(record_connection)

        # Create MCP server and register all servicers' tools/resources.
        server = FastMCP(name="reboot-mcp")
        for servicer_cls in servicers:
            servicer_cls._add_mcp(server, auto_construct_state_type_full_names)

        # The OAuth server (if any) was mounted earlier by
        # `_mount_oauth`; reach into it for the MCP-SDK token
        # verifier so expired tokens produce a clean 401 with
        # `WWW-Authenticate` from the SDK rather than an opaque
        # internal-server-error from our own verifier.
        mcp_sdk_token_verifier = (
            self._oauth_server.mcp_sdk_token_verifier
            if self._oauth_server is not None else None
        )

        # The `type: ignore` is needed because `create_mcp_factory`
        # returns a closure, and mypy can't verify Protocol conformance
        # on closures (the closure is structurally compatible with
        # `HTTPASGIApp` at runtime).
        self.http.mount(
            _MCP_PATH,
            factory=create_mcp_factory(  # type: ignore[arg-type]
                server=server,
                per_request_hooks=per_request_hooks,
                token_verifier=mcp_sdk_token_verifier,
            ),
        )

        # In dist mode (a built frontend, no Vite dev server) serve the
        # `--frontend-dist-path` directory over `/__/frontend/` from this
        # same HTTP server, alongside `/mcp`. Envoy has no frontend route
        # in this mode, so a browser's `/__/frontend/...` request falls
        # through to the app's HTTP cluster and lands here. Starlette
        # strips the mount prefix, so `StaticFiles(directory=dist_dir)`
        # resolves `/__/frontend/web/index.html` to
        # `dist_dir/web/index.html`. The mount must be present in every
        # serving server subprocess, so it is established here at serve
        # time. In HMR mode `ENVVAR_RBT_FRONTEND_HOST` points at the
        # Vite dev server and Envoy routes `/__/frontend/` there
        # instead, so skip the mount.
        frontend_dist_path = os.environ.get(ENVVAR_RBT_FRONTEND_DIST_PATH)
        if frontend_dist_path and not os.environ.get(ENVVAR_RBT_FRONTEND_HOST):
            project_root = self._frontend_project_root()
            self.http.mount(
                "/__/frontend",
                app=StaticFiles(
                    directory=str(project_root / frontend_dist_path),
                    # `html=True` so directory URLs like
                    # `/__/frontend/web/` (the web app's pop-out target)
                    # serve `index.html`. `check_dir=False` so a
                    # not-yet-built dist doesn't crash startup: `ui.py`
                    # still serves its "build not found" placeholder for
                    # MCP UIs, and the web app 404s until it's built.
                    # `follow_symlink=True` so a dist whose files are
                    # symlinks pointing outside the served tree still
                    # resolves — notably under Bazel runfiles, where the
                    # built dist is a symlink farm into `bazel-out` and
                    # Starlette's default `realpath` check would reject
                    # every file as escaping the directory.
                    html=True,
                    check_dir=False,
                    follow_symlink=True,
                ),
            )

    def _frontend_project_root(self) -> Path:
        """The project root (the directory containing `.rbtrc`) that
        `--frontend-dist-path` is relative to.

        `self.servicers` mixes the user's servicers with
        framework-provided ones (libraries, `memoize`,
        `ApplicationServicer`) in no guaranteed order, and the
        framework ones live outside the project (e.g. in
        `site-packages`), where no `.rbtrc` is found. Resolve the root
        from the first servicer that has one.
        """
        for servicer in self.servicers:
            try:
                return find_project_root_from(inspect.getfile(servicer))
            except (RuntimeError, TypeError):
                # No `.rbtrc` above this servicer's file, or the
                # servicer has no source file at all.
                continue
        raise InputError(
            reason=(
                "`--frontend-dist-path` was set, but no project root (a "
                "directory containing `.rbtrc`) was found above any of "
                "this application's servicers, so the built frontend "
                "can't be located. Make sure your deployment includes "
                "your project's `.rbtrc` alongside its code."
            )
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
                title=self._title,
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

        # The entry process serves this application's web framework and
        # token verifier (and stores them on the revision that in-process
        # servers launch from), so — like the server subprocesses' `run()`
        # and the test harness's `up()` — it mounts the OAuth server and
        # MCP factory here, at its serve point, where the crypto root keys
        # are guaranteed present.
        if not self._config_mode:
            self._mount_oauth_and_mcp()

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
            allowed_origins=self._allowed_origins,
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
            # Mount the OAuth server and MCP factory here, at serve
            # time: the crypto root keys the OAuth server derives its
            # signing key from are guaranteed present now (just
            # required above), and this is the point where
            # `self._token_verifier` and the web framework's routes are
            # consumed by the server process below.
            if not self._config_mode:
                self._mount_oauth_and_mcp()
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
                    self._validate_configuration()
                    server = ConfigServer(
                        serviceables=self._get_serviceables(),
                        allowed_origins=self._allowed_origins,
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

    def _mount_oauth(
        self,
        servicers: list[type[Servicer]],
    ) -> list[StateTypeName]:
        # The OAuth Authorization Server is implemented on top of the
        # Python web framework. Node.js apps can't serve its
        # endpoints from the same process, so the unified `oauth=`
        # flow is Python-only this phase.
        if self._oauth is not None:
            raise ValueError(
                "`oauth=...` is not yet supported for Node.js "
                "applications. Use `token_verifier=...` with your "
                "own IdP integration, or switch to a Python-based "
                "Reboot application."
            )
        return []

    def _mount_mcp(
        self,
        servicers: list[type[Servicer]],
        auto_construct_state_type_full_names: list[StateTypeName],
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

            # Mount the OAuth server and MCP factory here, at serve
            # time, mirroring the Python server path: this Node server
            # subprocess is the serving path that consumes
            # `self._token_verifier` below. A Node mount derives no
            # crypto signing key (Node apps can't serve the Python
            # OAuth endpoints), so unlike the Python path there is no
            # key requirement to sequence after.
            if not self._config_mode:
                self._mount_oauth_and_mcp()

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
