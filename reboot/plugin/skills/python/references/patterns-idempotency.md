---
title: Make Constructor and `initialize` Calls Idempotent
impact: MEDIUM
impactDescription: Non-idempotent setup duplicates state on restart
tags: patterns, idempotency, initialize, constructor, restart
---

## Make Constructor and `initialize` Calls Idempotent

> **Critical:** `initialize` runs on every restart, and Reboot may
> retry transactions internally. `Service.create(context, id)` is the
> idempotent creation primitive — safe to call repeatedly. Inside a
> reusable constructor, gate set-once fields on `context.constructor`.

The `initialize` hook runs every time the application starts. Anything it
does must be safe to do repeatedly. Reboot's `Service.create(context, id)`
is the canonical idempotent creation primitive: calling it on an existing
actor is a no-op.

**Incorrect (initialize that double-creates on every boot):**

```python
async def initialize(context: InitializeContext):
    # If `initialize` is called twice (restarts), this would double-seed
    # state if the constructor weren't idempotent.
    bank = await Bank.ref(SINGLETON_BANK_ID).set_account_count(context, 0)
```

**Correct (matches the [`reboot-bank`](https://github.com/reboot-dev/reboot-bank) example):**

```python
async def initialize(context: InitializeContext):
    # Create-once: idempotent on subsequent boots.
    await Bank.create(context, SINGLETON_BANK_ID)
```

## Branch on `context.constructor` for Set-Once Fields

When a constructor method may be called more than once on the same actor,
guard set-once fields with `context.constructor`:

```python
async def open(
    self, context: WriterContext, request: OpenRequest,
) -> OpenResponse:
    if context.constructor:
        self.state.name = request.name
        self.state.created_at = now()
    # Other side effects always run:
    await self.ref().schedule(when=timedelta(seconds=1)).interest(context)
    return OpenResponse()
```

## Use UUIDv7 IDs for Insertable Records

When inserting into an `OrderedMap` keyed by time, prefer UUIDv7 over UUIDv4
so iteration is naturally ordered:

```python
from uuid7 import create as uuid7

await OrderedMap.ref(self.state.account_ids_map_id).insert(
    context,
    key=str(uuid7()),
    bytes=account_id.encode(),
)
```

## Re-running a Transaction Is Safe

Reboot may retry transactions internally. Don't write transaction code
that depends on running exactly once — every action inside a transaction
should be idempotent at the level of "the same input produces the same
state change once committed".
