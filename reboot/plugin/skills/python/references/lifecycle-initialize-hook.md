---
title: Use `initialize` for First-Run Setup
impact: HIGH
impactDescription: Singletons and seeded state need an explicit creation path
tags: initialize, InitializeContext, create, singleton, bootstrap
---

## Use `initialize` for First-Run Setup

> **Critical:** `initialize` runs on **every** application start —
> anything it does must be idempotent. Use `Service.create(context, id)`
> (no-op on existing actors), not `Service.ref(id).method(...)`. Don't
> create singletons in a Servicer's `__init__` — that runs lazily
> per-actor, not at app start.

`initialize` is an optional `async` callback passed to `Application(...)`. It
runs against an `InitializeContext` and is the right place to create
singletons or seed data that must exist before the first real request.

The callback runs each time the application starts; Reboot's idempotent
`Service.create(context, id)` makes calling it on every boot safe.

**Incorrect (creating singletons inside a Servicer's `__init__`):**

```python
# DON'T — Servicer instances are created on demand, not at app start.
class BankServicer(Bank.Servicer):
    def __init__(self):
        # This won't run "at startup"; it runs the first time
        # someone references the Bank actor.
        Bank.create(...)  # also: no context here
```

**Correct (matches the [`reboot-bank-pydantic`](https://github.com/reboot-dev/reboot-bank-pydantic) example, `backend/src/main.py`):**

```python
from reboot.aio.applications import Application
from reboot.aio.external import InitializeContext
from bank.v1.pydantic.bank_rbt import Bank

SINGLETON_BANK_ID = 'SVB'


async def initialize(context: InitializeContext):
    await Bank.create(context, SINGLETON_BANK_ID)


async def main():
    await Application(
        servicers=[AccountServicer, BankServicer],
        initialize=initialize,
    ).run()
```

## Implicit Constructor on First Write

If a `Type` does **not** declare a `factory=True` method, Reboot will
implicitly create the actor on the first writer call. A simple chat
room can use this — no explicit `ChatRoom.create(...)` is needed when
`send` is a `Writer`:

```python
async def initialize(context: InitializeContext):
    chat_room = ChatRoom.ref(EXAMPLE_STATE_MACHINE_ID)
    # Implicitly construct state machine upon first write.
    await chat_room.send(context, message="Hello, World!")
```

When the API **does** declare a factory (`Writer(... factory=True ...)`
or `Transaction(... factory=True ...)`), call it explicitly via
`Service.create(context, id)` or `Service.<CtorMethod>(context, id, ...)`.
