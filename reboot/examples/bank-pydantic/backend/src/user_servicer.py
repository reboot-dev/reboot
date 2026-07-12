from bank.v1.bank_rbt import Bank
from bank.v1.customer_rbt import Customer
from bank.v1.user import AccountBalance
from bank.v1.user_rbt import User
from constants import SINGLETON_BANK_ID
from reboot.aio.contexts import ReaderContext, TransactionContext


class UserServicer(User.Servicer):
    # No explicit authorizer: `User` is auto-constructed
    # `PER_USER_ID`, so the framework only routes calls whose caller
    # user-id matches the state-id, which is exactly the security
    # check we want here.

    async def create(
        self,
        context: TransactionContext,
    ) -> None:
        """Sign the user up with the bank as a customer. `User` is
        auto-constructed when a user first signs in, so every
        signed-in user is a bank customer, with their user id (this
        state's id) as their `customer_id`."""
        await Bank.ref(SINGLETON_BANK_ID).sign_up(
            context,
            customer_id=context.state_id,
        )

    async def open_account(
        self,
        context: TransactionContext,
        request: User.OpenAccountRequest,
    ) -> User.OpenAccountResponse:
        response = await Customer.ref(context.state_id).open_account(
            context,
            initial_deposit=request.initial_deposit,
        )
        return User.OpenAccountResponse(account_id=response.account_id)

    async def balances(
        self,
        context: ReaderContext,
    ) -> User.BalancesResponse:
        response = await Customer.ref(context.state_id).balances(context)
        return User.BalancesResponse(
            balances=[
                AccountBalance(
                    account_id=balance.account_id,
                    balance=balance.balance,
                ) for balance in response.balances
            ]
        )
