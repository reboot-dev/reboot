import { Application, Reboot } from "@reboot-dev/reboot";
import { blobLibrary } from "@reboot-dev/reboot-std/blob/v1";
import { strict as assert } from "node:assert";
import test from "node:test";

test("blob library in a Node.js application", async (t) => {
  let rbt: Reboot;

  t.beforeEach(async () => {
    rbt = new Reboot();
    await rbt.start();
  });

  t.afterEach(async () => {
    await rbt.stop();
  });

  await t.test("refuses to start without a data plane URL", async (t) => {
    // The filesystem data plane serves its bytes over HTTP routes that
    // only Python applications register, so a Node.js application
    // that is not pointed at a data plane elsewhere must be refused at
    // startup, rather than start and mint upload URLs nothing serves.
    const application = new Application({
      libraries: [blobLibrary()],
    });
    await assert.rejects(rbt.up(application), (error: Error) =>
      error.message.includes("REBOOT_BLOB_DATA_PLANE_URL")
    );
  });
});
