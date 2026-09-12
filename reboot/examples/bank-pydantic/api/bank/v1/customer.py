from reboot.api import (
    API,
    Exclusive,
    Field,
    Methods,
    Model,
    Reader,
    Transaction,
    Type,
    Writer,
)


class CustomerState(Model):
    account_ids: list[str] = Field(
        tag=1,
        default_factory=list,
        description="The ids of the customer's accounts, in the order "
        "they were opened.",
    )


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
        description="Bring the customer into existence with no "
        "accounts.",
        mcp=None,
    ),
    open_account=Transaction(
        mode=Exclusive(),
        request=OpenAccountRequest,
        response=OpenAccountResponse,
        description="Open an account for this customer with an "
        "initial deposit, returning the id it was given.",
        mcp=None,
    ),
    balances=Reader(
        request=None,
        response=BalancesResponse,
        description="The balance of every account this customer owns.",
        mcp=None,
    ),
)

api = API(
    Customer=Type(
        state=CustomerState,
        methods=CustomerMethods,
        description="One customer, and the accounts they own.",
    ),
)
