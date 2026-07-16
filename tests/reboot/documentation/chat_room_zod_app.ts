import {
  Application,
  InitializeContext,
  ReaderContext,
  Reboot,
  WriterContext,
} from "@reboot-dev/reboot";
import { strict as assert } from "node:assert";
import test from "node:test";
import { ChatRoom } from "./chat_room_zod_rbt.js";

export const chatRoomServicer = ChatRoom.servicer({
  messages: async (
    context: ReaderContext,
    state: ChatRoom.State,
    request: ChatRoom.MessagesRequest
  ): Promise<ChatRoom.MessagesResponse> => {
    return { messages: state.messages };
  },

  send: async (
    context: WriterContext,
    state: ChatRoom.State,
    request: ChatRoom.SendRequest
  ): Promise<[ChatRoom.State]> => {
    state.messages.push(request.message);
    return [state];
  },
});

export class ChatRoomServicer extends ChatRoom.Servicer {
  async messages(
    context: ReaderContext,
    request: ChatRoom.MessagesRequest
  ): Promise<ChatRoom.MessagesResponse> {
    return { messages: this.state.messages };
  }

  async send(
    context: WriterContext,
    request: ChatRoom.SendRequest
  ): Promise<void> {
    this.state.messages.push(request.message);
  }
}

const initialize = async (context: InitializeContext) => {
  const chatRoom = ChatRoom.ref("reboot-chat-room");

  await chatRoom.send(context, { message: "Hello, World!" });
};

function main() {
  new Application({
    servicers: [chatRoomServicer],
    initialize,
  }).run();
}

void main;

function mainWithClassServicer() {
  new Application({
    servicers: [ChatRoomServicer],
    initialize,
  }).run();
}

void mainWithClassServicer;

// Runs the snippets used in
// `documentation/docs/full_stack_apps/typescript.mdx`.
test("chat room app from the full-stack tutorial", async (t) => {
  let rbt: Reboot;
  t.before(async () => {
    rbt = new Reboot();
    await rbt.start();
    await rbt.up(
      new Application({ servicers: [chatRoomServicer], initialize })
    );
  });
  t.after(async () => {
    await rbt.stop();
  });

  await t.test("initialize sent the first message", async (t) => {
    const context = rbt.createExternalContext("documentation", {
      appInternal: true,
    });

    const chatRoom = ChatRoom.ref("reboot-chat-room");

    const { messages } = await chatRoom.messages(context);
    assert.deepEqual(messages, ["Hello, World!"]);
  });
});
