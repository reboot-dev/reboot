import { PartialMessage } from "@bufbuild/protobuf";
import {
  Application,
  ReaderContext,
  Reboot,
  WriterContext,
  allow,
} from "@reboot-dev/reboot";
import { strict as assert } from "node:assert";
import process from "node:process";
import { test } from "node:test";
// import { Echo } from "../../../tests/reboot/protoc/default_state_annotations_rbt.js";
import { Empty, Text } from "./shared_pb.js";

const ECHO_STATE_RBT_MODULE_PATH = process.env["ECHO_STATE_RBT_MODULE_PATH"];
console.log("ECHO_STATE_RBT_MODULE_PATH: " + ECHO_STATE_RBT_MODULE_PATH);
const ECHO_STATE_RBT_MODULE = await import(ECHO_STATE_RBT_MODULE_PATH);

const REPLY_CLIENT_RBT_MODULE_PATH =
  process.env["REPLY_CLIENT_RBT_MODULE_PATH"];
console.log("REPLY_CLIENT_RBT_MODULE_PATH: " + REPLY_CLIENT_RBT_MODULE_PATH);
const REPLY_CLIENT_RBT_MODULE = await import(REPLY_CLIENT_RBT_MODULE_PATH);

const LAST_MESSAGE_CLIENT_RBT_MODULE_PATH =
  process.env["LAST_MESSAGE_CLIENT_RBT_MODULE_PATH"];
console.log(
  "LAST_MESSAGE_CLIENT_RBT_MODULE_PATH: " + LAST_MESSAGE_CLIENT_RBT_MODULE_PATH
);
const LAST_MESSAGE_CLIENT_RBT_MODULE = await import(
  LAST_MESSAGE_CLIENT_RBT_MODULE_PATH
);

const rbt = new Reboot();
await rbt.start();

try {
  await test("can use echo", async (t) => {
    assert.notEqual(ECHO_STATE_RBT_MODULE, undefined, "ECHO_STATE_RBT_MODULE");
    assert.notEqual(
      ECHO_STATE_RBT_MODULE.Echo,
      undefined,
      "ECHO_STATE_RBT_MODULE.Echo"
    );
    assert.notEqual(
      REPLY_CLIENT_RBT_MODULE,
      undefined,
      "REPLY_CLIENT_RBT_MODULE"
    );
    assert.notEqual(
      REPLY_CLIENT_RBT_MODULE.Echo,
      undefined,
      "REPLY_CLIENT_RBT_MODULE.Echo"
    );
    assert.notEqual(
      LAST_MESSAGE_CLIENT_RBT_MODULE,
      undefined,
      "LAST_MESSAGE_CLIENT_RBT_MODULE"
    );
    assert.notEqual(
      LAST_MESSAGE_CLIENT_RBT_MODULE.Echo,
      undefined,
      "LAST_MESSAGE_CLIENT_RBT_MODULE.Echo"
    );

    class EchoServicer extends ECHO_STATE_RBT_MODULE.Echo.singleton.Servicer {
      constructor() {
        super();
      }

      authorizer() {
        return allow();
      }

      async reply(
        context: WriterContext,
        state: any, // Actually: ECHO_STATE_RBT_MODULE.Echo.State
        request: Text
      ): Promise<PartialMessage<Text>> {
        state.lastMessage = request;
        return { content: request.content };
      }

      async lastMessage(
        context: ReaderContext,
        state: any, // Actually: ECHO_STATE_RBT_MODULE.Echo.State
        request: Empty
      ): Promise<PartialMessage<Text>> {
        return state.lastMessage;
      }
    }

    await rbt.up(new Application({ servicers: [EchoServicer] }));
    const context = rbt.createExternalContext("test");

    // Validate that we can use the state type to make all calls.
    let echo = ECHO_STATE_RBT_MODULE.Echo.ref("test-id");
    let response = await echo.reply(context, { content: "hello, world!" });
    console.log("First response was: '" + response.content + "'");
    assert(response.content == "hello, world!");
    response = await echo.lastMessage(context);
    console.log("Second response was: '" + response.content + "'");
    assert(response.content == "hello, world!");

    // Validate that we can use service-specific clients to make specific calls,
    // even when we may not have the state type itself.
    echo = REPLY_CLIENT_RBT_MODULE.Echo.ref("fixed-id");
    response = await echo.reply(context, {
      content: "hello, client-only world!",
    });
    console.log("Third response was: '" + response.content + "'");
    assert(response.content == "hello, client-only world!");

    echo = LAST_MESSAGE_CLIENT_RBT_MODULE.Echo.ref("fixed-id");
    response = await echo.lastMessage(context);
    console.log("Fourth response was: '" + response.content + "'");
    assert(response.content == "hello, client-only world!");
  });
} finally {
  await rbt.stop();
}
