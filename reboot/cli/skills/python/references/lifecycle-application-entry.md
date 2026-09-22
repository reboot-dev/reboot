---
title: Define the Application Entry Point
impact: CRITICAL
impactDescription: Application won't start without a correctly-shaped `main`
tags: main, application, asyncio, servicers, libraries
---

## Define the Application Entry Point

> **Critical:** pass Servicer **classes** to `Application(servicers=[...])`,
> not instances. `[ChatRoomServicer()]` is wrong; `[ChatRoomServicer]`
> is right. Stdlib types need `libraries=[ordered_map_library(), ...]`
> registered alongside their `servicers()`.

Every Reboot Python application has an `async def main()` that constructs an
`Application` with the list of Servicer classes and any standard-library
components, then awaits `.run()`. The `__main__` block runs it under
`asyncio.run`.

**Incorrect (sync main, no `Application` wrapper):**

```python
# DON'T — Reboot Servicers run inside an Application event loop.
from chat_room_servicer import ChatRoomServicer

if __name__ == '__main__':
    ChatRoomServicer().serve()  # not how Reboot starts
```

**Correct (canonical entry shape):**

```python
import asyncio
import logging
from chat_room.v1.chat_room_rbt import ChatRoom
from chat_room_servicer import ChatRoomServicer
from reboot.aio.applications import Application
from reboot.aio.external import InitializeContext

logging.basicConfig(level=logging.INFO)

EXAMPLE_STATE_MACHINE_ID = 'reboot-chat-room'


async def initialize(context: InitializeContext):
    chat_room = ChatRoom.ref(EXAMPLE_STATE_MACHINE_ID)
    await chat_room.send(context, message="Hello, World!")


async def main():
    await Application(
        servicers=[ChatRoomServicer],
        initialize=initialize,
    ).run()


if __name__ == '__main__':
    asyncio.run(main())
```

## Pass Servicer Classes, Not Instances

`Application(servicers=[...])` takes the **classes**. Reboot constructs
instances per actor as needed.

**Incorrect:**

```python
await Application(servicers=[ChatRoomServicer()]).run()  # instance, wrong
```

**Correct:**

```python
await Application(servicers=[ChatRoomServicer]).run()
```

## Multiple Servicers and Stdlib Libraries

Combine Servicer classes from your code with stdlib `servicers()` factories
and `libraries=[...]` for stdlib state types:

```python
import reboot.thirdparty.mailgun
from reboot.aio.applications import Application
from reboot.std.collections.ordered_map.v1.ordered_map import (
    ordered_map_library,
)


async def main():
    await Application(
        servicers=[AccountServicer, BankServicer]
        + reboot.thirdparty.mailgun.servicers(),
        libraries=[ordered_map_library()],
        initialize=initialize,
    ).run()
```

## See Also

If you're using any stdlib state type, the wiring lives in **two**
places: its `servicers()` list goes into `servicers=[...]`, and its
`<name>_library()` factory goes into `libraries=[...]`. Forgetting
either gives a runtime "unknown actor type" error. The references for
each type call out exactly what to register:

- `stdlib-ordered-map.md` — `ordered_map.servicers()` + `ordered_map_library()`
- `stdlib-queue.md` — `queue.servicers()` + the stdlib map library
  (`Queue` uses a stdlib sorted-map actor under the hood — see the
  reference for the exact import)
- `stdlib-pubsub.md` — `pubsub.servicers()` (transitively pulls
  `queue.servicers()`) + the stdlib map library
- `stdlib-presence.md` — `presence.servicers()` (returns three
  Servicers; no library factory)

For first-run setup that creates singletons or seeds state, see
`lifecycle-initialize-hook.md`.
