import httpx
import os
import re
import unittest
from fastapi import FastAPI
from reboot.aio.auth.oauth_client import (
    OAuthClient,
    OAuthClientError,
    discover,
    pkce_pair,
    register,
)
from reboot.aio.auth.oauth_providers import Development
from reboot.aio.auth.oauth_server import OAuthServer
from reboot.settings import ENVVAR_RBT_DEV
from tests.reboot.aio.auth import oauth_server_harness as harness
from urllib.parse import parse_qs, urlparse

FOREIGN = "https://ben--counter--acme.dev.rbt.cloud"


class OAuthClientTest(unittest.IsolatedAsyncioTestCase):
    """`OAuthClient` against an `OAuthServer`: discovery, dynamic
    registration, the authorization code grant with PKCE and a
    resource, refresh, and the server's refusals."""

    def setUp(self) -> None:
        harness.ensure_root_keys()
        os.environ[ENVVAR_RBT_DEV] = "true"
        self.server = OAuthServer(
            provider=Development(),
            protected_resources=["/mcp"],
            application_title="Counter",
        )
        self.app = harness.serve(self.server.mount_routes)

    async def _sign_in(self, origin: str,
                       authorization_url: str) -> tuple[str, str]:
        """Drive the browser's part of the flow: consent, then the
        development account picker. Returns the code and state the
        client's redirect URI received."""
        async with httpx.AsyncClient(follow_redirects=False) as browser:
            response = await browser.get(authorization_url)
            self.assertEqual(response.status_code, 200, response.text)
            consent = re.search(
                r'name="consent" value="([^"]+)"', response.text
            )
            assert consent is not None
            response = await browser.post(
                f"{origin}/__/oauth/consent",
                data={
                    "consent": consent.group(1),
                    "action": "approve"
                },
            )
            self.assertEqual(response.status_code, 302, response.text)
            location = response.headers["location"]
            self.assertIn("/__/oauth/dev-login", location)
            state = parse_qs(urlparse(location).query)["state"][0]
            response = await browser.get(
                f"{origin}/__/oauth/callback",
                params={
                    "code": "Alice",
                    "state": state
                },
            )
            self.assertEqual(response.status_code, 302, response.text)
            query = parse_qs(urlparse(response.headers["location"]).query)
            return query["code"][0], query["state"][0]

    async def test_authorization_code_grant(self):
        async for origin in harness.serve_on_loopback(self.app):
            metadata = await discover(origin)
            self.assertEqual(metadata.issuer, origin)
            self.assertEqual(
                metadata.token_endpoint, f"{origin}/__/oauth/token"
            )
            assert metadata.registration_endpoint is not None
            redirect_uri = "http://127.0.0.1:1/callback"
            client_id = await register(
                metadata.registration_endpoint,
                redirect_uris=[redirect_uri],
                client_name="rbt",
            )
            client = OAuthClient(
                authorization_endpoint=metadata.authorization_endpoint,
                token_endpoint=metadata.token_endpoint,
                client_id=client_id,
            )
            verifier, challenge = pkce_pair()
            url = client.authorization_url(
                redirect_uri=redirect_uri,
                state="opaque",
                code_challenge=challenge,
                resource=FOREIGN,
            )
            params = parse_qs(urlparse(url).query)
            self.assertEqual(params["code_challenge_method"], ["S256"])
            self.assertEqual(params["resource"], [FOREIGN])
            code, state = await self._sign_in(origin, url)
            self.assertEqual(state, "opaque")

            # The wrong verifier is refused with the server's error.
            with self.assertRaises(OAuthClientError) as raised:
                await client.exchange_code(
                    code=code,
                    redirect_uri=redirect_uri,
                    code_verifier="not-the-verifier",
                    resource=FOREIGN,
                )
            self.assertEqual(raised.exception.error, "invalid_grant")

            tokens = await client.exchange_code(
                code=code,
                redirect_uri=redirect_uri,
                code_verifier=verifier,
                resource=FOREIGN,
            )
            self.assertIn("access_token", tokens)
            refreshed = await client.refresh(
                refresh_token=tokens["refresh_token"],
                resource=FOREIGN,
            )
            self.assertIn("access_token", refreshed)
            # A refresh for another resource than the grant's is
            # refused.
            with self.assertRaises(OAuthClientError) as raised:
                await client.refresh(
                    refresh_token=refreshed["refresh_token"],
                    resource="https://other.example",
                )
            self.assertEqual(raised.exception.error, "invalid_target")
            # A refresh token that is not one is refused.
            with self.assertRaises(OAuthClientError) as raised:
                await client.refresh(refresh_token="not-a-refresh-token")
            self.assertEqual(raised.exception.error, "invalid_grant")

    def test_authorization_url_names_a_resource(self):
        url = OAuthClient(
            authorization_endpoint="https://cloud.test/authorize",
            token_endpoint="https://cloud.test/token",
            client_id="client",
        ).authorization_url(
            redirect_uri="http://127.0.0.1:1/callback",
            state="opaque",
            resource=FOREIGN,
        )
        self.assertEqual(parse_qs(urlparse(url).query)["resource"], [FOREIGN])

    async def test_discovery_of_a_non_server(self):
        async for origin in harness.serve_on_loopback(FastAPI()):
            with self.assertRaises(OAuthClientError) as raised:
                await discover(origin)
            self.assertEqual(raised.exception.error, "404")


if __name__ == "__main__":
    unittest.main()
