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
from reboot.aio.auth.oauth_providers import Development
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


if __name__ == "__main__":
    unittest.main()
