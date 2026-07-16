import uuid
from reboot.aio.auth.authorizers import allow
from reboot.aio.contexts import (
    ReaderContext,
    TransactionContext,
    WriterContext,
)
from tests.reboot.documentation.bank_rbt import (
    Account,
    BalanceRequest,
    BalanceResponse,
    Bank,
    CreateBankRequest,
    CreateBankResponse,
    DepositRequest,
    DepositResponse,
    OpenAccountRequest,
    OpenAccountResponse,
    SignUpRequest,
    SignUpResponse,
    TransferRequest,
    TransferResponse,
    WithdrawRequest,
    WithdrawResponse,
)


class AccountServicer(Account.Servicer):

    def authorizer(self):
        return allow()

    async def open(
        self,
        context: WriterContext,
        request: OpenAccountRequest,
    ) -> OpenAccountResponse:
        return OpenAccountResponse()

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
        self.state.balance -= request.amount
        return WithdrawResponse(updated_balance=self.state.balance)


class BankServicer(Bank.Servicer):

    def authorizer(self):
        return allow()

    async def create(
        self,
        context: WriterContext,
        request: CreateBankRequest,
    ) -> CreateBankResponse:
        return CreateBankResponse()

    async def sign_up(
        self,
        context: TransactionContext,
        request: SignUpRequest,
    ) -> SignUpResponse:
        new_account_id = str(uuid.uuid4())

        await Account.open(context, new_account_id)

        # Transactions like writers can alter state directly.
        self.state.account_ids.append(new_account_id)

        return SignUpResponse(account_id=new_account_id)

    async def transfer(
        self,
        context: TransactionContext,
        request: TransferRequest,
    ) -> TransferResponse:
        from_account = Account.ref(request.from_account_id)
        to_account = Account.ref(request.to_account_id)

        await from_account.withdraw(context, amount=request.amount)
        await to_account.deposit(context, amount=request.amount)

        return TransferResponse()
