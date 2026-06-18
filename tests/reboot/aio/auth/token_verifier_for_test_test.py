import time
import unittest
from reboot.aio.aborted import Aborted
from reboot.aio.applications import Application
from reboot.aio.tests import Reboot, TokenVerifierForTest
from reboot.ping.ping import CounterServicer, UserServicer
from reboot.ping.ping_api_rbt import User


class TokenVerifierForTestTest(unittest.IsolatedAsyncioTestCase):
    """`TokenVerifierForTest` is the identity layer tests substitute for an
    application's production `token_verifier=` (e.g. a web app's external
    identity provider integration). It must accept the tokens minted by
    `Reboot.make_valid_oauth_access_token(...)` while leaving the application's
    authorizers to run for real — here the enforced `state_id_is_user_id`
    default on the `User` type."""

    async def asyncSetUp(self) -> None:
        self.rbt = Reboot()
        await self.rbt.start()
        await self.rbt.up(
            Application(
                servicers=[UserServicer, CounterServicer],
                token_verifier=TokenVerifierForTest(),
            ),
        )

    async def asyncTearDown(self) -> None:
        await self.rbt.stop()

    def _context_as(self, name: str, bearer_token: str):
        return self.rbt.create_external_context(
            name=f"{name}-{self.id()}",
            bearer_token=bearer_token,
        )

    async def test_minted_token_impersonates_user(self) -> None:
        # A token minted for "alice" must satisfy the `User` type's
        # enforced `state_id_is_user_id` authorizer end-to-end.
        context = self._context_as(
            "alice",
            self.rbt.make_valid_oauth_access_token(user_id="alice"),
        )
        await UserServicer._auto_construct(context, state_id="alice")

        response = await User.ref("alice").whoami(context)
        self.assertEqual(response.user_id, "alice")

    async def test_real_authorizer_denies_other_user(self) -> None:
        # The verifier substitutes only identity; the real authorizer
        # still denies "bob" access to "alice"'s state.
        alice_context = self._context_as(
            "alice",
            self.rbt.make_valid_oauth_access_token(user_id="alice"),
        )
        await UserServicer._auto_construct(alice_context, state_id="alice")

        bob_context = self._context_as(
            "bob",
            self.rbt.make_valid_oauth_access_token(user_id="bob"),
        )
        with self.assertRaises(Aborted):
            await User.ref("alice").whoami(bob_context)

    async def test_expired_token_is_rejected(self) -> None:
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
        context = self._context_as("alice", "not-a-jwt")
        with self.assertRaises(Aborted):
            await User.ref("alice").whoami(context)


if __name__ == "__main__":
    unittest.main()
