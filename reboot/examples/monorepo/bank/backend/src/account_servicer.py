import logging
from bank.v1.account_rbt import (
    Account,
    BalanceRequest,
    BalanceResponse,
    DepositRequest,
    DepositResponse,
    OpenRequest,
    OpenResponse,
    WelcomeEmailRequest,
    WelcomeEmailResponse,
    WithdrawRequest,
    WithdrawResponse,
)
from bank.v1.errors_pb2 import OverdraftError
from reboot.aio.auth.authorizers import allow
from reboot.aio.contexts import ReaderContext, WriterContext

logging.basicConfig(level=logging.INFO)


class AccountServicer(Account.Servicer):

    def authorizer(self):
        return allow()

    async def open(
        self,
        context: WriterContext,
        request: OpenRequest,
    ) -> OpenResponse:
        # Since this is a constructor, we are setting the initial state of the
        # state machine.
        self.state.customer_name = request.customer_name

        # We'd like to send the new customer a welcome email, but that can be
        # done asynchronously, so we schedule it as a task.
        task_id = await self.ref().schedule().welcome_email(context)

        return OpenResponse(welcome_email_task_id=task_id)

    async def balance(
        self,
        context: ReaderContext,
        request: BalanceRequest,
    ) -> BalanceResponse:
        return BalanceResponse(balance=self.state.balance)

    async def deposit(
        self,
        context: WriterContext,
        request: DepositRequest,
    ) -> DepositResponse:
        self.state.balance += request.amount
        return DepositResponse(updated_balance=self.state.balance)

    async def withdraw(
        self,
        context: WriterContext,
        request: WithdrawRequest,
    ) -> WithdrawResponse:
        updated_balance = self.state.balance - request.amount
        if updated_balance < 0:
            raise Account.WithdrawAborted(
                OverdraftError(amount=-updated_balance)
            )
        self.state.balance = updated_balance
        return WithdrawResponse(updated_balance=updated_balance)

    async def welcome_email(
        self,
        context: WriterContext,
        request: WelcomeEmailRequest,
    ) -> WelcomeEmailResponse:
        message_body = (
            f"Hello {self.state.customer_name},\n"
            "\n"
            "We are delighted to welcome you as a customer.\n"
            f"Your new account has been opened, and has ID '{context.state_id}'.\n"
            "\n"
            "Best regards,\n"
            "Your Bank"
        )

        await send_email(message_body)

        return WelcomeEmailResponse()


async def send_email(message_body: str):
    # We're not actually going to send an email here; but you could!
    #
    # If you do send real emails, please be sure to use an idempotent API, since
    # (like in any well-written distributed system) this call may be retried in
    # case of errors.
    logging.info(f"Sending email:\n====\n{message_body}\n====")
