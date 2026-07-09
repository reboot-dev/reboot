import base64
import hashlib
import html
import httpx
import json
import os
import rbt.v1alpha1.errors_pb2
import re
import unittest
from mcp.client.session import ClientSession
from mcp.client.streamable_http import streamable_http_client
from rbt.std.oauth.v1.oauth_rbt import OAuthTokenManager, OAuthTokens
from reboot.aio.applications import Application
from reboot.aio.auth.oauth_providers import (
    Anonymous,
    Auth0,
    Development,
    ExchangeResult,
    GitHub,
    Google,
    OAuthProvider,
    OAuthProviderByEnvironment,
    UserId,
)
from reboot.aio.auth.token_verifiers import TokenVerifier, VerifyTokenResult
from reboot.aio.contexts import ReaderContext
from reboot.aio.exceptions import InputError
from reboot.aio.tests import OAuthProviderForTest, Reboot
from reboot.ping.ping import CounterServicer, UserServicer
from reboot.std.ciphertext.v1.ciphertext import ciphertext_library
from reboot.std.collections.ordered_map.v1.ordered_map import (
    ordered_map_library,
)
from reboot.std.oauth.v1.oauth import oauth_library
from typing import Optional
from unittest import mock
from urllib.parse import parse_qs, urlencode, urlparse

# Generous per-request HTTP timeout for the in-process OAuth flows
# below. Each request hits a full Reboot cluster plus a local Envoy,
# and some — notably the OAuth callback, which runs a distributed
# token-store transaction — can take several seconds on a loaded or
# degraded CI runner. `httpx`'s 5-second default is tight enough that
# such a request occasionally trips it and fails as a `ReadTimeout`;
# this headroom keeps that latency from reading as a failure, while
# Bazel's test timeout stays the real backstop against a genuine hang.
_HTTP_TIMEOUT_SECONDS = 30.0

# Path of the consent endpoint the `/authorize` consent screen POSTs to.
_CONSENT_PATH = "/__/oauth/consent"


def _extract_consent_token(consent_page_html: str) -> str:
    """Pull the signed consent token out of the consent page's hidden
    form field. The page HTML-escapes attribute values, so unescape what
    we scrape back to its raw form."""
    match = re.search(r'name="consent" value="([^"]+)"', consent_page_html)
    assert match is not None, "consent page is missing its consent token"
    return html.unescape(match.group(1))


async def _approve_consent(
    client: httpx.AsyncClient,
    consent_url: str,
    consent_page_html: str,
) -> httpx.Response:
    """Approve the consent screen: extract its token and POST an approval
    to `/__/oauth/consent`, returning the resulting (302) response.

    `client` must be the same cookie-aware client that fetched the
    consent page, so the CSRF cookie set on `/authorize` is sent back
    with the approval (the server requires the two to match)."""
    return await client.post(
        consent_url,
        data={
            "consent": _extract_consent_token(consent_page_html),
            "action": "approve",
        },
    )


