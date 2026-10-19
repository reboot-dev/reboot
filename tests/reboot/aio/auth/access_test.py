import httpx
import os
import unittest
from rbt.v1alpha1 import errors_pb2
from reboot.aio.auth import SESSION_COOKIE_NAME, Auth
from reboot.aio.auth.access import (
    ACCESS_COOKIE_NAME,
    CALLBACK_PATH,
    SIGNOUT_PATH,
    Access,
    AppSignIn,
    Policy,
    UserPolicy,
    Visitor,
)
from reboot.aio.auth.oauth import Allow, ResourceDecision, ResourceRequest
from reboot.aio.auth.oauth_providers import Development
from reboot.aio.auth.oauth_server import OAuthServer
from reboot.aio.auth.token_verifiers import TokenVerifier
from reboot.aio.http import PythonWebFramework
from reboot.settings import (
    ENVVAR_RBT_DEV,
    ENVVAR_REBOOT_ACCESS_ISSUER,
    ENVVAR_REBOOT_ACCESS_POLICY,
)
from starlette.requests import Request
from starlette.responses import PlainTextResponse
from tests.reboot.aio.auth import oauth_server_harness as harness
from typing import Any, Optional
from urllib.parse import parse_qs, urlparse


class _Policy(Policy):
    """Lets in the visitors in `allowed`, or everyone while it is
    `None`; remembers everyone it was asked about."""

    def __init__(self) -> None:
        self.allowed: Optional[set[str]] = None
        self.asked: list[Visitor] = []

    def allows(self, visitor: Visitor) -> bool:
        self.asked.append(visitor)
        return self.allowed is None or visitor.user_id in self.allowed

    def describe(self) -> str:
        return "the chosen few"


class _Context:
    """Stands in for the `ReaderContext` a token verifier receives:
    whether the call is from within the application, and its
    `Cookie`."""

    def __init__(self, *, app_internal: bool, cookie: Optional[str]):
        self.app_internal = app_internal
        self.cookie = cookie


class _Verifier(TokenVerifier):
    """Vouches for the one token `good`."""

    def __init__(self, good: str):
        self.good = good

    async def verify_token(self, context: Any, token: Optional[str]) -> Any:
        if token == self.good:
            return Auth(user_id="app-user")
        return None


async def _issuer_authorizes(
    context: Any,
    request: ResourceRequest,
) -> ResourceDecision:
    """The issuer's `authorize_resource`: anyone, for any resource."""
    return Allow()


