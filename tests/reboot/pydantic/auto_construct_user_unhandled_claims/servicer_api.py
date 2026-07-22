from reboot.api import API, Field, Methods, Model, Reader, Type


# The `User` state is auto-constructed `PER_USER_ID`, so the framework
# injects a reserved, overridable `create` factory and a reserved,
# overridable `set_claims` claims-delivery method onto it. This test's
# servicer deliberately overrides neither, so that delivering claims
# exercises the injected `set_claims` default.
class UserState(Model):
    # An email identity claim that a `set_claims` override would fill
    # in; it stays at its default here because this servicer never
    # consumes delivered claims.
    email: str = Field(tag=1, default="")


class UserGetResponse(Model):
    email: str = Field(tag=1, default="")


api = API(
    User=Type(
        state=UserState,
        methods=Methods(
            get=Reader(
                request=None,
                response=UserGetResponse,
                mcp=None,
            ),
        ),
    ),
)
