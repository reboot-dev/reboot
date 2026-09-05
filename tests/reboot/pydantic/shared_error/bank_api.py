"""A bank whose `transfer` declares an error another API file
defines: the account's `OverdraftError`."""
from reboot.api import API, Field, Methods, Model, Transaction, Type
from tests.reboot.pydantic.shared_error.account_api import OverdraftError


class BankState(Model):
    transfers: int = Field(tag=1, default=0)


class TransferRequest(Model):
    from_account_id: str = Field(tag=1)
    to_account_id: str = Field(tag=2)
    amount: float = Field(tag=3)


BankMethods = Methods(
    create=Transaction(
        request=None,
        response=None,
        factory=True,
        mcp=None,
    ),
    transfer=Transaction(
        request=TransferRequest,
        response=None,
        errors=[OverdraftError],
        mcp=None,
    ),
)

api = API(
    Bank=Type(
        state=BankState,
        methods=BankMethods,
    ),
)
