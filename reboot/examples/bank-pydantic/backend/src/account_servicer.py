import random
from bank.v1.pydantic.account import OverdraftError
from bank.v1.pydantic.account_rbt import Account
from datetime import timedelta
from reboot.aio.auth.authorizers import allow
from reboot.aio.contexts import ReaderContext, WriterContext


class AccountServicer(Account.Servicer):

    def authorizer(self):
        return allow()

    async def balance(
        self,
        context: ReaderContext,
    ) -> Account.BalanceResponse:
        return Account.BalanceResponse(amount=self.state.balance)

    async def deposit(
        self,
        context: WriterContext,
        request: Account.DepositRequest,
    ) -> None:
        self.state.balance += request.amount

    async def withdraw(
        self,
        context: WriterContext,
        request: Account.WithdrawRequest,
    ) -> None:
        self.state.balance -= request.amount
        if self.state.balance < 0:
            raise Account.WithdrawAborted(
                OverdraftError(amount=-self.state.balance)
            )

    async def open(
        self,
        context: WriterContext,
    ) -> None:
        self.state.balance = 0.0
        await self.ref().schedule(
            when=timedelta(seconds=1),
        ).interest(context)

    async def interest(
        self,
        context: WriterContext,
    ) -> None:

        self.state.balance += 1

        await self.ref().schedule(
            when=timedelta(seconds=random.randint(1, 4)),
        ).interest(context)
