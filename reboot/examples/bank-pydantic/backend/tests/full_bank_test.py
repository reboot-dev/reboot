import unittest
from account_servicer import AccountServicer
from bank.v1.proto.customer_rbt import Customer
from bank.v1.pydantic.account import BalanceResponse, OverdraftError
from bank.v1.pydantic.account_rbt import Account
from bank.v1.pydantic.bank import (
    AccountBalancesResponse,
    AllCustomerIdsResponse,
    SignUpRequest,
    TransferRequest,
)
from bank.v1.pydantic.bank_rbt import Bank
from bank_servicer import BankServicer
from customer_servicer import CustomerServicer
from google.protobuf.message import Message
from rbt.v1alpha1 import errors_pb2
from reboot.aio.applications import Application
from reboot.aio.auth.authorizers import allow, allow_if
from reboot.aio.contexts import ReaderContext, WriterContext
from reboot.aio.tests import Reboot
from reboot.std.collections.v1.sorted_map import sorted_map_library
from typing import Optional

BANK_ID = 'test-bank'


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


class TestBank(unittest.IsolatedAsyncioTestCase):

    async def asyncSetUp(self) -> None:
        self.rbt = Reboot()
        await self.rbt.start()

    async def asyncTearDown(self) -> None:
        await self.rbt.stop()

    async def test_transfer(self) -> None:
        await self.rbt.up(
            Application(
                servicers=[
                    BankServicerWithAuthorizer,
                    AccountServicerWithNoInterestAndAuthorizer,
                    CustomerServicer,
                ],
                libraries=[sorted_map_library()],
            )
        )
        context = self.rbt.create_external_context(name=f"test-{self.id()}")
        bank, response = await Bank.create(context, BANK_ID)

        # Assert that the constructor returns 'None' as described in
        # Pydantic schema.
        assert response is None

        CUSTOMER_ID_1 = "test@reboot.dev"
        CUSTOMER_ID_2 = "test2@reboot.dev"

        await bank.sign_up(
            context,
            # Show Pydantic model request.
            SignUpRequest(
                customer_id=CUSTOMER_ID_1,
            ),
        )

        open_account_response_1 = await Customer.ref(
            CUSTOMER_ID_1
        ).open_account(context, initial_deposit=1000.0)

        # The 'Customer' servicer was described in Protobuf, so assert
        # that the response is a Protobuf message.
        assert isinstance(open_account_response_1, Message)

        await bank.sign_up(
            context,
            # Show field name kwargs request.
            customer_id=CUSTOMER_ID_2,
        )

        all_customer_ids_response = await bank.all_customer_ids(context)

        assert isinstance(all_customer_ids_response, AllCustomerIdsResponse)

        open_account_response_2 = await Customer.ref(
            CUSTOMER_ID_2
        ).open_account(context, initial_deposit=0.0)

        # The 'Customer' servicer was described in Protobuf, so assert
        # that the response is a Protobuf message.
        assert isinstance(open_account_response_2, Message)

        await bank.transfer(
            context,
            # Show Pydantic model request.
            TransferRequest(
                from_account_id=open_account_response_1.account_id,
                to_account_id=open_account_response_2.account_id,
                amount=250.0,
            )
        )

        account_balances = await bank.account_balances(context)

        # Assert that the response is a Pydantic model as described in
        # the Pydantic schema.
        assert isinstance(account_balances, AccountBalancesResponse)

        for account_balance in account_balances.balances:
            if account_balance.customer_id == CUSTOMER_ID_1:
                self.assertEqual(len(account_balance.accounts), 1)
                self.assertEqual(account_balance.accounts[0].balance, 750.0)
            elif account_balance.customer_id == CUSTOMER_ID_2:
                self.assertEqual(len(account_balance.accounts), 1)
                self.assertEqual(account_balance.accounts[0].balance, 250.0)
            else:
                self.fail(
                    f"Unexpected customer ID: {account_balance.customer_id}"
                )

        # Also test balances from the Account servicer.
        account_1 = Account.ref(open_account_response_1.account_id)
        account_2 = Account.ref(open_account_response_2.account_id)

        balance_response_1 = await account_1.balance(context)
        assert isinstance(balance_response_1, BalanceResponse)
        self.assertEqual(balance_response_1.amount, 750.0)

        balance_response_2 = await account_2.balance(context)
        assert isinstance(balance_response_2, BalanceResponse)
        self.assertEqual(balance_response_2.amount, 250.0)

    async def test_overdraft(self) -> None:
        await self.rbt.up(
            Application(
                servicers=[
                    BankServicerWithAuthorizer,
                    AccountServicerWithNoInterestAndAuthorizer,
                    CustomerServicer,
                ],
                libraries=[sorted_map_library()],
            )
        )
        context = self.rbt.create_external_context(name=f"test-{self.id()}")
        await Bank.create(context, BANK_ID)

        ACCOUNT_ID = "test-overdraft-account"
        account, _ = await Account.open(context, ACCOUNT_ID)
        try:
            await account.withdraw(context, amount=50.50)
            raise Exception("Expected `OverdraftError` to be thrown")
        except Account.WithdrawAborted as aborted:
            assert isinstance(aborted.error, OverdraftError)
            self.assertEqual(aborted.error.amount, 50.50)

    async def test_tasks(self) -> None:
        await self.rbt.up(
            Application(
                servicers=[
                    BankServicerWithAuthorizer,
                    AccountServicerWithNoInterestAndAuthorizer,
                    CustomerServicer,
                ],
                libraries=[sorted_map_library()],
            )
        )
        context = self.rbt.create_external_context(name=f"test-{self.id()}")
        await Bank.create(context, BANK_ID)

        ACCOUNT_ID = "test-overdraft-account"

        account, _ = await Account.open(context, ACCOUNT_ID)

        task = await account.spawn().deposit(context, amount=10.0)

        await task

        balance_task = await account.spawn().balance(context)
        balance_response = await balance_task

        assert isinstance(balance_response, BalanceResponse)

        self.assertEqual(balance_response.amount, 10.0)
