import asyncio
import uuid
from bank.v1.proto.customer_rbt import Customer
from bank.v1.pydantic.account_rbt import Account
from bank.v1.pydantic.bank import CustomerAccount, CustomerAccounts
from bank.v1.pydantic.bank_rbt import Bank
from google.protobuf.message import Message
from rbt.std.collections.v1.sorted_map_rbt import SortedMap
from reboot.aio.auth.authorizers import allow
from reboot.aio.contexts import ReaderContext, TransactionContext
from uuid7 import create as uuid7


class BankServicer(Bank.Servicer):

    def authorizer(self):
        return allow()

    async def create(
        self,
        context: TransactionContext,
    ) -> None:
        self.state.customer_ids_map_id = str(uuid.uuid4())
        await SortedMap.ref(self.state.customer_ids_map_id).insert(
            context,
            entries={},
        )

    async def sign_up(
        self,
        context: TransactionContext,
        request: Bank.SignUpRequest,
    ) -> None:
        await Customer.sign_up(context, request.customer_id)

        await SortedMap.ref(self.state.customer_ids_map_id).insert(
            context,
            entries={str(uuid7()): request.customer_id.encode()},
        )

    async def all_customer_ids(
        self,
        context: ReaderContext,
    ) -> Bank.AllCustomerIdsResponse:
        customer_ids_map = SortedMap.ref(self.state.customer_ids_map_id)
        customer_ids = await customer_ids_map.range(context, limit=32)

        assert isinstance(customer_ids, Message)

        return Bank.AllCustomerIdsResponse(
            customer_ids=[
                entry.value.decode() for entry in customer_ids.entries
            ]
        )

    async def transfer(
        self,
        context: TransactionContext,
        request: Bank.TransferRequest,
    ) -> None:
        from_account = Account.ref(request.from_account_id)
        to_account = Account.ref(request.to_account_id)

        await from_account.withdraw(context, amount=request.amount)
        await to_account.deposit(context, amount=request.amount)

    async def open_customer_account(
        self,
        context: TransactionContext,
        request: Bank.OpenCustomerAccountRequest,
    ) -> None:
        await Customer.ref(request.customer_id).open_account(
            context,
            initial_deposit=request.initial_deposit,
        )

    async def account_balances(
        self,
        context: ReaderContext,
    ) -> Bank.AccountBalancesResponse:
        # Get the first "page" of customer IDs (32 entries).
        customer_ids_map = SortedMap.ref(self.state.customer_ids_map_id)
        customer_ids = await customer_ids_map.range(context, limit=32)

        assert isinstance(customer_ids, Message)

        async def customer_accounts(customer_id: str):
            # We get a Protobuf message back, so we need to convert it
            # to a proper Pydantic type.
            customer_balance = await Customer.ref(
                customer_id,
            ).balances(context)

            assert isinstance(customer_balance, Message)

            return CustomerAccounts(
                customer_id=customer_id,
                accounts=[
                    CustomerAccount(
                        account_id=entry.account_id, balance=entry.balance
                    ) for entry in customer_balance.balances
                ],
            )

        all_customer_balances: list[CustomerAccounts] = await asyncio.gather(
            *[
                customer_accounts(entry.value.decode())
                for entry in customer_ids.entries
            ]
        )

        return Bank.AccountBalancesResponse(balances=all_customer_balances)
