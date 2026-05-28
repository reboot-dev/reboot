import base64
import hashlib
import html
import httpx
import json
import os
import re
import unittest
from mcp.client.session import ClientSession
from mcp.client.streamable_http import streamable_http_client
from reboot.aio.applications import Application
from reboot.aio.auth.oauth_providers import (
    Anonymous,
    Development,
    GitHub,
    Google,
    OAuthProviderByEnvironment,
)
from reboot.aio.exceptions import InputError
from reboot.aio.tests import OAuthProviderForTest, Reboot
from reboot.ping.ping import CounterServicer, UserServicer
from reboot.settings import ENVVAR_RBT_SERVE
from unittest import mock


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
        async with httpx.AsyncClient() as client:
            response = await client.get(
                self.rbt.
                http_localhost_url("/.well-known/oauth-authorization-server"),
            )
            self.assertEqual(response.status_code, 200)
            metadata = response.json()
        register_url = metadata["registration_endpoint"]
        authorize_url = metadata["authorization_endpoint"]
        token_url = metadata["token_endpoint"]

        async def login_as(identity: str) -> str:
            """Run the full OAuth flow picking `identity`; return an
            access token."""
            # PKCE: a random verifier and its S256 challenge.
            code_verifier = base64.urlsafe_b64encode(os.urandom(32)
                                                    ).rstrip(b"=").decode()
            code_challenge = base64.urlsafe_b64encode(
                hashlib.sha256(code_verifier.encode()).digest()
            ).rstrip(b"=").decode()

            async with httpx.AsyncClient() as client:
                # Register a client.
                response = await client.post(
                    register_url,
                    json={"redirect_uris": [client_redirect_uri]},
                )
                self.assertEqual(response.status_code, 201)
                client_id = response.json()["client_id"]

                # GET /authorize → 302 to the dev-login page.
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

        async with httpx.AsyncClient() as client:
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

    async def test_user_without_oauth_raises_in_prod(self):
        """
        In a real production deployment (`rbt serve` / Reboot Cloud), an
        `Application` whose `oauth` selector has no provider for that
        environment (here, the `oauth=None` default ≡ `dev=None,
        prod=None`) fails to start when it has a `User` servicer — its
        `OAuthProviderByEnvironment.get()` raises. So an app can't
        silently ship without choosing a real OAuth provider. (Under
        `rbt dev` and in tests the `dev` arm is used instead.)

        Uses the real `reboot.aio.applications.Application` (the test
        `Application` always resolves to a concrete provider).
        """
        with mock.patch.dict(
            os.environ,
            {ENVVAR_RBT_SERVE: "true"},
            clear=False,
        ):
            with self.assertRaises(InputError) as context:
                Application(
                    servicers=[UserServicer, CounterServicer],
                )
        self.assertIn(
            "No OAuth provider is configured",
            str(context.exception),
        )


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
