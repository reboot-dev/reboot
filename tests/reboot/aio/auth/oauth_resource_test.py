import os
import unittest
from reboot.aio.auth.oauth_providers import Development
from reboot.aio.auth.oauth_server import OAuthServer
from reboot.settings import ENVVAR_RBT_DEV
from tests.reboot.aio.auth import oauth_server_harness as harness

# A resource on another origin than the server's, as the access
# middleware of an application on a dev URL asks the Cloud for.
FOREIGN = "https://ben--counter--acme.dev.rbt.cloud"

ORIGIN = "https://app.test"


class OAuthResourceTest(unittest.IsolatedAsyncioTestCase):
    """RFC 8707 `resource` parameter: parsed at `/authorize`, carried
    through the consent, pending, code and refresh tokens, and held
    to at `/token`."""

    def setUp(self) -> None:
        harness.ensure_root_keys()
        os.environ[ENVVAR_RBT_DEV] = "true"
        self.server = OAuthServer(
            provider=Development(),
            protected_resources=["/mcp"],
            application_title="Counter",
        )
        self.app = harness.serve(self.server.mount_routes)

    async def test_resource_rides_through_code_and_refresh_token(self):
        async with harness.client(self.app, ORIGIN) as client:
            client_id = await harness.register(client)
            verifier, code, _ = await harness.authorize(
                client, client_id, resources=[FOREIGN + "/mcp"]
            )
            assert code is not None
            self.assertEqual(
                harness.claims(code)["resource"], FOREIGN + "/mcp"
            )
            response = await harness.exchange(
                client, client_id=client_id, code=code, verifier=verifier
            )
            self.assertEqual(response.status_code, 200, response.text)
            tokens = response.json()
            self.assertEqual(
                harness.claims(tokens["refresh_token"])["resource"],
                FOREIGN + "/mcp",
            )
            response = await harness.refresh(
                client,
                client_id=client_id,
                refresh_token=tokens["refresh_token"],
                resources=[FOREIGN + "/mcp"],
            )
            self.assertEqual(response.status_code, 200, response.text)
            self.assertEqual(
                harness.claims(response.json()["refresh_token"])["resource"],
                FOREIGN + "/mcp",
            )

    async def test_own_origin_resource_is_the_default(self):
        # What MCP clients send today: the server's own `/mcp`. Nothing
        # about the grant changes.
        async with harness.client(self.app, ORIGIN) as client:
            client_id = await harness.register(client)
            verifier, code, _ = await harness.authorize(
                client, client_id, resources=[ORIGIN + "/mcp"]
            )
            assert code is not None
            self.assertNotIn("resource", harness.claims(code))
            response = await harness.exchange(
                client,
                client_id=client_id,
                code=code,
                verifier=verifier,
                resources=[ORIGIN + "/mcp"],
            )
            self.assertEqual(response.status_code, 200, response.text)
            self.assertNotIn(
                "resource", harness.claims(response.json()["refresh_token"])
            )

    async def test_token_request_must_name_the_same_resource(self):
        async with harness.client(self.app, ORIGIN) as client:
            client_id = await harness.register(client)
            verifier, code, _ = await harness.authorize(
                client, client_id, resources=[FOREIGN]
            )
            assert code is not None
            response = await harness.exchange(
                client,
                client_id=client_id,
                code=code,
                verifier=verifier,
                resources=["https://other.example"],
            )
            self.assertEqual(response.status_code, 400)
            self.assertEqual(response.json()["error"], "invalid_target")
            # Naming none keeps the issued one.
            response = await harness.exchange(
                client, client_id=client_id, code=code, verifier=verifier
            )
            self.assertEqual(response.status_code, 200, response.text)
            tokens = response.json()
            response = await harness.refresh(
                client,
                client_id=client_id,
                refresh_token=tokens["refresh_token"],
                resources=["https://other.example"],
            )
            self.assertEqual(response.json()["error"], "invalid_target")

    async def test_malformed_resource_is_invalid_target(self):
        async with harness.client(self.app, ORIGIN) as client:
            client_id = await harness.register(client)
            for resources in (
                [FOREIGN, "https://other.example"],
                ["javascript:alert(1)"],
                [FOREIGN + "#fragment"],
                ["not a uri"],
            ):
                response = await harness.authorize(
                    client, client_id, resources=resources
                )
                assert not isinstance(response, tuple), resources
                self.assertEqual(response.status_code, 400, resources)
                self.assertEqual(response.json()["error"], "invalid_target")

    async def test_resource_is_normalized(self):
        async with harness.client(self.app, ORIGIN) as client:
            client_id = await harness.register(client)
            _, code, _ = await harness.authorize(
                client, client_id, resources=[FOREIGN.upper()]
            )
            assert code is not None
            self.assertEqual(harness.claims(code)["resource"], FOREIGN)


if __name__ == "__main__":
    unittest.main()
