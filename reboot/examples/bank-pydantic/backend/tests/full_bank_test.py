"""The bank's tests: the Gherkin scenarios in the `.feature` files
beside this module.

The scenarios run against servicer subclasses that wire up
authorizers, showing how a test exercises authorization, and that
disable the account's scheduled interest so balances stay stable.
"""

import pytest
from account_servicer import AccountServicer
from bank.v1.account_rbt import Account
from bank.v1.bank_rbt import Bank
from bank_servicer import BankServicer
from customer_servicer import CustomerServicer
from rbt.v1alpha1 import errors_pb2
from reboot.aio.applications import Application
from reboot.aio.auth.authorizers import allow, allow_if
from reboot.aio.contexts import ReaderContext, WriterContext
from reboot.bdd import scenarios
from reboot.std.collections.v1.sorted_map import sorted_map_library
from typing import Optional


class BankServicerWithAuthorizer(BankServicer):

    def authorizer(self):

        def one_rule_for_all_methods(
            context: ReaderContext,
            state: Bank.State,
            request: Bank.SignUpRequest | Bank.TransferRequest |
            Bank.OpenCustomerAccountRequest | None,
            **kwargs,
        ):
            # During the constructor method call there is no state.
            if state is not None:
                assert isinstance(state, Bank.State)

            # Since it is the only authorizer rule for all methods,
            # the request can be of different types or None.
            if request is not None:
                assert isinstance(
                    request,
                    (
                        Bank.SignUpRequest,
                        Bank.TransferRequest,
                        Bank.OpenCustomerAccountRequest,
                    ),
                )

            return errors_pb2.Ok()

        return allow_if(all=[one_rule_for_all_methods])


class AccountServicerWithNoInterestAndAuthorizer(AccountServicer):

    def authorizer(self):

        def balance_authorizer_rule(
            context: ReaderContext,
            state: Account.State,
            # There is no request for 'balance' method.
            request: None,
            **kwargs,
        ):
            assert state is not None
            assert isinstance(state, Account.State)
            assert request is None

            return errors_pb2.Ok()

        def deposit_authorizer_rule(
            context: ReaderContext,
            state: Account.State,
            request: Account.DepositRequest,
            **kwargs,
        ):
            assert state is not None
            assert isinstance(state, Account.State)
            assert request is not None
            assert isinstance(request, Account.DepositRequest)

            return errors_pb2.Ok()

        def withdraw_authorizer_rule(
            context: ReaderContext,
            state: Account.State,
            request: Account.WithdrawRequest,
            **kwargs,
        ):
            assert state is not None
            assert isinstance(state, Account.State)
            assert request is not None
            assert isinstance(request, Account.WithdrawRequest)

            return errors_pb2.Ok()

        def open_authorizer_rule(
            context: ReaderContext,
            state: Optional[Account.State],
            # There is no request for 'open' method.
            request: None,
            **kwargs,
        ):
            # 'open' is a constructor method, so state can be None.
            if state is not None:
                assert isinstance(state, Account.State)
            assert request is None

            return errors_pb2.Ok()

        return Account.Authorizer(
            balance=allow_if(all=[balance_authorizer_rule]),
            deposit=allow_if(all=[deposit_authorizer_rule]),
            withdraw=allow_if(all=[withdraw_authorizer_rule]),
            open=allow_if(all=[open_authorizer_rule]),
            interest=allow(),
        )

    async def interest(
        self,
        context: WriterContext,
    ) -> None:
        # To avoid flakes remove the interest on the Account,
        # so the balance remains stable during tests.
        pass


@pytest.fixture
def application() -> Application:
    return Application(
        servicers=[
            BankServicerWithAuthorizer,
            AccountServicerWithNoInterestAndAuthorizer,
            CustomerServicer,
        ],
        libraries=[sorted_map_library()],
    )


scenarios('transfers.feature', 'deposits.feature', 'withdrawals.feature')
