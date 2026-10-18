import asyncio
import grpc
import unittest
from google.protobuf import empty_pb2
from rbt.v1alpha1.errors_pb2 import (
    Ok,
    PermissionDenied,
    Unauthenticated,
    Unknown,
)
from reboot.aio.applications import Application
from reboot.aio.auth import Auth
from reboot.aio.auth.authorizers import (
    allow_if,
    has_verified_token,
    is_app_internal,
)
from reboot.aio.auth.token_verifiers import TokenVerifier
from reboot.aio.call import Options
from reboot.aio.caller_id import CallerID
from reboot.aio.contexts import (
    Context,
    ReaderContext,
    TransactionContext,
    WriterContext,
)
from reboot.aio.headers import Headers
from reboot.aio.tests import Reboot
from reboot.aio.types import ApplicationId, StateRef
from tests.reboot import bank_pb2, bank_pb2_grpc, bank_rbt
from tests.reboot.bank import SINGLETON_BANK_ID, AccountServicer, BankServicer
from tests.reboot.bank_rbt import Account, Bank
from tests.reboot.test_token_verifier import TestTokenVerifier
from typing import Optional

TEST_USER = 'emily'

ACCOUNT_NAME = TEST_USER
SECRET = 'S3CR3T!'
VALID_JWT = TestTokenVerifier.create_test_token(
    {
        'sub': TEST_USER,
    },
    SECRET,
)
INVALID_JWT = TestTokenVerifier.create_test_token(
    {
        'sub': TEST_USER,
    },
    'not the secret',
)


def _is_test_user(*, context: ReaderContext, **kwargs):
    if context.auth is None or context.auth.user_id is None:
        # This must mean an "incorrect" bearer token was passed.
        assert context.caller_bearer_token != VALID_JWT
        return Unauthenticated()

    if context.auth.user_id == TEST_USER:
        assert context.caller_bearer_token == VALID_JWT
        return Ok()

    return PermissionDenied()


class TestBankServicer(BankServicer):
    """Servicer that shares implementation with `BankServicer` but uses custom
    authorization.
    """

    def authorizer(self):
        return allow_if(all=[_is_test_user])

    def token_verifier(self) -> Optional[TokenVerifier]:
        return TestTokenVerifier(secret=SECRET)

    async def create(
        self,
        context: WriterContext,
        request: empty_pb2.Empty,
    ):
        # Demonstrate that auth is (still) present in the writer context.
        assert context.auth is not None
        assert context.auth.user_id == TEST_USER
        assert context.method == 'Create'

        # Check that the method name is set correctly inside the
        # TokenVerifier.
        TestTokenVerifier.method = 'Create'

        response = await super().create(context, request)

        # Restore the method name to None so that it does not affect any
        # transitive calls.
        TestTokenVerifier.method = None

        return response

    async def sign_up(
        self,
        context: TransactionContext,
        request: bank_rbt.SignUpRequest,
    ) -> bank_rbt.SignUpResponse:
        # Demonstrate that auth is (still) present in the transaction context.
        assert context.auth is not None
        assert context.auth.user_id == TEST_USER
        assert context.method == 'SignUp'

        return await super().sign_up(context, request)


class TestAccountServicer(AccountServicer):
    """Servicer that shares implementation with `AccountServicer` but uses
    custom authorization.
    """

    def authorizer(self):

        # Only allow streaming of state if balance is less than 8.
        def is_balance_less_than_eight(
            *,
            state: Optional[Account.State],
            **kwargs,
        ):
            assert state is not None
            return Ok() if state.balance < 8 else PermissionDenied()

        def is_balance_more_than_hundred(
            *,
            state: Optional[Account.State],
            **kwargs,
        ):
            assert state is not None
            return Ok() if state.balance > 100 else PermissionDenied()

        return Account.Authorizer(
            stream_state_updates=allow_if(all=[is_balance_less_than_eight]),
            withdraw=allow_if(
                any=[is_balance_less_than_eight, is_balance_more_than_hundred]
            ),
            _default=allow_if(all=[has_verified_token]),
        )


