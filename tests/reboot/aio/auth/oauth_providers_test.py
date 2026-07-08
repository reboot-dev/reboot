import base64
import hashlib
import html
import httpx
import json
import os
import rbt.v1alpha1.errors_pb2
import re
import time
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
    RegisteredOAuthProvider,
    UserId,
)
from reboot.aio.auth.token_verifiers import TokenVerifier, VerifyTokenResult
from reboot.aio.contexts import ReaderContext
from reboot.aio.exceptions import InputError
from reboot.aio.tests import OAuthProviderForTest, Reboot
from reboot.ping.ping import CounterServicer, UserServicer
from reboot.settings import ENVVAR_RBT_DEV
from reboot.std.ciphertext.v1.ciphertext import ciphertext_library
from reboot.std.collections.ordered_map.v1.ordered_map import (
    ordered_map_library,
)
from reboot.std.oauth.v1.oauth import oauth_library
from tests.reboot.pydantic.auto_construct_user.servicer import \
    ProfileServicer as AutoConstructProfileServicer
from tests.reboot.pydantic.auto_construct_user.servicer import \
    UserServicer as AutoConstructUserServicer
from tests.reboot.pydantic.auto_construct_user.servicer_api_rbt import \
    User as AutoConstructUser
from typing import Any, Mapping, Optional
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

    async def test_browser_flow_whoami_and_refresh_expose_expires_at(self):
        """
        Drive the browser-flow OAuth dance end to end against the
        `/__/oauth/start` / `/__/oauth/finish` endpoints, then
        verify that both `/__/oauth/whoami` and `/__/oauth/refresh`
        return `expires_at` in their JSON bodies — that field is
        the foundation the React provider's proactive-refresh
        timer relies on to schedule renewal *before* the access
        JWT expires (the WebSocket-multiplex mutation path has no
        401-retry hook, so the SPA can't react after the fact).
        """
        await self.rbt.up(
            Application(
                servicers=[UserServicer, CounterServicer],
                oauth=OAuthProviderForTest(Development()),
            ),
        )

        base = self.rbt.http_localhost_url("")
        # Browser flows are same-origin from the backend's
        # perspective; the start endpoint round-trips relative
        # paths only.
        return_to = "/"

        async with httpx.AsyncClient(
            follow_redirects=False,
            # `httpx.Cookies()` would suffice; passing an empty
            # `cookies=` makes the SetCookie persistence explicit
            # for readers.
            cookies=httpx.Cookies(),
        ) as client:

            def strip_secure_flag_from_cookies() -> None:
                # The OAuth server marks all browser-flow cookies
                # `Secure`, which browsers exempt for `localhost`.
                # httpx's cookie jar does not — it would refuse to
                # ship them on the test's http: URL — so we strip
                # the flag after each redirect.
                for cookie in client.cookies.jar:
                    cookie.secure = False

            # 1. /__/oauth/start → 302 to /__/oauth/authorize.
            #    Sets `rbt_oauth_pending` carrying the PKCE
            #    verifier.
            response = await client.get(
                base + "/__/oauth/start",
                params={"return_to": return_to},
            )
            strip_secure_flag_from_cookies()
            self.assertEqual(response.status_code, 302, response.text)
            authorize_url = response.headers["location"]
            self.assertIn("/__/oauth/authorize", authorize_url)

            # 2. /__/oauth/authorize → 302 to /__/oauth/dev-login.
            response = await client.get(authorize_url)
            strip_secure_flag_from_cookies()
            self.assertEqual(response.status_code, 302, response.text)
            login_url = response.headers["location"]
            self.assertIn("/__/oauth/dev-login", login_url)

            # 3. /__/oauth/dev-login → HTML; scrape Alice's link.
            response = await client.get(login_url)
            strip_secure_flag_from_cookies()
            self.assertEqual(response.status_code, 200, response.text)
            match = re.search(
                r'href="([^"]*?code=Alice[^"]*?)"', response.text
            )
            self.assertIsNotNone(match)
            assert match is not None
            callback_url = html.unescape(match.group(1))

            # 4. /__/oauth/callback → 302 to /__/oauth/finish.
            response = await client.get(callback_url)
            strip_secure_flag_from_cookies()
            self.assertEqual(response.status_code, 302, response.text)
            finish_url = response.headers["location"]
            self.assertIn("/__/oauth/finish", finish_url)

            # 5. /__/oauth/finish → 302 to `return_to`. Sets
            #    `rbt_session` and `rbt_refresh`.
            response = await client.get(finish_url)
            strip_secure_flag_from_cookies()
            self.assertEqual(response.status_code, 302, response.text)
            self.assertEqual(response.headers["location"], return_to)
            self.assertIn("rbt_session", client.cookies)
            self.assertIn("rbt_refresh", client.cookies)

            # Stamp now() before each token-issuing call so we can
            # assert each `expires_at` is roughly the access TTL
            # ahead of wall clock.
            ttl = Development().access_token_ttl_seconds

            # 6. /__/oauth/whoami → 200 JSON, must include
            #    `expires_at` consistent with the access TTL.
            now_before_whoami = int(time.time())
            response = await client.get(base + "/__/oauth/whoami")
            self.assertEqual(response.status_code, 200, response.text)
            body = response.json()
            self.assertTrue(body["authenticated"])
            self.assertIn("access_token", body)
            self.assertIn(
                "expires_at",
                body,
                "/__/oauth/whoami must surface `expires_at` so "
                "the SPA's proactive-refresh scheduler can re-arm "
                "before the JWT expires.",
            )
            self.assertIsInstance(body["expires_at"], int)
            # Tolerate ±2 s of clock-and-RPC slop.
            self.assertGreaterEqual(
                body["expires_at"], now_before_whoami + ttl - 2
            )
            self.assertLessEqual(
                body["expires_at"], now_before_whoami + ttl + 2
            )
            original_expires_at = body["expires_at"]

            # 7. /__/oauth/refresh → 200 JSON, must include a
            #    *fresh* `expires_at` >= the one we just saw, and
            #    return a new access_token (the rotation we
            #    promised the proactive-refresh timer).
            now_before_refresh = int(time.time())
            # Send the backend's own origin, as a browser would on a
            # same-origin `fetch` POST; the CSRF check must let it
            # through.
            response = await client.post(
                base + "/__/oauth/refresh",
                headers={"Origin": base},
            )
            self.assertEqual(response.status_code, 200, response.text)
            body = response.json()
            self.assertIn("access_token", body)
            self.assertIn(
                "expires_at",
                body,
                "/__/oauth/refresh must surface `expires_at` so "
                "the SPA can re-arm its proactive-refresh timer "
                "without a second `/whoami` round-trip.",
            )
            self.assertIsInstance(body["expires_at"], int)
            self.assertGreaterEqual(
                body["expires_at"], now_before_refresh + ttl - 2
            )
            self.assertGreaterEqual(body["expires_at"], original_expires_at)

    async def test_start_rejects_unsafe_return_to(self):
        """
        `/__/oauth/start` reflects `return_to` into the 302 it
        eventually fires from `/__/oauth/finish`, so a malicious
        `return_to` would let an attacker bounce a signed-in user
        through their own backend onto an attacker-controlled page
        ("phishing aid": no tokens leak, but trust transfers).
        Same-origin relative paths are accepted unconditionally;
        absolute URLs are accepted only when their origin is trusted
        (listed in `Application(allowed_origins=...)`, the backend's
        own origin, or localhost under `rbt dev run`); everything
        else is 400.
        """
        await self.rbt.up(
            Application(
                servicers=[UserServicer, CounterServicer],
                oauth=OAuthProviderForTest(Development()),
                allowed_origins=["https://spa.example"],
            ),
        )
        start_url = self.rbt.http_localhost_url("/__/oauth/start")

        bad_cases = [
            ("empty", ""),
            ("protocol_relative", "//evil.example/"),
            ("javascript_scheme", "javascript:alert(1)"),
            ("data_scheme", "data:text/html,<script>alert(1)</script>"),
            # `urlparse` accepts these but the implementation
            # requires a known scheme + non-empty netloc.
            ("missing_scheme_with_host", "evil.example/path"),
            # Absolute URL whose origin is NOT in `allowed_origins`
            # — the phishing-aid case.
            ("absolute_not_in_allowed_origins", "https://evil.example/"),
        ]
        async with httpx.AsyncClient(follow_redirects=False) as client:
            for label, bad in bad_cases:
                response = await client.get(
                    start_url,
                    params={"return_to": bad},
                )
                self.assertEqual(
                    response.status_code,
                    400,
                    msg=f"{label}: return_to={bad!r} should be 400, got "
                    f"{response.status_code}: {response.text}",
                )

            # Sanity: a same-origin relative path is fine.
            response = await client.get(
                start_url,
                params={"return_to": "/some/path"},
            )
            self.assertEqual(response.status_code, 302, response.text)

            # An absolute URL whose origin IS in `allowed_origins`
            # is accepted — that's how a cross-origin SPA hosted at
            # `https://spa.example` signs the user in and gets sent
            # back to its own page.
            response = await client.get(
                start_url,
                params={"return_to": "https://spa.example/home"},
            )
            self.assertEqual(response.status_code, 302, response.text)

            # The backend's own origin is always an acceptable
            # absolute `return_to`, without appearing in
            # `allowed_origins` — a same-origin web app needs no
            # allow-listing.
            own_origin = self.rbt.http_localhost_url()
            response = await client.get(
                start_url,
                params={"return_to": f"{own_origin}/after-sign-in"},
            )
            self.assertEqual(response.status_code, 302, response.text)

            # Under `rbt dev run`, localhost origins are trusted
            # automatically — mirroring Envoy's dev CORS widening —
            # so a local frontend dev server's `return_to` works
            # without configuration...
            with mock.patch.dict(os.environ, {ENVVAR_RBT_DEV: "true"}):
                response = await client.get(
                    start_url,
                    params={"return_to": "http://localhost:5173/"},
                )
            self.assertEqual(response.status_code, 302, response.text)

            # ...while outside dev that same localhost origin (which
            # is neither allow-listed nor the backend's own origin —
            # the port differs) stays rejected.
            response = await client.get(
                start_url,
                params={"return_to": "http://localhost:5173/"},
            )
            self.assertEqual(response.status_code, 400, response.text)

    async def test_signout_rejects_cross_site_origin(self):
        """
        `/__/oauth/signout` is cookie-authorized and state-changing,
        so without an `Origin` check any web page the user visits
        could sign them out at will (CSRF). Browsers attach `Origin`
        to cross-origin POSTs; only trusted origins pass. Requests
        without an `Origin` header (non-browser clients) pass too —
        they attach cookies deliberately, not ambiently.
        """
        await self.rbt.up(
            Application(
                servicers=[UserServicer, CounterServicer],
                oauth=OAuthProviderForTest(Development()),
                allowed_origins=["https://spa.example"],
            ),
        )
        signout_url = self.rbt.http_localhost_url("/__/oauth/signout")
        async with httpx.AsyncClient(timeout=_HTTP_TIMEOUT_SECONDS) as client:
            response = await client.post(
                signout_url,
                headers={"Origin": "https://evil.example"},
            )
            self.assertEqual(response.status_code, 403, response.text)

            response = await client.post(
                signout_url,
                headers={"Origin": "https://spa.example"},
            )
            self.assertEqual(response.status_code, 204, response.text)

            response = await client.post(signout_url)
            self.assertEqual(response.status_code, 204, response.text)

    async def test_refresh_rejects_cross_site_origin(self):
        """
        `/__/oauth/refresh` is cookie-authorized and state-changing
        (it re-mints the session cookies, re-arming the refresh
        window), so it carries the same `Origin` CSRF check as
        `/__/oauth/signout`: cross-site origins are rejected before
        the refresh cookie is even consulted, while trusted origins
        and non-browser requests (no `Origin` header) proceed to the
        normal cookie check.
        """
        await self.rbt.up(
            Application(
                servicers=[UserServicer, CounterServicer],
                oauth=OAuthProviderForTest(Development()),
                allowed_origins=["https://spa.example"],
            ),
        )
        refresh_url = self.rbt.http_localhost_url("/__/oauth/refresh")
        async with httpx.AsyncClient(timeout=_HTTP_TIMEOUT_SECONDS) as client:
            response = await client.post(
                refresh_url,
                headers={"Origin": "https://evil.example"},
            )
            self.assertEqual(response.status_code, 403, response.text)

            # A trusted origin passes the origin check; without a
            # refresh cookie the request then fails the normal cookie
            # check.
            response = await client.post(
                refresh_url,
                headers={"Origin": "https://spa.example"},
            )
            self.assertEqual(response.status_code, 401, response.text)
            self.assertEqual(response.json()["error"], "not_signed_in")

            # So does a request without an `Origin` header (a
            # non-browser client).
            response = await client.post(refresh_url)
            self.assertEqual(response.status_code, 401, response.text)
            self.assertEqual(response.json()["error"], "not_signed_in")

    async def test_finish_requires_matching_pending_cookie(self):
        """
        `/__/oauth/finish` redeems an OAuth `code` against the PKCE
        verifier that `/__/oauth/start` stashed in the
        `rbt_oauth_pending` cookie. Without that cookie, an
        attacker controlling the redirect dance could swap in a
        forged `code`, so the endpoint must 400 — not silently
        roll forward.
        """
        await self.rbt.up(
            Application(
                servicers=[UserServicer, CounterServicer],
                oauth=OAuthProviderForTest(Development()),
            ),
        )
        finish_url = self.rbt.http_localhost_url("/__/oauth/finish")

        async with httpx.AsyncClient(follow_redirects=False) as client:
            # No `code` parameter at all.
            response = await client.get(finish_url)
            self.assertEqual(response.status_code, 400, response.text)
            self.assertIn(
                "code",
                response.json()["error_description"].lower(),
            )

            # `code` present, but no `rbt_oauth_pending` cookie —
            # the call can't proceed without the PKCE verifier.
            response = await client.get(
                finish_url,
                params={
                    "code": "fake-code",
                    "state": "fake-state"
                },
            )
            self.assertEqual(response.status_code, 400, response.text)
            self.assertIn(
                "pending",
                response.json()["error_description"].lower(),
                msg="Expected an error mentioning the pending-flow "
                "cookie",
            )

    async def test_authorize_short_circuits_with_valid_session(self):
        """
        Web→MCP SSO: if the user already has a valid `rbt_session`
        cookie (set by a previous browser sign-in), an MCP client
        going through `/__/oauth/authorize` still sees the consent
        screen, but approving it short-circuits *without* a trip
        through the IdP — `/consent` mints an auth code directly and
        302s back to the MCP client's `redirect_uri`. That's what
        lets an MCP client launched from an already-signed-in browser
        skip re-entering credentials.
        """
        await self.rbt.up(
            Application(
                servicers=[UserServicer, CounterServicer],
                oauth=OAuthProviderForTest(Development()),
            ),
        )

        base = self.rbt.http_localhost_url("")
        return_to = "/"

        async with httpx.AsyncClient(
            follow_redirects=False,
            cookies=httpx.Cookies(),
        ) as client:

            def strip_secure_flag_from_cookies() -> None:
                for cookie in client.cookies.jar:
                    cookie.secure = False

            # 1. Drive the browser sign-in once so the test client
            #    holds an `rbt_session` cookie. Helper steps; the
            #    flow itself is exercised by
            #    `test_browser_flow_whoami_and_refresh_expose_expires_at`.
            response = await client.get(
                base + "/__/oauth/start",
                params={"return_to": return_to},
            )
            strip_secure_flag_from_cookies()
            self.assertEqual(response.status_code, 302)
            authorize_url = response.headers["location"]

            response = await client.get(authorize_url)
            strip_secure_flag_from_cookies()
            self.assertEqual(response.status_code, 302)
            login_url = response.headers["location"]

            response = await client.get(login_url)
            strip_secure_flag_from_cookies()
            self.assertEqual(response.status_code, 200)
            match = re.search(
                r'href="([^"]*?code=Alice[^"]*?)"', response.text
            )
            assert match is not None
            callback_url = html.unescape(match.group(1))

            response = await client.get(callback_url)
            strip_secure_flag_from_cookies()
            self.assertEqual(response.status_code, 302)
            finish_url = response.headers["location"]

            response = await client.get(finish_url)
            strip_secure_flag_from_cookies()
            self.assertEqual(response.status_code, 302, response.text)
            self.assertIn("rbt_session", client.cookies)

            # 2. Now register a synthetic MCP client and drive
            #    `/__/oauth/authorize` with that client's params.
            #    The session cookie carries over; approving the
            #    consent screen should short-circuit straight to the
            #    MCP client's redirect_uri *without* bouncing through
            #    `/__/oauth/dev-login`.
            mcp_redirect_uri = "http://localhost/mcp-callback"
            metadata_response = await client.get(
                base + "/.well-known/oauth-authorization-server",
            )
            metadata = metadata_response.json()
            register_response = await client.post(
                metadata["registration_endpoint"],
                json={"redirect_uris": [mcp_redirect_uri]},
            )
            self.assertEqual(register_response.status_code, 201)
            client_id = register_response.json()["client_id"]

            # Synthetic PKCE pair.
            code_verifier = base64.urlsafe_b64encode(os.urandom(32)
                                                    ).rstrip(b"=").decode()
            code_challenge = base64.urlsafe_b64encode(
                hashlib.sha256(code_verifier.encode()).digest()
            ).rstrip(b"=").decode()

            response = await client.get(
                metadata["authorization_endpoint"],
                params={
                    "response_type": "code",
                    "client_id": client_id,
                    "redirect_uri": mcp_redirect_uri,
                    "code_challenge": code_challenge,
                    "code_challenge_method": "S256",
                    "state": "synthetic-mcp-state",
                },
            )
            strip_secure_flag_from_cookies()
            # A DCR (MCP) client still gets the consent screen — only
            # the first-party browser client skips it.
            self.assertEqual(response.status_code, 200, response.text)

            # Approving consent short-circuits straight to the MCP
            # client's redirect_uri *without* bouncing through
            # `/__/oauth/dev-login`: the `rbt_session` cookie from the
            # browser sign-in above carries the user's identity, so
            # `/consent` mints the auth code directly.
            consent_url = self.rbt.http_localhost_url(_CONSENT_PATH)
            response = await _approve_consent(
                client, consent_url, response.text
            )
            strip_secure_flag_from_cookies()
            self.assertEqual(response.status_code, 302, response.text)
            location = response.headers["location"]
            # The whole point: we land on the MCP client's
            # redirect URI directly, *not* on `/__/oauth/dev-login`.
            self.assertTrue(
                location.startswith(mcp_redirect_uri),
                msg="Expected short-circuit redirect to "
                f"{mcp_redirect_uri!r}, got {location!r}. If this is "
                "a dev-login URL, the session cookie wasn't honoured.",
            )
            parsed = httpx.URL(location)
            self.assertIn("code", parsed.params)
            self.assertEqual(
                parsed.params["state"],
                "synthetic-mcp-state",
            )

    async def test_callback_sets_session_cookies_via_mcp_redirect(self):
        """
        MCP→web SSO: when an MCP client kicks off a browser sign-
        in, the user's browser ends up at `/__/oauth/callback`,
        which 302s back to the MCP client's `redirect_uri`. The
        `Set-Cookie` headers on that 302 response are what land
        `rbt_session` / `rbt_refresh` in the first-party jar on
        the Reboot backend's origin, so the standalone SPA on
        that same origin is signed in next time it opens — even
        though the user never went through `/__/oauth/start`.
        """
        await self.rbt.up(
            Application(
                servicers=[UserServicer, CounterServicer],
                oauth=OAuthProviderForTest(Development()),
            ),
        )

        base = self.rbt.http_localhost_url("")

        async with httpx.AsyncClient(follow_redirects=False) as client:
            metadata_response = await client.get(
                base + "/.well-known/oauth-authorization-server",
            )
            metadata = metadata_response.json()

            # Register an MCP-style client (DCR).
            mcp_redirect_uri = "http://localhost/mcp-callback"
            register_response = await client.post(
                metadata["registration_endpoint"],
                json={"redirect_uris": [mcp_redirect_uri]},
            )
            self.assertEqual(register_response.status_code, 201)
            client_id = register_response.json()["client_id"]

            code_verifier = base64.urlsafe_b64encode(os.urandom(32)
                                                    ).rstrip(b"=").decode()
            code_challenge = base64.urlsafe_b64encode(
                hashlib.sha256(code_verifier.encode()).digest()
            ).rstrip(b"=").decode()

            # /authorize (no existing session) → 200 consent screen;
            # approving it → 302 to /dev-login.
            response = await client.get(
                metadata["authorization_endpoint"],
                params={
                    "response_type": "code",
                    "client_id": client_id,
                    "redirect_uri": mcp_redirect_uri,
                    "code_challenge": code_challenge,
                    "code_challenge_method": "S256",
                    "state": "mcp-state-cookie-test",
                },
            )
            self.assertEqual(response.status_code, 200, response.text)
            consent_url = self.rbt.http_localhost_url(_CONSENT_PATH)
            response = await _approve_consent(
                client, consent_url, response.text
            )
            self.assertEqual(response.status_code, 302)
            login_url = response.headers["location"]

            # Scrape Alice's link and follow into /__/oauth/callback.
            response = await client.get(login_url)
            self.assertEqual(response.status_code, 200)
            match = re.search(
                r'href="([^"]*?code=Alice[^"]*?)"', response.text
            )
            assert match is not None
            callback_url = html.unescape(match.group(1))

            response = await client.get(callback_url)
            self.assertEqual(response.status_code, 302)
            # Redirects back to the MCP client's redirect_uri with
            # an `?code=...` — same as the existing MCP flow.
            self.assertTrue(
                response.headers["location"].startswith(mcp_redirect_uri),
            )

            # The whole point: even though the redirect target is
            # the MCP client (not `/__/oauth/finish`), the response
            # carries `Set-Cookie` for the three browser-session
            # cookies, so the standalone SPA on the Reboot origin
            # finds them next time the user opens it.
            set_cookie_headers = response.headers.get_list("set-cookie")
            cookie_names = {
                line.split("=", 1)[0].strip() for line in set_cookie_headers
            }
            self.assertIn(
                "rbt_session",
                cookie_names,
                msg="MCP /callback must Set-Cookie rbt_session to "
                "drive MCP→web SSO. Cookies seen: "
                f"{sorted(cookie_names)}",
            )
            self.assertIn("rbt_refresh", cookie_names)

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

    async def test_development_exchange_fabricates_identity_claims(self):
        """
        `Development(claims=...)` fabricates the requested identity
        claims a real provider would deliver — matching the identity
        shown on its login page — so claims-consuming application code
        can be exercised locally. Without `claims=` it delivers none,
        and a mapping presents a claim under a different name.
        """
        # Bring up a cluster so the Reboot-managed crypto root keys the
        # dev user-id derivation uses are in place.
        await self.rbt.up(
            Application(
                servicers=[UserServicer, CounterServicer],
                oauth=OAuthProviderForTest(Development()),
            ),
        )
        result = await Development(
            claims=["email", "email_verified", "name"],
        ).exchange_code(
            code="Alice",
            redirect_uri="http://localhost/cb",
        )
        self.assertEqual(
            result.claims,
            {
                "email": "alice@example.com",
                "email_verified": True,
                "name": "Alice",
            },
        )

        # Without `claims=`, claim delivery is off entirely.
        result = await Development().exchange_code(
            code="Alice",
            redirect_uri="http://localhost/cb",
        )
        self.assertIsNone(result.claims)

        # A mapping presents a claim under a different name.
        result = await Development(
            claims={
                "email": "verified-email"
            },
        ).exchange_code(
            code="Alice",
            redirect_uri="http://localhost/cb",
        )
        self.assertEqual(
            result.claims,
            {"verified-email": "alice@example.com"},
        )


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
            # Same-origin-only browser auth: this test exercises
            # selector resolution, and `oauth=` requires an explicit
            # `allowed_origins` choice outside `rbt dev run`.
            allowed_origins=[],
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


