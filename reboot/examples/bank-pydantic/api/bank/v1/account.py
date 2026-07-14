from reboot.api import API, Field, Methods, Model, Reader, Tool, Type, Writer


class AccountState(Model):
    balance: float = Field(tag=1)


class BalanceResponse(Model):
    amount: float = Field(tag=1)


class DepositRequest(Model):
    amount: float = Field(tag=1)


class WithdrawRequest(Model):
    amount: float = Field(tag=1)


class OverdraftError(Model):
    amount: float = Field(tag=1)


AccountMethods = Methods(
    # Must use this method to create an instance of Account.
    open=Writer(
        request=None,
        response=None,
        factory=True,
        mcp=None,
    ),
    balance=Reader(
        request=None,
        response=BalanceResponse,
        description="Get the balance of an account. Get the "
        "`account_id` from `bank_account_balances`.",
        mcp=Tool(),
    ),
    deposit=Writer(
        request=DepositRequest,
        response=None,
        description="Deposit an amount into an account. Get "
        "the `account_id` from `bank_account_balances`.",
        mcp=Tool(),
    ),
    withdraw=Writer(
        request=WithdrawRequest,
        response=None,
        errors=[OverdraftError],
        description="Withdraw an amount from an account; "
        "fails with an overdraft error if the balance is "
        "insufficient. Get the `account_id` from "
        "`bank_account_balances`.",
        mcp=Tool(),
    ),
    interest=Writer(
        request=None,
        response=None,
        mcp=None,
    ),
)

api = API(
    Account=Type(
        state=AccountState,
        methods=AccountMethods,
    ),
)
