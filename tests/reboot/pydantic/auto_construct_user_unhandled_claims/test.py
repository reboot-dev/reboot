import unittest
from rbt.v1alpha1.errors_pb2 import Unknown
from reboot.aio.applications import Application
from reboot.aio.tests import Reboot
from tests.reboot.pydantic.auto_construct_user_unhandled_claims.servicer import (
    UserServicer,
)
from tests.reboot.pydantic.auto_construct_user_unhandled_claims.servicer_api_rbt import (
    User,
)

_USER_ID = "test-user"


class UnhandledClaimsTest(unittest.IsolatedAsyncioTestCase):
    """A `User` whose servicer never overrides the injected
    `set_claims`. Delivering identity claims to it must fail loudly
    rather than silently discard them, so a developer who requested
    claims but forgot to consume them finds out at sign-in."""

    async def asyncSetUp(self) -> None:
        self.rbt = Reboot()
        await self.rbt.start()
        await self.rbt.up(Application(servicers=[UserServicer]))
        # An app-internal context, the only kind allowed to reach the
        # claims-delivery `set_claims`.
        self.internal = self.rbt.create_external_context(
            name=f"internal-{self.id()}",
            app_internal=True,
        )

    async def asyncTearDown(self) -> None:
        await self.rbt.stop()

    async def test_delivering_claims_without_override_fails(self) -> None:
        # Construct the `User` first without claims (a claimless mint,
        # like a token refresh), so the failure below is the injected
        # `set_claims` default, not a missing state.
        await self.rbt.make_valid_oauth_access_token(user_id=_USER_ID)

        with self.assertRaises(User.SetClaimsAborted) as aborted:
            await User.ref(_USER_ID).set_claims(
                self.internal,
                claims={"email": "jane@example.com"},
            )
        # An uncaught servicer error propagates to the caller as
        # `Unknown`; the injected default logs a message explaining how
        # to fix it (override `set_claims`) to the server logs.
        self.assertIsInstance(aborted.exception.error, Unknown)

        # The failed delivery left the state untouched.
        user_response = await User.ref(_USER_ID).get(self.internal)
        self.assertEqual(user_response.email, "")

    async def test_minting_a_token_with_claims_fails(self) -> None:
        # The production mint path delivers claims through the same
        # chokepoint, so minting a token with claims for an
        # unhandled-claims `User` fails the sign-in.
        with self.assertRaises(User.SetClaimsAborted):
            await self.rbt.make_valid_oauth_access_token(
                user_id="minted-user",
                claims={"email": "minted@example.com"},
            )


if __name__ == "__main__":
    unittest.main()