class AccessTest(unittest.IsolatedAsyncioTestCase):
    """The access policy in front of an application's routes, with a
    second `OAuthServer` standing in for the issuer (the Cloud)."""

    def setUp(self) -> None:
        harness.ensure_root_keys()
        os.environ[ENVVAR_RBT_DEV] = "true"
        self.issuer = harness.serve(
            OAuthServer(
                provider=Development(),
                protected_resources=["/mcp"],
                application_title="Reboot Cloud",
                authorize_resource=_issuer_authorizes,
            ).mount_routes
        )
        self.policy = _Policy()

    def _app(self, issuer_origin: str, *, with_oauth: bool) -> Any:
        """The application: a `/hello` route, its own OAuth server
        when `with_oauth`, and the access policy in front."""
        self.app_server: Optional[OAuthServer] = None
        app_sign_in = None
        if with_oauth:
            self.app_server = OAuthServer(
                provider=Development(),
                protected_resources=["/mcp"],
                application_title="Counter",
            )
            app_sign_in = AppSignIn(
                session_cookie_name=SESSION_COOKIE_NAME,
                is_access_token=self.app_server.is_access_token,
                protected_resources=["/mcp"],
            )
        self.access = Access(
            issuer=issuer_origin,
            policy=self.policy,
            app=app_sign_in,
            client_name="Counter",
        )

        def mount(http: PythonWebFramework.HTTP) -> None:
            if self.app_server is not None:
                self.app_server.mount_routes(http)
            self.access.mount_routes(http)

            async def hello(request: Request) -> PlainTextResponse:
                return PlainTextResponse("hello")

            http.get("/hello")(hello)
            http.post("/mcp")(hello)

        return harness.serve(mount, middleware=self.access.middleware)

    async def _let_in(
        self,
        browser: httpx.AsyncClient,
        app_origin: str,
        *,
        identity: str,
        path: str = "/hello",
    ) -> httpx.Response:
        """Navigate to `path` as a browser and follow the sign-in
        through the issuer, choosing `identity` at its development
        account picker. Returns the response to the final redirect
        back, or an earlier one when the sign-in stopped there."""
        response = await browser.get(
            f"{app_origin}{path}",
            headers={"Accept": "text/html"},
        )
        if response.status_code != 302:
            return response
        location = response.headers["location"]
        self.assertTrue(location.startswith(self.access.issuer))
        params = parse_qs(urlparse(location).query)
        self.assertEqual(params["resource"], [app_origin])
        self.assertEqual(
            params["redirect_uri"], [f"{app_origin}{CALLBACK_PATH}"]
        )
        # The issuer: no consent screen, since the code goes back to
        # the very origin the token is for; straight to its picker.
        response = await browser.get(location)
        self.assertEqual(response.status_code, 302, response.text)
        location = response.headers["location"]
        self.assertIn("/__/oauth/dev-login", location)
        state = parse_qs(urlparse(location).query)["state"][0]
        response = await browser.get(
            f"{self.access.issuer}/__/oauth/callback",
            params={
                "code": identity,
                "state": state
            },
        )
        self.assertEqual(response.status_code, 302, response.text)
        location = response.headers["location"]
        self.assertTrue(location.startswith(f"{app_origin}{CALLBACK_PATH}"))
        response = await browser.get(location)
        if response.status_code != 302:
            return response
        self.assertEqual(response.headers["location"], path)
        return await browser.get(
            f"{app_origin}{path}", headers={"Accept": "text/html"}
        )

    async def test_browser_is_sent_through_the_issuer(self):
        async for issuer_origin in harness.serve_on_loopback(self.issuer):
            app = self._app(issuer_origin, with_oauth=False)
            async for app_origin in harness.serve_on_loopback(app):
                async with httpx.AsyncClient() as browser:
                    response = await self._let_in(
                        browser, app_origin, identity="Alice"
                    )
                    self.assertEqual(response.status_code, 200, response.text)
                    self.assertEqual(response.text, "hello")
                    self.assertIn(ACCESS_COOKIE_NAME, browser.cookies)
                    alice = self.policy.asked[0].user_id
                    self.assertTrue(alice.startswith("dev-"))
                    self.assertEqual(
                        self.policy.asked[0].issuer, issuer_origin
                    )
                    # The cookie, not the issuer, lets the next request
                    # in, API calls included.
                    response = await browser.post(f"{app_origin}/mcp")
                    self.assertEqual(response.status_code, 200)
                    # Until signed out.
                    response = await browser.get(f"{app_origin}{SIGNOUT_PATH}")
                    self.assertEqual(response.status_code, 200)
                    self.assertNotIn(ACCESS_COOKIE_NAME, browser.cookies)
                    response = await browser.post(f"{app_origin}/mcp")
                    self.assertEqual(response.status_code, 401)

    async def test_policy_turns_a_visitor_away(self):
        async for issuer_origin in harness.serve_on_loopback(self.issuer):
            app = self._app(issuer_origin, with_oauth=False)
            async for app_origin in harness.serve_on_loopback(app):
                async with httpx.AsyncClient() as alice:
                    response = await self._let_in(
                        alice, app_origin, identity="Alice"
                    )
                    self.assertEqual(response.status_code, 200)
                self.policy.allowed = {self.policy.asked[0].user_id}
                async with httpx.AsyncClient() as ben:
                    response = await self._let_in(
                        ben, app_origin, identity="Ben"
                    )
                    self.assertEqual(response.status_code, 403, response.text)
                    self.assertIn("the chosen few", response.text)
                    self.assertNotIn(ACCESS_COOKIE_NAME, ben.cookies)
                # Alice's cookie no longer lets her in once the policy
                # changes its mind.
                self.policy.allowed = set()
                async with httpx.AsyncClient() as alice:
                    response = await self._let_in(
                        alice, app_origin, identity="Alice"
                    )
                    self.assertEqual(response.status_code, 403)

    async def test_public_paths_and_refusals(self):
        async for issuer_origin in harness.serve_on_loopback(self.issuer):
            app = self._app(issuer_origin, with_oauth=True)
            async for app_origin in harness.serve_on_loopback(app):
                async with httpx.AsyncClient() as client:
                    # What an MCP client reaches before it holds anything.
                    response = await client.get(
                        f"{app_origin}/.well-known/oauth-authorization-server"
                    )
                    self.assertEqual(response.status_code, 200)
                    response = await client.post(
                        f"{app_origin}/__/oauth/register",
                        json={"redirect_uris": ["http://localhost:1/cb"]},
                    )
                    self.assertEqual(response.status_code, 201)
                    response = await client.options(f"{app_origin}/mcp")
                    self.assertNotEqual(response.status_code, 401)
                    response = await client.get(f"{app_origin}/__/probe")
                    self.assertNotEqual(response.status_code, 401)
                    # Anything else, without a credential: 401, naming
                    # the application's sign-in.
                    response = await client.post(f"{app_origin}/mcp")
                    self.assertEqual(response.status_code, 401)
                    self.assertEqual(
                        response.headers["www-authenticate"],
                        'Bearer resource_metadata="'
                        f'{app_origin}/.well-known/oauth-protected-resource'
                        '/mcp"',
                    )
                    response = await client.get(f"{app_origin}/hello")
                    self.assertEqual(response.status_code, 401)
                    self.assertEqual(
                        response.headers["www-authenticate"],
                        'Bearer resource_metadata="'
                        f'{app_origin}/.well-known/oauth-protected-resource"',
                    )
                    # The callback without a sign-in under way.
                    response = await client.get(
                        f"{app_origin}{CALLBACK_PATH}",
                        params={
                            "code": "x",
                            "state": "y"
                        },
                    )
                    self.assertEqual(response.status_code, 400)

    async def test_app_credential_lets_in(self):
        async for issuer_origin in harness.serve_on_loopback(self.issuer):
            app = self._app(issuer_origin, with_oauth=True)
            async for app_origin in harness.serve_on_loopback(app):
                async with httpx.AsyncClient(base_url=app_origin) as browser:
                    # The application's own sign-in is behind the
                    # policy, so a visitor is let in first ...
                    response = await self._let_in(
                        browser, app_origin, identity="Alice"
                    )
                    self.assertEqual(response.status_code, 200)
                    # ... and then signs in to the application.
                    client_id = await harness.register(browser)
                    verifier, code, _ = await harness.authorize(
                        browser, client_id
                    )
                    assert code is not None
                    response = await harness.exchange(
                        browser,
                        client_id=client_id,
                        code=code,
                        verifier=verifier,
                    )
                    self.assertEqual(response.status_code, 200, response.text)
                    app_token = response.json()["access_token"]
                # A fresh client holding only the application's token.
                async with httpx.AsyncClient() as mcp_client:
                    response = await mcp_client.post(
                        f"{app_origin}/mcp",
                        headers={"Authorization": f"Bearer {app_token}"},
                    )
                    self.assertEqual(response.status_code, 200)
                    response = await mcp_client.post(
                        f"{app_origin}/mcp",
                        headers={"Authorization": "Bearer not-a-token"},
                    )
                    self.assertEqual(response.status_code, 401)

    async def test_rpc_verifier(self):
        access = Access(issuer="https://cloud.test", policy=self.policy)
        cookie = (
            f"{ACCESS_COOKIE_NAME}=" + access._make_jwt(
                {
                    "type": "access",
                    "sub": "alice",
                    "iss": "https://cloud.test",
                },
                ttl_seconds=60,
            )
        )
        inner = _Verifier("good")

        async def verify(
            verifier: TokenVerifier,
            *,
            app_internal: bool = False,
            cookie: Optional[str] = None,
            token: Optional[str] = None,
        ) -> Any:
            return await verifier.verify_token(
                _Context(app_internal=app_internal, cookie=cookie),  # type: ignore[arg-type]
                token,
            )

        with_inner = access.wrapping(inner)
        without_inner = access.token_verifier
        # From within the application: as without the policy.
        self.assertIsNone(await verify(with_inner, app_internal=True))
        self.assertIsNone(await verify(without_inner, app_internal=True))
        # From outside, let in: as without the policy.
        self.assertIsNone(await verify(with_inner, cookie=cookie))
        self.assertEqual(
            (await verify(with_inner, cookie=cookie, token="good")).user_id,
            "app-user",
        )
        # From outside, with the application's credential: in.
        self.assertEqual(
            (await verify(with_inner, token="good")).user_id, "app-user"
        )
        # From outside, with nothing, or nothing good: refused.
        for verifier in (with_inner, without_inner):
            for token in (None, "bad"):
                result = await verify(verifier, token=token)
                self.assertIsInstance(result, errors_pb2.Unauthenticated)
                self.assertIn("the chosen few", result.message)
        # A cookie the policy no longer honors is no cookie.
        self.policy.allowed = set()
        self.assertIsInstance(
            await verify(with_inner, cookie=cookie),
            errors_pb2.Unauthenticated,
        )


