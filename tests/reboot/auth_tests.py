import asyncio
import unittest
from google.protobuf import empty_pb2
from rbt.v1alpha1.errors_pb2 import (
    Ok,
    PermissionDenied,
    Unauthenticated,
    Unknown,
)
from reboot.aio.applications import Application
from reboot.aio.auth.authorizers import (
    allow,
    allow_if,
    deny,
    has_verified_token,
    is_app_internal,
)
from reboot.aio.auth.token_verifiers import TokenVerifier
from reboot.aio.call import Options
from reboot.aio.contexts import (
    ReaderContext,
    TransactionContext,
    WriterContext,
)
from reboot.aio.tests import Reboot
from tests.reboot import bank_rbt
from tests.reboot.bank import SINGLETON_BANK_ID, AccountServicer, BankServicer
from tests.reboot.bank_rbt import Account, Bank
from tests.reboot.greeter_rbt import Greeter
from tests.reboot.greeter_servicers import MyGreeterServicer
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


# Authorizers for use in tests
_test_user_authorizer = Greeter.Authorizer(
    create=allow_if(all=[_is_test_user]),
)

_internal_auth_rule = allow_if(all=[is_app_internal])


class AllAuthorizersGreeterServicer(MyGreeterServicer):
    """Servicer that composes authorizers via all."""

    def authorizer(self):
        return Greeter.Authorizer.all(
            _internal_auth_rule, _test_user_authorizer
        )

    def token_verifier(self) -> Optional[TokenVerifier]:
        return TestTokenVerifier(secret=SECRET)


class AnyAuthorizersGreeterServicer(MyGreeterServicer):
    """Servicer that composes authorizers via any."""

    def authorizer(self):
        return Greeter.Authorizer.any(
            _internal_auth_rule, _test_user_authorizer
        )

    def token_verifier(self) -> Optional[TokenVerifier]:
        return TestTokenVerifier(secret=SECRET)


