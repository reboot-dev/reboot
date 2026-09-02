"""The `Account` servicer that the `reboot.bdd` tests bring up."""

from reboot.aio.auth.authorizers import allow
from reboot.aio.contexts import ReaderContext, WriterContext
from tests.reboot.bdd.account_pb2 import OverdraftError
from tests.reboot.bdd.account_rbt import (
    Account,
    BalanceRequest,
    BalanceResponse,
    DepositRequest,
    DepositResponse,
    OpenRequest,
    OpenResponse,
    WithdrawRequest,
    WithdrawResponse,
)


class AccountServicer(Account.Servicer):

    def authorizer(self):
        return allow()

    async def open(
        self,
        context: WriterContext,
        request: OpenRequest,
    ) -> OpenResponse:
        self.state.balance = request.initial_balance
        return OpenResponse(account_id=context.state_id)

    async def balance(
        self,
        context: ReaderContext,
        request: BalanceRequest,
    ) -> BalanceResponse:
        return BalanceResponse(balance=self.state.balance)

    async def deposit(
        self,
        context: WriterContext,
        request: DepositRequest,
    ) -> DepositResponse:
        self.state.balance += request.amount
        return DepositResponse(updated_balance=self.state.balance)

    async def withdraw(
        self,
        context: WriterContext,
        request: WithdrawRequest,
    ) -> WithdrawResponse:
        updated_balance = self.state.balance - request.amount
        if updated_balance < 0:
            raise Account.WithdrawAborted(
                OverdraftError(amount=-updated_balance)
            )
        self.state.balance = updated_balance
        return WithdrawResponse(updated_balance=updated_balance)