class DevelopmentOAuthProviderTest(unittest.IsolatedAsyncioTestCase):

    async def asyncSetUp(self):
        self.rbt = Reboot()
        await self.rbt.start()

    async def asyncTearDown(self):
        await self.rbt.stop()

    async def test_development_login_flow(self):
        """
        Drive the `Development()` account-picker flow end to end and
        verify the derived `dev-` user IDs are stable and per-identity.
        """
        await self.rbt.up(
            Application(
                servicers=[UserServicer, CounterServicer],
                oauth=OAuthProviderForTest(Development()),
            ),
        )

        mcp_url = self.rbt.http_localhost_url("/mcp")
        # The client's own redirect URI (where the OAuth server sends the
        # authorization code back to).
        client_redirect_uri = "http://localhost/callback"

        # Discover the OAuth endpoints the way a real client does, via
        # the RFC 8414 authorization server metadata.
        async with httpx.AsyncClient(timeout=_HTTP_TIMEOUT_SECONDS) as client:
            response = await client.get(
                self.rbt.
                http_localhost_url("/.well-known/oauth-authorization-server"),
            )
            self.assertEqual(response.status_code, 200)
            metadata = response.json()
        register_url = metadata["registration_endpoint"]
        authorize_url = metadata["authorization_endpoint"]
        token_url = metadata["token_endpoint"]
        consent_url = self.rbt.http_localhost_url(_CONSENT_PATH)

        async def login_as(identity: str) -> str:
            """Run the full OAuth flow picking `identity`; return an
            access token."""
            # PKCE: a random verifier and its S256 challenge.
            code_verifier = base64.urlsafe_b64encode(os.urandom(32)
                                                    ).rstrip(b"=").decode()
            code_challenge = base64.urlsafe_b64encode(
                hashlib.sha256(code_verifier.encode()).digest()
            ).rstrip(b"=").decode()

            async with httpx.AsyncClient(
                timeout=_HTTP_TIMEOUT_SECONDS
            ) as client:
                # Register a client.
                response = await client.post(
                    register_url,
                    json={"redirect_uris": [client_redirect_uri]},
                )
                self.assertEqual(response.status_code, 201)
                client_id = response.json()["client_id"]

                # GET /authorize → 200 consent screen.
                response = await client.get(
                    authorize_url,
                    params={
                        "response_type": "code",
                        "client_id": client_id,
                        "redirect_uri": client_redirect_uri,
                        "code_challenge": code_challenge,
                        "code_challenge_method": "S256",
                        "state": "mcp-state-123",
                    },
                )
                self.assertEqual(response.status_code, 200)

                # Approving consent → 302 to the dev-login page.
                response = await _approve_consent(
                    client, consent_url, response.text
                )
                self.assertEqual(response.status_code, 302)
                login_location = response.headers["location"]
                self.assertIn("/__/oauth/dev-login", login_location)

                # GET the dev-login page; it should list all identities.
                response = await client.get(login_location)
                self.assertEqual(response.status_code, 200)
                for name in ("Alice", "Ben", "Carlos", "Dani", "Esi"):
                    self.assertIn(name, response.text)

                # Follow the link for our chosen identity straight to
                # the OAuth callback (this is what clicking it does).
                # The page HTML-escapes the href, so unescape it first.
                match = re.search(
                    r'href="([^"]*?code=' + identity + r'[^"]*?)"',
                    response.text,
                )
                self.assertIsNotNone(match)
                assert match is not None  # Narrow for the type checker.
                callback_url = html.unescape(match.group(1))

                # The callback 302s back to the client's redirect URI with
                # an authorization code.
                response = await client.get(callback_url)
                self.assertEqual(response.status_code, 302)
                callback_redirect = httpx.URL(response.headers["location"])
                auth_code = callback_redirect.params["code"]

                # Exchange the authorization code for an access token.
                response = await client.post(
                    token_url,
                    data={
                        "grant_type": "authorization_code",
                        "code": auth_code,
                        "redirect_uri": client_redirect_uri,
                        "client_id": client_id,
                        "code_verifier": code_verifier,
                    },
                )
                self.assertEqual(response.status_code, 200)
                return response.json()["access_token"]

        async def whoami(access_token: str) -> str:
            async with httpx.AsyncClient(
                headers={
                    "Authorization": f"Bearer {access_token}",
                },
                follow_redirects=True,
                timeout=_HTTP_TIMEOUT_SECONDS,
            ) as http_client:
                async with streamable_http_client(
                    mcp_url,
                    http_client=http_client,
                ) as (read_stream, write_stream, _):
                    async with ClientSession(
                        read_stream,
                        write_stream,
                    ) as session:
                        await session.initialize()
                        result = await session.call_tool("whoami", {})
                        return json.loads(result.content[0].text)["user_id"]

        alice_id = await whoami(await login_as("Alice"))
        alice_id_again = await whoami(await login_as("Alice"))
        ben_id = await whoami(await login_as("Ben"))

        # The IDs are opaque, prefixed `dev-`, stable per identity, and
        # different between identities.
        self.assertTrue(alice_id.startswith("dev-"))
        self.assertEqual(alice_id, alice_id_again)
        self.assertNotEqual(alice_id, ben_id)
        self.assertNotIn("alice", alice_id.lower())

    async def test_dev_login_rejects_untrusted_redirect_uri(self):
        """
        The `dev-login` page reflects its `redirect_uri` query param into
        the per-identity links, so it must reject any `redirect_uri` that
        isn't this server's own (same-origin, http(s)) — otherwise it's
        an XSS / open-redirect gadget. A same-origin `redirect_uri` is
        accepted; a `javascript:` scheme and an off-origin URL are not.
        """
        await self.rbt.up(
            Application(
                servicers=[UserServicer, CounterServicer],
                oauth=OAuthProviderForTest(Development()),
            ),
        )

        dev_login_url = self.rbt.http_localhost_url("/__/oauth/dev-login")
        same_origin = self.rbt.http_localhost_url("/__/oauth/callback")

        async with httpx.AsyncClient(timeout=_HTTP_TIMEOUT_SECONDS) as client:
            # Same-origin callback: accepted, page renders.
            response = await client.get(
                dev_login_url,
                params={
                    "redirect_uri": same_origin,
                    "state": "x"
                },
            )
            self.assertEqual(response.status_code, 200)
            self.assertIn("Alice", response.text)

            # A `javascript:` scheme (the XSS gadget) is rejected, and
            # the payload never reaches the response body.
            for bad_redirect_uri in (
                "javascript:alert(document.cookie)//",
                "https://evil.example.com/callback",
            ):
                response = await client.get(
                    dev_login_url,
                    params={
                        "redirect_uri": bad_redirect_uri,
                        "state": "x"
                    },
                )
                self.assertEqual(response.status_code, 400)
                self.assertNotIn("Alice", response.text)


class _NoOpTokenVerifier(TokenVerifier):
    """A `token_verifier=` that has no opinion on any token. Enough to
    show that supplying a verifier does not lift the `oauth=`
    requirement for auto-construct state types."""

    async def verify_token(
        self,
        context: ReaderContext,
        token: Optional[str],
    ) -> VerifyTokenResult:
        return None


class UserWithoutOAuthTest(unittest.IsolatedAsyncioTestCase):

    async def test_user_without_oauth_raises(self):
        """
        An `Application` with a `User`-typed auto-construct servicer but
        no `Application(oauth=...)` fails to start, because
        auto-constructed users are only ever identified through the
        OAuth sign-in flow. This holds even when a `token_verifier=` is
        configured: a custom verifier authenticates requests but never
        auto-constructs, so it can't stand in for `oauth=`.

        The check runs at serve time, when the OAuth server and MCP
        factory mount (in production via `Application.run()`), so the
        app fails to start rather than at construction. This drives the
        mount directly to observe that invariant.

        Uses the real `reboot.aio.applications.Application`.
        """
        # Neither `oauth=` nor `token_verifier=`.
        application = Application(servicers=[UserServicer, CounterServicer])
        with self.assertRaises(InputError) as context:
            application._mount_oauth_and_mcp()
        self.assertIn("never auto-constructs", str(context.exception))

        # A `token_verifier=` but still no `oauth=`: authenticating
        # requests is not the same as identifying users to construct.
        application = Application(
            servicers=[UserServicer, CounterServicer],
            token_verifier=_NoOpTokenVerifier(),
        )
        with self.assertRaises(InputError) as context:
            application._mount_oauth_and_mcp()
        self.assertIn("never auto-constructs", str(context.exception))

    async def test_config_pod_resolves_selector(self):
        """
        A config pod runs the same OAuth validation serving pods hit
        at mount: a selector with no provider for the current
        environment fails the config pod fast, instead of passing
        config validation and then failing every serving pod.
        """
        application = Application(
            servicers=[UserServicer, CounterServicer],
            oauth=OAuthProviderByEnvironment(
                dev=Development(),
                prod=None,
            ),
        )
        with mock.patch(
            "reboot.aio.auth.oauth_providers.running_rbt_dev",
            return_value=False,
        ):
            with self.assertRaises(InputError):
                application._validate_configuration()
        # The same selector under `rbt dev run` resolves its dev arm,
        # so config validation passes.
        with mock.patch(
            "reboot.aio.auth.oauth_providers.running_rbt_dev",
            return_value=True,
        ):
            application._validate_configuration()