class _FakeAiohttpResponse:
    """A canned JSON response, shaped like an `aiohttp` request
    context manager."""

    def __init__(self, payload: Any) -> None:
        self._payload = payload

    async def __aenter__(self) -> "_FakeAiohttpResponse":
        return self

    async def __aexit__(self, *args: Any) -> None:
        return None

    def raise_for_status(self) -> None:
        pass

    async def json(self) -> Any:
        return self._payload


class _FakeAiohttpSession:
    """Just enough of `aiohttp.ClientSession` for a GitHub code
    exchange: canned JSON responses keyed by URL, recording the URLs
    requested."""

    def __init__(self, responses: Mapping[str, Any]) -> None:
        self._responses = responses
        self.requested_urls: list[str] = []

    async def __aenter__(self) -> "_FakeAiohttpSession":
        return self

    async def __aexit__(self, *args: Any) -> None:
        return None

    def post(self, url: str, **kwargs: Any) -> _FakeAiohttpResponse:
        self.requested_urls.append(url)
        return _FakeAiohttpResponse(self._responses[url])

    def get(self, url: str, **kwargs: Any) -> _FakeAiohttpResponse:
        self.requested_urls.append(url)
        return _FakeAiohttpResponse(self._responses[url])


class GitHubEmailClaimsTest(unittest.IsolatedAsyncioTestCase):
    """`GitHub(claims=...)` resolves the email claims via
    `GET /user/emails` — never the `GET /user` `email` field, which
    is the user-chosen public profile email and may be unverified —
    delivering the user's primary address only when GitHub has
    verified it."""

    _TOKEN_URL = "https://github.com/login/oauth/access_token"
    _USER_URL = "https://api.github.com/user"
    _EMAILS_URL = "https://api.github.com/user/emails"

    async def _exchange(
        self,
        provider: GitHub,
        emails: Any,
    ) -> tuple[ExchangeResult, _FakeAiohttpSession]:
        session = _FakeAiohttpSession(
            {
                self._TOKEN_URL: {
                    "access_token": "gh-token"
                },
                self._USER_URL:
                    {
                        "id": 12345,
                        # The public profile email: possibly unverified,
                        # so it must never become a claim.
                        "email": "public-profile@example.com",
                    },
                self._EMAILS_URL: emails,
            }
        )
        with mock.patch("aiohttp.ClientSession", return_value=session):
            result = await provider.exchange_code(
                code="c",
                redirect_uri="http://localhost/cb",
            )
        return result, session

    def _github(self, **kwargs: Any) -> GitHub:
        return GitHub(client_id="id", client_secret="s", **kwargs)

    async def test_verified_primary_email_delivered(self):
        result, _ = await self._exchange(
            self._github(claims=["email", "email_verified"]),
            [
                {
                    "email": "secondary@example.com",
                    "primary": False,
                    "verified": True,
                },
                {
                    "email": "jane@example.com",
                    "primary": True,
                    "verified": True,
                },
            ],
        )
        self.assertEqual(
            result.claims,
            {
                "email": "jane@example.com",
                "email_verified": True,
            },
        )

    async def test_unverified_primary_email_delivers_no_email_claims(self):
        # The primary address is the user's canonical one; when it is
        # unverified there is no verified email to assert — even if
        # some secondary address is verified — so the claim set is
        # empty (a full replace that clears any previously delivered
        # email).
        result, _ = await self._exchange(
            self._github(claims=["email", "email_verified"]),
            [
                {
                    "email": "secondary@example.com",
                    "primary": False,
                    "verified": True,
                },
                {
                    "email": "jane@example.com",
                    "primary": True,
                    "verified": False,
                },
            ],
        )
        self.assertEqual(result.claims, {})

    async def test_email_claim_presented_under_mapped_name(self):
        result, _ = await self._exchange(
            self._github(claims={"email": "verified-email"}),
            [
                {
                    "email": "jane@example.com",
                    "primary": True,
                    "verified": True,
                },
            ],
        )
        self.assertEqual(
            result.claims,
            {"verified-email": "jane@example.com"},
        )

    async def test_no_claims_requested_skips_email_lookup(self):
        result, session = await self._exchange(self._github(), [])
        self.assertIsNone(result.claims)
        # No claims were requested, so the extra API round trip never
        # happens.
        self.assertNotIn(self._EMAILS_URL, session.requested_urls)


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


