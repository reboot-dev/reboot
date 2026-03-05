import { Application, ExternalContext, Reboot } from "@reboot-dev/reboot";
import { strict as assert } from "node:assert";
import { after, before, describe, it } from "node:test";
import {
  ChatRoom,
  ChatRoomWeakReference,
} from "../../api/chat_room/v1/chat_room_rbt.js";
import { ChatRoomServicer } from "../src/chat_room_servicer.js";

describe("ChatRoom Servicer", async () => {
  let context: ExternalContext;
  let rbt: Reboot;

  before(async () => {
    rbt = new Reboot();
    await rbt.start();
    await rbt.up(new Application({ servicers: [ChatRoomServicer] }));
    context = rbt.createExternalContext("test");
  });

  after(async () => {
    await rbt.stop();
  });

  describe("Messages", async () => {
    let chatRoom: ChatRoomWeakReference;

    before(() => {
      chatRoom = ChatRoom.ref("chat-room-nodejs");
    });

    it("sends a message without throwing", async () => {
      await chatRoom.send(context, { message: "Hello, World!" });
    });

    it("has correct response for messages", async () => {
      const response = await chatRoom.messages(context);
      assert(response.equals({ messages: ["Hello, World!"] }));
    });
  });
});