class ConsentScreenTest(unittest.IsolatedAsyncioTestCase):
    """The `/authorize` consent screen is what stands between a
    dynamically-registered ("open") client and a victim's identity. It
    surfaces the client's `redirect_uri` host before the user signs in,
    and only an explicit, same-browser POST to `/__/oauth/consent`
    resumes the flow — closing the "open client" / confused-deputy
    token-theft hole. See
    https://github.com/reboot-dev/mono/issues/5560.
    """

    async def asyncSetUp(self):
        self.rbt = Reboot()
        await self.rbt.start()

    async def asyncTearDown(self):
        await self.rbt.stop()

    async def _up(
        self,
        provider: Optional[OAuthProvider] = None,
        *,
        title: Optional[str] = None,
    ) -> None:
        await self.rbt.up(
            Application(
                servicers=[UserServicer, CounterServicer],
                oauth=OAuthProviderForTest(provider or Anonymous()),
                title=title,
            ),
        )

    async def _register(
        self,
        client: httpx.AsyncClient,
        *,
        redirect_uri: str,
        client_name: Optional[str] = None,
        client_uri: Optional[str] = None,
    ) -> str:
        body: dict = {"redirect_uris": [redirect_uri]}
        if client_name is not None:
            body["client_name"] = client_name
        if client_uri is not None:
            body["client_uri"] = client_uri
        response = await client.post(
            self.rbt.http_localhost_url("/__/oauth/register"),
            json=body,
        )
        self.assertEqual(response.status_code, 201)
        return response.json()["client_id"]

    async def _authorize(
        self,
        client: httpx.AsyncClient,
        *,
        client_id: str,
        redirect_uri: str,
        state: str = "mcp-state",
    ) -> httpx.Response:
        # A fixed PKCE pair (verifier "verifier"); the consent screen
        # doesn't depend on its value, but `/authorize` requires PKCE.
        code_challenge = base64.urlsafe_b64encode(
            hashlib.sha256(b"verifier").digest()
        ).rstrip(b"=").decode()
        return await client.get(
            self.rbt.http_localhost_url("/__/oauth/authorize"),
            params={
                "response_type": "code",
                "client_id": client_id,
                "redirect_uri": redirect_uri,
                "code_challenge": code_challenge,
                "code_challenge_method": "S256",
                "state": state,
            },
        )

    async def test_authorize_shows_consent_screen_not_idp_redirect(self):
        # The heart of the fix: `/authorize` renders a consent screen
        # that names the client and, prominently, the `redirect_uri`
        # host the tokens would be sent to — so a victim handed an
        # attacker's `/authorize` link on this trusted origin can notice
        # the unfamiliar destination before signing in.
        await self._up(title="Reboot Chat")
        async with httpx.AsyncClient(timeout=_HTTP_TIMEOUT_SECONDS) as client:
            redirect_uri = "https://evil.example/callback"
            client_id = await self._register(
                client,
                redirect_uri=redirect_uri,
                client_name="Totally Legit MCP",
                client_uri="https://evil.example/about",
            )
            response = await self._authorize(
                client,
                client_id=client_id,
                redirect_uri=redirect_uri,
            )
            # A consent screen, not a redirect to the identity provider.
            self.assertEqual(response.status_code, 200)
            self.assertNotIn("location", response.headers)
            # The screen frames the app (via `Application(title=...)`) as
            # the thing being acted on behalf of, not "Reboot".
            self.assertIn("Do you trust this AI?", response.text)
            self.assertIn("Reboot Chat", response.text)
            # The redirect host is surfaced, and the client's
            # self-reported metadata is shown as a hint.
            self.assertIn("evil.example", response.text)
            self.assertIn("Totally Legit MCP", response.text)
            self.assertIn("https://evil.example/about", response.text)
            # The double-submit CSRF cookie is set for the POST back.
            self.assertIn(
                "rbt_oauth_consent",
                response.headers.get("set-cookie", ""),
            )

    async def test_authorize_strips_userinfo_from_displayed_host(self):
        # A `redirect_uri` can smuggle `userinfo@` ahead of the real
        # host (`https://trusted.example@evil.example/...`). The
        # prominent host on the consent screen must show the real
        # destination (`evil.example`), not the trusted-looking left
        # side, so the user checks the address tokens actually go to.
        await self._up()
        async with httpx.AsyncClient(timeout=_HTTP_TIMEOUT_SECONDS) as client:
            redirect_uri = "https://trusted.example@evil.example/callback"
            client_id = await self._register(client, redirect_uri=redirect_uri)
            response = await self._authorize(
                client, client_id=client_id, redirect_uri=redirect_uri
            )
            self.assertEqual(response.status_code, 200)
            host = re.search(
                r'<summary class="host">([^<]*)</summary>',
                response.text,
            )
            self.assertIsNotNone(host)
            assert host is not None  # Narrow for the type checker.
            self.assertEqual(host.group(1).strip(), "https://evil.example")

    async def test_consent_approval_completes_flow(self):
        # Approving on the consent screen resumes the flow all the way to
        # a usable access token — the screen gates the flow, it doesn't
        # break it.
        await self._up(Anonymous())
        redirect_uri = "http://localhost/callback"
        async with httpx.AsyncClient(timeout=_HTTP_TIMEOUT_SECONDS) as client:
            client_id = await self._register(client, redirect_uri=redirect_uri)
            response = await self._authorize(
                client, client_id=client_id, redirect_uri=redirect_uri
            )
            self.assertEqual(response.status_code, 200)

            # Approve → 302 onward to the (here, `Anonymous`) provider,
            # which redirects straight into our own callback.
            response = await _approve_consent(
                client,
                self.rbt.http_localhost_url(_CONSENT_PATH),
                response.text,
            )
            self.assertEqual(response.status_code, 302)
            self.assertIn("/__/oauth/callback", response.headers["location"])

            # Follow into the callback; it 302s back to the client with
            # an authorization code.
            response = await client.get(response.headers["location"])
            self.assertEqual(response.status_code, 302)
            auth_code = httpx.URL(response.headers["location"]).params["code"]

            # The code exchanges for an access token (PKCE verifier
            # "verifier", matching the challenge `_authorize` sent).
            response = await client.post(
                self.rbt.http_localhost_url("/__/oauth/token"),
                data={
                    "grant_type": "authorization_code",
                    "code": auth_code,
                    "redirect_uri": redirect_uri,
                    "client_id": client_id,
                    "code_verifier": "verifier",
                },
            )
            self.assertEqual(response.status_code, 200)
            self.assertIn("access_token", response.json())

    async def test_consent_denial_redirects_with_error(self):
        # Cancelling is reported back to the client as `access_denied`
        # per RFC 6749 4.1.2.1, carrying the client's `state` and no
        # authorization code.
        await self._up()
        redirect_uri = "https://evil.example/callback"
        async with httpx.AsyncClient(timeout=_HTTP_TIMEOUT_SECONDS) as client:
            client_id = await self._register(client, redirect_uri=redirect_uri)
            page = await self._authorize(
                client,
                client_id=client_id,
                redirect_uri=redirect_uri,
                state="client-state-xyz",
            )
            response = await client.post(
                self.rbt.http_localhost_url(_CONSENT_PATH),
                data={
                    "consent": _extract_consent_token(page.text),
                    "action": "deny",
                },
            )
            self.assertEqual(response.status_code, 302)
            location = httpx.URL(response.headers["location"])
            self.assertEqual(
                f"{location.scheme}://{location.host}{location.path}",
                redirect_uri,
            )
            self.assertEqual(location.params["error"], "access_denied")
            self.assertEqual(location.params["state"], "client-state-xyz")
            self.assertNotIn("code", location.params)

    async def test_consent_rejects_cross_site_submit_without_cookie(self):
        # The CSRF guard: a cross-site auto-submit can't carry the
        # consent cookie (it isn't sent on a cross-site POST, and an
        # attacker can't set it on our origin). Model that with a fresh
        # client that holds a *valid* consent token but not the cookie
        # the matching `/authorize` set — the server must refuse to act
        # on it, so the screen can't be silently clicked through.
        await self._up()
        redirect_uri = "https://evil.example/callback"
        async with httpx.AsyncClient(
            timeout=_HTTP_TIMEOUT_SECONDS
        ) as victim_browser:
            client_id = await self._register(
                victim_browser, redirect_uri=redirect_uri
            )
            page = await self._authorize(
                victim_browser,
                client_id=client_id,
                redirect_uri=redirect_uri,
            )
            consent_token = _extract_consent_token(page.text)

        async with httpx.AsyncClient(
            timeout=_HTTP_TIMEOUT_SECONDS
        ) as no_cookie_client:
            response = await no_cookie_client.post(
                self.rbt.http_localhost_url(_CONSENT_PATH),
                data={
                    "consent": consent_token,
                    "action": "approve"
                },
            )
            self.assertEqual(response.status_code, 403)

    async def test_consent_rejects_invalid_token(self):
        # A garbage / unsigned consent token never resumes the flow.
        await self._up()
        async with httpx.AsyncClient(timeout=_HTTP_TIMEOUT_SECONDS) as client:
            response = await client.post(
                self.rbt.http_localhost_url(_CONSENT_PATH),
                data={
                    "consent": "not-a-real-jwt",
                    "action": "approve"
                },
            )
            self.assertEqual(response.status_code, 400)


