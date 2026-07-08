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
    # The bank `customer_id` this user is enrolled as; empty until
    # `enroll` has run.
    customer_id: str = Field(tag=1, default="")


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
# are exposed as MCP tools without an id parameter — the id comes
# from the session.
api = API(
    User=Type(
        state=UserState,
        methods=Methods(
            enroll=Transaction(
                request=None,
                response=None,
                description="Enroll the signed-in user as a customer "
                "of the bank. Idempotent: enrolling twice is a no-op. "
                "Other tools that need a customer enroll "
                "automatically, so calling this first is optional.",
                mcp=Tool(),
            ),
            open_account=Transaction(
                request=OpenAccountRequest,
                response=OpenAccountResponse,
                description="Open a new account for the signed-in "
                "user with an initial deposit, enrolling them as a "
                "customer of the bank first if needed. Returns the "
                "new `account_id`.",
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
