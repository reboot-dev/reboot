from rbt.v1alpha1.errors_pb2 import Ok, PermissionDenied, Unauthenticated
from reboot.aio.auth.authorizers import allow, allow_if, is_app_internal
from reboot.aio.contexts import ReaderContext
from tests.reboot.bank import AccountServicer, BankServicer
from tests.reboot.test_token_verifier import TestTokenVerifier

SECRET = 'S3CR3T!'
TEST_USER = 'emily'
TEST_JWT = TestTokenVerifier.create_test_token({'sub': TEST_USER}, SECRET)


class AuthAccountServicer(AccountServicer):
    """Servicer that shares implementation with `AccountServicer` but uses
    a custom Authorizer.
    """

    def authorizer(self):
        return allow()


def _is_test_user(*, context: ReaderContext, **kwargs):
    if context.auth is None or context.auth.user_id is None:
        return Unauthenticated()

    if context.auth.user_id == TEST_USER:
        return Ok()

    return PermissionDenied()


class AuthBankServicer(BankServicer):
    """Servicer that shares implementation with `BankServicer` but uses
    custom authorization.
    """

    def authorizer(self):
        response = allow_if(any=[_is_test_user, is_app_internal])
        return response
