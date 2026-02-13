import { Application, Reboot } from "@reboot-dev/reboot";
import { strict as assert } from "node:assert";
import { test } from "node:test";
import { Account } from "../../api/bank/v1/account_rbt.js";
import { Bank } from "../../api/bank/v1/bank_rbt.js";
import { OverdraftError } from "../../api/bank/v1/errors_pb.js";
import { AccountServicer } from "../src/account_servicer.js";
import { BankServicer } from "../src/bank_servicer.js";

function reportErrorToUser(errorMessage: string): void {
  // This is a dummy function for use in documentation code snippets.
}

async function performErroringWithdrawal(context: any): Promise<void> {
  const accountId = "account-nodejs";

  const [account] = await Account.open(context, accountId, {
    customerName: "Tony",
  });

  try {
    await account.withdraw(context, { amount: BigInt(65) });
  } catch (e) {
    if (e instanceof Account.WithdrawAborted) {
      if (e.error instanceof OverdraftError) {
        const { amount } = e.error;
        reportErrorToUser(
          `Your withdrawal could not be processed due to insufficient funds. ` +
            `Your account balance is less than the requested amount by ${amount} dollars.`
        );
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
      new Application({ servicers: [BankServicer, AccountServicer] })
    );
  });

  t.after(async () => {
    await rbt.stop();
  });

  await t.test("Sign Up", async (t) => {
    const context = rbt.createExternalContext("test");

    const bank = Bank.ref("bank-nodejs");

    const response = await bank
      .idempotently()
      .signUp(context, { customerName: "Initial User" });

    assert(response.accountId.length > 0);
  });
});

test("Test Bank Error Handling", async (t) => {
  let rbt: Reboot;

  t.before(async () => {
    rbt = new Reboot();
    await rbt.start();
    await rbt.up(
      new Application({ servicers: [BankServicer, AccountServicer] })
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
        e.error instanceof OverdraftError,
        "Expected an OverdraftError to be thrown"
      );
    }
  });
});
