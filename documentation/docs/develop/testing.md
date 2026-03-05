# Test your application

## Unit Testing

Testing a Reboot application typically involves testing the servicers you have
implemented.

### Python

To write a test, you can use the `reboot.aio.tests.Reboot` class. This allows
you to start your servicer, create a context, and call the method you want to
test.

<!-- MARKDOWN-AUTO-DOCS:START
(CODE:src=../../../reboot/examples/chat-room/backend/tests/chat_room_servicer_test.py&lines=10-40) -->
<!-- The below code snippet is automatically added from ../../../reboot/examples/chat-room/backend/tests/chat_room_servicer_test.py -->

```py
async def asyncSetUp(self) -> None:
    self.rbt = Reboot()
    await self.rbt.start()

async def asyncTearDown(self) -> None:
    await self.rbt.stop()

async def test_chat_room(self) -> None:
    await self.rbt.up(Application(servicers=[ChatRoomServicer]))

    context = self.rbt.create_external_context(name=f"test-{self.id()}")

    chat_room = ChatRoom.ref("testing-chat-room")

    await chat_room.send(context, message="Hello, World")

    response: ChatRoom.MessagesResponse = await chat_room.messages(context)
    self.assertEqual(response.messages, ["Hello, World"])

    await chat_room.send(context, message="Hello, Reboot!")
    await chat_room.send(context, message="Hello, Peace of Mind!")
    response = await chat_room.messages(context)
    self.assertEqual(
        response.messages,
        [
            "Hello, World",
            "Hello, Reboot!",
            "Hello, Peace of Mind!",
        ],
    )
```

<!-- MARKDOWN-AUTO-DOCS:END -->

#### Mocking Secrets

Some servicers may use secrets for connecting to external services or handling
sensitive data. You can mock secrets using
`reboot.aio.secrets.MockSecretSource`, which lets you override the secrets with
values you provide.

<!-- MARKDOWN-AUTO-DOCS:START
(CODE:src=../../../reboot/examples/boutique/backend/tests/full_app_test.py&lines=26-33) -->
<!-- The below code snippet is automatically added from ../../../reboot/examples/boutique/backend/tests/full_app_test.py -->

```py
Secrets.set_secret_source(
    MockSecretSource(
        {
            MAILGUN_API_KEY_SECRET_NAME: MAILGUN_API_KEY.encode(),
        }
    )
)
```

<!-- MARKDOWN-AUTO-DOCS:END -->

### TypeScript

For TypeScript, you can use the `Reboot` class from the `@reboot-dev/reboot` package to start your servicer,
create a context, and call the methods you want to test.
With the Node.js built-in test runner use `t` to call subtests and remember to `await` on them.

<!-- MARKDOWN-AUTO-DOCS:START
(CODE:src=../../../reboot/examples/chat-room-nodejs/backend/tests/test.ts&lines=2-36) -->
<!-- The below code snippet is automatically added from ../../../reboot/examples/chat-room-nodejs/backend/tests/test.ts -->

```ts
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
```

<!-- MARKDOWN-AUTO-DOCS:END -->

If you prefer to write tests in [BDD](https://en.wikipedia.org/wiki/Behavior-driven_development) style,
you can easily set up Reboot yourself in the test preparations, too.

<!-- MARKDOWN-AUTO-DOCS:START
(CODE:src=../../../reboot/examples/chat-room-nodejs/backend/tests/test_bdd.ts&lines=5-39) -->
<!-- The below code snippet is automatically added from ../../../reboot/examples/chat-room-nodejs/backend/tests/test_bdd.ts -->

```ts
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
```

<!-- The below code snippet is automatically added from ../../../reboot/examples/chat-room-nodejs/backend/tests/test_bdd.ts -->
<!-- MARKDOWN-AUTO-DOCS:END -->

#### Vitest

If you are using Vitest, errors printed to the console coming from 3rd-party libraries, could be potentially suppressed by the default reporters. We provide the `BetterErrorTracingReporter` for Vitest, which you could use for full error output.

In your `vitest.config.ts` apply it as follows:

```ts
import { defineConfig } from "vitest/config";
import { BetterErrorTracingReporter } from "@reboot-dev/reboot-std/vitest";

export default defineConfig({
  test: {
    reporters: [new BetterErrorTracingReporter()],
  },
});
```

## Calling your endpoint from outside of an app

You are able to call your servicer methods from outside of a Reboot app using
an [`ExternalContext`](/develop/call/from_outside_your_app) or directly
with an [`HTTP`](/develop/call/via_http) request.
