import time
import unittest
from reboot.aio.aborted import Aborted
from reboot.aio.applications import Application
from reboot.aio.auth.oauth_providers import Development
from reboot.aio.tests import OAuthProviderForTest, Reboot
from reboot.ping.ping import CounterServicer, UserServicer
from reboot.ping.ping_api_rbt import User


class OAuthTokenVerifierRejectionTest(unittest.IsolatedAsyncioTestCase):
    """The production `OAuthTokenVerifier` guards every authenticated
    request of an `oauth=...` application. The OAuth flow tests cover
    tokens minted through the real flow; this test covers the two ways
    a presented bearer can be bad — expired, and not a JWT at all —
    both of which must be rejected outright."""

    async def asyncSetUp(self) -> None:
        self.rbt = Reboot()
        await self.rbt.start()
        await self.rbt.up(
            Application(
                servicers=[UserServicer, CounterServicer],
                oauth=OAuthProviderForTest(Development()),
            ),
        )

    async def asyncTearDown(self) -> None:
        await self.rbt.stop()

    def _context_as(self, name: str, bearer_token: str):
        return self.rbt.create_external_context(
            name=f"{name}-{self.id()}",
            bearer_token=bearer_token,
        )

    async def test_minted_token_authenticates(self) -> None:
        # Positive control for the rejection tests below: a token
        # minted through the production chokepoint authenticates (and
        # auto-constructed the `User` as a mint side effect).
        context = self._context_as(
            "alice",
            await self.rbt.make_valid_oauth_access_token(user_id="alice"),
        )
        response = await User.ref("alice").whoami(context)
        self.assertEqual(response.user_id, "alice")

    async def test_expired_token_is_rejected(self) -> None:
        # A real mint first, so the `User` actor exists and the expired
        # token is the only thing standing between the caller and the
        # state.
        await self.rbt.make_valid_oauth_access_token(user_id="alice")
        expired_token = self.rbt.make_jwt(
            type="access",
            sub="alice",
            aud="reboot-mcp",
            exp=int(time.time()) - 60,
        )
        context = self._context_as("alice", expired_token)
        with self.assertRaises(Aborted):
            await User.ref("alice").whoami(context)

    async def test_garbage_token_is_rejected(self) -> None:
        await self.rbt.make_valid_oauth_access_token(user_id="alice")
        context = self._context_as("alice", "not-a-jwt")
        with self.assertRaises(Aborted):
            await User.ref("alice").whoami(context)


if __name__ == "__main__":
    unittest.main()
