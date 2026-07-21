import uuid
from bank.v1.account_rbt import Account
from bank.v1.customer import Balance
from bank.v1.customer_rbt import Customer
from reboot.aio.auth.authorizers import allow
from reboot.aio.contexts import (
    ReaderContext,
    TransactionContext,
    WriterContext,
)


class CustomerServicer(Customer.Servicer):

    def authorizer(self):
        return allow()

    async def sign_up(
        self,
        context: WriterContext,
    ) -> None:
        pass

    async def open_account(
        self,
        context: TransactionContext,
        request: Customer.OpenAccountRequest,
    ) -> Customer.OpenAccountResponse:
        account_id = str(uuid.uuid4())
        self.state.account_ids.append(account_id)

        account, _ = await Account.factory.open(
            context,
            account_id,
        )

        await account.deposit(context, amount=request.initial_deposit)

        return Customer.OpenAccountResponse(account_id=account_id)

    async def balances(
        self,
        context: ReaderContext,
    ) -> Customer.BalancesResponse:
        balances = []
        for account_id in self.state.account_ids:
            balance = await Account.ref(account_id).balance(context)
            balances.append(
                Balance(account_id=account_id, balance=balance.amount)
            )

        return Customer.BalancesResponse(balances=balances)
