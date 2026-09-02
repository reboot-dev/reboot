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
    GetOwnerRequest,
    GetOwnerResponse,
    GetOwnersRequest,
    GetOwnersResponse,
    OpenRequest,
    OpenResponse,
    PutOwnerRequest,
    PutOwnerResponse,
    SetOwnerRequest,
    SetOwnerResponse,
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

    async def set_owner(
        self,
        context: WriterContext,
        request: SetOwnerRequest,
    ) -> SetOwnerResponse:
        self.state.owner.CopyFrom(request.owner)
        return SetOwnerResponse()

    async def get_owner(
        self,
        context: ReaderContext,
        request: GetOwnerRequest,
    ) -> GetOwnerResponse:
        return GetOwnerResponse(owner=self.state.owner)

    async def put_owner(
        self,
        context: WriterContext,
        request: PutOwnerRequest,
    ) -> PutOwnerResponse:
        self.state.owners[request.key].CopyFrom(request.owner)
        return PutOwnerResponse()

    async def get_owners(
        self,
        context: ReaderContext,
        request: GetOwnersRequest,
    ) -> GetOwnersResponse:
        return GetOwnersResponse(owners=self.state.owners)

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
