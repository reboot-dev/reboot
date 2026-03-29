import unittest
import uuid
from datetime import timedelta
from rbt.v1alpha1.errors_pb2 import StateAlreadyConstructed
from reboot.aio.applications import Application
from reboot.aio.call import Options
from reboot.aio.idempotency import (
    IdempotencyUncertainError,
    make_expiring_idempotency_key,
)
from reboot.aio.tests import Reboot
from tests.reboot import bank_rbt
from tests.reboot.bank import SINGLETON_BANK_ID, AccountServicer, BankServicer
from tests.reboot.bank_rbt import Account, Bank
from typing import Optional


class IdempotencyTestCase(unittest.IsolatedAsyncioTestCase):

    async def asyncSetUp(self) -> None:
        self.rbt = Reboot()
        await self.rbt.start()

    async def asyncTearDown(self) -> None:
        await self.rbt.stop()

    async def test_exactly_one_idempotency_argument(self) -> None:
        await self.rbt.up(Application(servicers=[AccountServicer]))
        context = self.rbt.create_external_context(name=self.id())

        with self.assertRaises(ValueError) as exc:
            await Account.idempotently(
                key="key",
                alias="alias",  # type: ignore[call-overload]
            ).Open(context, "one")
        self.assertIn(
            (
                "At most one of the positional argument `alias` or the "
                "keyword argument `key` should be specified"
            ),
            str(exc.exception),
        )

    async def _test_writers_are_idempotent(
        self,
        *args,
        **kwargs,
    ) -> None:
        """Tests that a call to a writer using an idempotency key will only
        perform the mutation once, even after restarting the sidecar
        and recovering."""
        revision = await self.rbt.up(Application(servicers=[AccountServicer]))

        context = self.rbt.create_external_context(name=self.id())

        account, _ = await Account.Open(context)

        await account.Deposit(context, amount=1000)

        # Now perform a withdrawal idempotently.
        await account.idempotently(*args, **kwargs).Withdraw(
            context,
            amount=1000,
        )

        balance = await account.Balance(context)

        self.assertEqual(0, balance.amount)

        # Now try and perform another withdrawal which should fail
        # because we are out of funds.
        with self.assertRaises(Account.WithdrawAborted) as aborted:
            await account.Withdraw(context, amount=1)

        self.assertEqual(
            type(aborted.exception.error), bank_rbt.OverdraftError
        )

        # And now try our same withdrawal that we did before which
        # should not do anything because we'll just get the idempotent
        # response!
        await account.idempotently(*args, **kwargs).Withdraw(
            context,
            amount=1000,
        )

        # Now bring the servicer down and back up and we still should
        # be able to make the idempotent call safely (because the
        # idempotency key should not have expired).
        await self.rbt.down()
        await self.rbt.up(revision=revision)

        account = Account.ref(account.state_id)

        await account.idempotently(*args, **kwargs).Withdraw(
            context,
            amount=1000,
        )

    async def test_writers_are_idempotent_with_key(self) -> None:
        await self._test_writers_are_idempotent(
            key=make_expiring_idempotency_key(),
        )

    async def test_expiring_idempotency_key(self) -> None:
        """Tests that a call with an expired idempotency key will fail."""
        await self.rbt.up(Application(servicers=[AccountServicer]))

        context = self.rbt.create_external_context(name=self.id())

        account, _ = await Account.Open(context)

        await account.Deposit(context, amount=1000)

        # Now perform a withdraw which should abort because the
        # idempotency key we are trying to use has expired.
        with self.assertRaises(Account.WithdrawAborted) as aborted:
            await account.idempotently(
                key=make_expiring_idempotency_key(timedelta(days=-7)),
            ).Withdraw(
                context,
                amount=1000,
            )

        self.assertIn(
            "UUIDv7 idempotency key has expired",
            str(aborted.exception),
        )

    async def test_writers_are_idempotent_with_alias(self) -> None:
        await self._test_writers_are_idempotent(
            'Withdraw',
        )

    async def _test_transactions_are_idempotent(
        self,
        *args,
        **kwargs,
    ) -> None:
        """Tests that a call to a transaction using an idempotency key will
        only perform the mutation once, even after restarting the
        sidecar and recovering."""
        revision = await self.rbt.up(
            Application(servicers=[AccountServicer, BankServicer])
        )

        context = self.rbt.create_external_context(name=self.id())

        bank, _ = await Bank.Create(context, SINGLETON_BANK_ID)

        await bank.idempotently(*args, **kwargs).SignUp(
            context,
            account_id='jonathan',
        )

        # Now try and perform another sign up which should fail
        # because we have already signed up this account.
        with self.assertRaises(Bank.SignUpAborted) as aborted:
            await bank.SignUp(context, account_id='jonathan')

        self.assertIn(
            "Account 'jonathan' already exists!",
            str(aborted.exception),
        )

        # Need to acknowledge idempotency uncertainty so that we can
        # continue running the test!
        context.acknowledge_idempotency_uncertainty()

        # And now try our same sign up that we did before which should
        # not do anything because we'll just get the idempotent
        # response!
        await bank.idempotently(*args, **kwargs).SignUp(
            context,
            account_id='jonathan',
        )

        # Now bring the servicer down and back up and we still should
        # be able to make the idempotent call safely (because the
        # idempotency key should not have expired).
        await self.rbt.down()
        await self.rbt.up(revision=revision)

        bank = Bank.ref(SINGLETON_BANK_ID)

        await bank.idempotently(*args, **kwargs).SignUp(
            context,
            account_id='jonathan',
        )

    async def test_transactions_are_idempotent_with_key(self) -> None:
        await self._test_transactions_are_idempotent(
            key=make_expiring_idempotency_key(),
        )

    async def test_transactions_are_idempotent_with_alias(self) -> None:
        await self._test_transactions_are_idempotent(
            'Sign up Jonathan',
        )

    async def test_idempotency_request_violation(self) -> None:
        """Tests idempotency violation when reusing with a different request.
        """
        await self.rbt.up(Application(servicers=[AccountServicer]))

        context = self.rbt.create_external_context(name=self.id())

        account, _ = await Account.idempotently(
            'Open',
        ).Open(context, 'test-1234')

        await account.idempotently('Deposit 1000').Deposit(
            context,
            amount=1000,
        )

        # Using the same idempotency alias but for a different request
        # should fail.
        with self.assertRaises(ValueError) as error:
            await account.idempotently('Deposit 1000').Deposit(
                context,
                amount=1001,
            )

        self.assertIn(
            "Idempotency key for 'tests.reboot.AccountMethods.Deposit' "
            f"of state '{account.state_id}' is being reused _unsafely_; you "
            "can not reuse an idempotency key with a different request",
            str(error.exception),
        )

    async def test_idempotency_metadata_violation(self) -> None:
        """Tests idempotency violation when reusing with different metadata.
        """
        await self.rbt.up(Application(servicers=[AccountServicer]))

        context = self.rbt.create_external_context(name=self.id())

        account, _ = await Account.idempotently(
            'Open',
        ).Open(
            context,
            'test-1234',
            Options(metadata=(('x-reboot-some-key', '42'),)),
        )

        # Using the same idempotency alias but for different metadata
        # should fail.
        with self.assertRaises(ValueError) as error:
            await Account.idempotently('Open').Open(
                context,
                'test-1234',
                Options(metadata=(('x-reboot-some-key', '41'),)),
            )

        self.assertIn(
            "Idempotency key for 'tests.reboot.AccountMethods.Open' "
            f"of state '{account.state_id}' is being reused _unsafely_; you "
            "can not reuse an idempotency key with different metadata",
            str(error.exception),
        )

    async def test_idempotency_generate_violation(self) -> None:
        """Tests idempotency violation when using empty `.idempotently()`.
        """
        await self.rbt.up(Application(servicers=[AccountServicer]))

        context = self.rbt.create_external_context(name=self.id())

        account, _ = await Account.idempotently().Open(context, 'test-1234')

        # Doing another call should fail, regardless of if it has
        # different arguments, metadata, etc.
        with self.assertRaises(ValueError) as error:
            await Account.idempotently().Open(
                context,
                'test-1234',
                Options(metadata=(('x-reboot-some-key', '41'),)),
            )

        self.assertIn(
            f"To call 'tests.reboot.AccountMethods.Open' of "
            f"'{account.state_id}' more than once using the same context an "
            "idempotency alias or key must be specified",
            str(error.exception),
        )

    async def test_idempotency_failed_mutation_violation(self) -> None:
        await self.rbt.up(Application(servicers=[AccountServicer]))
        context = self.rbt.create_external_context(name=self.id())
        account, _ = await Account.Open(context, "foo")

        # A failed mutation that we can't be sure is due to an error
        # that came from the backend will make this idempotency
        # context "uncertain". We get that by calling `ThrowException`
        # which raises an exception that is not a declared error.
        with self.assertRaises(Account.ThrowExceptionAborted):
            await account.ThrowException(context)

        # On a second attempt, we should get an IdempotencyUncertainError.
        with self.assertRaises(IdempotencyUncertainError) as error:
            await account.idempotently(
                'Withdraw',
            ).Withdraw(context, amount=1000)
        self.assertEqual(
            "Because we don't know if the mutation from calling "
            "'tests.reboot.AccountMethods.ThrowException' of state "
            "'foo' failed or succeeded AND you've made some NON-IDEMPOTENT "
            "mutations we can't reliably determine whether or not the call to "
            "'tests.reboot.AccountMethods.Withdraw' of state 'foo' is due to a "
            "retry which may cause an undesired mutation -- if you are trying "
            "to write your own manual retry logic you should ensure you're "
            "always using an idempotency alias (or passing an explicit "
            "idempotency key) for mutations",
            str(error.exception),
        )

    async def test_constructors_are_idempotent(self) -> None:
        """
        Tests that calling a constructor idempotently twice with
        the same alias and parameters succeeds both times, rather
        than raising `StateAlreadyConstructed` on the second call.
        """
        await self.rbt.up(Application(servicers=[AccountServicer]))

        context = self.rbt.create_external_context(name=self.id())

        # First call: construct the account idempotently.
        state_id = 'idempotent-constructor-test'
        account1, _ = await Account.idempotently(
            'open account',
        ).Open(context, state_id)

        # Second call: exact same alias, context, and state ID. This
        # must succeed (not raise `StateAlreadyConstructed`).
        account2, _ = await Account.idempotently(
            'open account',
        ).Open(context, state_id)

        # Both calls should return the same state.
        self.assertEqual(account1.state_id, state_id)
        self.assertEqual(account2.state_id, state_id)

        # Verify that calling the constructor *without* idempotency on
        # the same state ID does raise `StateAlreadyConstructed`.
        with self.assertRaises(Account.OpenAborted) as aborted:
            await Account.Open(context, state_id)

        self.assertEqual(
            type(aborted.exception.error), StateAlreadyConstructed
        )

    async def test_non_constructor_transactions_are_idempotent(
        self,
    ) -> None:
        """
        Tests that calling a non-constructor transaction idempotently
        twice with the same alias will elide the second execution,
        rather than re-executing the mutation on the second call.
        """
        await self.rbt.up(
            Application(servicers=[AccountServicer, BankServicer])
        )

        context = self.rbt.create_external_context(name=self.id())

        bank, _ = await Bank.Create(context, SINGLETON_BANK_ID)

        # First call: sign up the account idempotently.
        await bank.idempotently('sign up jonathan').SignUp(
            context,
            account_id='jonathan',
        )

        # Second call: exact same alias, context, and arguments. This
        # must succeed by returning the cached response, not by
        # re-executing the mutation (which would fail because 'jonathan'
        # is already in `bank.state.account_ids`).
        await bank.idempotently('sign up jonathan').SignUp(
            context,
            account_id='jonathan',
        )

        # Sanity-check: a non-idempotent re-sign-up must still fail.
        with self.assertRaises(Bank.SignUpAborted):
            await bank.SignUp(context, account_id='jonathan')

    async def test_idempotently_generate_id(self) -> None:

        created_id: Optional[str] = None

        async def create_or_assert(*, idempotency_seed: Optional[uuid.UUID]):
            context = self.rbt.create_external_context(
                name='create_or_assert',
                idempotency_seed=idempotency_seed,
            )
            account, _ = await Account.idempotently().Open(
                context,
            )
            nonlocal created_id
            if created_id is None:
                created_id = account.state_id
            else:
                self.assertEqual(created_id, account.state_id)

        # Launch, and initialize the id with one context, passing an
        # idempotency_seed to imitate a WorkflowContext or `initialize` method.
        idempotency_seed = uuid.uuid5(
            uuid.NAMESPACE_DNS,
            'test.rbt.dev',
        )
        revision = await self.rbt.up(Application(servicers=[AccountServicer]))
        await create_or_assert(idempotency_seed=idempotency_seed)
        self.assertIsNotNone(created_id)

        # ALARM! ALARM! The following is necessary for this test to pass, which
        # indicates a persistence issue!
        # ISSUE(3613): FIX THIS!
        import asyncio
        await asyncio.sleep(5)

        # Bring it down, restart it, and then validate the id with the same
        # seed as before.
        await self.rbt.down()
        await self.rbt.up(revision=revision)
        await create_or_assert(idempotency_seed=idempotency_seed)

        # Try again, but without an idempotency seed, and confirm that we fail.
        with self.assertRaises(ValueError) as exc:
            await create_or_assert(idempotency_seed=None)
        self.assertIn(
            (
                "Cannot idempotently generate an id for a state (of type "
                "tests.reboot.Account) without an idempotency seed."
            ),
            str(exc.exception),
        )


if __name__ == '__main__':
    unittest.main()
