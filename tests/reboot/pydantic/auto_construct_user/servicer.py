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

    def authorizer(self):
        # A deliberately permissive authorizer: the tests prove that
        # even a blanket `allow()` cannot expose the `set_claims`
        # claims-delivery method to external callers.
        return allow()

    async def create(self, context: TransactionContext) -> None:
        """Override the auto-constructed `create` to also construct a
        `Profile` for this user; a `Transaction` can call other state
        machines during construction."""
        profile_id = f"profile-{context.state_id}"
        await Profile.create(context, profile_id)
        self.state.profile_id = profile_id

    async def set_claims(
        self,
        context: TransactionContext,
        request: User.SetClaimsRequest,
    ) -> None:
        """Override the injected `set_claims` to transcribe the
        delivered email claim; a full replace, so it reads the
        complete claims set from the request every time."""
        self.state.email = request.claims.get("email", "")
        self.state.update_count += 1

    async def get(self, context: ReaderContext) -> User.GetResponse:
        return User.GetResponse(
            profile_id=self.state.profile_id,
            email=self.state.email,
            update_count=self.state.update_count,
        )


class ProfileServicer(Profile.Servicer):

    def authorizer(self):
        return allow()

    async def create(self, context: WriterContext) -> None:
        self.state.created = True

    async def get(self, context: ReaderContext) -> Profile.GetResponse:
        return Profile.GetResponse(created=self.state.created)
