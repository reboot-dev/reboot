from bank.v1.proto.customer_rbt import Customer
from bank.v1.pydantic.bank_rbt import Bank
from bank.v1.pydantic.user import AccountBalance
from bank.v1.pydantic.user_rbt import User
from constants import SINGLETON_BANK_ID
from google.protobuf.message import Message
from reboot.aio.contexts import ReaderContext, TransactionContext


class UserServicer(User.Servicer):
    # No explicit authorizer: `User` is auto-constructed
    # `PER_USER_ID`, so the framework only routes calls whose caller
    # user-id matches the state-id, which is exactly the security
    # check we want here.

    async def _ensure_enrolled(self, context: TransactionContext) -> None:
        """Sign the user up with the bank as a customer, using their
        authenticated user id as the `customer_id`."""
        if self.state.customer_id:
            return
        assert context.auth is not None
        customer_id = context.auth.user_id
        assert customer_id is not None
        await Bank.ref(SINGLETON_BANK_ID).sign_up(
            context,
            customer_id=customer_id,
        )
        self.state.customer_id = customer_id

    async def enroll(
        self,
        context: TransactionContext,
    ) -> None:
        await self._ensure_enrolled(context)

    async def open_account(
        self,
        context: TransactionContext,
        request: User.OpenAccountRequest,
    ) -> User.OpenAccountResponse:
        await self._ensure_enrolled(context)
        response = await Customer.ref(self.state.customer_id).open_account(
            context,
            initial_deposit=request.initial_deposit,
        )
        assert isinstance(response, Message)
        return User.OpenAccountResponse(account_id=response.account_id)

    async def balances(
        self,
        context: ReaderContext,
    ) -> User.BalancesResponse:
        if not self.state.customer_id:
            return User.BalancesResponse(balances=[])
        response = await Customer.ref(self.state.customer_id).balances(
            context,
        )
        assert isinstance(response, Message)
        return User.BalancesResponse(
            balances=[
                AccountBalance(
                    account_id=balance.account_id,
                    balance=balance.balance,
                ) for balance in response.balances
            ]
        )
