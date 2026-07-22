import unittest
from rbt.v1alpha1.errors_pb2 import PermissionDenied
from reboot.aio.applications import Application
from reboot.aio.tests import Reboot
from tests.reboot.pydantic.auto_construct_user.servicer import (
    ProfileServicer,
    UserServicer,
)
from tests.reboot.pydantic.auto_construct_user.servicer_api_rbt import (
    Profile,
    User,
)

_USER_ID = "test-user"


class AutoConstructUserTest(unittest.IsolatedAsyncioTestCase):
    """The auto-constructed `User.create` is a `Transaction`, so an
    overriding servicer can construct other state machines as part of
    user creation. The framework separately delivers the user's
    verified identity claims through the injected `set_claims`
    method."""

    async def asyncSetUp(self) -> None:
        self.rbt = Reboot()
        await self.rbt.start()
        await self.rbt.up(
            Application(
                servicers=[UserServicer, ProfileServicer],
            )
        )
        # An authenticated context whose user-id matches the `User`
        # state-id, which is what the framework requires to reach an
        # auto-constructed `User`. Minting the token also constructs
        # the `User` as a side effect.
        self.context = await self.rbt.create_external_context_as(
            name=f"test-{self.id()}",
            user_id=_USER_ID,
        )
        # An app-internal context that may also call `User`.
        self.internal = self.rbt.create_external_context(
            name=f"internal-{self.id()}",
            app_internal=True,
        )

    async def asyncTearDown(self) -> None:
        await self.rbt.stop()

    async def test_create_transaction_constructs_related_state(
        self,
    ) -> None:
        await UserServicer._authenticated(self.context, state_id=_USER_ID)

        # The override recorded the `Profile` it created on the `User`.
        user_response = await User.ref(_USER_ID).get(self.context)
        self.assertEqual(
            user_response.profile_id,
            f"profile-{_USER_ID}",
        )

        # The `Profile` was really constructed by the transaction, not
        # just referenced: reading it back shows the state its own
        # `create` wrote.
        profile = Profile.ref(user_response.profile_id)
        profile_response = await profile.get(self.context)
        self.assertTrue(profile_response.created)

    async def test_auto_construct_is_idempotent(self) -> None:
        # Auto-construction may be triggered repeatedly (e.g. at the
        # start of every session); doing so must be a no-op rather
        # than re-running the constructing transaction.
        await UserServicer._authenticated(self.context, state_id=_USER_ID)
        await UserServicer._authenticated(self.context, state_id=_USER_ID)

        user_response = await User.ref(_USER_ID).get(self.context)
        self.assertEqual(
            user_response.profile_id,
            f"profile-{_USER_ID}",
        )

    async def test_set_claims_copies_email(self) -> None:
        # The injected `set_claims` delivers the user's verified
        # identity claims; our test's override copies the email address
        # into state.
        await User.ref(_USER_ID).set_claims(
            self.internal,
            claims={"email": "jane@example.com"},
        )

        user_response = await User.ref(_USER_ID).get(self.context)
        self.assertEqual(user_response.email, "jane@example.com")
        self.assertEqual(user_response.update_count, 1)

    async def test_set_claims_is_app_internal_only(self) -> None:
        # Even the owning user may not call `set_claims` on their own
        # state: claims are provided by the identity provider and may
        # contain things (like a validated email address) that we don't
        # trust the user to set directly. The servicer's blanket
        # `allow()` authorizer does not loosen this — the generated
        # middleware rejects external callers before consulting any
        # authorizer.
        with self.assertRaises(User.SetClaimsAborted) as aborted:
            await User.ref(_USER_ID).set_claims(
                self.context,
                claims={"email": "spoofed@example.com"},
            )
        self.assertIsInstance(aborted.exception.error, PermissionDenied)

    async def test_authenticated_delivers_claims(self) -> None:
        # `_authenticated` with claims constructs the state (if
        # needed) and delivers the claims through `set_claims`.
        await UserServicer._authenticated(
            self.internal,
            state_id=_USER_ID,
            claims={
                "email": "jane@example.com",
                "email_verified": True
            },
        )

        user_response = await User.ref(_USER_ID).get(self.context)
        self.assertEqual(
            user_response.profile_id,
            f"profile-{_USER_ID}",
        )
        self.assertEqual(user_response.email, "jane@example.com")

    async def test_authenticated_without_claims_skips_set_claims(
        self,
    ) -> None:
        # `_authenticated()` with no claims (e.g. a token refresh)
        # ensures the state exists but delivers nothing, so it never
        # clears previously delivered claims.
        await UserServicer._authenticated(
            self.internal,
            state_id=_USER_ID,
            claims={"email": "jane@example.com"},
        )
        await UserServicer._authenticated(self.internal, state_id=_USER_ID)

        user_response = await User.ref(_USER_ID).get(self.context)
        self.assertEqual(user_response.email, "jane@example.com")
        self.assertEqual(user_response.update_count, 1)

    async def test_repeated_delivery_converges_after_a_b_a(self) -> None:
        # Every sign-in delivers, so a user whose email changes from A
        # to B and back to A ends up with A: state converges on the
        # most recently delivered claims rather than deduplicating a
        # "seen" value.
        for email in ("a@example.com", "b@example.com", "a@example.com"):
            await UserServicer._authenticated(
                self.internal,
                state_id=_USER_ID,
                claims={"email": email},
            )

        user_response = await User.ref(_USER_ID).get(self.context)
        self.assertEqual(user_response.email, "a@example.com")
        self.assertEqual(user_response.update_count, 3)

    async def test_mint_with_claims_delivers(self) -> None:
        # The test harness mirrors production: minting a token with
        # claims delivers them through the same chokepoint, so a
        # freshly minted user has their claims transcribed.
        await self.rbt.make_valid_oauth_access_token(
            user_id="minted-user",
            claims={"email": "minted@example.com"},
        )

        user_response = await User.ref("minted-user").get(self.internal)
        self.assertEqual(user_response.email, "minted@example.com")


if __name__ == "__main__":
    unittest.main()
