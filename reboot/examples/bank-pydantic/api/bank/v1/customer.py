from reboot.api import (
    API,
    Field,
    Methods,
    Model,
    Reader,
    Transaction,
    Type,
    Writer,
)


class CustomerState(Model):
    account_ids: list[str] = Field(tag=1, default_factory=list)


class OpenAccountRequest(Model):
    initial_deposit: float = Field(tag=1)


class OpenAccountResponse(Model):
    account_id: str = Field(tag=1)


class Balance(Model):
    account_id: str = Field(tag=1)
    balance: float = Field(tag=2)


class BalancesResponse(Model):
    balances: list[Balance] = Field(tag=1, default_factory=list)


CustomerMethods = Methods(
    sign_up=Writer(
        request=None,
        response=None,
        factory=True,
        mcp=None,
    ),
    open_account=Transaction(
        request=OpenAccountRequest,
        response=OpenAccountResponse,
        mcp=None,
    ),
    balances=Reader(
        request=None,
        response=BalancesResponse,
        mcp=None,
    ),
)

api = API(
    Customer=Type(
        state=CustomerState,
        methods=CustomerMethods,
    ),
)
