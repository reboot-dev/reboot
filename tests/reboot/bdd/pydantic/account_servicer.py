"""The pydantic `Account` servicer that the `reboot.bdd` tests bring
up."""

from reboot.aio.auth.authorizers import allow
from reboot.aio.contexts import ReaderContext, WriterContext
from tests.reboot.bdd.pydantic.account_api import (
    BalanceResponse,
    DepositRequest,
    DepositResponse,
    GetOwnerResponse,
    GetOwnersResponse,
    OpenRequest,
    OverdraftError,
    PutOwnerRequest,
    SetOwnerRequest,
    WhoamiResponse,
    WithdrawRequest,
    WithdrawResponse,
)
from tests.reboot.bdd.pydantic.account_api_rbt import Account


class AccountServicer(Account.Servicer):

    def authorizer(self):
        return allow()

    async def open(
        self,
        context: WriterContext,
        request: OpenRequest,
    ) -> None:
        self.state.balance = request.initial_balance

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

    async def balance(
        self,
        context: ReaderContext,
    ) -> BalanceResponse:
        return BalanceResponse(balance=self.state.balance)

    async def whoami(
        self,
        context: ReaderContext,
    ) -> WhoamiResponse:
        return WhoamiResponse(
            user_id=(
                context.auth.user_id if context.auth is not None and
                context.auth.user_id is not None else ''
            )
        )

    async def set_owner(
        self,
        context: WriterContext,
        request: SetOwnerRequest,
    ) -> None:
        self.state.owner = request.owner

    async def get_owner(
        self,
        context: ReaderContext,
    ) -> GetOwnerResponse:
        return GetOwnerResponse(owner=self.state.owner)

    async def put_owner(
        self,
        context: WriterContext,
        request: PutOwnerRequest,
    ) -> None:
        self.state.owners = {**self.state.owners, request.key: request.owner}

    async def get_owners(
        self,
        context: ReaderContext,
    ) -> GetOwnersResponse:
        return GetOwnersResponse(owners=self.state.owners)
