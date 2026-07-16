import unittest
from reboot.aio.applications import Application
from reboot.aio.tests import Reboot
from tests.reboot.documentation.bank_rbt import Account, Bank
from tests.reboot.documentation.bank_servicer import (
    AccountServicer,
    BankServicer,
)


# Validates the servicer method snippets used in the
# `documentation/docs/learn_more/implement/` pages by signing up
# accounts, transferring money, and checking the balances.
class TestBank(unittest.IsolatedAsyncioTestCase):

    async def asyncSetUp(self) -> None:
        self.rbt = Reboot()
        await self.rbt.start()

    async def asyncTearDown(self) -> None:
        await self.rbt.stop()

    async def test_sign_up_deposit_transfer_balance(self) -> None:
        await self.rbt.up(
            Application(servicers=[AccountServicer, BankServicer]),
        )

        context = self.rbt.create_external_context(name=self.id())

        bank, _ = await Bank.create(context, "bank")

        from_account_id = (await bank.sign_up(context)).account_id
        to_account_id = (await bank.sign_up(context)).account_id

        from_account = Account.ref(from_account_id)
        to_account = Account.ref(to_account_id)

        deposit = await from_account.deposit(context, amount=100)
        self.assertEqual(deposit.updated_balance, 100)

        await bank.transfer(
            context,
            from_account_id=from_account_id,
            to_account_id=to_account_id,
            amount=60,
        )

        self.assertEqual((await from_account.balance(context)).balance, 40)
        self.assertEqual((await to_account.balance(context)).balance, 60)


if __name__ == '__main__':
    unittest.main()
