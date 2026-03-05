from reboot.api import API, Field, Methods, Model, Reader, Type, Writer


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
    balance=Reader(
        request=None,
        response=BalanceResponse,
    ),
    deposit=Writer(
        request=DepositRequest,
        response=None,
    ),
    withdraw=Writer(
        request=WithdrawRequest,
        response=None,
        errors=[OverdraftError],
    ),
    # Must use this method to create an instance of Account.
    open=Writer(
        request=None,
        response=None,
        factory=True,
    ),
    interest=Writer(
        request=None,
        response=None,
    ),
)

api = API(
    Account=Type(
        state=AccountState,
        methods=AccountMethods,
    ),
)
