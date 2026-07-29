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

#### Setting Secrets

Some servicers may use [secrets](/learn_more/secrets) for connecting
to external services or handling sensitive data. In tests, set the
required environment variables before starting the test harness.

<!-- MARKDOWN-AUTO-DOCS:START
(CODE:src=../../../reboot/examples/boutique/backend/tests/full_app_test.py&lines=25-25) -->
<!-- The below code snippet is automatically added from ../../../reboot/examples/boutique/backend/tests/full_app_test.py -->

```py
os.environ["MAILGUN_API_KEY"] = MAILGUN_API_KEY
```

<!-- MARKDOWN-AUTO-DOCS:END -->

#### Testing recovery from failures

The test harness can take your application down and bring it back
up, so you can test how your app recovers from a failure:
`rbt.up(...)` returns an `ApplicationRevision`, and passing it back
to `rbt.up()` restores the same application.

```py
revision = await self.rbt.up(Application(servicers=[OrderServicer]))

context = self.rbt.create_external_context(name=f"test-{self.id()}")
order = Order.ref(f"order-{self.id()}")
await order.place(context, sku="ABC", quantity=2)

# The process dies...
await self.rbt.down()

# ...and comes back.
await self.rbt.up(revision=revision)
```

:::tip Test in-flight work, not plain durability

Committed state surviving a restart is Reboot's own guarantee, so a
test that only asserts "the data is still there" afterwards is
testing Reboot rather than your application. What's worth testing is
what your app had **in flight** when the process died — a
[task](/learn_more/tasks) half-run, a
[workflow](/learn_more/implement/workflows) between steps, an effect
that must happen exactly once — and the invariants a partial
recovery could break: a counter that must not double-count, a
payment that must not go out twice.

:::

A few rules the harness enforces:

* Call `down()` before a second `up()`; bringing up an application
  that is already up raises a `ValueError`.
* `down()` stops the servers, while `rbt.stop()` tears down the
  harness itself — your `asyncTearDown` still calls `stop()`.
* While the app is down, don't `await` a unary call from the test's
  context. An
  [`ExternalContext`](/learn_more/call/from_outside_your_app) is the
  one context type that retries individual calls, and it retries
  `Unavailable` with no attempt limit — so the call waits for the app
  to come back instead of failing.

##### Failing inside a method, not between calls

A restart _between_ two calls only exercises a boundary the app
would survive anyway. To make the failure land in the middle of a
method — half a workflow done, a task picked up but unfinished —
replace that method with one that blocks until the test has taken
the app down:

```py
async def test_fulfillment_survives_a_crash_mid_flight(self) -> None:
    reached_mark_paid = asyncio.Event()
    app_is_down = asyncio.Event()

    # `mark_paid` is the writer the `fulfill` workflow calls once the
    # payment goes through.
    original_mark_paid = OrderServicer.mark_paid

    async def stalling_mark_paid(self, context, request):
        reached_mark_paid.set()
        # Hold the method open until the test kills the app.
        await app_is_down.wait()
        return await original_mark_paid(self, context, request)

    with mock.patch(
        "servicers.orders.OrderServicer.mark_paid", stalling_mark_paid
    ):
        revision = await self.rbt.up(
            Application(servicers=[OrderServicer])
        )
        context = self.rbt.create_external_context(
            name=f"test-{self.id()}"
        )

        order = Order.ref(f"order-{self.id()}")
        await order.place(context, sku="ABC", quantity=2)
        task = await order.spawn().fulfill(context)

        # Wait until the app is provably inside `mark_paid`.
        await reached_mark_paid.wait()

        await self.rbt.down()
        app_is_down.set()

        await self.rbt.up(revision=revision)

        # The workflow was picked back up and ran to completion.
        await task

    # The payment was recorded exactly once, despite the crash.
    response = await order.get(context)
    self.assertEqual(len(response.payments), 1)
```

The two `asyncio.Event`s are what make this deterministic instead of
a `sleep` race: one proves the app reached the method before the
kill, the other releases the method only afterwards.

Assert on the **state** the work produced — one payment recorded, a
balance that moved once — rather than on how many times a method
body ran. In unit tests Reboot enables **effect validation**, which
deliberately re-executes writer and transaction bodies to catch
bodies that aren't safe to re-run, so a counter incremented inside a
writer reports more calls than the test made. If a test really must
count those invocations, disable it for that test:

```py
from reboot.aio.contexts import EffectValidation

revision = await self.rbt.up(
    Application(servicers=[OrderServicer]),
    effect_validation=EffectValidation.DISABLED,
)
```

### TypeScript

For TypeScript, you can use the `Reboot` class from the `@reboot-dev/reboot` package to start your servicer,
create a context, and call the methods you want to test.
With the Node.js built-in test runner, call subtests through the `t` argument (`t.test(...)`) and remember to `await` them.

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

If you are using Vitest, its default reporters can suppress errors that third-party libraries print to the console. Reboot provides the `BetterErrorTracingReporter` for Vitest, which you can use to get full error output.

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

You can call your servicer methods from outside of a Reboot app using
an [`ExternalContext`](/learn_more/call/from_outside_your_app) or directly
with an [`HTTP`](/learn_more/call/via_http) request.
