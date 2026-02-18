// `eslint` disabled to preserve separation of imports for documentation.
// eslint-disable-next-line
import { Any, createRegistry } from "@bufbuild/protobuf";
// eslint-disable-next-line
import { Value } from "@bufbuild/protobuf";
// eslint-disable-next-line
import { JsonObject } from "@bufbuild/protobuf";
import { strict as assert } from "node:assert";
import { test } from "node:test";
import { CreateRequest as SomeMessage } from "../../../greeter_rbt.js";

test("test item", async (t) => {
  await t.test("Item with value", async (t) => {
    // Test storing a value in an `Item`.
    // `console.log` statements are used as part of the documentation examples.
    let item;
    item = { value: Value.fromJson(true) };
    console.log(item.value?.toJson());

    item = { value: Value.fromJson(1) };
    console.log(item.value?.toJson());

    item = { value: Value.fromJson("apple") };
    console.log(item.value?.toJson());

    item = { value: Value.fromJson(["a", "b", "c"]) };
    console.log(item.value?.toJson());

    item = { value: Value.fromJson({ details: "details-go-here" }) };
    console.log(item.value?.toJson());

    let json = item.value?.toJson() as JsonObject;
    assert(json["details"] === "details-go-here");
  });

  await t.test("Item with bytes", async (t) => {
    // Test storing bytes in an `Item`.
    // `console.log` statements are used as part of the documentation examples.
    const item = { bytes: new TextEncoder().encode("some-bytes") };
    console.log(item.bytes);

    assert(new TextDecoder().decode(item.bytes) === "some-bytes");
  });

  await t.test("Item with any", async (t) => {
    // Test storing bytes in an `Item`.
    // `console.log` statements are used as part of the documentation examples.
    const contents = {
      title: "king",
      name: "nemo",
      adjective: "fishy",
    };
    const message = new SomeMessage(contents);

    const item = { any: Any.pack(message) };

    const registry = createRegistry(SomeMessage);
    const unpackedMessage = item.any.unpack(registry) as SomeMessage;

    assert(unpackedMessage.name === "nemo");
  });
});
