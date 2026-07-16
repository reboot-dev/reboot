import { allow, Application, deny, Reboot } from "@reboot-dev/reboot";
import { errors_pb } from "@reboot-dev/reboot-api";
// eslint-disable-next-line
import { SortedMap } from "@reboot-dev/reboot-std/collections/v1/sorted_map.js";
import { InvalidRangeError } from "@reboot-dev/reboot-std/collections/v1/sorted_map.js";
// eslint-disable-next-line
import { sortedMapLibrary } from "@reboot-dev/reboot-std/collections/v1/sorted_map.js";
import { strict as assert } from "node:assert";
import { test } from "node:test";

test("use std servicer", async (t) => {
  let rbt: Reboot;
  t.beforeEach(async () => {
    rbt = new Reboot();
    await rbt.start();
  });
  t.afterEach(async () => {
    await rbt.stop();
  });

  await t.test("use std library", async (t) => {
    await rbt.up(new Application({ libraries: [sortedMapLibrary()] }));

    const context = rbt.createExternalContext("test", {
      appInternal: true,
    });

    const myMap = SortedMap.ref("test-id");

    await myMap.insert(context, {
      entries: { foo: new TextEncoder().encode("bar") },
    });

    const getResponse = await myMap.get(context, { key: "foo" });
    const getResponseValue = new TextDecoder().decode(getResponse.value);
    assert(
      getResponseValue == "bar",
      `Expected 'bar' but got '${getResponseValue}'`
    );
  });

  await t.test("use overriding auth", async (t) => {
    const authorizer = new SortedMap.Authorizer({
      insert: allow(),
      get: deny(),
    });

    await rbt.up(
      new Application({ libraries: [sortedMapLibrary({ authorizer })] })
    );

    // Expect to be able to insert even with `appInternal=false`.
    let context = rbt.createExternalContext("test", {
      appInternal: false,
    });
    let myMap = SortedMap.ref("test-id");
    await myMap.insert(context, {
      entries: { foo: new TextEncoder().encode("bar") },
    });

    // Expect to not be able to get even with `appInternal=true`.
    context = rbt.createExternalContext("test", {
      appInternal: true,
    });
    myMap = SortedMap.ref("test-id");
    try {
      await myMap.get(context, { key: "foo" });
      assert(false, "Should not have successfully authed.");
    } catch (e) {
      assert(
        e instanceof SortedMap.GetAborted,
        "Should receive SortedMap.GetAborted error."
      );
      assert(
        e.error instanceof errors_pb.PermissionDenied,
        "Should receive PermissionDenied error."
      );
    }
  });
});

function main() {
  new Application({
    libraries: [sortedMapLibrary()],
  }).run();
}

void main;

// Runs the snippets used in
// `documentation/docs/library_services/sorted_map.mdx`.
test("SortedMap documentation snippets", async (t) => {
  let rbt: Reboot;
  t.beforeEach(async () => {
    rbt = new Reboot();
    await rbt.start();
  });
  t.afterEach(async () => {
    await rbt.stop();
  });

  await t.test("insert, get, remove, range", async (t) => {
    await rbt.up(new Application({ libraries: [sortedMapLibrary()] }));

    const context = rbt.createExternalContext("documentation", {
      appInternal: true,
    });

    const myMap = SortedMap.ref("my-map");

    await myMap.insert(context, {
      entries: {
        "key-a": new TextEncoder().encode("value-1"),
        "key-b": new TextEncoder().encode("value-2"),
        "key-c": new TextEncoder().encode("value-3"),
      },
    });

    // Get key that has a value.
    const response = await myMap.get(context, { key: "key-a" });
    console.log(new TextDecoder().decode(response.value));

    // Get key that has no associated value.
    const missingResponse = await myMap.get(context, { key: "missing-key" });
    // missingResponse.hasOwnProperty("value") === false

    assert(!missingResponse.hasOwnProperty("value") || !missingResponse.value);

    const range1 = await myMap.range(context, {
      startKey: "key-b",
      endKey: "key-z",
      limit: 2,
    });

    for (const entry of range1.entries) {
      console.log(entry.key, new TextDecoder().decode(entry.value));
    }

    // Returns entries associated with the 3 smallest keys.
    const range2 = await myMap.range(context, {
      limit: 3,
    });

    assert(range2.entries.length === 3);

    const reverseRange1 = await myMap.reverseRange(context, {
      startKey: "key-z",
      endKey: "key-b",
      limit: 2,
    });

    for (const entry of reverseRange1.entries) {
      console.log(entry.key, new TextDecoder().decode(entry.value));
    }

    // Returns entries associated with the 3 largest keys.
    const reverseRange2 = await myMap.reverseRange(context, {
      limit: 3,
    });

    assert(reverseRange2.entries.length === 3);

    await myMap.remove(context, {
      keys: ["key-a", "key-b"],
    });

    try {
      await myMap.range(context, {
        startKey: "zero",
        endKey: "one",
      });
    } catch (e) {
      if (
        e instanceof SortedMap.RangeAborted &&
        e.error instanceof InvalidRangeError
      ) {
        console.error(e.error.message);
      }
    }
  });
});
