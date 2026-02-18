import test from "node:test";
import {
  Application,
  Auth,
  ReaderContext,
  Reboot,
  TokenVerifier,
  allowIf,
  isAppInternal,
} from "@reboot-dev/reboot";
import { errors_pb } from "@reboot-dev/reboot-api";
import { strict as assert } from "node:assert";
import { Greeter } from "../../../../tests/reboot/greeter_rbt.js";
import { GreeterServicer } from "../greeter.js";

class NoAuthedGreeterServicer extends GreeterServicer {
  authorizer() {
    return null;
  }

  async create(context, request) {
    assert(context.appInternal);
    return super.create(context, request);
  }
}

class AuthedGreeterServicer extends NoAuthedGreeterServicer {
  authorizer() {
    return new Greeter.Authorizer({
      create: allowIf({ all: [isAppInternal] }),
    });
  }
}

class TestTokenVerifier extends TokenVerifier {
  async verifyToken(
    context: ReaderContext,
    token?: string
  ): Promise<Auth | null> {
    assert(context.appInternal);
    return null;
  }
}

test("app internal", async (t) => {
  let rbt: Reboot;
  t.beforeEach(async () => {
    rbt = new Reboot();
    await rbt.start();
  });
  t.afterEach(async () => {
    await rbt.stop();
  });

  // Test that without a token verifier _or_ authorizer the method
  // still sees that `context.appInternal` is true.
  await t.test("no token verifier, no authorizer", async (t) => {
    await rbt.up(new Application({ servicers: [NoAuthedGreeterServicer] }));

    const context = rbt.createExternalContext("test", { appInternal: true });

    await Greeter.create(context, {});
  });

  // Test that without a token verifier the authorizer and method both
  // see that `context.appInternal` is true.
  await t.test("no token verifier, authorizer", async (t) => {
    await rbt.up(new Application({ servicers: [AuthedGreeterServicer] }));

    const context = rbt.createExternalContext("test", { appInternal: true });

    await Greeter.create(context, {});
  });

  // Test that _with_ a token verifier the authorizer and method both
  // see that `context.appInternal` is true.
  await t.test("token verifier, authorizer", async (t) => {
    await rbt.up(
      new Application({
        servicers: [AuthedGreeterServicer],
        tokenVerifier: new TestTokenVerifier(),
      })
    );

    const context = rbt.createExternalContext("test", { appInternal: true });

    await Greeter.create(context, {});
  });
});
