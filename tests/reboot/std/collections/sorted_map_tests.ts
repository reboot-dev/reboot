import { allow, Application, deny, Reboot } from "@reboot-dev/reboot";
import { errors_pb } from "@reboot-dev/reboot-api";
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
