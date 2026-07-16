import unittest
from reboot.aio.applications import Application
from reboot.aio.concurrently import concurrently
from reboot.aio.tests import Reboot
from tests.reboot.documentation.bank_rbt import Account, BalanceResponse, Bank
from tests.reboot.documentation.bank_servicer import (
    AccountServicer,
    BankServicer,
    CounterServicer,
)


def process(balance: BalanceResponse) -> None:
    assert balance.balance > 0


def handle_error(error: BaseException) -> None:
    raise error


# Validates the `concurrently` snippets used in
# `documentation/docs/learn_more/call/from_within_your_app.mdx`.
class TestConcurrently(unittest.IsolatedAsyncioTestCase):

    async def asyncSetUp(self) -> None:
        self.rbt = Reboot()
        await self.rbt.start()

        await self.rbt.up(
            Application(
                servicers=[
                    AccountServicer,
                    BankServicer,
                    CounterServicer,
                ],
            ),
        )

        self.context = self.rbt.create_external_context(name="concurrently")

        bank, _ = await Bank.create(self.context, "bank")

        self.account_ids = []
        for amount in [10, 20, 30]:
            account_id = (await bank.sign_up(self.context)).account_id
            await Account.ref(account_id).deposit(self.context, amount=amount)
            self.account_ids.append(account_id)

    async def asyncTearDown(self) -> None:
        await self.rbt.stop()

    async def test_generator_expression(self) -> None:
        context = self.context
        account_ids = self.account_ids

        # Collect all results into a list (like `asyncio.gather`):
        balances = await concurrently(
            Account.ref(account_id).balance(context)
            for account_id in account_ids
        )

        self.assertEqual(sorted(b.balance for b in balances), [10, 20, 30])

    async def test_async_for(self) -> None:
        context = self.context
        account_ids = self.account_ids

        async for balance in concurrently(
            Account.ref(account_id).balance(context)
            for account_id in account_ids
        ):
            process(balance)

    async def test_iterable(self) -> None:
        context = self.context
        account_ids = self.account_ids

        balances = await concurrently(
            [
                Account.ref(account_id).balance(context)
                for account_id in account_ids
            ]
        )

        self.assertEqual(len(balances), 3)

    async def test_async_generator(self) -> None:
        context = self.context
        customers = ["alice", "bob"]
        account_id_by_customer = dict(zip(customers, self.account_ids[:2]))

        def get_account_id(customer: str) -> str:
            return account_id_by_customer[customer]

        async def fetch_balances():
            for customer in customers:
                account_id = get_account_id(customer)
                yield Account.ref(account_id).balance(context)

        balances = await concurrently(fetch_balances())

        self.assertEqual(len(balances), 2)

    async def test_for_each_dict(self) -> None:
        context = self.context
        account_ids = self.account_ids

        balances_by_account_id = {
            account_id: balance async for account_id, balance in concurrently(
                lambda account_id: Account.ref(account_id).balance(context),
                for_each=account_ids,
            )
        }

        self.assertEqual(len(balances_by_account_id), 3)

    async def test_for_each_await(self) -> None:
        context = self.context
        account_ids = self.account_ids

        balances = await concurrently(
            lambda account_id: Account.ref(account_id).balance(context),
            for_each=account_ids,
        )

        for account_id, balance in balances:
            process(balance)

    async def test_for_each_async_generator(self) -> None:
        context = self.context

        async def paginated_api():
            yield self.account_ids[:2]
            yield self.account_ids[2:]

        async def account_ids():
            async for page in paginated_api():
                for account_id in page:
                    yield account_id

        balances_by_id = {
            account_id: balance async for account_id, balance in concurrently(
                lambda account_id: Account.ref(account_id).balance(context),
                for_each=account_ids(),
            )
        }

        self.assertEqual(len(balances_by_id), 3)

    async def test_return_exceptions_await(self) -> None:
        context = self.context
        account_ids = self.account_ids

        # With `await`:
        balances = await concurrently(
            (
                Account.ref(account_id).balance(context)
                for account_id in account_ids
            ),
            return_exceptions=True,
        )
        for balance in balances:
            if isinstance(balance, BaseException):
                handle_error(balance)
            else:
                process(balance)  # mypy narrows the type correctly!

    async def test_return_exceptions_async_for(self) -> None:
        context = self.context
        account_ids = self.account_ids

        def handle_error(account_id: str, error: BaseException) -> None:
            raise error

        def process(account_id: str, balance: BalanceResponse) -> None:
            assert balance.balance > 0

        # With `async for` and `for_each`:
        async for account_id, balance in concurrently(
            lambda account_id: Account.ref(account_id).balance(context),
            for_each=account_ids,
            return_exceptions=True,
        ):
            if isinstance(balance, BaseException):
                handle_error(account_id, balance)
            else:
                process(account_id, balance)  # mypy narrows correctly!


if __name__ == '__main__':
    unittest.main()
