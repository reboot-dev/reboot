import { ReaderContext, WriterContext, allow } from "@reboot-dev/reboot";
import { WithdrawResponse } from "../../api/bank/v1/account_pb.js";
import { Account } from "../../api/bank/v1/account_rbt.js";
import { OverdraftError } from "../../api/bank/v1/errors_pb.js";

export class AccountServicer extends Account.Servicer {
  authorizer() {
    return allow();
  }

  async open(
    context: WriterContext,
    request: Account.OpenRequest
  ): Promise<Account.PartialOpenResponse> {
    // Since this is a constructor, we are setting the initial state of the
    // state machine.
    this.state.customerName = request.customerName;

    // We'd like to send the new customer a welcome email, but that can be
    // done asynchronously, so we schedule it as a task.
    const taskId = await this.ref().schedule().welcomeEmail(context);

    return { welcomeEmailTaskId: taskId };
  }

  async balance(
    _context: ReaderContext,
    request: Account.BalanceRequest
  ): Promise<Account.PartialBalanceResponse> {
    return { balance: this.state.balance };
  }

  async deposit(
    context: WriterContext,
    request: Account.DepositRequest
  ): Promise<Account.PartialDepositResponse> {
    this.state.balance += request.amount;

    return { updatedBalance: this.state.balance };
  }

  async withdraw(
    context: WriterContext,
    request: Account.WithdrawRequest
  ): Promise<Account.WithdrawResponse> {
    const updatedBalance = this.state.balance - request.amount;
    if (updatedBalance < 0) {
      throw new Account.WithdrawAborted(
        new OverdraftError({
          amount: Number(-updatedBalance),
        })
      );
    }

    this.state.balance = updatedBalance;

    return new WithdrawResponse({ updatedBalance });
  }

  async welcomeEmail(
    context: WriterContext,
    request: Account.WelcomeEmailRequest
  ): Promise<Account.PartialWelcomeEmailResponse> {
    const messageBody = `
      Hello ${this.state.customerName},

      We are delighted to welcome you as a customer.
      Your new account has been opened, and has ID '${context.stateId}'.

      Best regards,
      Your Bank
    `;

    await sendEmail({ messageBody });

    return {};
  }
}

const sendEmail = ({ messageBody }: { messageBody: string }) => {
  // We're not actually going to send an email here; but you could!
  //
  // If you do send real emails, please be sure to use an idempotent API, since
  // (like in any well-written distributed system) this call may be retried in
  // case of errors.
  console.log(`
    Sending email:

    ${messageBody}
  `);
};
