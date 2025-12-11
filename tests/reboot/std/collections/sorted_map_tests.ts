import { Application, Reboot } from "@reboot-dev/reboot";
import {
  SortedMap,
  sortedMapLibrary,
} from "@reboot-dev/reboot-std/collections/v1/sorted_map.js";
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
    const config = await rbt.up(
      new Application({ libraries: [sortedMapLibrary()] })
    );

    const context = rbt.createExternalContext("test", {
      appInternal: true,
    });

    const myMap = SortedMap.ref("test-id");

    const insertResponse = await myMap.insert(context, {
      entries: { foo: new TextEncoder().encode("bar") },
    });

    const getResponse = await myMap.get(context, { key: "foo" });
    const getResponseValue = new TextDecoder().decode(getResponse.value);
    assert(
      getResponseValue == "bar",
      `Expected 'bar' but got '${getResponseValue}'`
    );
  });
});
