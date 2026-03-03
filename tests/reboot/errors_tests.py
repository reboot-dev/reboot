import asyncio
import unittest
from log.log import get_logger
from rbt.v1alpha1.errors_pb2 import Unknown
from reboot.aio.applications import Application
from reboot.aio.call import MixedContextsError
from reboot.aio.external import ExternalContext
from reboot.aio.tests import Reboot
from tests.reboot import bank_rbt
from tests.reboot.bank import SINGLETON_BANK_ID, AccountServicer, BankServicer
from tests.reboot.bank_rbt import Account, Bank

logger = get_logger(__name__)


class ErrorsTestCase(unittest.IsolatedAsyncioTestCase):

    async def asyncSetUp(self) -> None:
        self.rbt = Reboot()
        await self.rbt.start()

    async def asyncTearDown(self) -> None:
        await self.rbt.stop()

    async def test_declared_error(self) -> None:
        """Tests raising a declared error."""
        await self.rbt.up(Application(servicers=[AccountServicer]))

        context = self.rbt.create_external_context(name=self.id())

        account, _ = await Account.Open(context)

        await account.Deposit(context, amount=100)

        with self.assertRaises(Account.WithdrawAborted) as aborted:
            await account.Withdraw(context, amount=101)

        self.assertEqual(
            type(aborted.exception.error), bank_rbt.OverdraftError
        )

        self.assertEqual(aborted.exception.error.amount, 1)

    async def test_declared_errors_propagate(self) -> None:
        """Tests that an error will propagate if it is declared by an
        intermediate service."""
        await self.rbt.up(
            Application(servicers=[AccountServicer, BankServicer])
        )

        context = self.rbt.create_external_context(name=self.id())

        bank, _ = await Bank.Create(context, SINGLETON_BANK_ID)

        await bank.SignUp(context, account_id='jonathan', initial_deposit=100)
        await bank.SignUp(context, account_id='morten')

        with self.assertRaises(Bank.TransferAborted) as aborted:
            await bank.Transfer(
                context,
                from_account_id='jonathan',
                to_account_id='morten',
                amount=101,
            )

        self.assertEqual(
            type(aborted.exception.error), bank_rbt.OverdraftError
        )

        self.assertEqual(aborted.exception.error.amount, 1)

    async def test_undeclared_error(self) -> None:
        """Tests that an undeclared error will propagate as Unknown."""
        await self.rbt.up(
            Application(servicers=[AccountServicer, BankServicer])
        )

        context = self.rbt.create_external_context(name=self.id())

        bank, _ = await Bank.Create(context, SINGLETON_BANK_ID)

        await bank.SignUp(context, account_id='jonathan')

        with self.assertRaises(Bank.SignUpAborted) as aborted:
            await bank.SignUp(context, account_id='jonathan')

        self.assertEqual(type(aborted.exception.error), Unknown)

        self.assertIn(
            "Account 'jonathan' already exists!",
            str(aborted.exception),
        )

    async def test_undeclared_errors_propagate(self) -> None:
        """Tests that an undeclared error will propagate as Unknown."""
        await self.rbt.up(
            Application(servicers=[AccountServicer, BankServicer])
        )

        context = self.rbt.create_external_context(name=self.id())

        bank, _ = await Bank.Create(context, SINGLETON_BANK_ID)

        with self.assertRaises(Bank.SignUpAborted) as aborted:
            await bank.SignUp(
                context,
                account_id='jonathan',
                initial_deposit=0,
            )

        self.assertEqual(type(aborted.exception.error), Unknown)

        self.assertIn(
            "aborted with 'ZeroDepositError'",
            str(aborted.exception),
        )

    async def test_unavailable_errors_propagate(self) -> None:
        """Tests that `Unavailable` errors will propagate."""
        await self.rbt.up(
            Application(servicers=[AccountServicer, BankServicer])
        )

        context = self.rbt.create_external_context(name=self.id())

        bank, _ = await Bank.Create(context, SINGLETON_BANK_ID)

        await bank.SignUp(context, account_id='jonathan')
        account = Account.ref('jonathan')

        # While Jonathan has no money, `MimicUnavailable` will raise
        # `Unavailable` errors and be retried under the hood - both for
        # system-reported `Unavailable` and user-code ("regular")
        # `Unavailable`. That means that `asyncio.Tasks` running these
        # calls do not complete.
        async def call_regular():
            await bank.MimicUnavailable(
                context,
                account_id='jonathan',
            )

        regular_task = asyncio.shield(asyncio.create_task(call_regular()))

        async def call_system():
            await bank.MimicUnavailable(
                context,
                account_id='jonathan',
                system=True,
            )

        system_task = asyncio.shield(asyncio.create_task(call_system()))

        async def short_wait():
            await asyncio.sleep(0.5)

        short_wait_task = asyncio.create_task(short_wait())

        logger.info(
            "Waiting briefly, expecting `MimicUnavailable` tasks "
            "not to complete yet, since they are faking unavailability..."
        )
        done, pending = await asyncio.wait(
            [regular_task, system_task, short_wait_task],
            return_when=asyncio.FIRST_COMPLETED,
        )

        # Only our short wait task completed; the other two tasks are
        # still retrying.
        self.assertEqual(len(done), 1)
        self.assertIn(short_wait_task, done)

        # Give Jonathan some money so that the `MimicUnavailable` calls
        # start returning successfully. We expect the tasks to complete
        # on their next retry.
        logger.info("Ending `MimicUnavailable` fake unavailability...")
        await account.Deposit(context, amount=1)
        logger.info("Waiting for `MimicUnavailable` tasks to finish...")
        done, pending = await asyncio.wait(
            pending, return_when=asyncio.ALL_COMPLETED
        )
        self.assertEqual(len(done), 2)
        for task in done:
            await task  # Show that no exceptions were raised.

    async def test_external_context_mixing_error(self) -> None:
        """
        Tests that when mixing two external contexts on the same stub, we get a helpful
        error.
        """
        await self.rbt.up(
            Application(servicers=[AccountServicer, BankServicer])
        )

        context1: ExternalContext = self.rbt.create_external_context(
            name=self.id() + "1"
        )
        context2: ExternalContext = self.rbt.create_external_context(
            name=self.id() + "2"
        )

        account, _ = await Account.Open(context1)

        with self.assertRaises(MixedContextsError) as error:
            await account.Deposit(context2, amount=200)

        self.assertEqual(
            str(error.exception),
            f"This `WeakReference` for `Account` with ID '{account.state_id}' has "
            "previously been used by a different `Context`. That "
            "is not allowed. Instead create a new `WeakReference` for every "
            "`Context` by calling "
            f"`Account.ref('{account.state_id}')`."
        )


if __name__ == '__main__':
    unittest.main()
