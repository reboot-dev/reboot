// `eslint` disabled to preserve separation of imports for documentation.
import { Value } from "@bufbuild/protobuf";
import { Application, Reboot } from "@reboot-dev/reboot";
import { Queue } from "@reboot-dev/reboot-std/collections/queue/v1";
// eslint-disable-next-line
import { queueLibrary } from "@reboot-dev/reboot-std/collections/queue/v1";
import { sortedMapLibrary } from "@reboot-dev/reboot-std/collections/v1/sorted_map.js";
import { strict as assert } from "node:assert";
import { test } from "node:test";
import { CreateRequest } from "../../../../greeter_rbt.js";

test("Use queue servicers", async (t) => {
  // These tests simply verify that we are properly exporting the Queue
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

  await t.test("Interact with the Queue", async (t) => {
    await rbt.up(
      new Application({ libraries: [queueLibrary(), sortedMapLibrary()] })
    );

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

  await t.test(
    "Examples for documentation for single enqueue/dequeue.",
    async (t) => {
      await rbt.up(
        new Application({ libraries: [queueLibrary(), sortedMapLibrary()] })
      );

      const context = rbt.createExternalContext("test", {
        appInternal: true,
      });

      const firstQueue = Queue.ref("my-first-queue");
      const secondQueue = Queue.ref("my-second-queue");

      await firstQueue.enqueue(context, {
        value: Value.fromJson({ details: "details-go-here" }),
      });

      await secondQueue.enqueue(context, {
        bytes: new TextEncoder().encode("my-bytes"),
      });

      // `Any` not supported by TypeScript because conversion from TS to Python is
      // passed via JSON, which bufbuilder needs a registry for. Converting into
      // bytes instead would fix this.
      // await thirdQueue.enqueue(context, {
      //   any: Any.pack(any),
      // });

      const { value } = await firstQueue.dequeue(context);
      console.log(value?.toJson()["details"]);

      const { bytes } = await secondQueue.dequeue(context);
      console.log(bytes);

      // `Any` not supported by TypeScript because conversion from TS to Python is
      // passed via JSON, which bufbuilder needs a registry for. Converting into
      // bytes instead would fix this.
      // const { any } = await thirdQueue.dequeue(context);
      // console.log(any);
    }
  );

  await t.test(
    "Examples for documentation for bulk enqueue/dequeue.",
    async (t) => {
      await rbt.up(
        new Application({ libraries: [queueLibrary(), sortedMapLibrary()] })
      );

      const context = rbt.createExternalContext("test", {
        appInternal: true,
      });

      const firstQueue = Queue.ref("my-first-queue");
      const secondQueue = Queue.ref("my-second-queue");

      // `any` needs to be defined for documentation. It won't actually be
      // shown. Any proto will do.
      let any = new CreateRequest({
        title: "king",
        name: "nemo",
        adjective: "fishy",
      });

      await firstQueue.enqueue(context, {
        items: [
          { value: Value.fromJson(null) },
          { value: Value.fromJson(true) },
          { value: Value.fromJson(3) },
          { value: Value.fromJson("apple") },
          { value: Value.fromJson(["a", "b", "c"]) },
          { value: Value.fromJson({ details: "details-go-here" }) },
        ],
      });

      await secondQueue.enqueue(context, {
        items: [
          { bytes: new TextEncoder().encode("some-bytes") },
          { bytes: new TextEncoder().encode("some-more-bytes") },
        ],
      });

      // `Any` not supported by TypeScript because conversion from TS to Python is
      // passed via JSON, which bufbuilder needs a registry for. Converting into
      // bytes instead would fix this.
      // await thirdQueue.enqueue(context, { items: [{ any }, { any }] });

      const { items } = await firstQueue.dequeue(context, {
        bulk: true,
        atMost: 5,
      });
      // `items` is a list of Items
    }
  );

  await t.test("Test tryDequeue()", async (t) => {
    await rbt.up(
      new Application({ libraries: [queueLibrary(), sortedMapLibrary()] })
    );

    const context = rbt.createExternalContext("test", {
      appInternal: true,
    });

    const queue = Queue.ref("test-queue");

    // `console.log()` and if/else below is pulled in for example code in documentation.
    const response = await queue.tryDequeue(context, { bulk: true, atMost: 1 });
    if (response.items.length === 0) {
      console.log("The queue is empty.");
    } else {
      // Something was in the queue; handle it.
    }

    assert(response.items.length === 0, `Expected 0 items to be dequeued.`);

    // Add item and `tryDequeue()` it.
    await queue.enqueue(context, {
      value: Value.fromJson({ details: "details-go-here" }),
    });

    const { value } = await queue.tryDequeue(context);

    assert(
      value?.toJson()["details"] === "details-go-here",
      `Expected to tryDequeue() the correct item.`
    );
  });

  await t.test("Test empty().", async (t) => {
    await rbt.up(
      new Application({ libraries: [queueLibrary(), sortedMapLibrary()] })
    );

    const context = rbt.createExternalContext("test", {
      appInternal: true,
    });

    const queue = Queue.ref("test-queue");

    // Need to construct state before reading.
    await queue.tryDequeue(context);

    // `console.log()` below is pulled in for example code in documentation.
    const response = await queue.empty(context);
    if (response.empty) {
      console.log("The queue is empty.");
    }

    assert(
      response.empty === true,
      `Expected empty() to be true when there are no items.`
    );

    // Add item and check `empty()` again.
    await queue.enqueue(context, {
      value: Value.fromJson({ details: "details-go-here" }),
    });

    const emptyFalseResponse = await queue.empty(context);

    assert(
      emptyFalseResponse.empty === false,
      `Expected empty() to be true when there are items.`
    );
  });
});
