import time
import unittest
from rbt.v1alpha1.errors_pb2 import Unauthenticated
from reboot.aio.applications import Application
from reboot.aio.auth import Auth
from reboot.aio.auth.oauth_providers import Development
from reboot.aio.auth.token_verifiers import TokenVerifier, VerifyTokenResult
from reboot.aio.contexts import ReaderContext
from reboot.aio.tests import OAuthProviderForTest, Reboot
from reboot.ping.ping import CounterServicer, UserServicer
from reboot.ping.ping_api_rbt import User
from typing import Optional


class _BearerIsUserIdForTest(TokenVerifier):
    """A `TokenVerifier` that takes the bearer token verbatim as the
    user ID."""

    async def verify_token(
        self,
        context: ReaderContext,
        token: Optional[str],
    ) -> VerifyTokenResult:
        if token is None:
            return None
        return Auth(user_id=token)


class CompoundTokenVerifierTest(unittest.IsolatedAsyncioTestCase):
    """An application may pass both `oauth=` and `token_verifier=`;
    the two compose: the OAuth server's verifier runs first, and any
    token it has no opinion on (anything that is not a Reboot-minted
    access JWT) falls through to the user's verifier — here
    `_BearerIsUserIdForTest`, which takes the bearer token verbatim as
    the user ID."""

    async def asyncSetUp(self) -> None:
        self.rbt = Reboot()
        await self.rbt.start()
        await self.rbt.up(
            Application(
                servicers=[UserServicer, CounterServicer],
                oauth=OAuthProviderForTest(Development()),
                token_verifier=_BearerIsUserIdForTest(),
            ),
        )

    async def asyncTearDown(self) -> None:
        await self.rbt.stop()

    def _context_as(self, name: str, bearer_token: str):
        return self.rbt.create_external_context(
            name=f"{name}-{self.id()}",
            bearer_token=bearer_token,
        )

    async def test_reboot_minted_token_authenticates(self) -> None:
        # A Reboot-minted access JWT authenticates via the OAuth
        # server's verifier. Construct the `User` explicitly, since in
        # this era minting has no auto-construct side effect.
        context = self._context_as(
            "alice",
            self.rbt.make_valid_oauth_access_token(user_id="alice"),
        )
        await UserServicer._auto_construct(context, state_id="alice")
        response = await User.ref("alice").whoami(context)
        self.assertEqual(response.user_id, "alice")

    async def test_custom_token_falls_through(self) -> None:
        # "bob" is not a JWT, so the OAuth server's verifier has no
        # opinion and the token falls through to
        # `_BearerIsUserIdForTest`, which authenticates user "bob".
        context = self._context_as("bob", "bob")
        await UserServicer._auto_construct(context, state_id="bob")

        response = await User.ref("bob").whoami(context)
        self.assertEqual(response.user_id, "bob")

    async def test_expired_reboot_token_stops_the_chain(self) -> None:
        # An expired Reboot-minted access JWT is definitively rejected
        # by the OAuth server's verifier, ending the chain with
        # `Unauthenticated`. This discriminates the ordering: had the
        # token fallen through, `_BearerIsUserIdForTest` would have
        # authenticated the caller as the literal token string and
        # this request would have aborted with `PermissionDenied`
        # instead.
        self.rbt.make_valid_oauth_access_token(user_id="alice")
        expired_token = self.rbt.make_jwt(
            type="access",
            sub="alice",
            aud="reboot-mcp",
            exp=int(time.time()) - 60,
        )
        context = self._context_as("alice", expired_token)
        with self.assertRaises(User.WhoamiAborted) as aborted:
            await User.ref("alice").whoami(context)
        self.assertIsInstance(aborted.exception.error, Unauthenticated)


if __name__ == "__main__":
    unittest.main()
