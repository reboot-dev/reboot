import { Application, Reboot } from "@reboot-dev/reboot";
import { strict as assert } from "node:assert";
import test from "node:test";
import { COUNTER_ID, CounterServicer } from "./servicer.js";
import { Counter } from "./servicer_api_rbt.js";

// How many transactions to run at the same time against the one state.
const CONCURRENCY = 20;

test("Concurrent transactions on one state", async (t) => {
  await t.test("none of their writes may be lost", async (t) => {
    const rbt = new Reboot();
    await rbt.start();

    t.after(async () => {
      await rbt.stop();
    });

    await rbt.up(new Application({ servicers: [CounterServicer] }), {
      localEnvoy: true,
    });

    const context = rbt.createExternalContext("test");
    const counter = Counter.ref(COUNTER_ID);

    const responses = await Promise.all(
      Array.from({ length: CONCURRENCY }, () =>
        counter.transactionallyIncrement(context, {})
      )
    );

    // Every transaction that reported success must have produced a
    // distinct count: two of them handing back the same count means
    // one of them was lost.
    const counts = responses
      .map((response) => response.count)
      .sort((a, b) => a - b);
    assert.deepStrictEqual(
      counts,
      Array.from({ length: CONCURRENCY }, (_, index) => index + 1)
    );

    const response = await counter.get(context, {});
    assert.equal(response.count, CONCURRENCY);
  });
});
