import {
  Application,
  Auth,
  ReaderContext,
  Reboot,
  TokenVerifier,
} from "@reboot-dev/reboot";
import { fork } from "child_process";
import * as http from "http";
import { strict as assert } from "node:assert";
import test from "node:test";
import { URL } from "url";
import { Greeter } from "../../greeter_rbt.js";
import {
  GreeterServicer,
  testLongRunningWriterAbortController,
  testLongRunningWriterCalled,
  testLongRunningWriterCancelled,
} from "../greeter.js";

const TOKEN_FOR_TEST = "S3CR3T!";

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
  await t.test("URL is `http`", async (t) => {
    const rbt = new Reboot();
    await rbt.start();
    t.after(async () => {
      await rbt.stop();
    });
    await rbt.up(new Application({ servicers: [GreeterServicer] }), {
      localEnvoy: true,
    });
    assert(rbt.url().startsWith("http:"));
  });

  await t.test("HTTP catchall endpoints", async (t) => {
    const application = new Application({
      servicers: [GreeterServicer],
      // We're passing a `TokenVerifier` to validate that the bearer token added
      // to the `ExternalContext` we inject in the HTTP handler is correct.
      tokenVerifier: new StaticTokenVerifier(),
    });

    application.http.post("/hello_world", async (context, req, res) => {
      const [greeter] = await Greeter.create(context, {
        title: "Dr",
        name: "Jonathan",
        adjective: "Best",
      });

      const { message } = await greeter.greet(context, { name: "Jake" });

      assert(message === "Hi Jake, I am Dr Jonathan the Best");

      res.json({ message: "Hello, world!", bearerToken: context.bearerToken });
    });

    const rbt = new Reboot();
    await rbt.start();
    t.after(async () => {
      await rbt.stop();
    });
    await rbt.up(application, { localEnvoy: true });

    const data = await new Promise<{ message: string }>((resolve, reject) => {
      const req = http.request(
        new URL(rbt.url() + "/hello_world"),
        {
          method: "POST",
          headers: { Authorization: `Bearer ${TOKEN_FOR_TEST}` },
        },
        (res) => {
          let data = "";
          res.on("data", (chunk) => {
            data += chunk;
          });
          res.on("end", () => {
            resolve(JSON.parse(data) as { message: string });
          });
        }
      );

      req.on("error", (err) => {
        reject(err);
      });

      req.end();
    });

    assert(data.message == "Hello, world!", `${JSON.stringify(data)}`);
  });

  await t.test("Deep proto message", async (t) => {
    const application = new Application({
      servicers: [GreeterServicer],
    });

    const rbt = new Reboot();
    await rbt.start();

    t.after(async () => {
      await rbt.stop();
    });

    await rbt.up(application, { localEnvoy: true });

    const context = rbt.createExternalContext("test");

    const [greeter] = await Greeter.create(context, {
      title: "Dr",
      name: "Jonathan",
      adjective: "Best",
    });

    let depth = 50;

    await greeter.constructAndStoreRecursiveMessage(context, {
      depth: depth,
    });

    const read_response = await greeter.readRecursiveMessage(context, {});
    // Show that a recursive protobuf message can get serialized, as long as
    // it's within protobuf's limits on nestedness.
    assert(read_response.message.message == `Level ${depth - 1}`);

    depth = 1000;

    try {
      // Show that when protobuf's limits are exceeded, we produce a helpful
      // error message.
      await greeter.constructAndStoreRecursiveMessage(context, {
        depth: depth,
      });

      throw new Error("Should be unreachable");
    } catch (e) {
      assert(
        e.message.includes(
          "This is usually caused by a deeply nested protobuf message, which is not supported by protobuf."
        )
      );
    }
  });

  await t.test("Cancelled calls are await'ed", async (t) => {
    const rbt = new Reboot();
    await rbt.start();
    t.after(async () => {
      await rbt.stop();
    });

    await rbt.up(new Application({ servicers: [GreeterServicer] }), {
      localEnvoy: true,
    });

    const context = rbt.createExternalContext("test");

    const [greeter] = await Greeter.create(context, {
      title: "Dr",
      name: "Jonathan",
      adjective: "Best",
    });

    // NOTE: this test has a few quirks due to deficiencies in
    // TypeScript.
    //
    // (1) We're calling into a subprocess because we want to test
    // what happens when an RPC is cancelled and cancelling an RPC is
    // not supported yet but we can kill a subprocess which will cause
    // the RPC to be considered cancelled.
    //
    // (2) We're checking global state because all TypeScript tests
    // run "in process" and we need to wait for particular events to
    // have occurred.

    const subprocess = fork("./tests/reboot/nodejs/reboot_test/call.js", [
      rbt.url(),
      greeter.stateId,
    ]);

    // Wait until `testLongRunningWriter` is called.
    while (testLongRunningWriterCalled === false) {
      await new Promise<void>((resolve) => setTimeout(resolve, 100));
    }

    // Now call another writer which should be blocked.
    let setAdjectiveResolved = false;

    const setAdjectivePromise = greeter
      .setAdjective(context, {
        adjective: "Friendly",
      })
      .then(() => {
        setAdjectiveResolved = true;
      });

    // Wait a little bit and ensure that `setAdjectiveResolved` is
    // still `false`.
    await new Promise<void>((resolve) => setTimeout(resolve, 500));
    assert(setAdjectiveResolved === false);

    // Tell the child process it can exit.
    subprocess.send("");

    await new Promise<void>((resolve, reject) => {
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

    assert(testLongRunningWriterCancelled !== undefined);

    await testLongRunningWriterCancelled;

    // Wait for a longer period of time and then ensure that
    // `setAdjectiveResolved` is still `false`.
    await new Promise<void>((resolve) => setTimeout(resolve, 3000));
    assert(setAdjectiveResolved === false);

    // Now let the function actually abort.
    testLongRunningWriterAbortController.abort();

    await setAdjectivePromise;
  });
});
