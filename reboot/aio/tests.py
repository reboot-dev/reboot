import jwt
import os
import reboot.aio.reboot
import unittest
from reboot.aio.applications import Application, NodeApplication
from reboot.aio.auth.oauth_providers import (
    ExchangeResult,
    OAuthProvider,
    OAuthProviderSelector,
    UserId,
)
from reboot.aio.auth.oauth_server import signing_secret
from reboot.aio.auth.token_verifiers import TokenVerifier
from reboot.aio.contexts import EffectValidation
from reboot.aio.external import ExternalContext, InitializeContext
from reboot.aio.http import WebFramework
from reboot.aio.libraries import AbstractLibrary
from reboot.aio.reboot import ApplicationRevision
from reboot.aio.servicers import Servicer
from reboot.run_environments import in_nodejs
from reboot.settings import (
    ENVVAR_REBOOT_CRYPTO_ROOT_KEYS,
    ENVVAR_REBOOT_ENABLE_EVENT_LOOP_BLOCKED_WATCHDOG,
)
from typing import Any, Awaitable, Callable, Optional, Sequence, overload
from unittest import mock

# Hardcoded cryptographic root keys for unit tests. Not real secrets —
# only used in-process (libraries derive their keys from these, e.g.,
# the OAuth signing key for test JWT minting).
_TEST_CRYPTO_ROOT_KEYS = "v1:reboot-test-root-key"


class OAuthProviderForTest(OAuthProviderSelector):
    """`OAuthProviderSelector` that always returns the given provider,
    regardless of environment. Used by the test `Application`, since
    tests run in a single, known environment."""

    def __init__(self, provider: OAuthProvider):
        self._provider = provider

    def _select(self) -> OAuthProvider:
        return self._provider


# Error message shared by `FakeOnly`'s flow entry points: a pointer to
# the impersonation helper a unit test uses in place of a real OAuth
# flow.
_FAKE_ONLY_NO_FLOWS_MESSAGE = (
    "`FakeOnly` supports no OAuth flows; in unit tests impersonate a "
    "user with `await rbt.create_external_context_as(...)` instead."
)


class FakeOnly(OAuthProvider):
    """OAuth provider that exists only so the test harness can stand up
    an `OAuthServer` to mint and verify test JWTs. Raises on every flow
    entry point; a unit test signs in as a user by impersonating them
    with `await rbt.create_external_context_as(...)`.
    """

    def authorization_url(self, state: str, redirect_uri: str) -> str:
        raise NotImplementedError(_FAKE_ONLY_NO_FLOWS_MESSAGE)

    async def exchange_code(
        self,
        code: str,
        redirect_uri: str,
    ) -> ExchangeResult:
        raise NotImplementedError(_FAKE_ONLY_NO_FLOWS_MESSAGE)


def assert_called_twice_with(
    testcase: unittest.IsolatedAsyncioTestCase,
    mock_obj: mock.Mock,
    *args: Any,
    **kwargs: Any,
) -> None:
    """Asserts that the given mock received exactly two calls, and that they had
    the given arguments.

    This is a useful alternative to `Mock.assert_called_once_with` in the presence
    of effect validation, which will frequently trigger two identical calls to a mock.
    """
    call = mock.call(*args, **kwargs)
    mock_obj.assert_has_calls([call, call])
    testcase.assertEqual(mock_obj.call_count, 2)


def temporary_environ(
    testcase: unittest.TestCase,
    values: dict[str, str],
) -> None:
    """Set env vars for the duration of the test, restoring their
    prior state (including removing keys that weren't set before) on
    test cleanup.

    Call from `asyncSetUp` / `setUp` before anything that reads the
    env vars runs.
    """
    patcher = mock.patch.dict(os.environ, values)
    patcher.start()
    testcase.addCleanup(patcher.stop)


