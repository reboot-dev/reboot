import { Any, Value } from "@bufbuild/protobuf";
import {
  allow,
  allowIf,
  Application,
  ExternalContext,
  isAppInternal,
  Reboot,
} from "@reboot-dev/reboot";
import {
  InvalidRangeError,
  Node,
  OrderedMap,
  orderedMapLibrary,
} from "@reboot-dev/reboot-std/collections/ordered_map/v1";
import { strict as assert } from "node:assert";
import { test } from "node:test";

test("Use orderedMap and node servicers", async (t) => {
  // These tests simply verify that we are properly exporting the OrderedMap
  // and node servicers to be used in typescript. They aren't meant to
  // thoroughly test any logic.

  let rbt: Reboot;
  t.beforeEach(async () => {
    rbt = new Reboot();
    await rbt.start();
  });
  t.afterEach(async () => {
    await rbt.stop();
  });

  await t.test("Interact with the OrderedMap v1", async (t) => {
    await rbt.up(new Application({ libraries: [orderedMapLibrary()] }));

    const context = rbt.createExternalContext("test", {
      appInternal: true,
    });

    const orderedMap = OrderedMap.ref("test-id");
    await orderedMap.create(context, {
      degree: 4,
    });

    await orderedMap.insert(context, {
      key: "50",
      value: Value.fromJson("fifty"),
    });

    const entry = await orderedMap.search(context, { key: "50" });

    assert(entry.found, `Expected entry to be found, but it was not.`);

    assert(
      entry.value?.toJson() === "fifty",
      `Expected value to be 'fifty', but got '${entry.value?.toJson()}'`
    );
  });

  await t.test("Interact with the Node", async (t) => {
    await rbt.up(new Application({ libraries: [orderedMapLibrary()] }));

    const context = rbt.createExternalContext("test", {
      appInternal: true,
    });

    const node = Node.ref("test-id");
    await node.create(context, {
      degree: 4,
      isLeaf: true,
      keys: [],
    });

    await node.insert(context, {
      entries: {
        "50": Value.fromJson("fifty").toBinary(),
      },
    });

    const entry = await node.search(context, { key: "50" });

    assert(entry.found, `Expected entry to be found, but it was not.`);

    assert(
      Value.fromBinary(entry.value).toJson(),
      `Expected value to be 'fifty', but got '${new TextDecoder().decode(
        entry.value
      )}'`
    );
  });
});

function main() {
  new Application({
    libraries: [orderedMapLibrary()],
  }).run();
}

void main;

// Type-checked (but not executed): inserting an `Any` over the
// TypeScript JSON transport requires the packed type to be in the
// transport's type registry.
async function insertExamples(context: ExternalContext) {
  const myMap = OrderedMap.ref("my-map");

  await myMap.insert(context, {
    key: "key-a",
    value: Value.fromJson("a value!"),
  });

  await myMap.insert(context, {
    key: "key-b",
    bytes: new TextEncoder().encode("some bytes"),
  });

  await myMap.insert(context, {
    key: "key-c",
    any: Any.pack(Value.fromJson("any value!")),
  });
}

void insertExamples;

// Runs the snippets used in
// `documentation/docs/library_services/ordered_map.mdx`.
test("OrderedMap documentation snippets", async (t) => {
  let rbt: Reboot;
  t.beforeEach(async () => {
    rbt = new Reboot();
    await rbt.start();
  });
  t.afterEach(async () => {
    await rbt.stop();
  });

  await t.test("create", async (t) => {
    const authorizer = new OrderedMap.Authorizer({
      insert: allowIf({ all: [isAppInternal] }),
      search: allow(),
    });

    const application = new Application({
      libraries: [orderedMapLibrary({ authorizer })],
    });

    await rbt.up(application);

    const context = rbt.createExternalContext("documentation", {
      appInternal: true,
    });

    const myMap = OrderedMap.ref("my-map");

    await myMap.create(context, {
      degree: 128,
      maintainSize: true,
    });
  });

  await t.test("insert, search, remove, range", async (t) => {
    await rbt.up(new Application({ libraries: [orderedMapLibrary()] }));

    const context = rbt.createExternalContext("documentation", {
      appInternal: true,
    });

    const myMap = OrderedMap.ref("my-map");

    // Implicitly creates with degree 64 if not yet
    // created, or validates that the existing map
    // was created with degree 64.
    await myMap.insert(context, {
      key: "key-a",
      value: Value.fromJson("a value!"),
      degree: 64,
    });

    await myMap.insert(context, {
      key: "key-a",
      value: Value.fromJson("a value!"),
    });

    await myMap.insert(context, {
      key: "key-b",
      bytes: new TextEncoder().encode("some bytes"),
    });

    await myMap.insert(context, {
      entries: {
        "key-a": { value: Value.fromJson("a value!") },
        "key-b": { bytes: new TextEncoder().encode("some bytes") },
      },
    });

    // Search for key with associated `Value`.
    const { value } = await myMap.search(context, { key: "key-a" });
    console.log(value?.toJson());

    // Search for key with associated `bytes`.
    const { bytes } = await myMap.search(context, { key: "key-b" });
    console.log(new TextDecoder().decode(bytes));

    // Search for key with associated `Any`.
    const { any } = await myMap.search(context, { key: "key-c" });
    console.log(any);

    // Search for key with no associated data.
    const missingResponse = await myMap.search(context, {
      key: "missing-key",
    });
    assert(missingResponse.found === false);

    await myMap.remove(context, { key: "key-a" });

    await myMap.insert(context, {
      key: "key-a",
      value: Value.fromJson("a value!"),
    });

    await myMap.remove(context, {
      keys: ["key-a", "key-b", "key-c"],
    });

    await myMap.insert(context, {
      entries: {
        "key-a": { value: Value.fromJson("a value!") },
        "key-b": { bytes: new TextEncoder().encode("some bytes") },
        "key-c": { value: Value.fromJson("c value!") },
        "key-d": { value: Value.fromJson("d value!") },
      },
    });

    const range1 = await myMap.range(context, {
      startKey: "key-b",
      limit: 2,
    });

    for (const entry of range1.entries) {
      console.log(entry.key, entry.value, entry.bytes, entry.any);
    }

    // Returns entries associated with the 3 smallest keys.
    const range2 = await myMap.range(context, {
      limit: 3,
    });

    assert(range2.entries.length === 3);

    const reverseRange1 = await myMap.reverseRange(context, {
      startKey: "key-z",
      limit: 2,
    });

    for (const entry of reverseRange1.entries) {
      console.log(entry.key, entry.value, entry.bytes, entry.any);
    }

    // Returns entries associated with the 3 largest keys.
    const reverseRange2 = await myMap.reverseRange(context, {
      limit: 3,
    });

    assert(reverseRange2.entries.length === 3);

    try {
      await myMap.range(context);
    } catch (e) {
      if (
        e instanceof OrderedMap.RangeAborted &&
        e.error instanceof InvalidRangeError
      ) {
        console.error(e.error.message);
      }
    }
  });
});