class GoogleValidateTest(unittest.TestCase):
    """
    `Google.validate()` (inherited from `RegisteredOAuthProvider`)
    rejects each missing credential with a message naming the failing
    field and the provider class — that's what a developer reading
    their app's startup logs needs to know which env var was missing
    and which `Google(...)` it belongs to.
    """

    def test_none_client_id_message_names_provider_and_field(self):
        # `os.environ.get("GOOGLE_OAUTH_CLIENT_ID")` against a missing
        # env var hands us `None`; `validate()` must surface that
        # cleanly, not e.g. as a `TypeError` deep in an HTTP call.
        provider = Google(client_id=None, client_secret="secret")
        with self.assertRaises(InputError) as context:
            provider.validate()
        self.assertIn("Google", str(context.exception))
        self.assertIn("`client_id`", str(context.exception))

    def test_empty_client_id_treated_like_none(self):
        # Same path: an env var that's literally `""` is just as
        # broken as one that's unset, and the error should be the
        # same shape.
        provider = Google(client_id="", client_secret="secret")
        with self.assertRaises(InputError) as context:
            provider.validate()
        self.assertIn("`client_id`", str(context.exception))

    def test_none_client_secret_message_names_provider_and_field(self):
        provider = Google(client_id="id", client_secret=None)
        with self.assertRaises(InputError) as context:
            provider.validate()
        self.assertIn("Google", str(context.exception))
        self.assertIn("`client_secret`", str(context.exception))

    def test_both_supplied_passes(self):
        # Sanity check: with both credentials present `validate()`
        # is a no-op (doesn't raise).
        Google(client_id="id", client_secret="secret").validate()


