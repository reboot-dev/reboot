import { Application, ExternalContext, Reboot } from "@reboot-dev/reboot";
import { strict as assert } from "node:assert";
import test from "node:test";
import * as uuid from "uuid";
import { Greeter } from "../../greeter_rbt.js";
import { GreeterServicer } from "../greeter.js";

test("Reboot down test", async (t) => {
  const rbt = new Reboot();
  await rbt.start();
  t.after(async () => {
    await rbt.stop();
  });

  await rbt.up(
    new Application({ servicers: [GreeterServicer] }),
    // Run with a local Envoy proxy to let us keep the same `context`
    // (pointed at the same endpoint) while restarting Reboot.
    { localEnvoy: true }
  );

  let context = new ExternalContext({
    name: "reboot-down-test",
    url: rbt.url(),
    idempotencySeed: uuid.v4(),
  });

  let [greeter, _] = await Greeter.create(context, {
    title: "Dr",
    name: "Jonathan",
    adjective: "Best",
  });

  const greeterStateId = greeter.stateId;

  let response = await greeter.greet(context, { name: "Duke" });

  assert.equal(response.message, "Hi Duke, I am Dr Jonathan the Best");

  // Bring Reboot down, calls should now be blocked.
  await rbt.down();

  // Start a call; it should be blocked until Reboot is back up.
  const greetPromise = greeter.greet(context, { name: "Duke" });

  // Wait a short time to ensure `greetPromise` is still pending.
  let isSettled = false;
  greetPromise.then(
    () => {
      isSettled = true;
    },
    () => {
      isSettled = true;
    }
  );
  await new Promise((resolve) => setTimeout(resolve, 200));
  assert.equal(isSettled, false, "greet should be blocked while rbt is down");

  // Bring Reboot back up. Envoy will reuse the same port, so the
  // previous `greet` should now complete.
  await rbt.up(new Application({ servicers: [GreeterServicer] }), {
    localEnvoy: true,
  });

  const result = await greetPromise;
  assert.equal(result.message, "Hi Duke, I am Dr Jonathan the Best");
});
