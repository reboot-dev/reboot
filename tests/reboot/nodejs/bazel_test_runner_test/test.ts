import { ExternalContext, Reboot } from "@reboot-dev/reboot";
import { describe, it, before, after } from "node:test";
import { strict as assert } from "node:assert";

// NOTE: This test is skipped, because it hangs with the Bazel test runner with Aspect rules.
// Stays here for awareness.
describe.skip("Tests with Bazel Aspect rules runner should not hang, if all test cases ran", () => {
  let context: ExternalContext;
  let rbt: Reboot;

  before(async () => {
    rbt = new Reboot();
    await rbt.start();
  });

  // NOTE: This is intentionally commented out to test the process exit behaviour.
  // after(async () => {
  //   await rbt.stop();
  // });

  it("starts Reboot", () => {
    assert.ok(true);
  });
});