class BankAccountAuthTests(unittest.IsolatedAsyncioTestCase):
    """Test authorization on bank and account services.

    In the following tests the singleton bank is created and the user TEST_USER
    has been signed up.

    Test transitive authorization first on the bank and account services by
    using Bank to SignUp for an account. Proceed to test authorized and
    unauthorized access to the account.
    """

    async def asyncSetUp(self):
        self.rbt = Reboot()
        await self.rbt.start()

        await self.rbt.up(
            Application(
                servicers=[TestAccountServicer, TestBankServicer],
                token_verifier=TestTokenVerifier(secret=SECRET),
            ),
        )

        context = self.rbt.create_external_context(
            name=self.id(),
            bearer_token=VALID_JWT,
        )

        bank, _ = await Bank.create(context, SINGLETON_BANK_ID)
        await bank.sign_up(context, account_id=ACCOUNT_NAME)

    async def asyncTearDown(self):
        await self.rbt.stop()

    async def test_authorized_context(self):
        context = self.rbt.create_external_context(
            name=self.id(),
            bearer_token=VALID_JWT,
        )

        account = Account.ref(ACCOUNT_NAME)
        await account.balance(context)

    async def test_authorized_account_access(self):
        context = self.rbt.create_external_context(
            name=self.id(),
            bearer_token=VALID_JWT,
        )

        account = Account.ref(ACCOUNT_NAME)
        await account.balance(context)

    async def test_unauthenticated_account_access(self):

        with self.assertRaises(Account.BalanceAborted) as aborted:
            context = self.rbt.create_external_context(name=self.id())

            account = Account.ref(ACCOUNT_NAME)
            await account.balance(context)

        self.assertEqual(type(aborted.exception.error), Unauthenticated)

    async def test_unauthorized_account_access(self):

        with self.assertRaises(Account.BalanceAborted) as aborted:
            context = self.rbt.create_external_context(
                name=self.id(),
                bearer_token=INVALID_JWT,
            )

            account = Account.ref(ACCOUNT_NAME)
            await account.balance(context)

        self.assertEqual(type(aborted.exception.error), Unauthenticated)

    async def test_auth_on_streaming_read(self):

        async def make_deposits():
            context = self.rbt.create_external_context(
                name=self.id() + 'depositor',
                bearer_token=VALID_JWT,
            )

            account = Account.ref(ACCOUNT_NAME)
            for i in range(10):
                await account.deposit(context, amount=1)

        async def stream_balance():
            context = self.rbt.create_external_context(
                name=self.id() + 'streamer',
                bearer_token=VALID_JWT,
            )

            account = Account.ref(ACCOUNT_NAME)

            last_balance = 0
            with self.assertRaises(
                Account.StreamStateUpdatesAborted
            ) as aborted:
                # We expect this to raise due to authorizer rule.
                async for response in account.stream_state_updates(context):
                    last_balance = response.state.balance

            # TODO(#5191): The error should be `PermissionDenied` rather than `Unknown`.
            self.assertEqual(type(aborted.exception.error), Unknown)
            self.assertIn(
                "aborted with 'PermissionDenied'",
                str(aborted.exception),
            )

            # The value is expected to be the cutoff value of the authorizer
            # that only allows state streaming until a certain balance.
            self.assertEqual(last_balance, 7)

        # Run depositing and state streaming in parallel and wait for both to
        # terminate.
        await asyncio.gather(
            make_deposits(),
            stream_balance(),
        )

        context = self.rbt.create_external_context(
            name=self.id() + 'check',
            bearer_token=VALID_JWT,
        )

        account = Account.ref(ACCOUNT_NAME)
        response = await account.balance(context)
        self.assertEqual(response.amount, 10)

    async def test_auth_on_withdraw_with_any_auth_rule(self):
        """Test auth when you have `allow_if(any=....)`."""
        context = self.rbt.create_external_context(
            name=self.id(),
            bearer_token=VALID_JWT,
        )

        account = Account.ref(ACCOUNT_NAME)

        await account.deposit(context, amount=1)

        # Valid withdraw because < 8 in the account.
        await account.withdraw(context, amount=1)

        await account.deposit(context, amount=10)

        # Invalid withdraw because > 8 and < 100 in the account.
        with self.assertRaises(Account.WithdrawAborted) as aborted:
            await account.withdraw(context, amount=1)

            # TODO(#5191): The error should be `PermissionDenied` rather than `Unknown`.
            self.assertEqual(type(aborted.exception.error), Unknown)
            self.assertIn(
                "aborted with 'PermissionDenied'",
                str(aborted.exception),
            )

        context = self.rbt.create_external_context(
            name=self.id() + '-with-more-money',
            bearer_token=VALID_JWT,
        )
        account = Account.ref(ACCOUNT_NAME)

        await account.deposit(context, amount=1000)

        # Valid withdraw because > 100 in the account.
        await account.withdraw(context, amount=1)


