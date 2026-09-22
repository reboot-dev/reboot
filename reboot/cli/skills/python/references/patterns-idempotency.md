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

## Uncertain Mutations — `IdempotencyUncertainError`

When a mutation call raises, the client has to decide whether the
mutation actually happened on the server. It can only be sure when
the exception is **definitively from the backend**: an `Aborted`
carrying an error the method _declared_. Those are recoverable — a
caller can catch one and the transaction still commits.

Anything else (a transport failure, a cancellation, an undeclared
error) leaves the client genuinely unable to tell, so it marks the
context as having an **uncertain mutation**. The next mutation you
make from that same context _without_ an idempotency key then
fails with `IdempotencyUncertainError`:

> Because we don't know if the mutation from calling `X` of state
> `'…'` failed or succeeded AND you've made some NON-IDEMPOTENT
> mutations we can't reliably determine whether or not the call to
> `Y` … is due to a retry which may cause an undesired mutation

It is not complaining about the call it refused — it is refusing
because an _earlier_ call left the context uncertain.

Two consequences worth knowing before you meet them:

- **Asserting a declared error is safe.** A test that does
  `with self.assertRaises(TaskList.AddTaskAborted)` on a method
  that declares `QuotaExceededError` creates no uncertainty, and
  the context stays usable for the assertions that follow.
- **Retrying a mutation yourself requires an idempotency key.**
  Any hand-written retry loop, and any mutation issued after a
  cancelled or transport-failed one, must carry
  `.idempotently("alias")` or an explicit `key=`:

  ```python
  await TaskList.ref(list_id).idempotently("Add the first task").add_task(
      context, title="Milk",
  )
  ```

  The alias must be unique within the lifetime of the context —
  reusing one is how you tell Reboot "this is the same logical
  mutation", which is exactly right for a retry and exactly wrong
  for two different additions.
