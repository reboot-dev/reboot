import { Application, Reboot } from "@reboot-dev/reboot";
import { ciphertextLibrary } from "@reboot-dev/reboot-std/ciphertext/v1";
import { orderedMapLibrary } from "@reboot-dev/reboot-std/collections/ordered_map/v1";
import {
  GOOGLE,
  OAuthTokenManager,
  oauthLibrary,
} from "@reboot-dev/reboot-std/oauth/v1";
import { strict as assert } from "node:assert";
import { test } from "node:test";

function main() {
  new Application({
    libraries: [oauthLibrary(), ciphertextLibrary(), orderedMapLibrary()],
  }).run();
}

void main;

// Runs the snippets used in
// `documentation/docs/library_services/oauth_token_manager.mdx`.
test("OAuthTokenManager documentation snippets", async (t) => {
  let rbt: Reboot;
  t.beforeEach(async () => {
    rbt = new Reboot();
    await rbt.start();
    await rbt.up(
      new Application({
        libraries: [oauthLibrary(), ciphertextLibrary(), orderedMapLibrary()],
      })
    );
  });
  t.afterEach(async () => {
    await rbt.stop();
  });

  await t.test("store, fetch, shred", async (t) => {
    const context = rbt.createExternalContext("documentation", {
      appInternal: true,
    });

    const userId = "u1";
    const accessToken = "access-1";
    const refreshToken = "refresh-1";
    const expiresAt = 2000000000n;
    const grantedScopes = ["calendar.events"];

    await OAuthTokenManager.ref("slack.com").store(context, {
      userId,
      tokens: {
        accessToken,
        refreshToken, // Omit if none was issued.
        expiresAt, // Epoch seconds, if reported.
        scopes: grantedScopes,
      },
    });

    await OAuthTokenManager.ref(GOOGLE).store(context, {
      userId,
      tokens: { accessToken },
    });

    const response = await OAuthTokenManager.ref(GOOGLE).fetch(context, {
      userId,
    });
    if (response.found) {
      const accessToken = response.tokens.accessToken;

      void accessToken;
    }

    assert(response.found);
  });
});
