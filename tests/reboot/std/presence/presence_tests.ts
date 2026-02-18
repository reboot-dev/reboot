import { test } from "node:test";
import { Application, Reboot } from "@reboot-dev/reboot";
import presence, { Presence } from "@reboot-dev/reboot-std/presence/v1";
import { MousePosition } from "@reboot-dev/reboot-std/presence/mouse_tracker/v1";
import { Subscriber } from "@reboot-dev/reboot-std/presence/subscriber/v1";
import { strict as assert } from "node:assert";

test("Use Presence Servicers", async (t) => {
  // These tests simply verify that we are properly exporting the Presence servicers
  // to be used in typescript. They aren't meant to thoroughly test any Presence logic.

  let rbt: Reboot;

  t.before(async () => {
    rbt = new Reboot();
    await rbt.start();
    await rbt.up(new Application({ servicers: presence.servicers() }));
  });

  t.after(async () => {
    await rbt.stop();
  });

  await t.test("Create Subscriber", async (t) => {
    const context = rbt.createExternalContext("test");

    const subscriber = Subscriber.ref("test-id");

    await t.test("create a subscriber without throwing", async () => {
      await subscriber.create(context);
    });
  });

  await t.test("Subscribe", async (t) => {
    const context = rbt.createExternalContext("test");

    const subscriber = Subscriber.ref("test");
    const presence = Presence.ref("presence-test-id");

    await t.test("create a subscriber without throwing", async () => {
      await subscriber.create(context);
    });

    await t.test(
      "subsequent call to subscribe responds with the proper error",
      async () => {
        try {
          await presence.subscribe(context, {
            subscriberId: subscriber.stateId,
          });

          assert(false);
        } catch (error) {
          assert(error.code === 9);
          assert(error.name === "PresenceSubscribeAborted");
        }
      }
    );
  });

  await t.test("Update Mouse Position", async (t) => {
    const context = rbt.createExternalContext("test");

    const mousePosition = MousePosition.ref("mouse-position-test-id");

    await t.test("update mouse position without throwing", async () => {
      await mousePosition.update(context, {
        left: 1,
        top: 2,
      });
    });
  });
});
