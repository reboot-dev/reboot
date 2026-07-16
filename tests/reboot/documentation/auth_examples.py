from google.protobuf.message import Message
from rbt.v1alpha1 import errors_pb2
from reboot.aio.applications import Application
from reboot.aio.auth import Auth
from reboot.aio.auth.authorizers import allow, allow_if
from reboot.aio.auth.token_verifiers import TokenVerifier, VerifyTokenResult
from reboot.aio.contexts import ReaderContext
from reboot.aio.external import ExternalContext
from tests.reboot.documentation.bank_rbt import Account
from typing import Optional


async def validate_user(user_id: str) -> bool:
    return user_id != ""


async def is_valid_user(
    *,
    context: ReaderContext,
    state: Optional[Message],
    request: Optional[Message],
    **kwargs,
):
    if context.auth is None or context.auth.user_id is None:
        return errors_pb2.Unauthenticated()

    if await validate_user(context.auth.user_id):
        return errors_pb2.Ok()

    return errors_pb2.PermissionDenied()


async def is_admin(
    *,
    context: ReaderContext,
    state: Optional[Message],
    request: Optional[Message],
    **kwargs,
):
    if context.auth is not None and context.auth.user_id == "admin":
        return errors_pb2.Ok()

    return errors_pb2.PermissionDenied()


async def is_account_owner(
    *,
    context: ReaderContext,
    state: Optional[Message],
    request: Optional[Message],
    **kwargs,
):
    if context.auth is not None and context.auth.user_id == context.state_id:
        return errors_pb2.Ok()

    return errors_pb2.PermissionDenied()


class AccountServicer(Account.Servicer):

    def authorizer(self):
        return Account.Authorizer(
            balance=allow_if(any=[is_admin, is_account_owner]),
            deposit=allow(),
            withdraw=allow_if(all=[is_account_owner]),
        )


class AdminOnlyAccountServicer(Account.Servicer):

    def authorizer(self):
        return allow_if(all=[is_admin])


class MyTokenVerifier(TokenVerifier):

    async def verify_token(
        self,
        context: ReaderContext,
        token: Optional[str],
    ) -> VerifyTokenResult:
        if token is None:
            return None
        return Auth(user_id=token)


async def main():
    application = Application(
        servicers=[AccountServicer],
        token_verifier=MyTokenVerifier(),
    )
    await application.run()


def make_context(token: str) -> ExternalContext:
    context = ExternalContext(
        name="Example",
        url="http://localhost:9991",
        bearer_token=token,
    )
    return context
