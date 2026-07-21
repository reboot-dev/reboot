import unittest
from reboot.aio.applications import Application
from reboot.aio.auth import Auth
from reboot.aio.auth.token_verifiers import TokenVerifier, VerifyTokenResult
from reboot.aio.contexts import ReaderContext
from reboot.aio.tests import FakeOnly, Reboot
from reboot.ping.ping import CounterServicer, UserServicer
from reboot.ping.ping_api_rbt import User
from typing import Optional


class CustomTokenVerifier(TokenVerifier):
    """A minimal production-style `token_verifier=`: authenticates the
    one fixed bearer "custom-token-bob" as user "bob", and has no
    opinion on anything else (so a Reboot-minted access JWT gets `None`
    and defers to the authorizer)."""

    async def verify_token(
        self,
        context: ReaderContext,
        token: Optional[str],
    ) -> VerifyTokenResult:
        if token == "custom-token-bob":
            return Auth(user_id="bob")
        return None


class AutoSuppliedOAuthWithCustomVerifierTest(
    unittest.IsolatedAsyncioTestCase
):
    """An app that wires identity through `token_verifier=` alone still
    gets an OAuth server: `up()` auto-supplies a `FakeOnly` provider,
    so `create_external_context_as` mints real tokens. The two verifiers
    compose — the OAuth server's runs first, and a bearer it has no
    opinion on falls through to the custom verifier."""

    async def asyncSetUp(self) -> None:
        self.rbt = Reboot()
        await self.rbt.start()
        # This app has `User`-typed auto-construct servicers but no
        # `oauth=`, which in production fails fast at startup: a
        # `token_verifier=` authenticates requests but never
        # auto-constructs the users. It starts here only because the
        # test harness auto-supplies a `FakeOnly` OAuth provider.
        await self.rbt.up(
            Application(
                servicers=[UserServicer, CounterServicer],
                token_verifier=CustomTokenVerifier(),
            ),
        )

    async def asyncTearDown(self) -> None:
        await self.rbt.stop()

    def _context_as(self, name: str, bearer_token: str):
        return self.rbt.create_external_context(
            name=f"{name}-{self.id()}",
            bearer_token=bearer_token,
        )

    async def test_create_external_context_as_mints_and_auto_constructs(
        self
    ) -> None:
        # `create_external_context_as` mints a token through the
        # auto-supplied OAuth server's production chokepoint, whose
        # `_authenticated` hook auto-constructs alice's `User` as a
        # side effect — so `whoami` finds her actor without any
        # explicit `_authenticated` call here.
        context = await self.rbt.create_external_context_as(
            name="alice",
            user_id="alice",
        )
        response = await User.ref("alice").whoami(context)
        self.assertEqual(response.user_id, "alice")

    async def test_custom_bearer_falls_through_to_verifier(self) -> None:
        # "custom-token-bob" is not a Reboot-minted JWT, so the OAuth
        # server's verifier has no opinion and the bearer falls through
        # to `CustomTokenVerifier`, which authenticates user "bob". No
        # mint happened for bob, so construct his `User` explicitly.
        context = self._context_as("bob", "custom-token-bob")
        await UserServicer._authenticated(context, state_id="bob")

        response = await User.ref("bob").whoami(context)
        self.assertEqual(response.user_id, "bob")


class AutoSuppliedOAuthWithoutVerifierTest(unittest.IsolatedAsyncioTestCase):
    """An app with neither `oauth=` nor `token_verifier=` — which has
    `User`-typed auto-construct servicers and would otherwise have no
    way to identify users — is made to work by the auto-supplied OAuth
    server, so `create_external_context_as` mints and impersonates a
    user just the same."""

    async def asyncSetUp(self) -> None:
        self.rbt = Reboot()
        await self.rbt.start()
        await self.rbt.up(
            Application(servicers=[UserServicer, CounterServicer]),
        )

    async def asyncTearDown(self) -> None:
        await self.rbt.stop()

    async def test_create_external_context_as_works(self) -> None:
        context = await self.rbt.create_external_context_as(
            name="alice",
            user_id="alice",
        )
        response = await User.ref("alice").whoami(context)
        self.assertEqual(response.user_id, "alice")


class FakeOnlyTest(unittest.IsolatedAsyncioTestCase):
    """`FakeOnly` backs the auto-supplied test OAuth server purely to
    mint and verify JWTs; every real OAuth flow entry point raises,
    steering a test toward `create_external_context_as` instead."""

    async def test_authorization_url_raises(self) -> None:
        with self.assertRaises(NotImplementedError):
            FakeOnly().authorization_url(state="state", redirect_uri="uri")

    async def test_exchange_code_raises(self) -> None:
        with self.assertRaises(NotImplementedError):
            await FakeOnly().exchange_code(code="code", redirect_uri="uri")


if __name__ == "__main__":
    unittest.main()
