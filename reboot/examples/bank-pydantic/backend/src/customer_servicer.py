import uuid
from bank.v1.proto.customer_pb2 import Balance
from bank.v1.proto.customer_rbt import Customer
from bank.v1.pydantic.account import BalanceResponse
from bank.v1.pydantic.account_rbt import Account
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
        request: Customer.SignUpRequest,
    ) -> Customer.SignUpResponse:
        return Customer.SignUpResponse()

    async def open_account(
        self,
        context: TransactionContext,
        request: Customer.OpenAccountRequest,
    ) -> Customer.OpenAccountResponse:
        account_id = str(uuid.uuid4())
        self.state.account_ids.append(account_id)

        account, _ = await Account.open(
            context,
            account_id,
        )

        await account.deposit(context, amount=request.initial_deposit)

        return Customer.OpenAccountResponse(account_id=account_id)

    async def balances(
        self,
        context: ReaderContext,
        request: Customer.BalancesRequest,
    ) -> Customer.BalancesResponse:
        balances = []
        for account_id in self.state.account_ids:
            balance = await Account.ref(account_id).balance(context)
            assert isinstance(balance, BalanceResponse)
            balances.append(
                Balance(account_id=account_id, balance=balance.amount)
            )

        return Customer.BalancesResponse(balances=balances)
