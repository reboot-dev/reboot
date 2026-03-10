from reboot.api import API, Field, Methods, Model, Reader, Transaction, Type


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
    ),
    sign_up=Transaction(
        request=SignUpRequest,
        response=None,
    ),
    all_customer_ids=Reader(
        request=None,
        response=AllCustomerIdsResponse,
    ),
    transfer=Transaction(
        request=TransferRequest,
        response=None,
    ),
    open_customer_account=Transaction(
        request=OpenCustomerAccountRequest,
        response=None,
    ),
    account_balances=Reader(
        request=None,
        response=AccountBalancesResponse,
    ),
)

api = API(
    Bank=Type(
        state=BankState,
        methods=BankMethods,
    ),
)
