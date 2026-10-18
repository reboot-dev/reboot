import {
  Application,
  ReaderContext,
  Reboot,
  WriterContext,
  allow,
} from "@reboot-dev/reboot";
import { WebContext } from "@reboot-dev/reboot-web";
import { strict as assert } from "node:assert";
import test from "node:test";
import { ChatRoom as ChatRoomBackend } from "./chat_room_zod_rbt.js";
import { ChatRoom } from "./chat_room_zod_rbt_web.js";

// The servicer for the Zod `ChatRoom` in `chat_room_zod.ts`, which the
// React docs show as the TypeScript API definition.
class ChatRoomServicer extends ChatRoomBackend.Servicer {
  authorizer() {
    return allow();
  }

  async messages(
    context: ReaderContext,
    request: ChatRoomBackend.MessagesRequest
  ): Promise<ChatRoomBackend.PartialMessagesResponse> {
    return { messages: this.state.messages };
  }

  async send(
    context: WriterContext,
    request: ChatRoomBackend.SendRequest
  ): Promise<void> {
    this.state.messages.push(request.message);
  }
}

// Runs the reactive read that the "Calling readers reactively" section
// of `documentation/docs/call/from_outside_your_app.mdx` shows, so the
// snippet is real and tested. Reactive reads from TypeScript use the
// web client (`@reboot-dev/reboot-web`), which works from Node.js too.
test("chat room", async (t) => {
  let rbt: Reboot;
  t.before(async () => {
    rbt = new Reboot();
    await rbt.start();
    // The web client connects to a URL, which the local Envoy provides.
    await rbt.up(new Application({ servicers: [ChatRoomServicer] }), {
      localEnvoy: true,
    });
  });
  t.after(async () => {
    await rbt.stop();
  });

  await t.test("read messages reactively", async () => {
    const context = new WebContext({ url: rbt.url() });
    const chatRoom = ChatRoom.ref("reboot-chat-room");
    await chatRoom.send(context, { message: "Hello, World!" });

    // The docs snippet: from `const [responses]` through the loop.
    const [responses] = await chatRoom.reactively().messages(context);
    for await (const { response, aborted } of responses) {
      if (aborted !== undefined) {
        // The reader raised an error, e.g., the chat room does not
        // exist yet. The read continues and yields again once the
        // state changes.
        console.log(`Could not read messages: ${aborted.message}`);
        continue;
      }
      console.log(response.messages);
      if (response.messages.includes("Hello, World!")) {
        break;
      }
    }
  });

  await t.test("read before the chat room exists", async () => {
    const context = new WebContext({ url: rbt.url() });
    const abortController = new AbortController();
    const [responses] = await ChatRoom.ref("another-chat-room")
      .reactively()
      .messages(context, {}, { signal: abortController.signal });
    const result = await responses.next();
    if (result.done === true) {
      throw new Error("Expected an item");
    }
    const { response, aborted } = result.value;
    assert(response === undefined);
    assert(aborted !== undefined);
    // A Zod API's errors are plain objects discriminated by `type`.
    assert(aborted.error.type === "StateNotConstructed");
    abortController.abort();
    assert((await responses.next()).done);
  });
});