class RequestedClaimsTest(unittest.TestCase):
    """The `claims=` a provider is constructed with decides exactly
    what `_presented_claims` lets out of a decoded ID token (or
    userinfo response): only the requested claims, under their
    presented names — so ephemeral protocol claims (`exp`, `nonce`,
    ...) never leak into `ExchangeResult.claims`, where they would
    make every sign-in look like a claims change. Requests a provider
    cannot serve fail at construction."""

    def _google(self, **kwargs: Any) -> Google:
        return Google(client_id="id", client_secret="s", **kwargs)

    def test_filters_to_requested_claims(self):
        self.assertEqual(
            self._google(
                claims=["email", "email_verified", "name"],
            )._presented_claims(
                {
                    "iss": "https://idp.example",
                    "sub": "user-123",
                    "aud": "client-id",
                    "exp": 1999999999,
                    "iat": 1999990000,
                    "nonce": "abc",
                    "email": "jane@example.com",
                    "email_verified": True,
                    "name": "Jane Doe",
                }
            ),
            {
                "email": "jane@example.com",
                "email_verified": True,
                "name": "Jane Doe",
            },
        )

    def test_unrequested_claims_stay_inside_the_provider(self):
        self.assertEqual(
            self._google(claims=["email"])._presented_claims(
                {
                    "email": "jane@example.com",
                    "name": "Jane Doe",
                }
            ),
            {"email": "jane@example.com"},
        )

    def test_mapping_presents_claims_under_new_names(self):
        self.assertEqual(
            self._google(
                claims={
                    "email": "verified-email",
                    "name": "name",
                },
            )._presented_claims(
                {
                    "email": "jane@example.com",
                    "name": "Jane Doe",
                }
            ),
            {
                "verified-email": "jane@example.com",
                "name": "Jane Doe",
            },
        )

    def test_no_claims_requested_presents_none(self):
        # `None`, not `{}`: claim delivery is off, as opposed to
        # asserting a verified-empty claim set.
        self.assertIsNone(
            self._google()._presented_claims({"email": "jane@example.com"}),
        )

    def test_omits_absent_and_none_claims(self):
        self.assertEqual(
            self._google(
                claims=["email", "name"],
            )._presented_claims({
                "email": "jane@example.com",
                "name": None,
            }),
            {"email": "jane@example.com"},
        )

    def test_false_valued_claims_are_kept(self):
        # `email_verified: false` is a meaningful claim value, distinct
        # from the claim being absent.
        self.assertEqual(
            self._google(
                claims=["email_verified"],
            )._presented_claims({"email_verified": False}),
            {"email_verified": False},
        )

    def test_unavailable_claim_rejected_naming_available_ones(self):
        with self.assertRaises(InputError) as context:
            self._google(claims=["email", "phone_number"])
        message = str(context.exception)
        self.assertIn("Google", message)
        self.assertIn("'phone_number'", message)
        # The message names the claims that ARE available.
        self.assertIn("'email'", message)
        self.assertIn("'email_verified'", message)
        self.assertIn("'name'", message)

    def test_claimless_provider_rejects_any_claims(self):
        # A provider with no claims vocabulary at all rejects every
        # `claims=` request.
        class Claimless(RegisteredOAuthProvider):
            _REQUIRED_SCOPE = "basic"

            def authorization_url(
                self,
                state: str,
                redirect_uri: str,
            ) -> str:
                raise NotImplementedError()

            async def exchange_code(
                self,
                code: str,
                redirect_uri: str,
            ) -> ExchangeResult:
                raise NotImplementedError()

        with self.assertRaises(InputError) as context:
            Claimless(client_id="id", client_secret="s", claims=["email"])
        self.assertIn("Claimless", str(context.exception))
        self.assertIn("does not deliver", str(context.exception))

    def test_github_rejects_claims_it_cannot_deliver(self):
        # GitHub's menu is intentionally limited to the verified
        # email claims until the integration is easier to test, so
        # `name` is not on it (see `GitHub._AVAILABLE_CLAIMS`).
        with self.assertRaises(InputError) as context:
            GitHub(client_id="id", client_secret="s", claims=["name"])
        message = str(context.exception)
        self.assertIn("GitHub", message)
        self.assertIn("'name'", message)
        self.assertIn("'email'", message)

    def test_bare_string_rejected(self):
        # A bare string is a `Sequence[str]` of characters; catch the
        # mistake instead of requesting claims 'e', 'm', 'a', ...
        with self.assertRaises(InputError) as context:
            self._google(claims="email")
        self.assertIn("'email'", str(context.exception))

    def test_non_string_claim_entries_rejected(self):
        # Malformed `claims=` values fail with the same
        # construction-time diagnostics as unknown claims, not a raw
        # `TypeError` from further down.
        with self.assertRaises(InputError) as context:
            self._google(claims=[["email"]])
        self.assertIn("non-string", str(context.exception))
        with self.assertRaises(InputError) as context:
            self._google(claims={"email": ["alias"]})
        self.assertIn("non-string", str(context.exception))

    def test_duplicate_presented_names_rejected(self):
        with self.assertRaises(InputError) as context:
            self._google(
                claims={
                    "email": "contact",
                    "name": "contact",
                },
            )
        self.assertIn("'contact'", str(context.exception))

    def test_empty_claims_means_none(self):
        self.assertIsNone(
            self._google(claims=[])._presented_claims({"email": "x"}),
        )


