"""An account with a balance a withdrawal may not take below zero."""
from reboot.api import API, Field, Methods, Model, Reader, Type, Writer


class AccountState(Model):
    balance: float = Field(tag=1)


class OpenRequest(Model):
    balance: float = Field(tag=1)


class DepositRequest(Model):
    amount: float = Field(tag=1)


class WithdrawRequest(Model):
    amount: float = Field(tag=1)


class BalanceResponse(Model):
    amount: float = Field(tag=1)


class OverdraftError(Model):
    """By how much a withdrawal exceeded the balance."""
    amount: float = Field(tag=1)


AccountMethods = Methods(
    open=Writer(
        request=OpenRequest,
        response=None,
        factory=True,
        mcp=None,
    ),
    deposit=Writer(
        request=DepositRequest,
        response=None,
        mcp=None,
    ),
    withdraw=Writer(
        request=WithdrawRequest,
        response=None,
        errors=[OverdraftError],
        mcp=None,
    ),
    balance=Reader(
        request=None,
        response=BalanceResponse,
        mcp=None,
    ),
)

api = API(
    Account=Type(
        state=AccountState,
        methods=AccountMethods,
    ),
)
