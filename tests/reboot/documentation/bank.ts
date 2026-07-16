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
import { Account, Bank, Counter } from "./bank_rbt.js";

const accountServicer = Account.servicer({
  authorizer: () => {
    return allow();
  },

  open: async (
    context: WriterContext,
    state: Account.State,
    request: Account.OpenRequest
  ): Promise<[Account.State, Account.PartialOpenResponse]> => {
    state.customerName = request.customerName;

    return [state, {}];
  },

  getId: async (
    context: ReaderContext,
    state: Account.State,
    request: Account.GetIdRequest
  ): Promise<Account.PartialGetIdResponse> => {
    const currentId = context.stateId;
    return { id: currentId };
  },

  balance: async (
    context: ReaderContext,
    state: Account.State,
    request: Account.BalanceRequest
  ): Promise<Account.PartialBalanceResponse> => {
    return { balance: state.balance };
  },

  deposit: async (
    context: WriterContext,
    state: Account.State,
    request: Account.DepositRequest
  ): Promise<[Account.State, Account.PartialDepositResponse]> => {
    state.balance += request.amount;

    return [state, { updatedBalance: state.balance }];
  },

  withdraw: async (
    context: WriterContext,
    state: Account.State,
    request: Account.WithdrawRequest
  ): Promise<[Account.State, Account.PartialWithdrawResponse]> => {
    state.balance -= request.amount;

    return [state, { updatedBalance: state.balance }];
  },
});

const counterServicer = Counter.servicer({
  authorizer: () => {
    return allow();
  },

  increment: async (
    context: WriterContext,
    state: Counter.State,
    request: Counter.IncrementRequest
  ): Promise<[Counter.State, Counter.PartialIncrementResponse]> => {
    state.value += 1;

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

  signUp: async (
    context: TransactionContext,
    state: Bank.State,
    request: Bank.SignUpRequest
  ): Promise<[Bank.State, Bank.PartialSignUpResponse]> => {
    const [account, response] = await Account.open(context, {
      customerName: request.customerName,
    });

    const newAccountId = account.stateId;

    // Transactions like writers can alter state directly.
    state.accountIds.push(newAccountId);

    return [state, { accountId: newAccountId }];
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

export class AccountServicer extends Account.Servicer {
  authorizer() {
    return allow();
  }

  async open(
    context: WriterContext,
    request: Account.OpenRequest
  ): Promise<Account.PartialOpenResponse> {
    this.state.customerName = request.customerName;

    return {};
  }

  async getId(
    context: ReaderContext,
    request: Account.GetIdRequest
  ): Promise<Account.PartialGetIdResponse> {
    const currentId = context.stateId;
    return { id: currentId };
  }

  async balance(
    context: ReaderContext,
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
  ): Promise<Account.PartialWithdrawResponse> {
    this.state.balance -= request.amount;

    return { updatedBalance: this.state.balance };
  }
}

export class BankServicer extends Bank.Servicer {
  authorizer() {
    return allow();
  }

  async create(
    context: WriterContext,
    request: Bank.CreateRequest
  ): Promise<Bank.PartialCreateResponse> {
    return {};
  }

  async signUp(
    context: TransactionContext,
    request: Bank.SignUpRequest
  ): Promise<Bank.PartialSignUpResponse> {
    const [account] = await Account.open(context, {
      customerName: request.customerName,
    });

    const newAccountId = account.stateId;

    // Transactions like writers can alter state directly.
    this.state.accountIds.push(newAccountId);

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

// Validates the servicer method snippets used in the
// `documentation/docs/learn_more/implement/` pages by signing up
// accounts, transferring money, and checking the balances.
test("bank", async (t) => {
  let rbt: Reboot;
  t.before(async () => {
    rbt = new Reboot();
    await rbt.start();
    await rbt.up(
      new Application({
        servicers: [accountServicer, bankServicer, counterServicer],
      })
    );
  });
  t.after(async () => {
    await rbt.stop();
  });

  await t.test("sign up, deposit, transfer, balance", async (t) => {
    const context = rbt.createExternalContext("test");

    const [bank] = await Bank.create(context, "bank");

    const { accountId: fromAccountId } = await bank.signUp(context);
    const { accountId: toAccountId } = await bank.signUp(context);

    const fromAccount = Account.ref(fromAccountId);
    const toAccount = Account.ref(toAccountId);

    const { updatedBalance } = await fromAccount.deposit(context, {
      amount: 100,
    });
    assert.equal(updatedBalance, 100);

    await bank.transfer(context, {
      fromAccountId,
      toAccountId,
      amount: 60,
    });

    assert.equal((await fromAccount.balance(context)).balance, 40);
    assert.equal((await toAccount.balance(context)).balance, 60);

    assert.equal((await fromAccount.getId(context)).id, fromAccountId);
  });

  await t.test("idempotent open", async (t) => {
    const context = rbt.createExternalContext("test-idempotent-open", {
      idempotencySeed: "123e4567-e89b-12d3-a456-426614174000",
    });

    const [account, response] = await Account.idempotently().open(context, {
      customerName: "Riley",
    });

    assert.notEqual(account.stateId, "");
  });

  await t.test("implicit construction", async (t) => {
    const context = rbt.createExternalContext("test-implicit-construction");

    const id = "my-counter";

    const counter = Counter.ref(id);

    // Will implicitly construct if not already constructed!
    await counter.increment(context);

    await counter.increment(context);
  });
});
