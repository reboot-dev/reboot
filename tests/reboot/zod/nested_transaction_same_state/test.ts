import { Application, Reboot } from "@reboot-dev/reboot";
import { strict as assert } from "node:assert";
import test from "node:test";
import {
  NESTED_WROTE,
  NOT_OBSERVED,
  NOT_WRITTEN,
  NestedServicer,
  OUTER_WROTE,
  WRITER_WROTE,
} from "./servicer.js";
import { Nested } from "./servicer_api_rbt.js";

// A transaction, a transaction nested in it on the same state
// instance, and a writer the outer transaction calls afterwards all
// write one field each. Every assertion names both the call whose
// write is at stake and the call doing the observing, so a failure
// says which write was lost and who failed to see it.
test("Nested transaction on the same state", async (t) => {
  const rbt = new Reboot();
  await rbt.start();

  t.after(async () => {
    await rbt.stop();
  });

  await rbt.up(new Application({ servicers: [NestedServicer] }), {
    localEnvoy: true,
  });

  const context = rbt.createExternalContext("test");

  // The baseline: a writer called by a transaction updates the
  // transaction's state. This holds with no nested transaction in
  // play, and must keep holding once there is one.
  await t.test("`Writer` in `Transaction`, nothing nested", async (t) => {
    const nested = Nested.ref("writer-only");

    const response = await nested.outerTransaction(context, {
      callNestedTransaction: false,
      callWriter: true,
    });

    assert.deepStrictEqual(response, {
      outersWriteSeenByNested: NOT_OBSERVED,
      nestedsWriteSeenByOuter: NOT_WRITTEN,
      writersWriteSeenByOuter: WRITER_WROTE,
      outersWriteSeenByOuter: OUTER_WROTE,
    });

    assert.deepStrictEqual(await nested.get(context, {}), {
      writtenByOuter: OUTER_WROTE,
      writtenByNested: NOT_WRITTEN,
      writtenByWriter: WRITER_WROTE,
    });
  });

  // A nested transaction on the same state instance sees what its
  // caller wrote, and its own write reaches both the caller and the
  // committed state.
  await t.test("`Transaction` in `Transaction`", async (t) => {
    const nested = Nested.ref("nested");

    const response = await nested.outerTransaction(context, {
      callNestedTransaction: true,
      callWriter: false,
    });

    assert.deepStrictEqual(response, {
      outersWriteSeenByNested: OUTER_WROTE,
      nestedsWriteSeenByOuter: NESTED_WROTE,
      writersWriteSeenByOuter: NOT_OBSERVED,
      outersWriteSeenByOuter: OUTER_WROTE,
    });

    assert.deepStrictEqual(await nested.get(context, {}), {
      writtenByOuter: OUTER_WROTE,
      writtenByNested: NESTED_WROTE,
      writtenByWriter: NOT_WRITTEN,
    });
  });

  // A writer called once a nested transaction has returned still
  // updates its caller's state, and every write survives to the
  // commit.
  await t.test("`Writer` after a nested `Transaction`", async (t) => {
    const nested = Nested.ref("nested-then-writer");

    const response = await nested.outerTransaction(context, {
      callNestedTransaction: true,
      callWriter: true,
    });

    assert.deepStrictEqual(response, {
      outersWriteSeenByNested: OUTER_WROTE,
      nestedsWriteSeenByOuter: NESTED_WROTE,
      writersWriteSeenByOuter: WRITER_WROTE,
      outersWriteSeenByOuter: OUTER_WROTE,
    });

    assert.deepStrictEqual(await nested.get(context, {}), {
      writtenByOuter: OUTER_WROTE,
      writtenByNested: NESTED_WROTE,
      writtenByWriter: WRITER_WROTE,
    });
  });
});
