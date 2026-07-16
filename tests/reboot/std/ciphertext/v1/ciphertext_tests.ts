import { Application, Reboot } from "@reboot-dev/reboot";
import {
  APP_SHARED_KEY_MANAGER_ID,
  Ciphertext,
  ciphertextLibrary,
  KeyManager,
  makeAssociatedData,
} from "@reboot-dev/reboot-std/ciphertext/v1";
import { orderedMapLibrary } from "@reboot-dev/reboot-std/collections/ordered_map/v1";
import { strict as assert } from "node:assert";
import { test } from "node:test";

function main() {
  new Application({
    libraries: [ciphertextLibrary(), orderedMapLibrary()],
  }).run();
}

void main;

// Runs the snippets used in
// `documentation/docs/library_services/ciphertext.mdx`.
test("Ciphertext documentation snippets", async (t) => {
  let rbt: Reboot;
  t.beforeEach(async () => {
    rbt = new Reboot();
    await rbt.start();
    await rbt.up(
      new Application({
        libraries: [ciphertextLibrary(), orderedMapLibrary()],
      })
    );
  });
  t.afterEach(async () => {
    await rbt.stop();
  });

  await t.test("encrypt, decrypt, rescope", async (t) => {
    const context = rbt.createExternalContext("documentation", {
      appInternal: true,
    });

    const associatedData = makeAssociatedData({
      user_id: "42",
      purpose: "ssn",
    });

    void associatedData;

    const ciphertextId = crypto.randomUUID();
    const [ciphertext] = await Ciphertext.encrypt(context, ciphertextId, {
      plaintext: new TextEncoder().encode("123-45-6789"),
      associatedData: makeAssociatedData({ user_id: "42", purpose: "ssn" }),
      scope: "user_id:42",
      keyManagerId: APP_SHARED_KEY_MANAGER_ID,
    });

    void ciphertext;

    const response = await Ciphertext.ref(ciphertextId).decrypt(context, {
      associatedData: makeAssociatedData({ user_id: "42", purpose: "ssn" }),
    });
    const plaintext = new TextDecoder().decode(response.plaintext);

    assert(plaintext === "123-45-6789");

    await Ciphertext.ref(ciphertextId).rescope(context, {
      scope: "tenant:acme",
    });
  });

  await t.test("named manager and shred", async (t) => {
    const context = rbt.createExternalContext("documentation", {
      appInternal: true,
    });

    const ciphertextId = crypto.randomUUID();

    // Encrypt under a named manager.
    await Ciphertext.encrypt(context, ciphertextId, {
      plaintext: new TextEncoder().encode("123-45-6789"),
      associatedData: makeAssociatedData({ user_id: "42", purpose: "ssn" }),
      scope: "user_id:42",
      keyManagerId: "tenant:acme",
    });

    // Shred that scope within the same manager.
    await KeyManager.ref("tenant:acme").shred(context, {
      scope: "user_id:42",
    });

    await KeyManager.ref(APP_SHARED_KEY_MANAGER_ID).shred(context, {
      scope: "user_id:42",
    });
  });
});
