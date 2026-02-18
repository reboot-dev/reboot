import { Application, Reboot } from "@reboot-dev/reboot";
import { strict as assert } from "node:assert";
import test from "node:test";
import {
  MainTestServicer,
  SecondaryTestServicer,
  SHARED_STATE_ID,
} from "./servicer.js";
import { MainTest } from "./servicer_api_rbt.js";

test("Test Zod Service", async (t) => {
  await t.test("`Reader` and `Writer` in `Transaction`", async (t) => {
    const rbt = new Reboot();
    await rbt.start();

    t.after(async () => {
      await rbt.stop();
    });

    await rbt.up(
      new Application({ servicers: [MainTestServicer, SecondaryTestServicer] }),
      {
        localEnvoy: true,
      }
    );

    const context = rbt.createExternalContext("test");

    const mainTest = MainTest.ref(SHARED_STATE_ID);

    await mainTest.transaction(context, {
      mainTestData: "main data",
      secondaryTestData: ["secondary", "data"],
    });

    const data = await mainTest.getData(context, {});

    assert.deepStrictEqual(data, {
      mainTestData: "main data",
      secondaryTestData: ["secondary", "data"],
    });
  });
});