class BankAccountAuthTestsNoAccountPresent(unittest.IsolatedAsyncioTestCase):
    """Test unauthorized and unauthenticated bank and account access.

    In the following tests the singleton bank is created but the user TEST_USER
    has NOT been signed up.

    Test transitive authorization first on the bank and account services by
    using Bank to SignUp for an account. Proceed to test authorized and
    unauthorized access to the account.
    """

    async def asyncSetUp(self):
        self.rbt = Reboot()
        await self.rbt.start()

        await self.rbt.up(
            Application(servicers=[TestAccountServicer, TestBankServicer]),
        )

        context = self.rbt.create_external_context(
            name=self.id(),
            bearer_token=VALID_JWT,
        )

        bank, _ = await Bank.create(context, SINGLETON_BANK_ID)

    async def asyncTearDown(self):
        await self.rbt.stop()

    async def test_unauthenticated_bank_signup(self):

        with self.assertRaises(Bank.SignUpAborted) as aborted:
            context = self.rbt.create_external_context(name=self.id())

            bank = Bank.ref(SINGLETON_BANK_ID)
            await bank.sign_up(context, account_id=ACCOUNT_NAME)

        self.assertEqual(type(aborted.exception.error), Unauthenticated)

    async def test_unauthorized_bank_signup(self):

        with self.assertRaises(Bank.SignUpAborted) as aborted:
            context = self.rbt.create_external_context(
                name=self.id(),
                bearer_token=INVALID_JWT,
            )

            bank = Bank.ref(SINGLETON_BANK_ID)
            await bank.sign_up(context, account_id=ACCOUNT_NAME)

        self.assertEqual(type(aborted.exception.error), Unauthenticated)

    async def test_unauthenticated_account_access_missing_account(self):

        with self.assertRaises(Account.BalanceAborted) as aborted:
            context = self.rbt.create_external_context(name=self.id())

            account = Account.ref(ACCOUNT_NAME)
            await account.balance(context)

        self.assertEqual(type(aborted.exception.error), Unauthenticated)

    async def test_unauthorized_account_access_missing_account(self):

        with self.assertRaises(Account.BalanceAborted) as aborted:
            context = self.rbt.create_external_context(
                name=self.id(),
                bearer_token=INVALID_JWT,
            )

            account = Account.ref(ACCOUNT_NAME)
            await account.balance(context)

        self.assertEqual(type(aborted.exception.error), Unauthenticated)


class BankConstructorAuth(unittest.IsolatedAsyncioTestCase):
    """In the following tests, the singleton bank has not been created.
    """

    async def asyncSetUp(self):
        self.rbt = Reboot()
        await self.rbt.start()

        await self.rbt.up(
            Application(servicers=[TestAccountServicer, TestBankServicer]),
        )

    async def asyncTearDown(self):
        await self.rbt.stop()

    async def test_construct_auth(self):
        context = self.rbt.create_external_context(name=self.id())

        # Test that a bearer token can be used via construct.
        bank, _ = await Bank.create(
            context,
            SINGLETON_BANK_ID,
            Options(bearer_token=VALID_JWT),
        )


class PropagatingBankServicer(BankServicer):
    """`sign_up` makes its nested calls, a constructor and a writer,
    without passing on the caller's bearer token.
    """

    def authorizer(self):
        return allow_if(all=[_is_test_user])

    def token_verifier(self) -> Optional[TokenVerifier]:
        return TestTokenVerifier(secret=SECRET)

    async def sign_up(
        self,
        context: TransactionContext,
        request: bank_rbt.SignUpRequest,
    ) -> bank_rbt.SignUpResponse:
        self.state.account_ids.append(request.account_id)
        await Account.idempotently('open').open(
            context,
            request.account_id,
            initial_deposit=1,
        )
        await Account.ref(request.account_id).deposit(context, amount=1)
        return bank_rbt.SignUpResponse()


