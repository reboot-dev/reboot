import { TransactionContext, allow } from "@reboot-dev/reboot";
import { Account } from "../../api/bank/v1/account_rbt.js";
import { Bank } from "../../api/bank/v1/bank_rbt.js";

function randomIntFromInterval(min: number, max: number): number {
  // Min / max inclusive.
  return Math.floor(Math.random() * (max - min + 1) + min);
}

export class BankServicer extends Bank.Servicer {
  authorizer() {
    return allow();
  }

  async PickNewAccountId(): Promise<string> {
    // Transactions normally observe state through Reader calls. However for
    // convenience, it is possible to do an inline read of the state of this
    // state machine, which is like calling a Reader that simply returns the
    // whole state of the state machine.

    while (true) {
      const newAccountId = String(randomIntFromInterval(1000000, 9999999));
      if (!this.state.accountIds.includes(newAccountId)) {
        return newAccountId;
      }
    }
  }

  async signUp(
    context: TransactionContext,
    request: Bank.SignUpRequest
  ): Promise<Bank.PartialSignUpResponse> {
    const newAccountId = await this.PickNewAccountId();

    // Transactions like writers can alter state directly.
    this.state.accountIds.push(newAccountId);

    // Let's go create the account.
    const [account, response] = await Account.open(context, newAccountId, {
      customerName: request.customerName,
    });

    return { accountId: newAccountId };
  }

  async transfer(
    context: TransactionContext,
    request: Bank.TransferRequest
  ): Promise<Bank.PartialTransferResponse> {
    const fromAccount = Account.ref(request.fromAccountId);
    const toAccount = Account.ref(request.toAccountId);

    await fromAccount.withdraw(context, { amount: request.amount });
    await toAccount.deposit(context, { amount: request.amount });

    return {};
  }
}