class AnonymousClaimsTest(unittest.IsolatedAsyncioTestCase):

    async def test_anonymous_exchange_has_no_claims(self):
        # An anonymous user has no verified identity to draw claims
        # from: the provider has no claims source at all (`None`), as
        # opposed to asserting a verified-empty claim set (`{}`).
        result = await Anonymous().exchange_code(
            code="anonymous",
            redirect_uri="http://localhost/cb",
        )
        self.assertIsNone(result.claims)


def _scope_param(authorization_url: str) -> list[str]:
    """Extract the space-delimited `scope` query parameter from an
    authorization URL as a list."""
    query = parse_qs(urlparse(authorization_url).query)
    return query["scope"][0].split()


class ScopeTest(unittest.TestCase):
    """`Google`/`GitHub` always request their required base scope and
    add the scopes any requested `claims=` need plus any
    developer-supplied `scopes` on top — so an app can ask for
    identity claims and extra access (Calendar, `repo`, …) without
    losing the scope identity resolution depends on."""

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

    def test_google_derives_scopes_from_requested_claims(self):
        # Requesting claims requests the scopes that make the identity
        # provider deliver them, without the developer having to know
        # the claim-to-scope mapping.
        url = Google(
            client_id="id",
            client_secret="s",
            claims=["email", "email_verified", "name"],
        ).authorization_url(state="x", redirect_uri="http://localhost/cb")
        self.assertEqual(_scope_param(url), ["openid", "email", "profile"])

    def test_claim_derived_scopes_are_deduplicated(self):
        # A claim-derived scope the developer also asked for via
        # `scopes=` appears once.
        url = Google(
            client_id="id",
            client_secret="s",
            scopes=["email"],
            claims=["email"],
        ).authorization_url(state="x", redirect_uri="http://localhost/cb")
        self.assertEqual(_scope_param(url), ["openid", "email"])

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

    def test_github_derives_user_email_scope_from_email_claim(self):
        # The email claims come from `GET /user/emails`, which needs
        # the `user:email` scope.
        url = GitHub(
            client_id="id",
            client_secret="s",
            claims=["email", "email_verified"],
        ).authorization_url(state="x", redirect_uri="http://localhost/cb")
        self.assertEqual(_scope_param(url), ["read:user", "user:email"])

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


