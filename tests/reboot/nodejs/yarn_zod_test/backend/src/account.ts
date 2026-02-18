import { allow, ReaderContext, WriterContext } from "@reboot-dev/reboot";
import { Account } from "../../api/bank/v1/account_rbt.js";

function random(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1) + min);
}

export const AccountServicer = Account.servicer({
  authorizer: () => {
    return allow();
  },

  balance: async (
    context: ReaderContext,
    state: Account.State,
    request: Account.BalanceRequest
  ): Promise<Account.BalanceResponse> => {
    return { amount: state.balance };
  },

  deposit: async (
    context: WriterContext,
    state: Account.State,
    request: Account.DepositRequest
  ): Promise<[Account.State]> => {
    state.balance += request.amount;
    return [state];
  },

  withdraw: async (
    context: WriterContext,
    state: Account.State,
    request: Account.WithdrawRequest
  ): Promise<[Account.State]> => {
    state.balance -= request.amount;
    if (state.balance < 0) {
      throw new Account.WithdrawAborted({
        type: "OverdraftError",
        amount: Number(-state.balance),
      });
    }
    return [state];
  },

  open: async (
    context: WriterContext,
    state: Account.State,
    request: Account.OpenRequest
  ): Promise<[Account.State]> => {
    // Schedule infinite "interest" task.
    await Account.ref()
      .schedule({ when: new Date(Date.now() + 1000) })
      .interest(context);
    return [state];
  },

  interest: async (
    context: WriterContext,
    state: Account.State,
    request: Account.InterestRequest
  ): Promise<[Account.State]> => {
    state.balance += 1;

    await Account.ref()
      .schedule({ when: new Date(Date.now() + random(1, 4) * 1000) })
      .interest(context);

    return [state];
  },
});
