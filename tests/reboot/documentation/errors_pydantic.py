from reboot.api import Field, Methods, Model, Writer


class WithdrawRequest(Model):
    amount: float = Field(tag=1)


# Error returned when a withdrawal would overdraft the account.
class OverdraftError(Model):
    # Amount that the account would have been overdrafted by.
    amount: float = Field(tag=1)


AccountMethods = Methods(
    withdraw=Writer(
        request=WithdrawRequest,
        response=None,
        errors=[OverdraftError],
        mcp=None,
    ),
    # ...
)


class AccountState(Model):
    balance: float = Field(tag=1)
