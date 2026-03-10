import { Application, Reboot } from "@reboot-dev/reboot";
import { strict as assert } from "node:assert";
import test from "node:test";
import { TestServicer } from "./servicer.js";
import { Test } from "./servicer_api_rbt.js";

test("Test Zod Service", async (t) => {
  await t.test("`Reader` and `Writer` in `Transaction`", async (t) => {
    const rbt = new Reboot();
    await rbt.start();
    t.after(async () => {
      await rbt.stop();
    });
    await rbt.up(new Application({ servicers: [TestServicer] }), {
      localEnvoy: true,
    });

    const context = rbt.createExternalContext("test");

    const [test] = await Test.construct(context, {});

    await test.writer(context, {
      data: "initialize",
      previousLiteralValue: "option1",
    });

    // The `writer` is a constructor, so we won't validate the passed
    // state to the method and no defaults will be set yet, so we do an
    // extra call to `checkDefaults` to validate that defaults are set
    // correctly after the state is created.
    await test.checkDefaults(context, {});

    const readerResponse = await test.reader(context, {});

    const expectedReaderResponse = {
      data: "initialize",
      literalValue: "option1",
    };

    assert.deepStrictEqual(readerResponse, expectedReaderResponse);

    await test.writer(context, {
      data: "finalize",
      newLiteralValue: "option2",
      previousLiteralValue: "option1",
    });

    const finalReaderResponse = await test.reader(context, {});
    const expectedFinalReaderResponse = {
      data: "finalize",
      literalValue: "option2",
    };

    assert.deepStrictEqual(finalReaderResponse, expectedFinalReaderResponse);

    try {
      await test.transaction(context);
    } catch (aborted) {
      assert.ok(aborted instanceof Error);
      assert.ok(aborted.message.includes("Transaction must abort"));
    }
  });
});
