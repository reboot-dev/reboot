import {
  Application,
  Auth,
  ReaderContext,
  Reboot,
  TokenVerifier,
} from "@reboot-dev/reboot";
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

// The next response of a reactive read, which must not be done.
async function nextResponse<ResponseType>(
  responses: AsyncGenerator<ResponseType, void, unknown>
): Promise<ResponseType> {
  const result = await responses.next();
  if (result.done === true) {
    assert.fail("Expected another response");
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

    const [responses] = await greeter
      .reactively()
      .greet(context, {}, { signal: abortController.signal });

    const first = await nextResponse(responses);
    assert(first.message == "Hi , I am Dr Jonathan the Best");

    await greeter.setAdjective(context, {
      adjective: "Friendly",
    });

    // The generator yields a response for each change to the state.
    const second = await nextResponse(responses);
    assert(second.message == "Hi , I am Dr Jonathan the Friendly");

    abortController.abort();
    assert((await responses.next()).done);
  });

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

    const [responses] = await greeter.reactively().greet(context, {});

    const first = await nextResponse(responses);
    assert(first.message == "Hi , I am Dr Jonathan the Best");

    // Restarting the server disconnects the reactive read, which
    // reconnects rather than surface the disconnect, and then
    // observes the mutation made after the restart.
    await rbt.down();
    await rbt.up(application, { localEnvoy: true });

    await greeter.setAdjective(context, {
      adjective: "Friendly",
    });

    while (true) {
      const response = await nextResponse(responses);
      if (response.message == "Hi , I am Dr Jonathan the Friendly") {
        break;
      }
    }
  });

  await t.test("Reactive reader surfaces a declared error", async (t) => {
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

    const [responses] = await greeter.reactively().failWithAborted(context, {});

    // A declared error ends the generator by throwing it, the same
    // way a unary call throws it, rather than being retried.
    await assert.rejects(
      async () => {
        for await (const _ of responses) {
        }
      },
      (error: unknown) => {
        assert(error instanceof GreeterFailWithAbortedAborted);
        assert(error.error instanceof ErrorWithValue);
        assert(error.error.value == "Hi!");
        return true;
      }
    );

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
