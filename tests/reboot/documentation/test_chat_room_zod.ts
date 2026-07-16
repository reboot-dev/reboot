import { strict as assert } from "node:assert";
import test from "node:test";
import { ChatRoom } from "./chat_room_zod.js";

// Validates the Zod API definition snippet used in
// `documentation/docs/learn_more/call/from_react.mdx`.
test("Tests for the from_react documentation Zod snippet", () => {
  const { messages, send } = ChatRoom.methods;
  assert.equal(messages.kind, "reader");
  assert.equal(send.kind, "writer");

  assert.equal(send.request.message.parse("Hello, World"), "Hello, World");
  assert.deepEqual(ChatRoom.state.messages.parse(undefined), []);
});
