import {
  Application,
  Auth,
  ReaderContext,
  Reboot,
  TokenVerifier,
} from "@reboot-dev/reboot";
import { errors_pb } from "@reboot-dev/reboot-api";
import { MousePosition } from "@reboot-dev/reboot-std/presence/mouse_tracker/v1";
import { Subscriber } from "@reboot-dev/reboot-std/presence/subscriber/v1";
import { Presence, presenceLibrary } from "@reboot-dev/reboot-std/presence/v1";
import { strict as assert } from "node:assert";
import { test } from "node:test";

class EmptyTokenVerifier extends TokenVerifier {
  async verifyToken(
    context: ReaderContext,
    token?: string
  ): Promise<Auth | null> {
    assert(context.appInternal);
    return new Auth({ userId: token || "default-user" });
  }
}

test("Use Presence Servicers", async (t) => {
  // These tests simply verify that we are properly exporting the Presence servicers
  // to be used in typescript. They aren't meant to thoroughly test any Presence logic.

  let rbt: Reboot;

  t.beforeEach(async () => {
    rbt = new Reboot();
    await rbt.start();
  });

  t.afterEach(async () => {
    await rbt.stop();
  });

  await t.test("Create Subscriber", async (t) => {
    await rbt.up(
      new Application({
        libraries: [presenceLibrary()],
        tokenVerifier: new EmptyTokenVerifier(),
      })
    );

    const context = rbt.createExternalContext("test");

    const subscriber = Subscriber.ref("test-id");

    // Should not error.
    await subscriber.create(context);
  });

  await t.test("Subscribe", async (t) => {
    await rbt.up(
      new Application({
        libraries: [presenceLibrary()],
        tokenVerifier: new EmptyTokenVerifier(),
      })
    );

    const context = rbt.createExternalContext("test");

    const subscriber = Subscriber.ref("test");
    const presence = Presence.ref("presence-test-id");

    // Should not error.
    await subscriber.create(context);

    // Subsequent call should error.
    try {
      await presence.subscribe(context, {
        subscriberId: subscriber.stateId,
      });

      assert(false);
    } catch (e) {
      assert(e instanceof Presence.SubscribeAborted);
      assert(e.code === 9);
      assert(e.error instanceof errors_pb.FailedPrecondition);
    }
  });

  await t.test("Update Mouse Position", async (t) => {
    await rbt.up(
      new Application({
        libraries: [presenceLibrary()],
        tokenVerifier: new EmptyTokenVerifier(),
      })
    );

    const context = rbt.createExternalContext("test");

    const mousePosition = MousePosition.ref("mouse-position-test-id");

    // Should not error.
    await mousePosition.update(context, {
      left: 1,
      top: 2,
    });
  });
});
