import unittest
from reboot.aio.applications import Application
from reboot.aio.auth.oauth_providers import Anonymous
from reboot.aio.tests import OAuthProviderForTest, Reboot
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
    user creation."""

    async def asyncSetUp(self) -> None:
        self.rbt = Reboot()
        await self.rbt.start()
        await self.rbt.up(
            Application(
                servicers=[UserServicer, ProfileServicer],
                oauth=OAuthProviderForTest(Anonymous()),
            )
        )
        # An authenticated context whose user-id matches the `User`
        # state-id, which is what the framework requires to reach an
        # auto-constructed `User`.
        self.context = self.rbt.create_external_context(
            name=f"test-{self.id()}",
            bearer_token=self.rbt.make_valid_oauth_access_token(
                user_id=_USER_ID,
            ),
        )

    async def asyncTearDown(self) -> None:
        await self.rbt.stop()

    async def test_create_transaction_constructs_related_state(
        self,
    ) -> None:
        await UserServicer._auto_construct(self.context, state_id=_USER_ID)

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
        await UserServicer._auto_construct(self.context, state_id=_USER_ID)
        await UserServicer._auto_construct(self.context, state_id=_USER_ID)

        user_response = await User.ref(_USER_ID).get(self.context)
        self.assertEqual(
            user_response.profile_id,
            f"profile-{_USER_ID}",
        )


if __name__ == "__main__":
    unittest.main()