class GitHubValidateTest(unittest.TestCase):
    """
    Same shape as `GoogleValidateTest` but for `GitHub`. What's worth
    checking separately is the class name in the message — `GitHub`,
    not `Google` — so a developer with both providers wired up knows
    which env var was missing.
    """

    def test_none_client_id_message_names_github(self):
        provider = GitHub(client_id=None, client_secret="secret")
        with self.assertRaises(InputError) as context:
            provider.validate()
        self.assertIn("GitHub", str(context.exception))
        self.assertIn("`client_id`", str(context.exception))

    def test_none_client_secret_message_names_github(self):
        provider = GitHub(client_id="id", client_secret=None)
        with self.assertRaises(InputError) as context:
            provider.validate()
        self.assertIn("GitHub", str(context.exception))
        self.assertIn("`client_secret`", str(context.exception))


class Auth0ValidateTest(unittest.TestCase):
    """
    Same shape as `GoogleValidateTest`/`GitHubValidateTest`, plus the
    extra `domain` that's unique to Auth0 — each missing field names
    itself and (for the credentials) the `Auth0` class, so a developer
    reading startup logs knows which env var to set.
    """

    def test_none_client_id_message_names_auth0(self):
        provider = Auth0(
            domain="tenant.auth0.com",
            client_id=None,
            client_secret="secret",
        )
        with self.assertRaises(InputError) as context:
            provider.validate()
        self.assertIn("Auth0", str(context.exception))
        self.assertIn("`client_id`", str(context.exception))

    def test_none_client_secret_message_names_auth0(self):
        provider = Auth0(
            domain="tenant.auth0.com",
            client_id="id",
            client_secret=None,
        )
        with self.assertRaises(InputError) as context:
            provider.validate()
        self.assertIn("Auth0", str(context.exception))
        self.assertIn("`client_secret`", str(context.exception))

    def test_missing_domain_rejected(self):
        # The `domain` is what `Google`/`GitHub` don't have; a missing
        # one must fail validation just like a missing credential.
        provider = Auth0(
            domain=None,
            client_id="id",
            client_secret="secret",
        )
        with self.assertRaises(InputError) as context:
            provider.validate()
        self.assertIn("Auth0", str(context.exception))
        self.assertIn("`domain`", str(context.exception))

    def test_all_supplied_passes(self):
        Auth0(
            domain="tenant.auth0.com",
            client_id="id",
            client_secret="secret",
        ).validate()


class Auth0DomainTest(unittest.TestCase):
    """The `domain` is accepted bare or as a full URL, and the
    authorization endpoint is derived from it under the tenant — that's
    what lets a developer paste either form from the Auth0 dashboard."""

    def test_bare_domain_builds_tenant_authorize_url(self):
        url = Auth0(
            domain="tenant.us.auth0.com",
            client_id="id",
            client_secret="s",
        ).authorization_url(state="x", redirect_uri="http://localhost/cb")
        self.assertTrue(
            url.startswith("https://tenant.us.auth0.com/authorize?")
        )

    def test_full_url_domain_is_normalized(self):
        # A pasted `https://tenant.auth0.com/` must resolve to the same
        # endpoint as the bare host, not a doubled-up scheme.
        url = Auth0(
            domain="https://tenant.auth0.com/",
            client_id="id",
            client_secret="s",
        ).authorization_url(state="x", redirect_uri="http://localhost/cb")
        self.assertTrue(url.startswith("https://tenant.auth0.com/authorize?"))


def _scope_param(authorization_url: str) -> list[str]:
    """Extract the space-delimited `scope` query parameter from an
    authorization URL as a list."""
    query = parse_qs(urlparse(authorization_url).query)
    return query["scope"][0].split()


