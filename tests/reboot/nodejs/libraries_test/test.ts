import { Empty } from "@bufbuild/protobuf";
import {
  Application,
  InitializeContext,
  ReaderContext,
  Reboot,
  WriterContext,
  allow,
} from "@reboot-dev/reboot";
import { strict as assert } from "node:assert";
import test from "node:test";
import { Box, ValueMessage } from "./library_rbt.js";

class BoxServicer extends Box.Servicer {
  authorizer() {
    return allow();
  }

  async get(context: ReaderContext, request: Empty): Promise<ValueMessage> {
    return new ValueMessage({ value: this.state.value });
  }

  async put(context: WriterContext, request: ValueMessage): Promise<Empty> {
    this.state.value = request.value;
    return new Empty();
  }
}

const LIBRARY_NAME = "libraries_test/library";

const library = () => ({
  name: LIBRARY_NAME,
  servicers: () => {
    return [BoxServicer];
  },
});

test("library", async (t) => {
  let rbt: Reboot;

  t.beforeEach(async () => {
    rbt = new Reboot();
    await rbt.start();
  });

  t.afterEach(async () => {
    await rbt.stop();
  });

  await t.test("basic library", async (t) => {
    const application = new Application({
      libraries: [library()],
    });
    await rbt.up(application);

    const context = rbt.createExternalContext("test");

    const ref = Box.ref("test");

    // Test a `put`.
    await ref.put(context, { value: "golden ring" });

    // Test a `get`.
    const response = await ref.get(context);
    assert(response.value === "golden ring");
  });

  await t.test("library with initialize", async (t) => {
    const functionsRan: string[] = [];

    const testLibrary = () => ({
      ...library(),
      initialize: async (context: InitializeContext) => {
        functionsRan.push("library initialize");
      },
    });

    const application = new Application({
      libraries: [testLibrary()],
    });
    await rbt.up(application);

    assert(functionsRan.length === 1);
    assert(
      functionsRan[0] === "library initialize",
      "Expected `initialize` to run."
    );
  });
});
