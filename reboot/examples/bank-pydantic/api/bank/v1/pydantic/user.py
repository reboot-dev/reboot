from reboot.api import (
    API,
    Field,
    Methods,
    Model,
    Reader,
    Tool,
    Transaction,
    Type,
)


class UserState(Model):
    pass


class OpenAccountRequest(Model):
    initial_deposit: float = Field(tag=1)


class OpenAccountResponse(Model):
    account_id: str = Field(tag=1)


class AccountBalance(Model):
    account_id: str = Field(tag=1)
    balance: float = Field(tag=2)


class BalancesResponse(Model):
    balances: list[AccountBalance] = Field(tag=1, default_factory=list)


# A `Type` named `User` is auto-constructed per authenticated user:
# every signed-in caller gets their own `User` state, and its methods
# are exposed as MCP tools. Auto-construction signs the user up as a bank
# customer (see `UserServicer.create`), with the user id doubling as
# their `customer_id`.
api = API(
    User=Type(
        state=UserState,
        methods=Methods(
            open_account=Transaction(
                request=OpenAccountRequest,
                response=OpenAccountResponse,
                description="Open a new account for the signed-in "
                "user with an initial deposit. Returns the new "
                "`account_id`.",
                mcp=Tool(),
            ),
            balances=Reader(
                request=None,
                response=BalancesResponse,
                description="List the signed-in user's accounts "
                "(`account_id`) and their balances. Empty if the "
                "user has no accounts yet.",
                mcp=Tool(),
            ),
        ),
    ),
)
