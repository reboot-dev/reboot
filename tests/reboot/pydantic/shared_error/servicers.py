from reboot.aio.auth.authorizers import allow
from reboot.aio.contexts import (
    ReaderContext,
    TransactionContext,
    WriterContext,
)
from tests.reboot.pydantic.shared_error.account_api import (
    BalanceResponse,
    DepositRequest,
    OpenRequest,
    OverdraftError,
    WithdrawRequest,
)
from tests.reboot.pydantic.shared_error.account_api_rbt import Account
from tests.reboot.pydantic.shared_error.bank_api import TransferRequest
from tests.reboot.pydantic.shared_error.bank_api_rbt import Bank


class AccountServicer(Account.Servicer):

    def authorizer(self):
        return allow()

    async def open(
        self,
        context: WriterContext,
        request: OpenRequest,
    ) -> None:
        self.state.balance = request.balance

    async def deposit(
        self,
        context: WriterContext,
        request: DepositRequest,
    ) -> None:
        self.state.balance += request.amount

    async def withdraw(
        self,
        context: WriterContext,
        request: WithdrawRequest,
    ) -> None:
        if request.amount > self.state.balance:
            raise Account.WithdrawAborted(
                OverdraftError(amount=request.amount - self.state.balance)
            )
        self.state.balance -= request.amount

    async def balance(
        self,
        context: ReaderContext,
    ) -> BalanceResponse:
        return BalanceResponse(amount=self.state.balance)


class BankServicer(Bank.Servicer):

    def authorizer(self):
        return allow()

    async def create(
        self,
        context: TransactionContext,
    ) -> None:
        self.state.transfers = 0

    async def transfer(
        self,
        context: TransactionContext,
        request: TransferRequest,
    ) -> None:
        # The withdrawal's `OverdraftError` propagates as this method's
        # own abort, since `transfer` declares it.
        await Account.ref(request.from_account_id).withdraw(
            context,
            amount=request.amount,
        )
        await Account.ref(request.to_account_id).deposit(
            context,
            amount=request.amount,
        )
        self.state.transfers += 1
