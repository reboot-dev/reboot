from reboot.aio.auth.authorizers import allow
from reboot.aio.contexts import ReaderContext
from tests.reboot.pydantic.auto_construct_user_unhandled_claims.servicer_api_rbt import (
    User,
)


class UserServicer(User.Servicer):
    """A `User` servicer that overrides neither the injected `create`
    nor the injected `set_claims`: the tests prove that delivering
    identity claims to it fails through the injected `set_claims`
    default rather than silently discarding the claims."""

    def authorizer(self):
        # A blanket `allow()`; the tests are about the injected
        # `set_claims` default, not authorization.
        return allow()

    async def get(self, context: ReaderContext) -> User.GetResponse:
        return User.GetResponse(email=self.state.email)
