import logging
import uuid
from bank.v1.account_rbt import Account
from bank.v1.bank_rbt import (
    Bank,
    SignUpRequest,
    SignUpResponse,
    TransferRequest,
    TransferResponse,
)
from reboot.aio.auth.authorizers import allow
from reboot.aio.contexts import TransactionContext

logging.basicConfig(level=logging.INFO)


class BankServicer(Bank.Servicer):

    def authorizer(self):
        return allow()

    async def sign_up(
        self,
        context: TransactionContext,
        request: SignUpRequest,
    ) -> SignUpResponse:
        # Generating an account ID so that we can demonstrate setting
        # the account ID explicitly. Alternatively you can just call
        # `construct()` without any args and Reboot will generate a
        # unique ID for you.
        new_account_id = str(uuid.uuid4())

        # Let's go create the account.
        account, _ = await Account.open(
            context,
            new_account_id,
            customer_name=request.customer_name,
        )

        # Transactions like writers can alter state directly.
        self.state.account_ids.append(account.state_id)

        return SignUpResponse(account_id=account.state_id)

    async def transfer(
        self,
        context: TransactionContext,
        request: TransferRequest,
    ) -> TransferResponse:
        from_account = Account.ref(request.from_account_id)
        to_account = Account.ref(request.to_account_id)

        await from_account.withdraw(context, amount=request.amount)
        await to_account.deposit(context, amount=request.amount)

        return TransferResponse()
