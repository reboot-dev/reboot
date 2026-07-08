from reboot.api import (
    API,
    UI,
    Field,
    Methods,
    Model,
    Reader,
    Tool,
    Transaction,
    Type,
)


class BankState(Model):
    customer_ids_map_id: str = Field(tag=1)


class SignUpRequest(Model):
    customer_id: str = Field(tag=1)


class AllCustomerIdsResponse(Model):
    customer_ids: list[str] = Field(tag=1)


class TransferRequest(Model):
    from_account_id: str = Field(tag=1)
    to_account_id: str = Field(tag=2)
    amount: float = Field(tag=3)


class OpenCustomerAccountRequest(Model):
    initial_deposit: float = Field(tag=1)
    customer_id: str = Field(tag=2)


class CustomerAccount(Model):
    account_id: str = Field(tag=1)
    balance: float = Field(tag=2)


class CustomerAccounts(Model):
    customer_id: str = Field(tag=1)
    accounts: list[CustomerAccount] = Field(tag=2)


class AccountBalancesResponse(Model):
    balances: list[CustomerAccounts] = Field(tag=1)


BankMethods = Methods(
    create=Transaction(
        request=None,
        response=None,
        factory=True,
        mcp=None,
    ),
    sign_up=Transaction(
        request=SignUpRequest,
        response=None,
        description="Sign up a new customer with the given "
        "`customer_id` (e.g. an email address). This example "
        "runs a single bank whose `bank_id` is `reboot-bank`.",
        mcp=Tool(),
    ),
    all_customer_ids=Reader(
        request=None,
        response=AllCustomerIdsResponse,
        description="List the `customer_id` of every customer "
        "that has signed up with the bank.",
        mcp=Tool(),
    ),
    transfer=Transaction(
        request=TransferRequest,
        response=None,
        description="Transfer an amount between two accounts. "
        "Get `from_account_id` and `to_account_id` from "
        "`bank_account_balances`.",
        mcp=Tool(),
    ),
    open_customer_account=Transaction(
        request=OpenCustomerAccountRequest,
        response=None,
        description="Open a new account for an existing "
        "customer with an initial deposit.",
        mcp=Tool(),
    ),
    account_balances=Reader(
        request=None,
        response=AccountBalancesResponse,
        description="List every customer of the bank along "
        "with their accounts (`account_id`) and balances.",
        mcp=Tool(),
    ),
    show_accounts=UI(
        request=None,
        path="frontend/mcp/accounts",
        title="Bank Accounts",
        description="Show a live table of every customer's "
        "accounts and balances.",
    ),
)

api = API(
    Bank=Type(
        state=BankState,
        methods=BankMethods,
    ),
)
