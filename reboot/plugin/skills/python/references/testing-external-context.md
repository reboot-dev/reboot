---
title: Issue Test Calls via `create_external_context`
impact: MEDIUM
impactDescription: Tests can't call into the application without an external context
tags: testing, external-context, RPC, harness
---

## Issue Test Calls via `create_external_context`

> **Critical:** never instantiate `ReaderContext`/`WriterContext`/etc.
> directly — those are runtime-managed. Use
> `rbt.create_external_context(name=...)` and pass it as the `context=`
> argument to actor method calls. One context can drive many calls in
> a single test.

Inside a Reboot test, call into the application using a context created by
`rbt.create_external_context(name=...)`. That context plays the role of an
outside caller — it can invoke any servicer method just like a real
client.

**Incorrect (constructing a context by hand):**

```python
# Don't try to instantiate ReaderContext etc. directly — those types are
# managed by the runtime.
ctx = ReaderContext(...)  # not a public construction path
```

**Correct (matches the [`reboot-hello`](https://github.com/reboot-dev/reboot-hello) example, `backend/tests/chat_room_servicer_test.py`):**

```python
context = self.rbt.create_external_context(name=f"test-{self.id()}")
chat_room = ChatRoom.ref("testing-chat-room")

await chat_room.send(context, message="Hello, World")

response = await chat_room.messages(context)
self.assertEqual(response.messages, ["Hello, World"])
```

## `name` Should Be Unique per Test

Pass a name that ties back to the test (e.g. `f"test-{self.id()}"`) so the
tracing output of failing tests is identifiable.

## One Context, Many Calls

A single external context can drive many calls in one test:

```python
async def test_chat_room(self) -> None:
    await self.rbt.up(Application(servicers=[ChatRoomServicer]))

    context = self.rbt.create_external_context(name=f"test-{self.id()}")
    chat_room = ChatRoom.ref("testing-chat-room")

    await chat_room.send(context, message="Hello, World")
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

## External Context Can Initiate Transactions

External contexts can call `transaction` methods directly — no in-app
caller needed. This makes them suitable for testing cross-actor flows.