class ComposingAuthorizerTests(unittest.IsolatedAsyncioTestCase):
    """Test Authorizer.any and Authorizer.all get generated properly."""

    async def asyncSetUp(self):
        self.rbt = Reboot()
        await self.rbt.start()

    async def asyncTearDown(self):
        await self.rbt.stop()

    async def test_authorizer_all_external_user(self) -> None:
        """
        Authorizer.all(is_app_internal, is_test_user) should fail
        when called from external context with user token.
        """
        await self.rbt.up(
            Application(servicers=[AllAuthorizersGreeterServicer]),
        )

        context = self.rbt.create_external_context(
            name=self.id(),
            bearer_token=VALID_JWT,
        )

        with self.assertRaises(Greeter.CreateAborted) as create_aborted:
            await Greeter.create(
                context,
                'greeter',
                title="King",
                name="Chip",
                adjective="Fluffy",
            )

        self.assertEqual(
            type(create_aborted.exception.error),
            PermissionDenied,
        )

    async def test_authorizer_all_external_non_user(self) -> None:
        """
        Authorizer.all(is_app_internal, is_test_user) should fail
        when called from external context without user token.
        """
        await self.rbt.up(
            Application(servicers=[AllAuthorizersGreeterServicer]),
        )

        context = self.rbt.create_external_context(
            name=self.id(),
        )

        with self.assertRaises(Greeter.CreateAborted) as create_aborted:
            await Greeter.create(
                context,
                'greeter',
                title="King",
                name="Chip",
                adjective="Fluffy",
            )

        self.assertEqual(
            type(create_aborted.exception.error),
            PermissionDenied,
        )

    async def test_authorizer_all_internal_user(self) -> None:
        """
        Authorizer.all(is_app_internal, is_test_user) should succeed
        when called from internal context with user token.
        """

        await self.rbt.up(
            Application(servicers=[AllAuthorizersGreeterServicer]),
        )

        context = self.rbt.create_external_context(
            name=self.id(),
            app_internal=True,
            bearer_token=VALID_JWT,
        )

        # Should not error.
        await Greeter.create(
            context,
            'greeter',
            title="King",
            name="Chip",
            adjective="Fluffy",
        )

    async def test_authorizer_all_internal_non_user(self) -> None:
        """
        Authorizer.all(is_app_internal, is_test_user) should fail
        when called from internal context without user token.
        """
        await self.rbt.up(
            Application(servicers=[AllAuthorizersGreeterServicer]),
        )

        context = self.rbt.create_external_context(
            name=self.id(),
            app_internal=True,
            bearer_token=INVALID_JWT,
        )

        with self.assertRaises(Greeter.CreateAborted) as create_aborted:
            await Greeter.create(
                context,
                'greeter',
                title="King",
                name="Chip",
                adjective="Fluffy",
            )

        self.assertEqual(
            type(create_aborted.exception.error),
            Unauthenticated,
        )

    async def test_authorizer_any_external_user(self) -> None:
        """
        Authorizer.any(is_app_internal, is_test_user) should succeed
        when called from external context with user token.
        """
        await self.rbt.up(
            Application(servicers=[AnyAuthorizersGreeterServicer]),
        )

        context = self.rbt.create_external_context(
            name=self.id(),
            bearer_token=VALID_JWT,
        )

        # Should not error.
        await Greeter.create(
            context,
            'greeter',
            title="King",
            name="Chip",
            adjective="Fluffy",
        )

    async def test_authorizer_any_external_non_user(self) -> None:
        """
        Authorizer.any(is_app_internal, is_test_user) should fail
        when called from external context without user token.
        """
        await self.rbt.up(
            Application(servicers=[AnyAuthorizersGreeterServicer]),
        )

        context = self.rbt.create_external_context(
            name=self.id(),
        )

        with self.assertRaises(Greeter.CreateAborted) as create_aborted:
            await Greeter.create(
                context,
                'greeter',
                title="King",
                name="Chip",
                adjective="Fluffy",
            )

        self.assertEqual(
            type(create_aborted.exception.error),
            PermissionDenied,
        )

    async def test_authorizer_any_internal_user(self) -> None:
        """
        Authorizer.any(is_app_internal, is_test_user) should succeed
        when called from internal context with user token.
        """
        await self.rbt.up(
            Application(servicers=[AnyAuthorizersGreeterServicer]),
        )

        context = self.rbt.create_external_context(
            name=self.id(),
            app_internal=True,
            bearer_token=VALID_JWT,
        )

        # Should not error.
        await Greeter.create(
            context,
            'greeter',
            title="King",
            name="Chip",
            adjective="Fluffy",
        )

    async def test_authorizer_any_internal_non_user(self) -> None:
        """
        Authorizer.any(is_app_internal, is_test_user) should succeed
        when called from internal context without user token.
        """
        await self.rbt.up(
            Application(servicers=[AnyAuthorizersGreeterServicer]),
        )

        context = self.rbt.create_external_context(
            name=self.id(),
            app_internal=True,
            bearer_token=INVALID_JWT,
        )

        # Should not error.
        await Greeter.create(
            context,
            'greeter',
            title="King",
            name="Chip",
            adjective="Fluffy",
        )

    async def test_authorizer_any_different_methods(self) -> None:
        """
        Authorizer.any() should allow if any of the passed in authorizers allow
        across different methods.

        Additionally, `default` rules for any Authorizers with specific method
        auth rules should only apply to `_default`, and not every unspecified method.
        """

        allow_create = Greeter.Authorizer(
            create=allow(),
            _default=deny(),
        )

        allow_greet = Greeter.Authorizer(
            greet=allow(),
            _default=deny(),
        )

        class AuthorizedGreeterServicer(MyGreeterServicer):

            def authorizer(self):
                return Greeter.Authorizer.any(allow_create, allow_greet)

        await self.rbt.up(
            Application(servicers=[AuthorizedGreeterServicer]),
        )

        context = self.rbt.create_external_context(
            name=self.id(),
            bearer_token=VALID_JWT,
        )

        greeter, _ = await Greeter.create(
            context,
            'greeter',
            title="King",
            name="Chip",
            adjective="Fluffy",
        )

        response = await greeter.greet(context, name="Dale")

        self.assertEqual(
            response.message, "Hi Dale, I am King Chip the Fluffy"
        )

        # Should fail with PermissionDenied due to default rules denying.
        with self.assertRaises(Greeter.GetWholeStateAborted) as aborted:
            await greeter.get_whole_state(context)

        self.assertEqual(
            type(aborted.exception.error),
            PermissionDenied,
        )

    async def test_authorizer_all_different_methods(self) -> None:
        """
        Authorizer.all() should allow if all of the passed in authorizers allow
        across different methods.

        Additionally, `default` rules for all Authorizers with specific method
        auth rules should only apply to `_default`, and not every unspecified method.
        """

        allow_create = Greeter.Authorizer(
            create=allow(),
            _default=deny(),
        )

        allow_greet = Greeter.Authorizer(
            greet=allow(),
            _default=deny(),
        )

        class AuthorizedGreeterServicer(MyGreeterServicer):

            def authorizer(self):
                return Greeter.Authorizer.all(allow_create, allow_greet)

        await self.rbt.up(
            Application(servicers=[AuthorizedGreeterServicer]),
        )

        context = self.rbt.create_external_context(
            name=self.id(),
            bearer_token=VALID_JWT,
        )

        greeter, _ = await Greeter.create(
            context,
            'greeter',
            title="King",
            name="Chip",
            adjective="Fluffy",
        )

        response = await greeter.greet(context, name="Dale")

        self.assertEqual(
            response.message, "Hi Dale, I am King Chip the Fluffy"
        )

        # Should fail with PermissionDenied due to default rules denying.
        with self.assertRaises(Greeter.GetWholeStateAborted) as aborted:
            await greeter.get_whole_state(context)

        self.assertEqual(
            type(aborted.exception.error),
            PermissionDenied,
        )

    async def test_authorizer_any_default_only_authorizer_rule_applies_to_all_methods(
        self
    ) -> None:
        """
        If an Authorizer *only* has a default rule and no custom authorization
        rules for any method, that default rule should apply to *all* methods when
        Authorizer.any()'d.
        """

        internal_authorizer = Greeter.Authorizer(
            _default=allow_if(any=[is_app_internal]),
        )

        class AuthorizedGreeterServicer(MyGreeterServicer):

            def authorizer(self):
                return Greeter.Authorizer.any(
                    _test_user_authorizer, internal_authorizer
                )

        await self.rbt.up(
            Application(servicers=[AuthorizedGreeterServicer]),
        )

        context = self.rbt.create_external_context(
            name=self.id(),
            app_internal=True,
        )

        # Should not error.
        await Greeter.create(
            context,
            'greeter',
            title="King",
            name="Chip",
            adjective="Fluffy",
        )

    async def test_authorizer_all_preserves_order_of_authorizers_and_rules(
        self
    ) -> None:
        """
        The order of the authorizers / rules passed into Authorizer.all should
        be preserved in terms of the order they are executed, which influences
        what error you might receive.
        """

        # Authorizer.all(is_app_internal, is_test_user) should fail first
        # on is_app_internal, resulting in PermissionDenied.
        class IsInternalAppRuleFirstGreeterServicer(MyGreeterServicer):

            def authorizer(self):
                return Greeter.Authorizer.all(
                    _internal_auth_rule, _test_user_authorizer
                )

            def token_verifier(self) -> Optional[TokenVerifier]:
                return TestTokenVerifier(secret=SECRET)

        await self.rbt.up(
            Application(servicers=[IsInternalAppRuleFirstGreeterServicer]),
        )

        context = self.rbt.create_external_context(
            name=self.id(),
        )

        with self.assertRaises(Greeter.CreateAborted) as create_aborted:
            await Greeter.create(
                context,
                'greeter',
                title="King",
                name="Chip",
                adjective="Fluffy",
            )

        self.assertEqual(
            type(create_aborted.exception.error),
            PermissionDenied,
        )

        await self.rbt.down()

        # Authorizer.all(is_test_user, is_app_internal) should fail first
        # on is_test_user, resulting in Unauthenticated.
        class UserAuthorizerFirstGreeterServicer(MyGreeterServicer):

            def authorizer(self):
                return Greeter.Authorizer.all(
                    _test_user_authorizer, _internal_auth_rule
                )

            def token_verifier(self) -> Optional[TokenVerifier]:
                return TestTokenVerifier(secret=SECRET)

        await self.rbt.up(
            Application(servicers=[UserAuthorizerFirstGreeterServicer]),
        )

        context = self.rbt.create_external_context(
            name=self.id(),
        )

        with self.assertRaises(Greeter.CreateAborted) as create_aborted:
            await Greeter.create(
                context,
                'greeter',
                title="King",
                name="Chip",
                adjective="Fluffy",
            )

        self.assertEqual(
            type(create_aborted.exception.error),
            Unauthenticated,
        )

    async def test_authorizer_all_with_no_arguments(self) -> None:
        """
        Authorizer.all() with no arguments, should return a default
        is_app_internal Authorizer."
        """

        class EmptyAllGreeterServicer(MyGreeterServicer):

            def authorizer(self):
                return Greeter.Authorizer.all()

            def token_verifier(self) -> Optional[TokenVerifier]:
                return TestTokenVerifier(secret=SECRET)

        await self.rbt.up(
            Application(servicers=[EmptyAllGreeterServicer]),
        )

        # External context should error.
        context = self.rbt.create_external_context(
            name=self.id(),
        )

        with self.assertRaises(Greeter.CreateAborted) as create_aborted:
            await Greeter.create(
                context,
                'greeter',
                title="King",
                name="Chip",
                adjective="Fluffy",
            )

        self.assertEqual(
            type(create_aborted.exception.error),
            PermissionDenied,
        )

        # Internal context should succeed.
        context = self.rbt.create_external_context(
            name=self.id() + "2",
            app_internal=True,
        )

        # Should not error.
        await Greeter.create(
            context,
            'greeter',
            title="King",
            name="Chip",
            adjective="Fluffy",
        )

    async def test_authorizer_any_with_no_arguments(self) -> None:
        """
        Authorizer.any() with no arguments, should return a default
        is_app_internal Authorizer."
        """

        class EmptyAnyGreeterServicer(MyGreeterServicer):

            def authorizer(self):
                return Greeter.Authorizer.any()

            def token_verifier(self) -> Optional[TokenVerifier]:
                return TestTokenVerifier(secret=SECRET)

        await self.rbt.up(
            Application(servicers=[EmptyAnyGreeterServicer]),
        )

        # External context should error.
        context = self.rbt.create_external_context(
            name=self.id(),
        )

        with self.assertRaises(Greeter.CreateAborted) as create_aborted:
            await Greeter.create(
                context,
                'greeter',
                title="King",
                name="Chip",
                adjective="Fluffy",
            )

        self.assertEqual(
            type(create_aborted.exception.error),
            PermissionDenied,
        )

        # Internal context should succeed.
        context = self.rbt.create_external_context(
            name=self.id() + "2",
            app_internal=True,
        )

        # Should not error.
        await Greeter.create(
            context,
            'greeter',
            title="King",
            name="Chip",
            adjective="Fluffy",
        )

    async def test_authorizer_all_with_global_rule_for_non_specified_method(
        self
    ) -> None:
        """
        Non-specified methods should use `default rule` and *not* just global rules.
        """
        allow_create = Greeter.Authorizer(
            create=allow(),
            _default=allow_if(all=[is_app_internal]),
        )

        allow_test_user = Greeter.Authorizer(
            _default=allow_if(all=[_is_test_user]),
        )

        class AllWithGlobalRuleGreeterServicer(MyGreeterServicer):

            def authorizer(self):
                return Greeter.Authorizer.all(allow_create, allow_test_user)

            def token_verifier(self) -> Optional[TokenVerifier]:
                return TestTokenVerifier(secret=SECRET)

        await self.rbt.up(
            Application(servicers=[AllWithGlobalRuleGreeterServicer]),
        )

        # External user context should error for `greet()`.
        context = self.rbt.create_external_context(
            name=self.id(),
            bearer_token=VALID_JWT,
        )

        greeter, _ = await Greeter.create(
            context,
            'greeter',
            title="King",
            name="Chip",
            adjective="Fluffy",
        )

        with self.assertRaises(Greeter.GreetAborted) as greet_aborted:
            await greeter.greet(context, name="Dale")

        self.assertEqual(
            type(greet_aborted.exception.error),
            PermissionDenied,
        )

    async def test_authorizer_any_with_global_rule_for_non_specified_method(
        self
    ) -> None:
        """
        Non-specified methods should use `default rule` and *not* just global rules.
        """
        allow_create = Greeter.Authorizer(
            create=allow(),
            _default=allow_if(all=[is_app_internal]),
        )

        allow_test_user = Greeter.Authorizer(
            _default=allow_if(all=[_is_test_user]),
        )

        class AnyWithGlobalRuleGreeterServicer(MyGreeterServicer):

            def authorizer(self):
                return Greeter.Authorizer.any(allow_create, allow_test_user)

            def token_verifier(self) -> Optional[TokenVerifier]:
                return TestTokenVerifier(secret=SECRET)

        await self.rbt.up(
            Application(servicers=[AnyWithGlobalRuleGreeterServicer]),
        )

        # Internal context should succeed for `greet()`.
        context = self.rbt.create_external_context(
            name=self.id(), app_internal=True
        )

        greeter, _ = await Greeter.create(
            context,
            'greeter',
            title="King",
            name="Chip",
            adjective="Fluffy",
        )

        # Should not error.
        await greeter.greet(context, name="Dale")


if __name__ == '__main__':
    unittest.main()