class AccessFromEnvironmentTest(unittest.TestCase):
    """The policy the environment imposes."""

    def setUp(self) -> None:
        harness.ensure_root_keys()
        for name in (ENVVAR_REBOOT_ACCESS_POLICY, ENVVAR_REBOOT_ACCESS_ISSUER):
            os.environ.pop(name, None)

    def test_none_when_unset(self):
        self.assertIsNone(Access.from_environment())
        os.environ[ENVVAR_REBOOT_ACCESS_ISSUER] = "https://cloud.test"
        self.assertIsNone(Access.from_environment())

    def test_user_policy(self):
        os.environ[ENVVAR_REBOOT_ACCESS_POLICY] = "user:abc"
        os.environ[ENVVAR_REBOOT_ACCESS_ISSUER] = "https://cloud.test/"
        access = Access.from_environment()
        assert access is not None
        self.assertEqual(access.issuer, "https://cloud.test")
        self.assertEqual(access.policy, UserPolicy(user_id="abc"))
        self.assertTrue(
            access.policy.allows(
                Visitor(user_id="abc", issuer="https://cloud.test")
            )
        )
        self.assertFalse(
            access.policy.allows(
                Visitor(user_id="abd", issuer="https://cloud.test")
            )
        )
        self.assertIn("abc", access.policy.describe())

    def test_malformed(self):
        os.environ[ENVVAR_REBOOT_ACCESS_ISSUER] = "https://cloud.test"
        for policy in ("user", "user:", "owner", "everyone"):
            os.environ[ENVVAR_REBOOT_ACCESS_POLICY] = policy
            with self.assertRaises(ValueError):
                Access.from_environment()

    def test_policy_without_issuer(self):
        os.environ[ENVVAR_REBOOT_ACCESS_POLICY] = "user:abc"
        with self.assertRaises(ValueError) as raised:
            Access.from_environment()
        self.assertIn(ENVVAR_REBOOT_ACCESS_ISSUER, str(raised.exception))


if __name__ == "__main__":
    unittest.main()
