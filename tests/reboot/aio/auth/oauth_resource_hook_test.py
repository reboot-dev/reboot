import os
import unittest
from reboot.aio.auth.oauth import (
    Allow,
    Deny,
    ResourceDecision,
    ResourceRequest,
)
from reboot.aio.auth.oauth_providers import Development
from reboot.aio.auth.oauth_server import OAuthServer
from reboot.settings import ENVVAR_RBT_DEV
from tests.reboot.aio.auth import oauth_server_harness as harness
from typing import Any
from urllib.parse import parse_qs, urlparse

FOREIGN = "https://ben--counter--acme.dev.rbt.cloud"

ORIGIN = "https://app.test"


class OAuthResourceHookTest(unittest.IsolatedAsyncioTestCase):
    """`OAuth(authorize_resource=...)` decides a request for a token
    for another resource, and the token's audience follows."""

    def setUp(self) -> None:
        harness.ensure_root_keys()
        os.environ[ENVVAR_RBT_DEV] = "true"
        # Every `ResourceRequest` the hook saw, in order.
        self.requests: list[ResourceRequest] = []
        self.decision: ResourceDecision = Allow()

    def _server(self, **kwargs: Any) -> OAuthServer:

        async def authorize_resource(
            context: Any,
            request: ResourceRequest,
        ) -> ResourceDecision:
            self.requests.append(request)
            return self.decision

        return OAuthServer(
            provider=Development(),
            protected_resources=["/mcp"],
            application_title="Counter",
            authorize_resource=authorize_resource,
            **kwargs,
        )

    async def test_allow_binds_the_token_to_the_resource(self):
        server = self._server()
        async with harness.client(
            harness.serve(server.mount_routes), ORIGIN
        ) as client:
            client_id = await harness.register(client)
            verifier, code, _ = await harness.authorize(
                client, client_id, resources=[FOREIGN]
            )
            assert code is not None
            # Decided once the identity provider had signed the user
            # in, with the client and where its code went.
            self.assertEqual(len(self.requests), 1)
            self.assertEqual(self.requests[0].resource, FOREIGN)
            self.assertTrue(self.requests[0].user_id.startswith("dev-"))
            self.assertEqual(self.requests[0].client_id, client_id)
            self.assertEqual(
                self.requests[0].redirect_uri, harness.DEFAULT_REDIRECT_URI
            )
            response = await harness.exchange(
                client, client_id=client_id, code=code, verifier=verifier
            )
            self.assertEqual(response.status_code, 200, response.text)
            tokens = response.json()
            # Decided again at the exchange.
            self.assertEqual(len(self.requests), 2)
            self.assertEqual(
                harness.claims(tokens["access_token"])["aud"], FOREIGN
            )
            # The response says who signed in, for a client that
            # cannot read the token.
            self.assertEqual(tokens["sub"], self.requests[0].user_id)
            # Such a token is good at the resource, not here: the
            # server's own verifiers reject it.
            self.assertIsNone(
                await server.token_verifier.verify_token(
                    context=None,  # type: ignore[arg-type]
                    token=tokens["access_token"],
                )
            )
            self.assertIsNone(
                await server.mcp_sdk_token_verifier.verify_token(
                    tokens["access_token"]
                )
            )
            # Signing in through the picker left a session cookie in
            # the client's jar; drop it so only the bearer speaks.
            client.cookies.clear()
            response = await client.get(
                "/__/oauth/whoami",
                headers={"Authorization": f"Bearer {tokens['access_token']}"},
            )
            self.assertFalse(response.json()["authenticated"])
            # And decided again on refresh.
            response = await harness.refresh(
                client,
                client_id=client_id,
                refresh_token=tokens["refresh_token"],
            )
            self.assertEqual(response.status_code, 200, response.text)
            self.assertEqual(len(self.requests), 3)
            self.assertEqual(
                harness.claims(response.json()["access_token"])["aud"],
                FOREIGN,
            )

    async def test_allow_with_audience_and_claims(self):
        self.decision = Allow(
            audience="https://api.acme.example",
            claims={
                "handle": "ben",
                "sub": "forged",
            },
        )
        server = self._server()
        async with harness.client(
            harness.serve(server.mount_routes), ORIGIN
        ) as client:
            client_id = await harness.register(client)
            verifier, code, _ = await harness.authorize(
                client, client_id, resources=[FOREIGN]
            )
            assert code is not None
            response = await harness.exchange(
                client, client_id=client_id, code=code, verifier=verifier
            )
            access = harness.claims(response.json()["access_token"])
            self.assertEqual(access["aud"], "https://api.acme.example")
            self.assertEqual(access["handle"], "ben")
            # A reserved claim is not overridden.
            self.assertTrue(access["sub"].startswith("dev-"))

    async def test_deny_sends_the_client_an_error_instead_of_a_code(self):
        self.decision = Deny("That URL belongs to someone else.")
        server = self._server()
        async with harness.client(
            harness.serve(server.mount_routes), ORIGIN
        ) as client:
            client_id = await harness.register(client)
            _, code, location = await harness.authorize(
                client, client_id, resources=[FOREIGN]
            )
            self.assertIsNone(code)
            query = parse_qs(urlparse(location).query)
            self.assertEqual(query["error"], ["access_denied"])
            self.assertEqual(
                query["error_description"],
                ["That URL belongs to someone else."],
            )
            self.assertEqual(query["state"], ["opaque"])

    async def test_deny_on_refresh_withdraws_the_grant(self):
        server = self._server()
        async with harness.client(
            harness.serve(server.mount_routes), ORIGIN
        ) as client:
            client_id = await harness.register(client)
            verifier, code, _ = await harness.authorize(
                client, client_id, resources=[FOREIGN]
            )
            assert code is not None
            response = await harness.exchange(
                client, client_id=client_id, code=code, verifier=verifier
            )
            tokens = response.json()
            self.decision = Deny("Revoked.")
            response = await harness.refresh(
                client,
                client_id=client_id,
                refresh_token=tokens["refresh_token"],
            )
            self.assertEqual(response.status_code, 400)
            self.assertEqual(response.json()["error"], "invalid_target")
            self.assertEqual(response.json()["error_description"], "Revoked.")

    async def test_own_origin_resource_never_reaches_the_hook(self):
        server = self._server()
        async with harness.client(
            harness.serve(server.mount_routes), ORIGIN
        ) as client:
            client_id = await harness.register(client)
            verifier, code, _ = await harness.authorize(
                client, client_id, resources=[ORIGIN + "/mcp"]
            )
            assert code is not None
            response = await harness.exchange(
                client, client_id=client_id, code=code, verifier=verifier
            )
            self.assertEqual(response.status_code, 200)
            self.assertEqual(self.requests, [])
            self.assertEqual(
                harness.claims(response.json()["access_token"])["aud"],
                "reboot-mcp",
            )

    async def test_without_a_hook_a_foreign_resource_is_ignored(self):
        server = OAuthServer(
            provider=Development(),
            protected_resources=["/mcp"],
            application_title="Counter",
        )
        async with harness.client(
            harness.serve(server.mount_routes), ORIGIN
        ) as client:
            client_id = await harness.register(client)
            verifier, code, _ = await harness.authorize(
                client, client_id, resources=[FOREIGN]
            )
            assert code is not None
            response = await harness.exchange(
                client, client_id=client_id, code=code, verifier=verifier
            )
            self.assertEqual(response.status_code, 200)
            self.assertEqual(
                harness.claims(response.json()["access_token"])["aud"],
                "reboot-mcp",
            )

    async def test_accepted_audiences_authenticate_here(self):
        server = self._server(accepted_audiences=[FOREIGN])
        async with harness.client(
            harness.serve(server.mount_routes), ORIGIN
        ) as client:
            client_id = await harness.register(client)
            verifier, code, _ = await harness.authorize(
                client, client_id, resources=[FOREIGN]
            )
            assert code is not None
            response = await harness.exchange(
                client, client_id=client_id, code=code, verifier=verifier
            )
            tokens = response.json()
            auth = await server.token_verifier.verify_token(
                context=None,  # type: ignore[arg-type]
                token=tokens["access_token"],
            )
            assert auth is not None and not isinstance(auth, Exception)
            self.assertTrue(auth.user_id.startswith("dev-"))
            response = await client.get(
                "/__/oauth/whoami",
                headers={"Authorization": f"Bearer {tokens['access_token']}"},
            )
            self.assertTrue(response.json()["authenticated"])


if __name__ == "__main__":
    unittest.main()
