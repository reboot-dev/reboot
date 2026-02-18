import { Value } from "@bufbuild/protobuf";
import { Application, Reboot } from "@reboot-dev/reboot";
import { Queue } from "@reboot-dev/reboot-std/collections/queue/v1";
import pubsub, { Topic } from "@reboot-dev/reboot-std/pubsub/v1";
import { strict as assert } from "node:assert";
import { test } from "node:test";

test("Use pubsub servicers", async (t) => {
  // These tests simply verify that we are properly exporting the PubSub
  // servicers to be used in typescript. They aren't meant to
  // thoroughly test any logic.

  let rbt: Reboot;
  t.beforeEach(async () => {
    rbt = new Reboot();
    await rbt.start();
  });
  t.afterEach(async () => {
    await rbt.stop();
  });

  await t.test("Interact with the Topic", async (t) => {
    await rbt.up(new Application({ servicers: pubsub.servicers() }));

    const context = rbt.createExternalContext("test", {
      appInternal: true,
    });

    const myTopic = Topic.ref("test-id");
    const myQueue = Queue.ref("receiving-queue");
    await myTopic.subscribe(context, {
      queueId: myQueue.stateId,
    });

    await myTopic.publish(context, { value: Value.fromJson("a message") });

    const { value } = await myQueue.dequeue(context);

    assert(
      value?.toJson() === "a message",
      `Expected to receive item "a message", but did not.`
    );
  });
});
