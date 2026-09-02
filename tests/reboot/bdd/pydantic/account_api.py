"""The pydantic API of the `Account` state type that the `reboot.bdd`
tests run against."""

from reboot.api import API, Field, Methods, Model, Reader, Type, Writer


class State(Model):
    balance: int = Field(tag=1, default=0)


class OpenRequest(Model):
    initial_balance: int = Field(tag=1, default=0)


class DepositRequest(Model):
    amount: int = Field(tag=1)


class DepositResponse(Model):
    updated_balance: int = Field(tag=1)


class WithdrawRequest(Model):
    amount: int = Field(tag=1)


class WithdrawResponse(Model):
    updated_balance: int = Field(tag=1)


class BalanceResponse(Model):
    balance: int = Field(tag=1)


class OverdraftError(Model):
    # Amount the withdrawal would have overdrafted the account by.
    amount: int = Field(tag=1)


AccountMethods = Methods(
    open=Writer(
        request=OpenRequest,
        response=None,
        factory=True,
        mcp=None,
    ),
    deposit=Writer(
        request=DepositRequest,
        response=DepositResponse,
        mcp=None,
    ),
    withdraw=Writer(
        request=WithdrawRequest,
        response=WithdrawResponse,
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
        state=State,
        methods=AccountMethods,
    ),
)