class PropagatingAccountServicer(AccountServicer):
    """Every method requires a verified token, so a nested call only runs
    at all if `has_verified_token` accepts the propagated `Auth`, and
    each then checks that it carried the caller's `Auth`, but not their
    token, and is still app-internal.
    """

    def authorizer(self):
        return allow_if(all=[has_verified_token])

    def _check(self, context: Context) -> None:
        assert context.auth is not None
        assert context.auth.user_id == TEST_USER
        assert context.auth.properties['sub'] == TEST_USER
        assert context.caller_bearer_token is None
        assert context.app_internal

    async def open(
        self,
        context: TransactionContext,
        state: Account.State,
        request: bank_rbt.OpenRequest,
    ) -> bank_rbt.OpenResponse:
        self._check(context)
        return await super().open(context, state, request)

    async def deposit(
        self,
        context: WriterContext,
        state: Account.State,
        request: bank_rbt.DepositRequest,
    ) -> bank_rbt.DepositResponse:
        self._check(context)
        return await super().deposit(context, state, request)

    async def balance(
        self,
        context: ReaderContext,
        state: Account.State,
        request: bank_rbt.BalanceRequest,
    ) -> bank_rbt.BalanceResponse:
        self._check(context)
        return await super().balance(context, state, request)


class AppInternalOnlyAccountServicer(PropagatingAccountServicer):

    def authorizer(self):
        return Account.Authorizer(
            open=allow_if(all=[is_app_internal]),
            _default=allow_if(all=[has_verified_token]),
        )


class AuthPropagationTests(unittest.IsolatedAsyncioTestCase):
    """A call from within a Reboot method carries its caller's
    `context.auth` to the callee, which still sees the call as
    app-internal (github.com/reboot-dev/reboot issues 236 and 237).
    """

    async def up(self, account_servicer: type[AccountServicer]) -> None:
        self.rbt = Reboot()
        await self.rbt.start()
        await self.rbt.up(
            Application(
                servicers=[account_servicer, PropagatingBankServicer],
                token_verifier=TestTokenVerifier(secret=SECRET),
            ),
        )
        self.context = self.rbt.create_external_context(
            name=self.id(),
            bearer_token=VALID_JWT,
        )
        await Bank.create(self.context, SINGLETON_BANK_ID)

    async def asyncTearDown(self):
        await self.rbt.stop()

    async def test_nested_calls_carry_callers_auth(self):
        await self.up(PropagatingAccountServicer)
        bank = Bank.ref(SINGLETON_BANK_ID)

        # A nested constructor and writer; the servicers assert what
        # they saw, and `has_verified_token` let them run at all.
        await bank.sign_up(self.context, account_id=ACCOUNT_NAME)

        # A nested reader: `balance` of each account.
        response = await bank.assets_under_management(
            self.context,
            wait_for_amount_at_least=2,
        )
        self.assertEqual(response.amount, 2)

    async def test_app_internal_only_constructor(self):
        await self.up(AppInternalOnlyAccountServicer)

        # Directly, the signed-in user may not open an account ...
        with self.assertRaises(Account.OpenAborted) as aborted:
            await Account.open(
                # Its own context: a failed mutation leaves a context
                # unsure whether it took effect, so it refuses further
                # non-idempotent mutations.
                self.rbt.create_external_context(
                    name=self.id() + '-direct',
                    bearer_token=VALID_JWT,
                ),
                ACCOUNT_NAME,
                initial_deposit=1,
            )
        self.assertEqual(type(aborted.exception.error), PermissionDenied)

        # ... but through the bank they can, and the account knows who.
        await Bank.ref(SINGLETON_BANK_ID).sign_up(
            self.context,
            account_id=ACCOUNT_NAME,
        )

    async def test_forged_caller_id_auth_is_ignored(self):
        await self.up(PropagatingAccountServicer)
        await Bank.ref(SINGLETON_BANK_ID).sign_up(
            self.context,
            account_id=ACCOUNT_NAME,
        )

        # An `Auth` in a caller ID naming another application (as a
        # cross-application call would) gives the caller no `Auth`.
        state_ref = StateRef.from_id(Account.__state_type_name__, ACCOUNT_NAME)
        channel = self.rbt.create_external_context(
            name=self.id()
        ).channel_manager.get_channel_to_state(
            Account.__state_type_name__,
            state_ref,
        )
        with self.assertRaises(grpc.aio.AioRpcError) as error:
            await bank_pb2_grpc.AccountMethodsStub(channel).Balance(
                bank_pb2.BalanceRequest(),
                metadata=Headers(
                    application_id=None,
                    state_ref=state_ref,
                    caller_id=CallerID(
                        application_id=ApplicationId('application'),
                        auth=Auth(user_id=TEST_USER),
                    ),
                ).to_grpc_metadata(),
            )
        self.assertEqual(
            error.exception.code(),
            grpc.StatusCode.UNAUTHENTICATED,
        )


if __name__ == '__main__':
    unittest.main()
