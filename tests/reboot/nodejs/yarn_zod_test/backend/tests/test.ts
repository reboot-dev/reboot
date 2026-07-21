// TO RUN THIS TEST:
// yarn run tsx backend/tests/test.ts

import { Application, Reboot } from "@reboot-dev/reboot";
import sortedMap from "@reboot-dev/reboot-std/collections/v1/sorted_map.js";
import { strict as assert } from "node:assert";
import { test } from "node:test";
import { Bank } from "../../api/bank/v1/bank_rbt.js";
import { AccountServicer } from "../src/account.js";
import { BankServicer } from "../src/bank.js";

test("Bank test", async (t) => {
  let rbt: Reboot;

  t.before(async () => {
    rbt = new Reboot();
    await rbt.start();
  });

  t.after(async () => {
    await rbt.stop();
  });

  await t.test("Sign Up and Create", async (t) => {
    await rbt.up(
      new Application({
        servicers: [BankServicer, AccountServicer, ...sortedMap.servicers()],
      })
    );

    const context = rbt.createExternalContext("test");

    // Calling a constructor transaction method, which will call a
    // writer method from inside the transaction.
    const [bank] = await Bank.factory.create(context);

    // Calling a common transaction method, which will call a writer
    // method from inside the transaction.
    await bank.signUp(context, {
      accountId: "test@reboot.dev",
      initialDeposit: 1000,
    });

    const response = await bank.accountBalances(context);

    // The account's scheduled `interest` task may tick between `signUp`
    // and this read, so the `balance` can be at or above the initial
    // deposit. Assert the deposit landed without depending on that
    // timing.
    assert.equal(response.balances.length, 1);
    const [account] = response.balances;
    assert.equal(account.accountId, "test@reboot.dev");
    assert.ok(account.balance >= 1000);
  });
});
