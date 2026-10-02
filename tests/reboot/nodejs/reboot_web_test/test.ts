import {
  Application,
  Auth,
  ReaderContext,
  Reboot,
  TokenVerifier,
  allowIf,
  hasVerifiedToken,
} from "@reboot-dev/reboot";
import { errors_pb } from "@reboot-dev/reboot-api";
import { WebContext } from "@reboot-dev/reboot-web";
import { fork } from "child_process";
import { strict as assert } from "node:assert";
import test from "node:test";
import { v4 as uuidv4 } from "uuid";
import {
  ErrorWithValue,
  Greeter,
  GreeterFailWithAbortedAborted,
} from "../../greeter_rbt_web.js";
import { GreeterServicer } from "../greeter.js";
const TOKEN_FOR_TEST = "S3CR3T!";

// NOTE: We use the 'web' generated code here, but we are calling it
// from the Node.js environment and we understand that there are
// possible flakes due to code might interact with the browser APIs like
// 'window' or 'document'. We are doing that because we want to test
// retry, which we can't do yet to the best of our knowledge with the
// tests in 'tests/reboot/react'.

// The next item of a reactive read, which must not be done.
async function nextItem<Item>(
  items: AsyncGenerator<Item, void, unknown>
): Promise<Item> {
  const result = await items.next();
  if (result.done === true) {
    assert.fail("Expected another item");
  }
  return result.value;
}

class StaticTokenVerifier extends TokenVerifier {
  async verifyToken(
    context: ReaderContext,
    token?: string
  ): Promise<Auth | null> {
    assert(token === TOKEN_FOR_TEST);
    return null;
  }
}

// Verifies `TOKEN_FOR_TEST` and no other token.
class OnlyTokenForTestVerifier extends TokenVerifier {
  async verifyToken(
    context: ReaderContext,
    token?: string
  ): Promise<Auth | null> {
    return token === TOKEN_FOR_TEST ? new Auth({ userId: "test" }) : null;
  }
}

// A `GreeterServicer` whose methods require a verified token.
class AuthenticatedGreeterServicer extends GreeterServicer {
  authorizer() {
    return allowIf({ all: [hasVerifiedToken] });
  }
}

