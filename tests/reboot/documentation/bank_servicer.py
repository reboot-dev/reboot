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
    Counter,
    CreateBankRequest,
    CreateBankResponse,
    DepositRequest,
    DepositResponse,
    GetIdRequest,
    GetIdResponse,
    IncrementRequest,
    IncrementResponse,
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
        self.state.customer_name = request.customer_name
        return OpenAccountResponse()

    async def get_id(
        self,
        context: ReaderContext,
        request: GetIdRequest,
    ) -> GetIdResponse:
        current_id = context.state_id
        return GetIdResponse(id=current_id)

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


class CounterServicer(Counter.Servicer):

    def authorizer(self):
        return allow()

    async def increment(
        self,
        context: WriterContext,
        request: IncrementRequest,
    ) -> IncrementResponse:
        self.state.value += 1
        return IncrementResponse()


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
        account, response = await Account.open(
            context,
            customer_name=request.customer_name,
        )

        new_account_id = account.state_id

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