class ScopeTest(unittest.TestCase):
    """`Google`/`GitHub` always request their required base scope and add
    any developer-supplied `scopes` on top — so an app can ask for extra
    access (Calendar, `repo`, …) without losing the scope identity
    resolution depends on."""

    def test_google_defaults_to_openid_only(self):
        url = Google(client_id="id", client_secret="s").authorization_url(
            state="x", redirect_uri="http://localhost/cb"
        )
        self.assertEqual(_scope_param(url), ["openid"])

    def test_google_adds_extra_scopes_after_base(self):
        calendar = "https://www.googleapis.com/auth/calendar"
        url = Google(
            client_id="id",
            client_secret="s",
            scopes=[calendar],
        ).authorization_url(state="x", redirect_uri="http://localhost/cb")
        scopes = _scope_param(url)
        self.assertEqual(scopes[0], "openid")
        self.assertIn(calendar, scopes)

    def test_google_store_tokens_requests_offline_access(self):
        url = Google(
            client_id="id",
            client_secret="s",
            store_tokens=True,
        ).authorization_url(state="x", redirect_uri="http://localhost/cb")
        query = parse_qs(urlparse(url).query)
        # `access_type=offline` asks for a refresh token. We do NOT force
        # `prompt=consent` (which would show the consent screen on every
        # sign-in); the token store carries an existing refresh token
        # forward instead.
        self.assertEqual(query.get("access_type"), ["offline"])
        self.assertNotIn("prompt", query)

    def test_github_defaults_to_read_user_only(self):
        url = GitHub(client_id="id", client_secret="s").authorization_url(
            state="x", redirect_uri="http://localhost/cb"
        )
        self.assertEqual(_scope_param(url), ["read:user"])

    def test_github_adds_extra_scopes_after_base(self):
        url = GitHub(
            client_id="id",
            client_secret="s",
            scopes=["repo"],
        ).authorization_url(state="x", redirect_uri="http://localhost/cb")
        scopes = _scope_param(url)
        self.assertEqual(scopes[0], "read:user")
        self.assertIn("repo", scopes)

    def test_extra_scopes_are_deduplicated(self):
        # Asking for the base scope again doesn't duplicate it.
        url = GitHub(
            client_id="id",
            client_secret="s",
            scopes=["read:user", "repo"],
        ).authorization_url(state="x", redirect_uri="http://localhost/cb")
        scopes = _scope_param(url)
        self.assertEqual(scopes.count("read:user"), 1)

    def test_auth0_defaults_to_openid_only(self):
        url = Auth0(
            domain="tenant.auth0.com",
            client_id="id",
            client_secret="s",
        ).authorization_url(state="x", redirect_uri="http://localhost/cb")
        self.assertEqual(_scope_param(url), ["openid"])

    def test_auth0_adds_extra_scopes_after_base(self):
        url = Auth0(
            domain="tenant.auth0.com",
            client_id="id",
            client_secret="s",
            scopes=["profile", "email"],
        ).authorization_url(state="x", redirect_uri="http://localhost/cb")
        scopes = _scope_param(url)
        self.assertEqual(scopes[0], "openid")
        self.assertIn("profile", scopes)
        self.assertIn("email", scopes)

    def test_auth0_store_tokens_requests_offline_access(self):
        # Auth0 issues a refresh token only when `offline_access` is in
        # the requested scopes (the analogue of Google's
        # `access_type=offline`); we add it only when storing tokens.
        plain = _scope_param(
            Auth0(
                domain="tenant.auth0.com",
                client_id="id",
                client_secret="s",
            ).authorization_url(state="x", redirect_uri="http://localhost/cb")
        )
        self.assertNotIn("offline_access", plain)
        storing = _scope_param(
            Auth0(
                domain="tenant.auth0.com",
                client_id="id",
                client_secret="s",
                store_tokens=True,
            ).authorization_url(state="x", redirect_uri="http://localhost/cb")
        )
        self.assertIn("offline_access", storing)

    def test_provider_without_store_tokens_does_not_store(self):
        self.assertFalse(
            Google(client_id="id", client_secret="s").stores_tokens
        )
        self.assertTrue(
            Google(
                client_id="id",
                client_secret="s",
                store_tokens=True,
            ).stores_tokens
        )


class _FakeStoringProvider(OAuthProvider):
    """A provider that redirects straight back to the callback (like
    `Anonymous`) and reports a fixed user plus identity-provider tokens,
    so the storage path can be exercised without talking to a real
    identity provider."""

    USER_ID = UserId("stored-user")
    SERVICE = "fake-service.example"

    def __init__(self) -> None:
        super().__init__()
        # The tokens the next `exchange_code` reports. Mutable so a test
        # can simulate a re-login that returns a different access token
        # and/or no refresh token.
        self.access_token: str = "access-1"
        self.refresh_token: Optional[str] = "refresh-1"

    @property
    def stores_tokens(self) -> bool:
        return True

    @property
    def token_service_id(self) -> str:
        return self.SERVICE

    def authorization_url(self, state: str, redirect_uri: str) -> str:
        return f"{redirect_uri}?{urlencode({'code': 'fake', 'state': state})}"

    async def exchange_code(
        self, code: str, redirect_uri: str
    ) -> ExchangeResult:
        return ExchangeResult(
            user_id=self.USER_ID,
            tokens=OAuthTokens(
                access_token=self.access_token,
                refresh_token=self.refresh_token,
                expires_at=None,
                scopes=["read:user"],
            ),
        )


