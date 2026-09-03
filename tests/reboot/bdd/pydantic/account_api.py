"""The pydantic API of the `Account` state type that the `reboot.bdd`
tests run against."""

from reboot.api import API, Field, Methods, Model, Reader, Type, Writer
from typing import Optional


class Owner(Model):
    name: str = Field(tag=1)
    tags: list[str] = Field(tag=2, default_factory=list)


class State(Model):
    balance: int = Field(tag=1, default=0)
    owner: Optional[Owner] = Field(tag=2, default=None)
    owners: dict[str, Owner] = Field(tag=3, default_factory=dict)


class OpenRequest(Model):
    initial_balance: int = Field(tag=1, default=0)


class DepositRequest(Model):
    amount: int = Field(tag=1)


class DepositResponse(Model):
    updated_balance: int = Field(tag=1)


class DepositLaterRequest(Model):
    # Amount a scheduled task will deposit.
    amount: int = Field(tag=1)


class WithdrawRequest(Model):
    amount: int = Field(tag=1)


class WithdrawResponse(Model):
    updated_balance: int = Field(tag=1)


class BalanceResponse(Model):
    balance: int = Field(tag=1)


class WhoamiResponse(Model):
    # ID of the authenticated caller; empty when anonymous.
    user_id: str = Field(tag=1, default='')


class SetOwnerRequest(Model):
    owner: Owner = Field(tag=1)
    # Owners in addition to `owner`.
    co_owners: list[Owner] = Field(tag=2, default_factory=list)


class GetOwnerResponse(Model):
    owner: Optional[Owner] = Field(tag=1)


class PutOwnerRequest(Model):
    key: str = Field(tag=1)
    owner: Owner = Field(tag=2)


class GetOwnersResponse(Model):
    owners: dict[str, Owner] = Field(tag=1, default_factory=dict)


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
    deposit_later=Writer(
        request=DepositLaterRequest,
        response=None,
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
    whoami=Reader(
        request=None,
        response=WhoamiResponse,
        mcp=None,
    ),
    set_owner=Writer(
        request=SetOwnerRequest,
        response=None,
        mcp=None,
    ),
    get_owner=Reader(
        request=None,
        response=GetOwnerResponse,
        mcp=None,
    ),
    put_owner=Writer(
        request=PutOwnerRequest,
        response=None,
        mcp=None,
    ),
    get_owners=Reader(
        request=None,
        response=GetOwnersResponse,
        mcp=None,
    ),
)

api = API(
    Account=Type(
        state=State,
        methods=AccountMethods,
    ),
)
