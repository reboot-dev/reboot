import asyncio
import httpx
import os
import re
import stat
import tempfile
import unittest
from reboot.aio.auth.oauth_providers import Development
from reboot.aio.auth.oauth_server import CODE_PAGE_PATH, OAuthServer
from reboot.cli.commands.login import login, logout
from reboot.cli.common import credentials
from reboot.settings import ENVVAR_RBT_DEV
from tests.reboot.aio.auth import oauth_server_harness as harness
from urllib.parse import parse_qs, urlparse


async def _browser(authorization_url: str) -> str:
    """What a person does in the browser `rbt login` opens: approve
    the consent screen and pick an identity at the development
    account picker. Returns where the Cloud sent them in the end."""
    async with httpx.AsyncClient(follow_redirects=False) as browser:
        response = await browser.get(authorization_url)
        assert response.status_code == 200, response.text
        consent = re.search(r'name="consent" value="([^"]+)"', response.text)
        assert consent is not None
        parsed = urlparse(authorization_url)
        origin = f"{parsed.scheme}://{parsed.netloc}"
        response = await browser.post(
            f"{origin}/__/oauth/consent",
            data={
                "consent": consent.group(1),
                "action": "approve"
            },
        )
        assert response.status_code == 302, response.text
        location = response.headers["location"]
        assert "/__/oauth/dev-login" in location
        state = parse_qs(urlparse(location).query)["state"][0]
        response = await browser.get(
            f"{origin}/__/oauth/callback",
            params={
                "code": "Alice",
                "state": state
            },
        )
        assert response.status_code == 302, response.text
        return response.headers["location"]


class LoginTest(unittest.IsolatedAsyncioTestCase):
    """`rbt login` against an `OAuthServer` standing in for the Cloud,
    and the sign-in it keeps."""

    def setUp(self) -> None:
        harness.ensure_root_keys()
        os.environ[ENVVAR_RBT_DEV] = "true"
        self.config_home = tempfile.TemporaryDirectory()
        os.environ["XDG_CONFIG_HOME"] = self.config_home.name
        self.cloud = harness.serve(
            OAuthServer(
                provider=Development(),
                protected_resources=["/mcp"],
                application_title="Reboot Cloud",
            ).mount_routes
        )

    def tearDown(self) -> None:
        self.config_home.cleanup()

    async def test_browser_sign_in_and_refresh_and_logout(self):
        async for cloud_url in harness.serve_on_loopback(self.cloud):
            opened: list[str] = []

            def open_browser(url: str) -> None:
                opened.append(url)

                async def finish() -> None:
                    # The loopback redirect is the last stop.
                    location = await _browser(url)
                    async with httpx.AsyncClient() as browser:
                        response = await browser.get(location)
                        assert response.status_code == 200, response.text

                asyncio.get_running_loop().create_task(finish())

            signed_in = await login(
                cloud_url=cloud_url,
                no_browser=False,
                open_browser=open_browser,
            )
            self.assertEqual(len(opened), 1)
            self.assertTrue(signed_in.user_id.startswith("dev-"))
            # Kept, for the person only.
            path = credentials.credentials_path()
            self.assertTrue(str(path).startswith(self.config_home.name))
            self.assertEqual(stat.S_IMODE(os.stat(path).st_mode), 0o600)
            kept = credentials.load(cloud_url)
            self.assertEqual(kept, signed_in)
            self.assertFalse(kept.expired)
            self.assertEqual(await credentials.fresh(cloud_url), signed_in)
            # The token is good at the Cloud.
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    f"{cloud_url}/__/oauth/whoami",
                    headers={
                        "Authorization": f"Bearer {signed_in.access_token}"
                    },
                )
                self.assertEqual(response.json()["user_id"], signed_in.user_id)
            # An expired sign-in is refreshed and kept.
            credentials.save(
                cloud_url,
                credentials.Credentials(
                    user_id=signed_in.user_id,
                    access_token=signed_in.access_token,
                    refresh_token=signed_in.refresh_token,
                    expires_at=0,
                    client_id=signed_in.client_id,
                ),
            )
            refreshed = await credentials.fresh(cloud_url)
            assert refreshed is not None
            self.assertFalse(refreshed.expired)
            self.assertEqual(refreshed.user_id, signed_in.user_id)
            self.assertEqual(credentials.load(cloud_url), refreshed)
            # A sign-in that can no longer be refreshed is no sign-in.
            credentials.save(
                cloud_url,
                credentials.Credentials(
                    user_id=signed_in.user_id,
                    access_token="stale",
                    refresh_token="not-a-refresh-token",
                    expires_at=0,
                    client_id=signed_in.client_id,
                ),
            )
            self.assertIsNone(await credentials.fresh(cloud_url))
            # Forgotten.
            logout(cloud_url=cloud_url)
            self.assertIsNone(credentials.load(cloud_url))
            logout(cloud_url=cloud_url)

    async def test_pasted_code_sign_in(self):
        async for cloud_url in harness.serve_on_loopback(self.cloud):
            told: list[str] = []

            async def read_line(prompt: str) -> str:
                # The person opened the URL `rbt` printed and pastes
                # the code from the page the Cloud showed them.
                url = re.search(r"https?://\S+", told[-1])
                assert url is not None
                location = await _browser(url.group(0))
                self.assertTrue(
                    location.startswith(f"{cloud_url}{CODE_PAGE_PATH}")
                )
                return parse_qs(urlparse(location).query)["code"][0]

            from reboot.cli.common import terminal
            original_info = terminal.info
            terminal.info = lambda message, *args, **kwargs: told.append(
                message
            )  # type: ignore[assignment]
            try:
                signed_in = await login(
                    cloud_url=cloud_url,
                    no_browser=True,
                    read_line=read_line,
                )
            finally:
                terminal.info = original_info  # type: ignore[assignment]
            self.assertTrue(signed_in.user_id.startswith("dev-"))
            self.assertEqual(credentials.load(cloud_url), signed_in)


if __name__ == "__main__":
    unittest.main()