class StoredTokensTest(unittest.IsolatedAsyncioTestCase):
    """Drives the OAuth flow with a token-storing provider and checks the
    identity provider's tokens are encrypted-at-rest, readable via
    `OAuthTokenManager.fetch`, and rotated on refresh."""

    SERVICE = _FakeStoringProvider.SERVICE

    async def asyncSetUp(self):
        self.rbt = Reboot()
        await self.rbt.start()

    async def asyncTearDown(self):
        await self.rbt.stop()

    async def test_fetch_before_any_store_is_unconstructed(self):
        # Reading tokens for a service before any have ever been stored
        # aborts with `StateNotConstructed`: the manager is constructed
        # lazily by the first store. Callers treat that as "no tokens"
        # (the same idiom used for an unconstructed `OrderedMap`).
        await self.rbt.up(
            Application(
                servicers=[UserServicer, CounterServicer],
                libraries=[
                    oauth_library(),
                    ciphertext_library(),
                    ordered_map_library()
                ],
                oauth=OAuthProviderForTest(_FakeStoringProvider()),
            ),
        )
        context = self.rbt.create_external_context(
            name=f"test-{self.id()}",
            app_internal=True,
        )
        with self.assertRaises(OAuthTokenManager.FetchAborted) as raised:
            await OAuthTokenManager.ref(self.SERVICE
                                       ).fetch(context, user_id="nobody")
        self.assertIsInstance(
            raised.exception.error,
            rbt.v1alpha1.errors_pb2.StateNotConstructed,
        )

    async def _perform_idp_login(self) -> None:
        """Drive one full identity-provider sign-in (register → authorize
        → follow into the callback), which causes the OAuth server to store
        the provider's tokens. The token exchange isn't needed: storage
        happens in the callback."""
        async with httpx.AsyncClient(timeout=_HTTP_TIMEOUT_SECONDS) as client:
            metadata = (
                await client.get(
                    self.rbt.http_localhost_url(
                        "/.well-known/oauth-authorization-server"
                    )
                )
            ).json()
            client_redirect_uri = "http://localhost/callback"
            code_verifier = base64.urlsafe_b64encode(os.urandom(32)
                                                    ).rstrip(b"=").decode()
            code_challenge = base64.urlsafe_b64encode(
                hashlib.sha256(code_verifier.encode()).digest()
            ).rstrip(b"=").decode()
            client_id = (
                await client.post(
                    metadata["registration_endpoint"],
                    json={"redirect_uris": [client_redirect_uri]},
                )
            ).json()["client_id"]
            response = await client.get(
                metadata["authorization_endpoint"],
                params={
                    "response_type": "code",
                    "client_id": client_id,
                    "redirect_uri": client_redirect_uri,
                    "code_challenge": code_challenge,
                    "code_challenge_method": "S256",
                    "state": "mcp-state",
                },
            )
            self.assertEqual(response.status_code, 200)
            # Approve consent → 302 to the (fake) identity provider, which
            # here is just our own callback.
            response = await _approve_consent(
                client,
                self.rbt.http_localhost_url(_CONSENT_PATH),
                response.text,
            )
            self.assertEqual(response.status_code, 302)
            # Follow the redirect into the callback; it stores the tokens.
            response = await client.get(response.headers["location"])
            self.assertEqual(response.status_code, 302)

    async def test_store_carries_existing_refresh_token_forward(self):
        # Some providers (e.g. Google) return a refresh token only on the
        # first consent. A later sign-in without one must keep the existing
        # refresh token rather than drop it; the OAuth server carries it
        # forward (`fetch` + merge) before storing.
        provider = _FakeStoringProvider()
        await self.rbt.up(
            Application(
                servicers=[UserServicer, CounterServicer],
                libraries=[
                    oauth_library(),
                    ciphertext_library(),
                    ordered_map_library()
                ],
                oauth=OAuthProviderForTest(provider),
            ),
        )

        # First sign-in: the provider returns an access and a refresh token.
        await self._perform_idp_login()

        # A later sign-in where the provider returned a fresh access token
        # but no refresh token.
        provider.access_token = "access-2"
        provider.refresh_token = None
        await self._perform_idp_login()

        context = self.rbt.create_external_context(
            name=f"test-{self.id()}",
            app_internal=True,
        )
        stored = await OAuthTokenManager.ref(
            self.SERVICE
        ).fetch(context, user_id=_FakeStoringProvider.USER_ID)
        self.assertTrue(stored.found)
        self.assertEqual(stored.tokens.access_token, "access-2")
        self.assertEqual(stored.tokens.refresh_token, "refresh-1")

    async def test_tokens_stored_on_login_and_untouched_by_refresh(self):
        provider = _FakeStoringProvider()
        await self.rbt.up(
            Application(
                servicers=[UserServicer, CounterServicer],
                libraries=[
                    oauth_library(),
                    ciphertext_library(),
                    ordered_map_library()
                ],
                oauth=OAuthProviderForTest(provider),
            ),
        )

        async with httpx.AsyncClient(timeout=_HTTP_TIMEOUT_SECONDS) as client:
            metadata = (
                await client.get(
                    self.rbt.http_localhost_url(
                        "/.well-known/oauth-authorization-server"
                    )
                )
            ).json()
            register_url = metadata["registration_endpoint"]
            authorize_url = metadata["authorization_endpoint"]
            token_url = metadata["token_endpoint"]
            consent_url = self.rbt.http_localhost_url(_CONSENT_PATH)
            client_redirect_uri = "http://localhost/callback"

            code_verifier = base64.urlsafe_b64encode(os.urandom(32)
                                                    ).rstrip(b"=").decode()
            code_challenge = base64.urlsafe_b64encode(
                hashlib.sha256(code_verifier.encode()).digest()
            ).rstrip(b"=").decode()

            client_id = (
                await client.post(
                    register_url,
                    json={"redirect_uris": [client_redirect_uri]},
                )
            ).json()["client_id"]

            # GET /authorize → 200 consent screen.
            response = await client.get(
                authorize_url,
                params={
                    "response_type": "code",
                    "client_id": client_id,
                    "redirect_uri": client_redirect_uri,
                    "code_challenge": code_challenge,
                    "code_challenge_method": "S256",
                    "state": "mcp-state",
                },
            )
            self.assertEqual(response.status_code, 200)

            # Approve consent → 302 to the (fake) identity provider, which
            # here is just our own callback.
            response = await _approve_consent(
                client, consent_url, response.text
            )
            self.assertEqual(response.status_code, 302)

            # Follow the redirect into the callback; it stores the tokens
            # and 302s back to the client with an auth code.
            response = await client.get(response.headers["location"])
            self.assertEqual(response.status_code, 302)
            auth_code = httpx.URL(response.headers["location"]).params["code"]

            # Exchange the auth code for our own access/refresh tokens.
            tokens = (
                await client.post(
                    token_url,
                    data={
                        "grant_type": "authorization_code",
                        "code": auth_code,
                        "redirect_uri": client_redirect_uri,
                        "client_id": client_id,
                        "code_verifier": code_verifier,
                    },
                )
            ).json()
            refresh_token = tokens["refresh_token"]

        # The identity provider's tokens were stored, encrypted, and are
        # readable via `OAuthTokenManager.fetch` using an app-internal
        # context.
        context = self.rbt.create_external_context(
            name=f"test-{self.id()}",
            app_internal=True,
        )
        stored = await OAuthTokenManager.ref(
            self.SERVICE
        ).fetch(context, user_id=_FakeStoringProvider.USER_ID)
        self.assertTrue(stored.found)
        self.assertEqual(stored.tokens.access_token, "access-1")
        self.assertEqual(stored.tokens.refresh_token, "refresh-1")

        # Refreshing the MCP token mints a new pair but does NOT
        # re-authorize at the identity provider: the stored provider
        # tokens are left untouched (storage is for the app to use, not
        # to drive re-authorization).
        async with httpx.AsyncClient(timeout=_HTTP_TIMEOUT_SECONDS) as client:
            response = await client.post(
                token_url,
                data={
                    "grant_type": "refresh_token",
                    "refresh_token": refresh_token,
                    "client_id": client_id,
                },
            )
            self.assertEqual(response.status_code, 200)

        unchanged = await OAuthTokenManager.ref(
            self.SERVICE
        ).fetch(context, user_id=_FakeStoringProvider.USER_ID)
        self.assertTrue(unchanged.found)
        self.assertEqual(unchanged.tokens.access_token, "access-1")
        self.assertEqual(unchanged.tokens.refresh_token, "refresh-1")


