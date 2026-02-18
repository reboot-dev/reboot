import test from "node:test";
import { strict as assert } from "node:assert";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import {
  Secrets,
  SecretNotFoundException,
  MockSecretSource,
  ENVVAR_RBT_SECRETS_DIRECTORY,
} from "@reboot-dev/reboot/secrets";

test("secrets", async (t) => {
  await t.test("from environment", async (t) => {
    const secretEnvName = "RBT_SECRET_TEST_SECRET";
    const testValue = "test_secret_value";
    let originalValue;
    t.before(async () => {
      originalValue = process.env[secretEnvName];
      process.env[secretEnvName] = testValue;
    });
    t.after(async () => {
      if (originalValue === undefined) {
        delete process.env[secretEnvName];
      } else {
        process.env[secretEnvName] = originalValue;
      }
    });

    await t.test("existing", async (t) => {
      const secrets = new Secrets();
      const test = async (secretName: string) => {
        const decoder = new TextDecoder("utf-8");
        const actualValue = await secrets.get(secretName);
        assert.strictEqual(decoder.decode(actualValue), testValue);
      };
      await test("test-secret");
      await test("test_secret");
      await test("TEST_SECRET");
    });

    await t.test("missing", async (t) => {
      const secrets = new Secrets();
      try {
        await secrets.get("does-not-exist");
        throw new Error("Should be unreachable!");
      } catch (error) {
        assert(error instanceof SecretNotFoundException);
      }
    });
  });

  await t.test("from disk", async (t) => {
    // Write a secrets file in a temporary directory.
    const tempDirPath = path.join(
      os.tmpdir(),
      `test-temp-${crypto.randomUUID()}`
    );
    await fs.mkdir(tempDirPath);
    const secretName = "test_secret";
    const testValue = "test_secret_value";
    await fs.writeFile(path.join(tempDirPath, secretName), testValue);

    let originalValue;
    t.before(async () => {
      originalValue = process.env[ENVVAR_RBT_SECRETS_DIRECTORY];
      process.env[ENVVAR_RBT_SECRETS_DIRECTORY] = tempDirPath;
    });
    t.after(async () => {
      if (originalValue === undefined) {
        delete process.env[ENVVAR_RBT_SECRETS_DIRECTORY];
      } else {
        process.env[ENVVAR_RBT_SECRETS_DIRECTORY] = originalValue;
      }
    });

    await t.test("existing", async (t) => {
      const secrets = new Secrets();
      const decoder = new TextDecoder("utf-8");
      const actualValue = await secrets.get(secretName);
      assert.strictEqual(decoder.decode(actualValue), testValue);
    });

    await t.test("missing", async (t) => {
      const secrets = new Secrets();
      try {
        await secrets.get("does-not-exist");
        throw new Error("Should be unreachable!");
      } catch (error) {
        assert(error instanceof SecretNotFoundException);
      }
    });
  });

  await t.test("from mock", async (t) => {
    const secretName = "test_secret";
    const testValue = "test_secret_value";

    t.before(async () => {
      Secrets.setSecretSource(
        new MockSecretSource({ [secretName]: Buffer.from(testValue, "utf8") })
      );
    });
    t.after(async () => {
      Secrets.setSecretSource(null);
    });

    await t.test("existing", async (t) => {
      const secrets = new Secrets();
      const decoder = new TextDecoder("utf-8");
      const actualValue = await secrets.get(secretName);
      assert.strictEqual(decoder.decode(actualValue), testValue);
    });

    await t.test("missing", async (t) => {
      const secrets = new Secrets();
      try {
        await secrets.get("does-not-exist");
        throw new Error("Should be unreachable!");
      } catch (error) {
        assert(error instanceof SecretNotFoundException);
      }
    });
  });
});
