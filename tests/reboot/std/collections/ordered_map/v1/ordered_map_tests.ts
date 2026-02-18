import { Value } from "@bufbuild/protobuf";
import { Application, Reboot } from "@reboot-dev/reboot";
import orderedMap, {
  Node,
  OrderedMap,
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
    await rbt.up(new Application({ servicers: orderedMap.servicers() }));
  });
  t.afterEach(async () => {
    await rbt.stop();
  });

  await t.test("Interact with the OrderedMap v1", async (t) => {
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
      key: "50",
      value: Value.fromJson("fifty").toBinary(),
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
