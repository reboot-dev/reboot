"""The servicer of the `Account` state type whose unqualified name
collides with `tests.reboot.bdd.Account` in the `reboot.bdd` tests."""

from reboot.aio.auth.authorizers import allow
from reboot.aio.contexts import ReaderContext, WriterContext
from tests.reboot.bdd.other.account_rbt import (
    Account,
    OpenRequest,
    OpenResponse,
    TotalRequest,
    TotalResponse,
)


class AccountServicer(Account.Servicer):

    def authorizer(self):
        return allow()

    async def open(
        self,
        context: WriterContext,
        request: OpenRequest,
    ) -> OpenResponse:
        self.state.total = request.initial_total
        return OpenResponse()

    async def total(
        self,
        context: ReaderContext,
        request: TotalRequest,
    ) -> TotalResponse:
        return TotalResponse(total=self.state.total)
