import httpx
import os
import unittest
from reboot.aio.auth.oauth_providers import Development
from reboot.aio.auth.oauth_server import CODE_PAGE_PATH, OAuthServer
from reboot.settings import ENVVAR_RBT_DEV
from tests.reboot.aio.auth import oauth_server_harness as harness
from urllib.parse import parse_qs, urlparse

ORIGIN = "https://app.test"

CODE_PAGE_URI = f"{ORIGIN}{CODE_PAGE_PATH}"


class OAuthCodePageTest(unittest.IsolatedAsyncioTestCase):
    """`/__/oauth/code`: the redirect target that shows the
    authorization code on a page for a client that cannot receive a
    redirect."""

    def setUp(self) -> None:
        harness.ensure_root_keys()
        os.environ[ENVVAR_RBT_DEV] = "true"
        self.server = OAuthServer(
            provider=Development(),
            protected_resources=["/mcp"],
            application_title="Counter",
        )
        self.app = harness.serve(self.server.mount_routes)

    async def test_code_is_shown_and_exchangeable(self):
        async with harness.client(self.app, ORIGIN) as client:
            client_id = await harness.register(client, CODE_PAGE_URI)
            verifier, code, location = await harness.authorize(
                client, client_id, redirect_uri=CODE_PAGE_URI
            )
            assert code is not None
            self.assertTrue(location.startswith(f"{CODE_PAGE_URI}?"))
            response = await client.get(location)
            self.assertEqual(response.status_code, 200, response.text)
            self.assertIn(code, response.text)
            self.assertEqual(response.headers["cache-control"], "no-store")
            self.assertEqual(
                response.headers["referrer-policy"], "no-referrer"
            )
            # The pasted code buys a token like any other, PKCE and all.
            response = await harness.exchange(
                client,
                client_id=client_id,
                code=code,
                verifier=verifier,
                redirect_uri=CODE_PAGE_URI,
            )
            self.assertEqual(response.status_code, 200, response.text)
            self.assertIn("access_token", response.json())

    async def test_only_a_code_for_this_page_is_shown(self):
        async with harness.client(self.app, ORIGIN) as client:
            # A code issued for another redirect URI.
            client_id = await harness.register(client)
            _, code, _ = await harness.authorize(client, client_id)
            assert code is not None
            response = await client.get(CODE_PAGE_PATH, params={"code": code})
            self.assertEqual(response.status_code, 400)
            # Not a code at all.
            response = await client.get(
                CODE_PAGE_PATH, params={"code": "<b>paste me</b>"}
            )
            self.assertEqual(response.status_code, 400)
            self.assertNotIn("paste me", response.text)
            # Neither a code nor an error.
            response = await client.get(CODE_PAGE_PATH)
            self.assertEqual(response.status_code, 400)

    async def test_refused_sign_in_explains_the_error(self):
        async with harness.client(self.app, ORIGIN) as client:
            client_id = await harness.register(client, CODE_PAGE_URI)
            result = await harness.authorize(
                client,
                client_id,
                redirect_uri=CODE_PAGE_URI,
                approve_consent=False,
            )
            assert not isinstance(result, httpx.Response)
            _, code, location = result
            self.assertIsNone(code)
            query = parse_qs(urlparse(location).query)
            self.assertEqual(query["error"], ["access_denied"])
            response = await client.get(location)
            self.assertEqual(response.status_code, 200, response.text)
            self.assertIn("was not approved", response.text)
            # An error nobody issued is not echoed.
            response = await client.get(
                CODE_PAGE_PATH, params={"error": "<b>call us</b>"}
            )
            self.assertEqual(response.status_code, 200)
            self.assertNotIn("call us", response.text)
            self.assertIn("invalid_request", response.text)


if __name__ == "__main__":
    unittest.main()