test("Reboot", async (t) => {
  await t.test("Non reactive calls", async (t) => {
    const application = new Application({
      servicers: [GreeterServicer],
    });

    const rbt = new Reboot();
    await rbt.start();

    t.after(async () => {
      await rbt.stop();
    });

    await rbt.up(application, { localEnvoy: true });

    const context = new WebContext({
      url: rbt.url(),
    });

    const [greeter] = await Greeter.create(context, {
      title: "Dr",
      name: "Jonathan",
      adjective: "Best",
    });

    await greeter.setAdjective(context, {
      adjective: "Friendly",
    });

    const response = await greeter.greet(context, {});

    assert(response.message == "Hi , I am Dr Jonathan the Friendly");
  });

  await t.test("Bearer token authentication", async (t) => {
    const application = new Application({
      servicers: [GreeterServicer],
      tokenVerifier: new StaticTokenVerifier(),
    });

    const rbt = new Reboot();
    await rbt.start();

    t.after(async () => {
      await rbt.stop();
    });

    await rbt.up(application, { localEnvoy: true });

    const context = new WebContext({
      url: rbt.url(),
      bearerToken: TOKEN_FOR_TEST,
    });

    const [greeter] = await Greeter.create(context, {
      title: "Dr",
      name: "Jonathan",
      adjective: "Best",
    });

    await greeter.setAdjective(context, {
      adjective: "Friendly",
    });

    const response = await greeter.greet(context, {});

    assert(response.message == "Hi , I am Dr Jonathan the Friendly");
  });

  await t.test("Bearer async token authentication", async (t) => {
    const application = new Application({
      servicers: [GreeterServicer],
      tokenVerifier: new StaticTokenVerifier(),
    });

    const rbt = new Reboot();
    await rbt.start();

    t.after(async () => {
      await rbt.stop();
    });

    await rbt.up(application, { localEnvoy: true });

    const asyncBearerToken = async () => {
      return "S3CR3T!";
    };

    const context = new WebContext({
      url: rbt.url(),
      bearerToken: asyncBearerToken,
    });

    const [greeter] = await Greeter.create(context, {
      title: "Dr",
      name: "Jonathan",
      adjective: "Best",
    });

    await greeter.setAdjective(context, {
      adjective: "Friendly",
    });

    const response = await greeter.greet(context, {});

    assert(response.message == "Hi , I am Dr Jonathan the Friendly");
  });

  await t.test("Retry loop", async (t) => {
    const application = new Application({
      servicers: [GreeterServicer],
    });

    const rbt = new Reboot();
    await rbt.start();

    t.after(async () => {
      await rbt.stop();
    });

    // Since the 'call.ts' subprocess will try to call the same
    // endpoint before and after the server is down, we have to use the
    // same port for the local envoy.
    await rbt.up(application, { localEnvoy: true });

    const context = new WebContext({
      url: rbt.url(),
    });

    const [greeter] = await Greeter.create(context, {
      title: "Dr",
      name: "Jonathan",
      adjective: "Best",
    });

    const subprocess = fork("./tests/reboot/nodejs/reboot_web_test/call.js", [
      rbt.url(),
      greeter.stateId,
    ]);

    const waitForSetAdjectiveCall = new Promise<void>((resolve, reject) => {
      subprocess.on("exit", (code, signal) => {
        if (code === 0) {
          resolve();
        } else if (signal === null) {
          reject(new Error(`Child exited with code ${code}`));
        } else {
          reject(new Error(`Child exited with signal ${signal}`));
        }
      });
    });

    await rbt.down();

    // Wait for a bit to ensure we are in a retry loop.
    await new Promise<void>((resolve) => setTimeout(resolve, 1000));

    await rbt.up(application, { localEnvoy: true });

    await waitForSetAdjectiveCall;

    const response = await greeter.greet(context, {});

    assert(response.message == "Hi , I am Dr Jonathan the Friendly");
  });

  await t.test("Reactive reader", async (t) => {
    const application = new Application({
      servicers: [GreeterServicer],
    });

    const rbt = new Reboot();
    await rbt.start();

    t.after(async () => {
      await rbt.stop();
    });

    await rbt.up(application, { localEnvoy: true });

    const context = new WebContext({
      url: rbt.url(),
    });

    const [greeter] = await Greeter.create(context, {
      title: "Dr",
      name: "Jonathan",
      adjective: "Best",
    });

    const abortController = new AbortController();

    const [items] = await greeter
      .reactively()
      .greet(context, {}, { signal: abortController.signal });

    const first = await nextItem(items);
    assert(first.response?.message == "Hi , I am Dr Jonathan the Best");

    await greeter.setAdjective(context, {
      adjective: "Friendly",
    });

    // The generator yields a response for each change to the state.
    const second = await nextItem(items);
    assert(second.response?.message == "Hi , I am Dr Jonathan the Friendly");

    abortController.abort();
    assert((await items.next()).done);
  });

  await t.test(
    "Reactive reader yields a declared error and keeps reading",
    async (t) => {
      const application = new Application({
        servicers: [GreeterServicer],
      });

      const rbt = new Reboot();
      await rbt.start();

      t.after(async () => {
        await rbt.stop();
      });

      await rbt.up(application, { localEnvoy: true });

      const context = new WebContext({
        url: rbt.url(),
      });

      const [greeter] = await Greeter.create(context, {
        title: "Dr",
        name: "Jonathan",
        adjective: "Best",
      });

      const abortController = new AbortController();

      const [items] = await greeter
        .reactively()
        .failWithAborted(context, {}, { signal: abortController.signal });

      // A declared error is yielded rather than thrown, and it does not
      // end the read: the next attempt, after a backoff, yields it
      // again.
      for (let i = 0; i < 2; i++) {
        const { response, aborted } = await nextItem(items);
        assert(response === undefined);
        assert(aborted instanceof GreeterFailWithAbortedAborted);
        assert(aborted.error instanceof ErrorWithValue);
        assert(aborted.error.value == "Hi!");
      }

      abortController.abort();
      assert((await items.next()).done);
    }
  );

  await t.test(
    "Reactive reader calls `onUnauthenticated` until the session is renewed",
    async (t) => {
      const application = new Application({
        servicers: [AuthenticatedGreeterServicer],
        tokenVerifier: new OnlyTokenForTestVerifier(),
      });

      const rbt = new Reboot();
      await rbt.start();

      t.after(async () => {
        await rbt.stop();
      });

      await rbt.up(application, { localEnvoy: true });

      const [greeter] = await Greeter.create(
        new WebContext({
          url: rbt.url(),
          bearerToken: TOKEN_FOR_TEST,
        }),
        {
          title: "Dr",
          name: "Jonathan",
          adjective: "Best",
        }
      );

      // The read starts with a token that the verifier rejects.
      let token = "expired";
      let calls = 0;

      const context = new WebContext({
        url: rbt.url(),
        bearerToken: async () => token,
        onUnauthenticated: async () => {
          calls += 1;
          if (calls === 1) {
            // The renewal fails, e.g., because the backend is
            // restarting.
            return false;
          }
          if (calls === 2) {
            // The renewal reports success, but the token is still the
            // rejected one.
            return true;
          }
          token = TOKEN_FOR_TEST;
          return true;
        },
      });

      const abortController = new AbortController();

      const [items] = await greeter
        .reactively()
        .greet(context, {}, { signal: abortController.signal });

      // The failed renewal yields the error.
      const first = await nextItem(items);
      assert(first.aborted?.error instanceof errors_pb.Unauthenticated);
      assert.equal(calls, 1);

      // The next attempt calls the hook again. It returns `true`, so
      // the read reconnects right away, and because the token is still
      // rejected the error is yielded without a third call.
      const second = await nextItem(items);
      assert(second.aborted?.error instanceof errors_pb.Unauthenticated);
      assert.equal(calls, 2);

      // The attempt after the backoff calls the hook a third time,
      // which renews the token.
      const third = await nextItem(items);
      assert(third.response?.message == "Hi , I am Dr Jonathan the Best");
      assert.equal(calls, 3);

      abortController.abort();
      assert((await items.next()).done);
    }
  );

  await t.test("Reactive reader retries a restarting server", async (t) => {
    const application = new Application({
      servicers: [GreeterServicer],
    });

    const rbt = new Reboot();
    await rbt.start();

    t.after(async () => {
      await rbt.stop();
    });

    await rbt.up(application, { localEnvoy: true });

    const context = new WebContext({
      url: rbt.url(),
    });

    const [greeter] = await Greeter.create(context, {
      title: "Dr",
      name: "Jonathan",
      adjective: "Best",
    });

    const abortController = new AbortController();

    const [responses] = await greeter
      .reactively()
      .greet(context, {}, { signal: abortController.signal });

    const first = await nextItem(responses);
    assert(first.response?.message == "Hi , I am Dr Jonathan the Best");

    // Restarting the server disconnects the reactive read, which
    // reconnects rather than surface the disconnect, and then
    // observes the mutation made after the restart.
    await rbt.down();
    await rbt.up(application, { localEnvoy: true });

    await greeter.setAdjective(context, {
      adjective: "Friendly",
    });

    while (true) {
      const { response, aborted } = await nextItem(responses);
      assert(aborted === undefined);
      if (response?.message == "Hi , I am Dr Jonathan the Friendly") {
        break;
      }
    }

    // Aborting the read ends the generator.
    abortController.abort();
    assert((await responses.next()).done);
  });

  await t.test("Transaction", async (t) => {
    const application = new Application({
      servicers: [GreeterServicer],
    });

    const rbt = new Reboot();
    await rbt.start();

    t.after(async () => {
      await rbt.stop();
    });

    await rbt.up(application, { localEnvoy: true });

    const context = new WebContext({
      url: rbt.url(),
    });

    const [greeter] = await Greeter.create(context, "my-greeter", {
      title: "Dr",
      name: "Jonathan",
      adjective: "Best",
    });

    assert(greeter.stateId == "my-greeter");

    // Transaction with 'revertAfter1Second' set to true returns a taskId,
    // but the 'Task' wrapper is located in the '*_rbt.ts' file and
    // expects either ExternalContext or WorkflowContext.
    // TODO: Should we make it work with WebContext as well?
    await greeter.transactionSetAdjective(context, {
      adjective: "Friendly",
      revertAfter1Second: true,
    });

    const response = await greeter.greet(context, {});

    assert(response.message == "Hi , I am Dr Jonathan the _Friendly_");

    while (true) {
      const response = await greeter.greet(context, {});
      if (response.message == "Hi , I am Dr Jonathan the Best") {
        // By the servicer logic we restore original adjective after
        // 1 second, in case it failed the test will time out.
        break;
      }
      await new Promise<void>((resolve) => setTimeout(resolve, 1000));
    }
  });

  await t.test("Idempotent call", async (t) => {
    const application = new Application({
      servicers: [GreeterServicer],
    });

    const rbt = new Reboot();
    await rbt.start();

    t.after(async () => {
      await rbt.stop();
    });

    await rbt.up(application, { localEnvoy: true });

    const context = new WebContext({
      url: rbt.url(),
    });

    const [greeter] = await Greeter.create(context, {
      title: "Dr",
      name: "Jonathan",
      adjective: "Best",
    });
    const idempotencyKey = uuidv4();

    await greeter.idempotently({ key: idempotencyKey }).setAdjective(context, {
      adjective: "Friendly",
    });

    // Make sure the next call with the same idempotency key
    // does not change the state.
    await greeter.idempotently({ key: idempotencyKey }).setAdjective(context, {
      adjective: "Happy",
    });

    const response = await greeter.greet(context, {});

    assert(response.message == "Hi , I am Dr Jonathan the Friendly");
  });
});
