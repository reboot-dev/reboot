import { Application, Reboot } from "@reboot-dev/reboot";
import { Blob, blobLibrary } from "@reboot-dev/reboot-std/blob/v1";
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

  await t.test("creates blobs against the store it runs", async () => {
    // A Node.js application hosts the library's Python servicers,
    // and with no store configured the library runs a MinIO of its
    // own, as it does for a Python application.
    const application = new Application({
      libraries: [blobLibrary()],
    });
    await rbt.up(application);

    const context = rbt.createExternalContext({
      name: "blob-tests",
      appInternal: true,
    });
    const [blob] = await Blob.create(context, {
      contentType: "text/plain",
    });
    const info = await blob.info(context);
    assert.equal(info.contentType, "text/plain");
  });
});
