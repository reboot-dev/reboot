"""A method may declare an error another API file defines: the
message is generated once, in that file's proto, and the error
propagates from the nested call as the declaring method's own."""
import unittest
from reboot.aio.applications import Application
from reboot.aio.tests import Reboot
from tests.reboot.pydantic.shared_error.account_api import OverdraftError
from tests.reboot.pydantic.shared_error.account_api_rbt import Account
from tests.reboot.pydantic.shared_error.bank_api_rbt import Bank
from tests.reboot.pydantic.shared_error.servicers import (
    AccountServicer,
    BankServicer,
)


class SharedErrorTest(unittest.IsolatedAsyncioTestCase):

    async def asyncSetUp(self) -> None:
        self.rbt = Reboot()
        await self.rbt.start()
        await self.rbt.up(
            Application(servicers=[AccountServicer, BankServicer]),
        )

    async def asyncTearDown(self) -> None:
        await self.rbt.stop()

    async def test_transfer_aborts_with_the_accounts_error(self) -> None:
        context = self.rbt.create_external_context(name=self.id())

        payer, _ = await Account.open(context, 'payer', balance=100.0)
        payee, _ = await Account.open(context, 'payee', balance=0.0)
        bank, _ = await Bank.create(context, 'bank')

        with self.assertRaises(Bank.TransferAborted) as aborted:
            await bank.transfer(
                context,
                from_account_id=payer.state_id,
                to_account_id=payee.state_id,
                amount=250.0,
            )

        self.assertIsInstance(aborted.exception.error, OverdraftError)
        self.assertEqual(aborted.exception.error.amount, 150.0)

        # The transaction rolled back: neither account changed.
        self.assertEqual((await payer.balance(context)).amount, 100.0)
        self.assertEqual((await payee.balance(context)).amount, 0.0)

    async def test_transfer_within_the_balance_moves_it(self) -> None:
        context = self.rbt.create_external_context(name=self.id())

        payer, _ = await Account.open(context, 'payer', balance=100.0)
        payee, _ = await Account.open(context, 'payee', balance=0.0)
        bank, _ = await Bank.create(context, 'bank')

        await bank.transfer(
            context,
            from_account_id=payer.state_id,
            to_account_id=payee.state_id,
            amount=40.0,
        )

        self.assertEqual((await payer.balance(context)).amount, 60.0)
        self.assertEqual((await payee.balance(context)).amount, 40.0)


if __name__ == '__main__':
    unittest.main(verbosity=2)
