from reboot.aio.auth.authorizers import allow
from reboot.aio.contexts import ReaderContext, TransactionContext
from tests.reboot.auto_construct_proto.test_rbt import User


class UserServicer(User.Servicer):

    def authorizer(self):
        # A deliberately permissive authorizer: the framework still
        # restricts `set_claims` to app-internal callers before
        # consulting this.
        return allow()

    async def create(
        self,
        context: TransactionContext,
        request: User.CreateRequest,
    ) -> User.CreateResponse:
        # Identity-independent setup would go here; this state has
        # none, so the constructor just materializes an empty `User`.
        return User.CreateResponse()

    async def set_claims(
        self,
        context: TransactionContext,
        request: User.SetClaimsRequest,
    ) -> User.SetClaimsResponse:
        # `request.claims` is a `map<string, google.protobuf.Value>`;
        # a verified `email` claim arrives as a string-valued `Value`.
        # That the framework delivered a usable `Value` here (rather
        # than the native `str` it starts with) is exactly what this
        # test exercises.
        email_value = request.claims.get("email")
        self.state.email = (
            email_value.string_value if email_value is not None else ""
        )
        self.state.update_count += 1
        return User.SetClaimsResponse()

    async def get(
        self,
        context: ReaderContext,
        request: User.GetRequest,
    ) -> User.GetResponse:
        return User.GetResponse(
            email=self.state.email,
            update_count=self.state.update_count,
        )
