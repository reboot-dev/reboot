import { Value } from "@bufbuild/protobuf";
import { Application, Reboot } from "@reboot-dev/reboot";
import queue, { Queue } from "@reboot-dev/reboot-std/collections/queue/v1";
import { strict as assert } from "node:assert";
import { test } from "node:test";

test("Use queue servicers", async (t) => {
  // These tests simply verify that we are properly exporting the Queue
  // servicers to be used in typescript. They aren't meant to
  // thoroughly test any logic.

  let rbt: Reboot;
  t.beforeEach(async () => {
    rbt = new Reboot();
    await rbt.start();
    await rbt.up(new Application({ servicers: queue.servicers() }));
  });
  t.afterEach(async () => {
    await rbt.stop();
  });

  await t.test("Interact with the Queue", async (t) => {
    const context = rbt.createExternalContext("test", {
      appInternal: true,
    });

    const myQueue = await Queue.ref("test-id");
    await myQueue.enqueue(context, {
      items: [
        { value: Value.fromJson(1) },
        { value: Value.fromJson(3) },
        { value: Value.fromJson(303) },
      ],
    });

    let bulkItems = await myQueue.dequeue(context, { bulk: true, atMost: 2 });

    assert(bulkItems.items.length === 2, `Expected 2 items to be dequeued.`);
    assert(
      bulkItems.items[0].value?.toJson() === 1,
      `Expected first dequeued item to be 1, but it was not.`
    );
    assert(
      bulkItems.items[1].value?.toJson() === 3,
      `Expected second dequeued item to be 3, but it was not.`
    );

    let lastItem = await myQueue.dequeue(context);

    assert(
      lastItem.value?.toJson() === 303,
      `Expected last dequeued item to be 303, but it was not.`
    );
  });
});
