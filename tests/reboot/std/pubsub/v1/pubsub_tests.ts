// `eslint` disabled to preserve separation of imports for documentation.
import { Value } from "@bufbuild/protobuf";
import { Application, Reboot } from "@reboot-dev/reboot";
import { Queue } from "@reboot-dev/reboot-std/collections/queue/v1";
import { Topic } from "@reboot-dev/reboot-std/pubsub/v1";
// eslint-disable-next-line
import { queueLibrary } from "@reboot-dev/reboot-std/collections/queue/v1";
import { sortedMapLibrary } from "@reboot-dev/reboot-std/collections/v1/sorted_map.js";
// eslint-disable-next-line
import { pubsubLibrary } from "@reboot-dev/reboot-std/pubsub/v1";
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
    await rbt.up(
      new Application({
        libraries: [pubsubLibrary(), queueLibrary(), sortedMapLibrary()],
      })
    );

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

  await t.test(
    "Examples for documentation for publish and subscribe.",
    async (t) => {
      await rbt.up(
        new Application({
          libraries: [pubsubLibrary(), queueLibrary(), sortedMapLibrary()],
        })
      );

      const context = rbt.createExternalContext("test", {
        appInternal: true,
      });

      const firstTopic = Topic.ref("my-first-topic");
      const secondTopic = Topic.ref("my-second-topic");

      await firstTopic.subscribe(context, {
        queueId: "receiving-queue",
      });

      await firstTopic.publish(context, {
        value: Value.fromJson({ details: "details-go-here" }),
      });

      await secondTopic.publish(context, {
        bytes: new TextEncoder().encode("my-bytes"),
      });

      // This subscribe is repeated for example code in documentation.
      await firstTopic.subscribe(context, {
        queueId: "receiving-queue",
      });

      const response = await Queue.ref("receiving-queue").dequeue(context);
    }
  );

  await t.test("Examples for documentation for bulk publish.", async (t) => {
    await rbt.up(
      new Application({
        libraries: [pubsubLibrary(), queueLibrary(), sortedMapLibrary()],
      })
    );

    const context = rbt.createExternalContext("test", {
      appInternal: true,
    });

    const firstTopic = Topic.ref("my-first-topic");
    const secondTopic = Topic.ref("my-second-topic");

    await firstTopic.subscribe(context, {
      queueId: "receiving-queue",
    });

    await firstTopic.publish(context, {
      items: [
        { value: Value.fromJson(null) },
        { value: Value.fromJson(true) },
        { value: Value.fromJson(3) },
        { value: Value.fromJson("apple") },
        { value: Value.fromJson(["a", "b", "c"]) },
        { value: Value.fromJson({ details: "details-go-here" }) },
      ],
    });

    await secondTopic.publish(context, {
      items: [
        { bytes: new TextEncoder().encode("some-bytes") },
        { bytes: new TextEncoder().encode("some-more-bytes") },
      ],
    });

    // `Any` not supported by TypeScript because conversion from TS to Python
    // is passed via JSON, which bufbuilder needs a registry for.

    const { items } = await Queue.ref("receiving-queue").dequeue(context, {
      bulk: true,
      atMost: 6,
    });
    // `items` is a list of Items
  });
});
