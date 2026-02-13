// Polyfill WebSocket for Node.js
import { Application, Reboot } from "@reboot-dev/reboot";
import { strict as assert } from "node:assert";
import { test } from "node:test";
import { ChatRoom } from "../../api/chat_room/v1/chat_room_rbt.js";
import { ChatRoomServicer } from "../src/chat_room_servicer.js";

test("Calling ChatRoom.Send", async (t) => {
  let rbt: Reboot;

  t.before(async () => {
    rbt = new Reboot();
    await rbt.start();
    await rbt.up(new Application({ servicers: [ChatRoomServicer] }));
  });

  t.after(async () => {
    await rbt.stop();
  });

  await t.test("Messages", async (t) => {
    const context = rbt.createExternalContext("test");

    const chatRoom = ChatRoom.ref("chat-room-nodejs");

    await t.test("sends a message without throwing", async () => {
      await chatRoom.send(context, { message: "Hello, World!" });
    });

    await t.test("messages response includes correct messages", async () => {
      const response = await chatRoom.messages(context);
      assert(response.equals({ messages: ["Hello, World!"] }));
    });
  });
});
