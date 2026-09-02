import { Application, Reboot } from "@reboot-dev/reboot";
import { strict as assert } from "node:assert";
import test from "node:test";
import {
  COUNTER_ID,
  CounterServicer,
  parkedIncrementIsParticipant,
  parkedIncrementMayWrite,
  rendezvous,
} from "./servicer.js";
import { Counter } from "./servicer_api_rbt.js";

// How many transactions to run at the same time against one state.
const CONCURRENCY = 20;

// Brings up an application with one constructed `COUNTER_ID`, which is
// what every test here starts from. The caller owns stopping `rbt`.
const setUp = async () => {
  const rbt = new Reboot();
  await rbt.start();

  await rbt.up(new Application({ servicers: [CounterServicer] }), {
    localEnvoy: true,
  });

  const context = rbt.createExternalContext("test");

  await Counter.create(context, COUNTER_ID, {});

  return { rbt, context };
};

test("Concurrent transactions on one state", async (t) => {
  // Nested transactions take their participant's lock in shared mode,
  // so many of them may be running inside one state at the same time.
  // The rendezvous only opens once every one of them has arrived, so
  // this can only finish if they really do overlap.
  //
  // The rendezvous counts the names it has seen rather than the
  // arrivals, so a driver whose transaction aborted and was retried is
  // still one arrival.
  await t.test("nested transactions on one state are parallel", async (t) => {
    const { rbt, context } = await setUp();

    t.after(async () => {
      await rbt.stop();
    });

    const driverIds = Array.from(
      { length: CONCURRENCY },
      (_, index) => `driver-${index}`
    );
    await Promise.all(
      driverIds.map((driverId) => Counter.create(context, driverId, {}))
    );

    rendezvous.reset(CONCURRENCY);

    await Promise.all(
      driverIds.map((driverId) =>
        Counter.ref(driverId).callInner(context, { peerId: COUNTER_ID })
      )
    );

    assert.equal(rendezvous.arrived.size, CONCURRENCY);
  });

  // A transaction's write survives another transaction on the same
  // state finishing first.
  //
  // Both of them are nested, so neither carries an idempotency key and
  // both are participants on `COUNTER_ID` at the same time. The test
  // drives them into this order:
  //
  //   1. `parkedIncrement` becomes a participant and then stops,
  //      having written nothing yet.
  //   2. `touch` becomes a participant on that same state and runs all
  //      the way to completion, writing nothing.
  //   3. `parkedIncrement` is released and does its increment.
  //
  // The count must then be 1. Whatever the runtime keeps per state for
  // the duration of a call has to be kept per transaction as well:
  // otherwise step 2 tears down what step 1 set up, step 3 writes into
  // something nothing else reads, and the increment is lost with no
  // error reported anywhere.
  await t.test("a finishing transaction keeps another's write", async (t) => {
    const { rbt, context } = await setUp();

    t.after(async () => {
      await rbt.stop();
    });

    await Counter.create(context, "writing-driver", {});
    await Counter.create(context, "touching-driver", {});

    parkedIncrementIsParticipant.reset();
    parkedIncrementMayWrite.reset();

    // Becomes a participant on the state, then parks before writing
    // anything.
    const writing = Counter.ref("writing-driver").callParkedIncrement(context, {
      peerId: COUNTER_ID,
    });
    await parkedIncrementIsParticipant.opened;

    // Becomes a participant on the same state and runs all the way to
    // completion while the first transaction is still in flight.
    await Counter.ref("touching-driver").callTouch(context, {
      peerId: COUNTER_ID,
    });

    // Only now let the first transaction do its write.
    parkedIncrementMayWrite.open();
    await writing;

    const response = await Counter.ref(COUNTER_ID).get(context, {});
    assert.equal(response.count, 1);
  });
});
