import {
  allow,
  Application,
  Reboot,
  ReaderContext,
  TransactionContext,
  WriterContext,
} from "@reboot-dev/reboot";
import { strict as assert } from "node:assert";
import test from "node:test";
import { Account, Bank } from "./transactions_rbt.js";

const accountServicer = Account.servicer({
  authorizer: () => {
    return allow();
  },

  open: async (
    context: WriterContext,
    state: Account.State,
    request: Account.OpenRequest
  ): Promise<[Account.State, Account.PartialOpenResponse]> => {
    return [state, {}];
  },

  balance: async (
    context: ReaderContext,
    state: Account.State,
    request: Account.BalanceRequest
  ): Promise<Account.PartialBalanceResponse> => {
    return { amount: state.balance };
  },

  deposit: async (
    context: WriterContext,
    state: Account.State,
    request: Account.DepositRequest
  ): Promise<[Account.State, Account.PartialDepositResponse]> => {
    state.balance += request.amount;
    return [state, {}];
  },

  withdraw: async (
    context: WriterContext,
    state: Account.State,
    request: Account.WithdrawRequest
  ): Promise<[Account.State, Account.PartialWithdrawResponse]> => {
    state.balance -= request.amount;
    return [state, {}];
  },
});

const bankServicer = Bank.servicer({
  authorizer: () => {
    return allow();
  },

  create: async (
    context: WriterContext,
    state: Bank.State,
    request: Bank.CreateRequest
  ): Promise<[Bank.State, Bank.PartialCreateResponse]> => {
    return [state, {}];
  },

  transfer: async (
    context: TransactionContext,
    state: Bank.State,
    request: Bank.TransferRequest
  ): Promise<[Bank.State, Bank.PartialTransferResponse]> => {
    const fromAccount = Account.ref(request.fromAccountId);
    const toAccount = Account.ref(request.toAccountId);

    await fromAccount.withdraw(context, { amount: request.amount });
    await toAccount.deposit(context, { amount: request.amount });

    return [state, {}];
  },
});

// Validates the `transaction` method snippet used in
// `documentation/docs/learn_more/implement/transactions.mdx` by
// transferring money between two accounts and checking the balances.
test("transactions", async (t) => {
  let rbt: Reboot;
  t.before(async () => {
    rbt = new Reboot();
    await rbt.start();
    await rbt.up(
      new Application({ servicers: [accountServicer, bankServicer] })
    );
  });
  t.after(async () => {
    await rbt.stop();
  });

  await t.test("transfer", async (t) => {
    const context = rbt.createExternalContext("test");

    const [bank] = await Bank.create(context, "bank");
    const [fromAccount] = await Account.open(context, "alice");
    const [toAccount] = await Account.open(context, "bob");

    await fromAccount.deposit(context, { amount: 100 });

    await bank.transfer(context, {
      fromAccountId: "alice",
      toAccountId: "bob",
      amount: 60,
    });

    assert.equal((await fromAccount.balance(context)).amount, 40);
    assert.equal((await toAccount.balance(context)).amount, 60);
  });
});
