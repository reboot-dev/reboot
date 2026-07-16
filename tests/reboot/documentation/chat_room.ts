import {
  allow,
  Application,
  ExternalContext,
  Reboot,
  ReaderContext,
  WriterContext,
} from "@reboot-dev/reboot";
import { strict as assert } from "node:assert";
import test from "node:test";
import { ChatRoom } from "./chat_room_rbt.js";

const chatRoomServicer = ChatRoom.servicer({
  authorizer: () => {
    return allow();
  },

  messages: async (
    context: ReaderContext,
    state: ChatRoom.State,
    request: ChatRoom.MessagesRequest
  ): Promise<ChatRoom.PartialMessagesResponse> => {
    return { messages: state.messages };
  },

  send: async (
    context: WriterContext,
    state: ChatRoom.State,
    request: ChatRoom.SendRequest
  ): Promise<[ChatRoom.State, ChatRoom.PartialSendResponse]> => {
    state.messages.push(request.message);
    return [state, {}];
  },
});

// Validates the snippets used in
// `documentation/docs/learn_more/call/from_outside_your_app.mdx`.
test("chat room", async (t) => {
  let rbt: Reboot;
  t.before(async () => {
    rbt = new Reboot();
    await rbt.start();
    await rbt.up(new Application({ servicers: [chatRoomServicer] }));
  });
  t.after(async () => {
    await rbt.stop();
  });

  await t.test("send from outside", async (t) => {
    // The URL of the application, e.g., "http://localhost:9991".
    const url = rbt.url();
    const id = "my-chat-room";

    const context = new ExternalContext({
      name: "send message",
      url,
    });

    const chatRoom = ChatRoom.ref(id);

    const response = await chatRoom.send(context, {
      message: "Hello, World!",
    });

    void response;

    const { messages } = await chatRoom.messages(context);
    assert.deepEqual(messages, ["Hello, World!"]);
  });

  await t.test("send with idempotency seed", async (t) => {
    const url = rbt.url();

    const context = new ExternalContext({
      name: "send message",
      url,
      idempotencySeed: "123e4567-e89b-12d3-a456-426614174000",
    });

    const chatRoom = ChatRoom.ref("my-chat-room");

    await chatRoom.send(context, { message: "Hello, again!" });

    const { messages } = await chatRoom.messages(context);
    assert.deepEqual(messages, ["Hello, World!", "Hello, again!"]);
  });
});
