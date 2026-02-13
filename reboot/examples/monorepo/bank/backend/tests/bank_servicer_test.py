import unittest
from account_servicer import AccountServicer
from bank.v1.account_rbt import Account, BalanceResponse
from bank.v1.bank_rbt import Bank, SignUpResponse
from bank.v1.errors_pb2 import OverdraftError
from bank_servicer import BankServicer
from reboot.aio.applications import Application
from reboot.aio.tests import Reboot


class TestAccount(unittest.IsolatedAsyncioTestCase):

    async def asyncSetUp(self) -> None:
        self.rbt = Reboot()
        await self.rbt.start()

    async def asyncTearDown(self) -> None:
        await self.rbt.stop()

    async def test_signup(self) -> None:
        await self.rbt.up(
            Application(servicers=[BankServicer, AccountServicer])
        )
        context = self.rbt.create_external_context(name=f"test-{self.id()}")
        bank = Bank.ref("my-bank")

        # The Bank state machine doesn't have a constructor, so we can simply
        # start calling methods on it.
        response: SignUpResponse = await bank.sign_up(
            context,
            customer_name="Alice",
        )

        # SignUp will have created an Account we can call.
        account = Account.ref(response.account_id)
        response = await account.balance(context)
        self.assertEqual(response.balance, 0)

    async def test_transfer(self):
        await self.rbt.up(
            Application(servicers=[BankServicer, AccountServicer])
        )
        context = self.rbt.create_external_context(name=f"test-{self.id()}")
        bank = Bank.ref("my-bank")

        alice: SignUpResponse = await bank.sign_up(
            context,
            customer_name="Alice",
        )
        alice_account = Account.ref(alice.account_id)
        bob: SignUpResponse = await bank.sign_up(
            context,
            customer_name="Bob",
        )
        bob_account = Account.ref(bob.account_id)

        # Alice deposits some money.
        await alice_account.deposit(context, amount=100)
        response: BalanceResponse = await alice_account.balance(context)
        self.assertEqual(response.balance, 100)

        # Alice transfers some money to Bob.
        await bank.transfer(
            context,
            from_account_id=alice.account_id,
            to_account_id=bob.account_id,
            amount=40,
        )
        response = await alice_account.balance(context)
        self.assertEqual(response.balance, 60)
        response = await bob_account.balance(context)
        self.assertEqual(response.balance, 40)

        # Bob tries to transfer too much money back to Alice.
        with self.assertRaises(Bank.TransferAborted) as aborted:
            await bank.transfer(
                context,
                from_account_id=bob.account_id,
                to_account_id=alice.account_id,
                amount=50,
            )
        self.assertTrue(isinstance(aborted.exception.error, OverdraftError))
        self.assertEqual(aborted.exception.error.amount, 10)
