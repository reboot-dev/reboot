---
title: Spin Up Tests with the `Reboot()` Harness
impact: MEDIUM
impactDescription: Without the harness, Servicer methods can't be exercised end-to-end
tags: testing, Reboot, harness, IsolatedAsyncioTestCase, setup
---

## Spin Up Tests with the `Reboot()` Harness

> **Critical:** don't construct Servicer instances directly — that
> bypasses identity, context, and persistence. Use `Reboot()` +
> `rbt.up(Application(...))` + `rbt.create_external_context(...)`,
> then call methods through `Service.ref(id).method(context, ...)`.

Reboot ships an in-process test harness at `reboot.aio.tests.Reboot`. Use
it from a `unittest.IsolatedAsyncioTestCase` to start a Reboot runtime,
register an `Application` via `rbt.up(...)`, and tear it down between
tests.

**Incorrect (calling Servicer methods directly without a harness):**

```python
# DON'T — there's no actor identity, no context, no persistence.
servicer = ChatRoomServicer()
await servicer.send(...)
```

**Correct (matches the [`reboot-hello`](https://github.com/reboot-dev/reboot-hello) example, `backend/tests/chat_room_servicer_test.py`):**

```python
import unittest
from chat_room.v1.chat_room_rbt import ChatRoom
from chat_room_servicer import ChatRoomServicer
from reboot.aio.applications import Application
from reboot.aio.tests import Reboot


class TestChatRoom(unittest.IsolatedAsyncioTestCase):

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

        response = await chat_room.messages(context)
        self.assertEqual(response.messages, ["Hello, World"])
```

## Pattern: Setup → Up → Run → Teardown

- `Reboot()` constructs the harness.
- `await rbt.start()` boots the in-process runtime.
- `await rbt.up(Application(...))` launches the application; pass it the
  same Servicers and stdlib `libraries=[...]` you'd pass in production.
- `await rbt.stop()` tears it all down.

## Use a Unique Actor ID per Test

Tests share the harness only within their `asyncSetUp`/`asyncTearDown`
window, but be defensive: use a per-test actor ID (e.g. include
`self.id()`) to keep tests independent if you ever run them with shared
state.

## Tests Are Real End-to-End

The harness exercises the full RPC path — not Servicer instances directly.
That means the same context-type rules, error semantics, and
serialization apply. If a test passes, the wiring is correct.
