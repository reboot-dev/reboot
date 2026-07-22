from reboot.api import API, Field, Methods, Model, Reader, Type, Writer


# A `Profile` is a separate state machine that the `User` servicer
# constructs as a side effect of its own construction. It exists to
# prove that the auto-constructed `User.create` can call other state
# machines, which is possible because `create` is a `Transaction`.
class ProfileState(Model):
    created: bool = Field(tag=1, default=False)


class ProfileGetResponse(Model):
    created: bool = Field(tag=1)


# The `User` state is auto-constructed `PER_USER_ID`, so the framework
# injects a reserved, overridable `create` factory and a reserved,
# overridable `set_claims` claims-delivery method onto it.
class UserState(Model):
    profile_id: str = Field(tag=1, default="")
    # The email identity claim most recently delivered via
    # `set_claims`.
    email: str = Field(tag=2, default="")
    # How many claims deliveries have reached `set_claims`, so tests
    # can observe which deliveries executed.
    update_count: int = Field(tag=3, default=0)


class UserGetResponse(Model):
    profile_id: str = Field(tag=1)
    email: str = Field(tag=2, default="")
    update_count: int = Field(tag=3, default=0)


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
    Profile=Type(
        state=ProfileState,
        methods=Methods(
            create=Writer(
                request=None,
                response=None,
                factory=True,
                mcp=None,
            ),
            get=Reader(
                request=None,
                response=ProfileGetResponse,
                mcp=None,
            ),
        ),
    ),
)
