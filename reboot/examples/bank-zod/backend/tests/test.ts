// TO RUN THIS TEST:
// npx tsx backend/tests/test.ts

import { Application, Reboot } from "@reboot-dev/reboot";
import sortedMap from "@reboot-dev/reboot-std/collections/v1/sorted_map.js";
import { strict as assert } from "node:assert";
import { test } from "node:test";
import { Account } from "../../api/bank/v1/account_rbt.js";
import { Bank } from "../../api/bank/v1/bank_rbt.js";
import { Customer } from "../../api/bank/v1/customer_rbt.js";
import { AccountServicer } from "../src/account.js";
import { BankServicer } from "../src/bank.js";
import { CustomerServicer } from "../src/customer.js";

function reportErrorToUser(errorMessage: string): void {
  // This is a dummy function for use in documentation code snippets.
}

async function performErroringWithdrawal(context: any): Promise<void> {
  const accountId = "account-nodejs";

  const [account] = await Account.open(context, accountId, {});

  try {
    await account.withdraw(context, { amount: 65 });
  } catch (e) {
    if (e instanceof Account.WithdrawAborted) {
      switch (e.error.type) {
        case "OverdraftError":
          const { amount } = e.error;
          reportErrorToUser(
            `Your withdrawal could not be processed due to insufficient funds. ` +
              `Your account balance is less than the requested amount by ${amount} dollars.`
          );
          break;
        default:
          throw new Error(`Unexpected error '${e.error.type}'`);
      }
    }
    throw e;
  }
}

test("Calling Bank.SignUp", async (t) => {
  let rbt: Reboot;

  t.before(async () => {
    rbt = new Reboot();
    await rbt.start();
    await rbt.up(
      new Application({
        servicers: [
          BankServicer,
          AccountServicer,
          CustomerServicer,
          ...sortedMap.servicers(),
        ],
      })
    );
  });

  t.after(async () => {
    await rbt.stop();
  });

  await t.test("Sign Up", async (t) => {
    const context = rbt.createExternalContext("test");

    const [bank] = await Bank.create(context, "bank-nodejs");

    const response = await bank.signUp(context, {
      customerId: "test@reboot.dev",
    });
  });
});

test("Test Bank Error Handling", async (t) => {
  let rbt: Reboot;

  t.before(async () => {
    rbt = new Reboot();
    await rbt.start();
    await rbt.up(
      new Application({
        servicers: [
          BankServicer,
          AccountServicer,
          CustomerServicer,
          ...sortedMap.servicers(),
        ],
      })
    );
  });

  t.after(async () => {
    await rbt.stop();
  });

  await t.test("Withdraw Error Handling", async (t) => {
    const context = rbt.createExternalContext("test");

    // Assert that the withdrawal throws an error
    try {
      await performErroringWithdrawal(context);

      // If no error is thrown, explicitly fail the test
      throw new Error(
        "Expected Account.WithdrawAborted to be thrown, but no error was thrown"
      );
    } catch (e) {
      assert(
        e instanceof Account.WithdrawAborted,
        `Expected Account.WithdrawAborted to be thrown: ${e}`
      );

      assert(
        e.error.type === "OverdraftError",
        `Expected an OverdraftError to be thrown: ${e.error.type}`
      );
    }
  });
});

test("Transfer with Customer", async (t) => {
  let rbt: Reboot;

  // Overwrite the 'open' method to not apply interest to make the test
  // be consistent.
  class AccountServicerNoInterest extends AccountServicer {
    async open(context, state, request) {}
  }

  t.before(async () => {
    rbt = new Reboot();
    await rbt.start();
    await rbt.up(
      new Application({
        servicers: [
          BankServicer,
          AccountServicerNoInterest,
          CustomerServicer,
          ...sortedMap.servicers(),
        ],
      })
    );
  });

  t.after(async () => {
    await rbt.stop();
  });

  await t.test("Sign Up", async (t) => {
    const context = rbt.createExternalContext("test");

    const [bank] = await Bank.create(context, "bank-nodejs");

    const CUSTOMER_ID_1 = "test@reboot.dev";
    const CUSTOMER_ID_2 = "test2@reboot.dev";

    await bank.signUp(context, {
      customerId: CUSTOMER_ID_1,
    });

    const { accountId: accountId1 } = await Customer.ref(
      CUSTOMER_ID_1
    ).openAccount(context, {
      initialDeposit: 1000,
    });

    await bank.signUp(context, {
      customerId: CUSTOMER_ID_2,
    });

    const { accountId: accountId2 } = await Customer.ref(
      CUSTOMER_ID_2
    ).openAccount(context, {
      initialDeposit: 0,
    });

    await bank.transfer(context, {
      fromAccountId: accountId1,
      toAccountId: accountId2,
      amount: 1000,
    });

    const { amount: balance1 } = await Account.ref(accountId1).balance(context);

    assert(balance1 === 0, "Balance of account 1 should be 0 after transfer");

    const { amount: balance2 } = await Account.ref(accountId2).balance(context);

    assert(
      balance2 === 1000,
      "Balance of account 2 should be 1000 after transfer"
    );
  });
});