class _FakeClaimsProvider(OAuthProvider):
    """A provider that redirects straight back to the callback and
    reports a fixed user with whatever claims a test assigns, so
    claims delivery can be exercised across successive sign-ins."""

    USER_ID = UserId("claims-user")

    def __init__(self) -> None:
        super().__init__()
        # The claims the next `exchange_code` reports; `None` means
        # the provider has no verified claims source.
        self.claims: Optional[Mapping[str, Any]] = None

    def authorization_url(self, state: str, redirect_uri: str) -> str:
        return f"{redirect_uri}?{urlencode({'code': 'fake', 'state': state})}"

    async def exchange_code(
        self, code: str, redirect_uri: str
    ) -> ExchangeResult:
        return ExchangeResult(
            user_id=self.USER_ID,
            tokens=None,
            claims=self.claims,
        )


class ClaimsDeliveryTest(unittest.IsolatedAsyncioTestCase):
    """Drives browser sign-ins with a fake provider and checks how the
    exchange's claims reach `User` state: a mapping is delivered as a
    full replacement (so an empty mapping clears previously delivered
    claims), while `None` delivers nothing and clears nothing."""

    async def asyncSetUp(self) -> None:
        self.rbt = Reboot()
        await self.rbt.start()
        self.provider = _FakeClaimsProvider()
        await self.rbt.up(
            Application(
                servicers=[
                    AutoConstructUserServicer,
                    AutoConstructProfileServicer,
                ],
                oauth=OAuthProviderForTest(self.provider),
            ),
        )

    async def asyncTearDown(self) -> None:
        await self.rbt.stop()

    async def _login(self) -> None:
        """Drive one full browser sign-in (start → authorize →
        callback → finish) with a fresh cookie jar, so every login
        performs a real identity-provider code exchange instead of
        being short-circuited by session-cookie SSO."""
        base = self.rbt.http_localhost_url("")
        async with httpx.AsyncClient(
            follow_redirects=False,
            cookies=httpx.Cookies(),
        ) as client:

            def strip_secure_flag_from_cookies() -> None:
                # The OAuth server marks all browser-flow cookies
                # `Secure`, which browsers exempt for `localhost` but
                # httpx's cookie jar does not.
                for cookie in client.cookies.jar:
                    cookie.secure = False

            response = await client.get(
                base + "/__/oauth/start",
                params={"return_to": "/"},
            )
            # start → authorize → (the fake provider redirects
            # straight back to) callback → finish → `return_to`.
            for _ in range(4):
                strip_secure_flag_from_cookies()
                self.assertEqual(response.status_code, 302, response.text)
                location = response.headers["location"]
                if location == "/":
                    return
                response = await client.get(location)
            self.assertEqual(response.headers["location"], "/")

    async def test_claims_full_replace_and_none_delivers_nothing(self) -> None:
        context = self.rbt.create_external_context(
            name=f"test-{self.id()}",
            app_internal=True,
        )
        user = AutoConstructUser.ref(_FakeClaimsProvider.USER_ID)

        # A mapping is delivered as the complete current claim set.
        self.provider.claims = {"email": "first@example.com"}
        await self._login()
        response = await user.get(context)
        self.assertEqual(response.email, "first@example.com")

        # `None`: the provider has no verified claims source, so
        # nothing is delivered and nothing is cleared.
        self.provider.claims = None
        await self._login()
        response = await user.get(context)
        self.assertEqual(response.email, "first@example.com")

        # An empty mapping is still the complete current claim set:
        # the full replacement clears previously delivered claims.
        self.provider.claims = {}
        await self._login()
        response = await user.get(context)
        self.assertEqual(response.email, "")


if __name__ == "__main__":
    unittest.main()