class Reboot(reboot.aio.reboot.Reboot):
    """A testing specific version of `Reboot` that takes an `Application`
    instead of explicit keyword args."""

    def __init__(self) -> None:
        super().__init__(in_process=True)
        # Enable the event loop blocked watchdog for tests
        # so that blocking calls are detected early. This
        # must be set before `start()` which is where
        # `monitor_event_loop()` reads the env var.
        os.environ[ENVVAR_REBOOT_ENABLE_EVENT_LOOP_BLOCKED_WATCHDOG] = 'true'
        # Set the test cryptographic root keys on test-harness
        # construction, not at import, so an accidental `import
        # reboot.aio.tests` in production injects nothing. Key-deriving
        # libraries (the `OAuthServer`'s JWT signing key, ...) need them
        # only at serve time, which for tests is `up()` — always after
        # this constructor. `setdefault` leaves an explicit value (e.g.
        # from `rbt`) untouched, mirroring `rbt dev`.
        os.environ.setdefault(
            ENVVAR_REBOOT_CRYPTO_ROOT_KEYS, _TEST_CRYPTO_ROOT_KEYS
        )
        # The application under test, or `None` before one is started.
        self._application: Optional[Application] = None

    async def make_valid_oauth_access_token(
        self,
        user_id: str = "test-user",
    ) -> str:
        """
        Mint a valid JWT OAuth access token for use in tests.

        Routes through the running application's
        `OAuthServer._mint_tokens_for_user`, which is the single
        production code path every JWT this server hands out goes
        through. That keeps the test token byte-for-byte equivalent
        to one minted by a real `/token` exchange, and it fires
        per-user auto-construct as a side effect — so a test that
        just does `await rbt.make_valid_oauth_access_token(...)`
        and immediately opens an MCP session finds the `User`
        actor already materialized, matching the behaviour MCP-via-
        OAuth flows get for free.

        The identity is just whatever the developer specified — no
        actual authentication takes place.

        Works for any application: `up()` guarantees an OAuth server
        exists, auto-supplying a `FakeOnly` test provider when the app
        has no `oauth=` of its own. Call `up()` before this.
        """
        assert (
            self._application is not None and
            self._application._oauth_server is not None
        ), (
            "make_valid_oauth_access_token() needs a running "
            "application with an OAuth server; call `up()` first. "
            "`up()` guarantees one for every test application "
            "(auto-supplying a `FakeOnly` test provider when the app "
            "has no `oauth=`), so this only trips when it is called "
            "before `up()`."
        )
        oauth_server = self._application._oauth_server

        tokens = await oauth_server._mint_tokens_for_user(
            user_id=UserId(user_id),
            # Tests don't model a real OAuth client; use a stable
            # synthetic id so refresh tokens minted in the same
            # process round-trip cleanly.
            client_id="reboot-test-client",
            # `iss` claim on the access token. The verifier ignores
            # `iss` (it only checks signature + `aud` + `exp`), so
            # this value is cosmetic; pick a stable string so the
            # token has a recognisable shape if dumped in a debug
            # log.
            base="http://reboot-test",
            # Production mints from `app_internal=True` routes, so
            # `_post_authenticate`'s auto-construct Writer runs as
            # trusted app code; tests have no request, so build an
            # app-internal context off the test `Reboot` directly.
            context=self.create_external_context(
                name="reboot.tests.make_valid_oauth_access_token",
                app_internal=True,
            ),
        )
        return tokens["access_token"]

    async def create_external_context_as(
        self,
        name: str,
        user_id: str = "test-user",
    ) -> ExternalContext:
        """
        Create an `ExternalContext` authenticated as `user_id`.

        The standard way a test impersonates a signed-in user: mint a
        valid OAuth access token for `user_id` (see
        `make_valid_oauth_access_token`) and hand it to
        `create_external_context` as the bearer token. Works for any
        application — `up()` guarantees an OAuth server to mint
        through, so call `up()` first.
        """
        return self.create_external_context(
            name=name,
            bearer_token=await self.make_valid_oauth_access_token(
                user_id=user_id,
            ),
        )

    def make_jwt(self, **claims: Any) -> str:
        """
        Mint an arbitrary JWT signed with the test signing secret.
        
        Use `make_bearer_token` for the common case of a valid access
        token; use this for custom tokens (expired, refresh, client,
        etc.).
        """
        return jwt.encode(
            claims,
            signing_secret(),
            algorithm="HS256",
        )

    @overload
    async def up(
        self,
        application: Application,
        *,
        local_envoy: Optional[bool] = None,
        local_envoy_port: int = 0,
        local_envoy_tls: Optional[bool] = None,
        servers: Optional[int] = None,
        effect_validation: Optional[EffectValidation] = None,
    ) -> ApplicationRevision:
        ...

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
        revision: Optional[ApplicationRevision] = None,
    ) -> ApplicationRevision:
        ...

    async def up(
        self,
        application: Optional[Application] = None,
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

        if revision is not None and application is not None:
            raise ValueError(
                "Only one of 'application' OR 'revision' can be passed"
            )

        if servicers is not None:
            raise ValueError("Not expecting 'servicers'")

        if legacy_grpc_servicers is not None:
            raise ValueError("Not expecting 'legacy_grpc_servicers'")

        if len(libraries) != 0:
            raise ValueError("Not expecting 'libraries'")

        if web_framework is not None:
            raise ValueError("Not expecting 'web_framework'")

        if token_verifier is not None:
            raise ValueError("Not expecting 'token_verifier'")

        if initialize is not None:
            raise ValueError("Not expecting 'initialize'")

        if initialize_bearer_token is not None:
            raise ValueError("Not expecting 'initialize_bearer_token'")

        if revision is not None:
            if servers is not None:
                raise ValueError("Not expecting 'servers'")

            if effect_validation is not None:
                raise ValueError("Not expecting 'effect_validation'")

            return await super().up(
                revision=revision,
            )

        if application is None:
            raise ValueError("Must pass one of 'application' or 'revision'")

        self._application = application

        # Guarantee every app under test has an OAuth server, so the
        # minting chokepoint `make_valid_oauth_access_token` (and
        # `create_external_context_as` on top of it) works uniformly.
        # An app that configured its own `oauth=` keeps it; one without
        # gets a `FakeOnly` provider, whose verifier composes ahead of
        # any `token_verifier=` (Reboot-minted access JWTs verify
        # first, everything else falls through), so a custom verifier
        # still authenticates its own tokens.
        # Node.js applications can't serve the OAuth server's
        # endpoints from their process, so they get no injected
        # provider (and `create_external_context_as` stays
        # Python-app-only for now).
        if (
            application._oauth is None and
            not isinstance(application, NodeApplication)
        ):
            application._oauth = OAuthProviderForTest(FakeOnly())

        # Mount the OAuth server and MCP factory now, at serve time —
        # the production serve path does this in `Application.run()`,
        # which tests don't call.
        if not application._config_mode:
            application._mount_oauth_and_mcp()

        # Should only have `application`, `local_envoy`,
        # `local_envoy_port`, `servers`, `effect_validation`.

        # Check if application.http has methods or mounts (note this
        # isn't relevant for TypeScript, which doesn't have that
        # property). If yes, we need a local_envoy to be present to
        # handle these requests.
        if local_envoy is None and not in_nodejs():
            if application.has_http_routes_or_mounts():
                local_envoy = True

        revision = await super().up(
            servicers=application.servicers,
            legacy_grpc_servicers=application.legacy_grpc_servicers,
            libraries=application.libraries,
            web_framework=application.web_framework,
            token_verifier=application.token_verifier,
            initialize=application.initialize,
            initialize_bearer_token=application._initialize_bearer_token,
            local_envoy=local_envoy,
            local_envoy_port=local_envoy_port,
            local_envoy_tls=local_envoy_tls,
            servers=servers,
            effect_validation=effect_validation,
        )

        return revision
