from reboot.aio.auth.authorizers import allow
from reboot.aio.contexts import (
    ReaderContext,
    TransactionContext,
    WriterContext,
)
from tests.reboot.pydantic.auto_construct_user.servicer_api_rbt import (
    Profile,
    User,
)


class UserServicer(User.Servicer):

    async def create(self, context: TransactionContext) -> None:
        """Override the auto-constructed `create` to also construct a
        `Profile` for this user; a `Transaction` can call other state
        machines during construction."""
        profile_id = f"profile-{context.state_id}"
        await Profile.factory.create(context, profile_id)
        self.state.profile_id = profile_id

    async def get(self, context: ReaderContext) -> User.GetResponse:
        return User.GetResponse(profile_id=self.state.profile_id)


class ProfileServicer(Profile.Servicer):

    def authorizer(self):
        return allow()

    async def create(self, context: WriterContext) -> None:
        self.state.created = True

    async def get(self, context: ReaderContext) -> Profile.GetResponse:
        return Profile.GetResponse(created=self.state.created)
