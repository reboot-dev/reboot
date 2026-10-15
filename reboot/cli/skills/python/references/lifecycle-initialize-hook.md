---
title: Use `initialize` for First-Run Setup
impact: HIGH
impactDescription: Singletons and seeded state need an explicit creation path
tags: initialize, InitializeContext, create, singleton, bootstrap
---

## Use `initialize` for First-Run Setup

> **Critical:** `initialize` runs on **every** application start, so
> its calls get an **auto-generated idempotency key** (one per
> `actor` + `method`) and run once. Constructors —
> `Service.create(context, id)` / factory methods — are a no-op on
> existing actors. The catch: to call the **same method on the same
> actor more than once** you **must** distinguish the calls with
> `.idempotently("alias")` (or an explicit `key=`), or the second one
> raises `ValueError: To call '...' more than once using the same context an idempotency alias or key must be specified`
> (see below). Don't create singletons in a Servicer's `__init__` —
> that runs lazily per-actor, not at app start.

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
from bank.v1.bank_rbt import Bank

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

## Calling the Same Method More Than Once — `.idempotently("alias")`

`initialize` auto-generates an idempotency key per `(actor, method)`,
so **one** call to a given method is fine bare — that's why
`Service.create(...)` followed by a single `ref.send(...)` works
without any alias. But calling that **same** method on the **same**
actor again in the same `initialize` raises:

```text
ValueError: To call 'hello.v1.HelloMethods.Send' of 'reboot-hello'
more than once using the same context an idempotency alias or key
must be specified
```

Give each call a **distinct** `.idempotently("alias")` (or explicit
`key=`) so the runtime can tell them apart:

```python
async def initialize(context: InitializeContext):
    hello, _ = await Hello.create(
        context, "reboot-hello", initial_message="Welcome!",
    )

    # First `send` is fine bare; a second `send` to the same actor
    # needs its own alias, so give BOTH a distinct one.
    await hello.idempotently("Greeting").send(context, message="Hi!")
    await hello.idempotently("Follow-up").send(
        context, message="Sent after construction!",
    )
```

`.idempotently("alias")` is the mechanism here. Reusing the **same**
alias for two different calls is also an error — each distinct call
needs a distinct alias.