class OAuthProviderByEnvironmentTest(unittest.TestCase):
    """
    `OAuthProviderByEnvironment.get()` picks the `dev=` arm only under
    `rbt dev` and the `prod=` arm everywhere else, raises with a
    pointed message when the selected arm is `None`, and runs
    `validate()` on the selected (and only the selected) provider —
    so a `Google(...)` with `None` credentials in the unused arm is
    fine, but the same provider in the *used* arm fails fast.
    """

    def test_returns_dev_arm_under_rbt_dev(self):
        dev_provider = Anonymous()
        prod_provider = Anonymous()
        selector = OAuthProviderByEnvironment(
            dev=dev_provider,
            prod=prod_provider,
        )
        with mock.patch(
            "reboot.aio.auth.oauth_providers.running_rbt_dev",
            return_value=True,
        ):
            self.assertIs(selector.get(), dev_provider)

    def test_returns_prod_arm_outside_rbt_dev(self):
        # `running_rbt_dev()` returns False under `rbt serve`, on
        # Reboot Cloud, and in any environment that can't be
        # classified — they all collapse to the `prod=` arm here, so
        # we never silently fall back to a dev provider in
        # production-shaped environments.
        dev_provider = Anonymous()
        prod_provider = Anonymous()
        selector = OAuthProviderByEnvironment(
            dev=dev_provider,
            prod=prod_provider,
        )
        with mock.patch(
            "reboot.aio.auth.oauth_providers.running_rbt_dev",
            return_value=False,
        ):
            self.assertIs(selector.get(), prod_provider)

    def test_none_selected_arm_raises_actionable_message(self):
        selector = OAuthProviderByEnvironment(
            dev=Anonymous(),
            prod=None,
        )
        with mock.patch(
            "reboot.aio.auth.oauth_providers.running_rbt_dev",
            return_value=False,
        ):
            with self.assertRaises(InputError) as context:
                selector.get()
        # Error must point the developer toward the fix
        # (`Application(oauth=OAuthProviderByEnvironment(...))`) so a
        # missing-arm crash actually tells them how to recover.
        self.assertIn(
            "No OAuth provider is configured",
            str(context.exception),
        )

    def test_get_validates_selected_arm(self):
        # A `Google(...)` with `None` credentials in the selected arm
        # must fail at selection time, not later at request time when
        # the user's already partway through a sign-in.
        selector = OAuthProviderByEnvironment(
            dev=Anonymous(),
            prod=Google(client_id=None, client_secret=None),
        )
        with mock.patch(
            "reboot.aio.auth.oauth_providers.running_rbt_dev",
            return_value=False,
        ):
            with self.assertRaises(InputError) as context:
                selector.get()
        self.assertIn("Google", str(context.exception))
        self.assertIn("`client_id`", str(context.exception))

    def test_get_skips_validation_on_unused_arm(self):
        # This is precisely the scenario `Optional` credentials are
        # designed for: `prod=Google(client_id=None, ...)` from
        # `os.environ.get(...)` is fine under `rbt dev`, where only
        # the `dev=` arm is selected and validated.
        selector = OAuthProviderByEnvironment(
            dev=Anonymous(),
            prod=Google(client_id=None, client_secret=None),
        )
        with mock.patch(
            "reboot.aio.auth.oauth_providers.running_rbt_dev",
            return_value=True,
        ):
            # No exception — the unused `prod=` arm isn't validated.
            self.assertIsNotNone(selector.get())


class OAuthProviderForTestSelectorTest(unittest.TestCase):
    """
    `OAuthProviderForTest` returns the given provider in every
    environment (tests run in a single known environment) and runs
    `validate()` on it — so e.g. a test that wires in `Google(
    client_id=None, ...)` fails fast at `get()`, not with a less
    obvious error mid-flow.
    """

    def test_returns_given_provider(self):
        provider = Anonymous()
        self.assertIs(OAuthProviderForTest(provider).get(), provider)

    def test_get_validates_provider(self):
        selector = OAuthProviderForTest(
            Google(client_id=None, client_secret=None),
        )
        with self.assertRaises(InputError) as context:
            selector.get()
        self.assertIn("Google", str(context.exception))


if __name__ == "__main__":
    unittest.main()
