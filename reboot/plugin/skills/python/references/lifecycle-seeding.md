---
title: Seed Data in Batches, Sequentially, with Aliases
impact: HIGH
impactDescription: A seed of one transaction per record, or of batches run concurrently, can stall with nothing logged or take minutes; a full production seed in every test dominates the suite
tags: seeding, seed, initialize, demo data, bulk, batch, fixture, idempotently, alias, OrderedMap, effect validation
---

## Seed Data in Batches, Sequentially, with Aliases

Use this when `initialize` or a test fixture loads more than a few
records: a catalog, demo data, a realistic development dataset. How
calls in `initialize` are keyed, and why a repeated call needs an
alias, is in [`lifecycle-initialize-hook.md`](lifecycle-initialize-hook.md).

Three rules make a seed fast and restartable:

- **One function, with the size as parameters.** `initialize` passes
  the production size; tests pass a small one.
- **One transaction per batch.** It creates the batch's actors and adds
  them to the shared index with one bulk `insert(entries=...)`. It
  calls only constructors and that insert: put each record's starting
  state (a member's plan, a room's status) in its create request,
  instead of calling the record's methods one after another.
- **One batch at a time**, each call with an **alias built from the
  batch's contents**, so a seed that restarts skips the batches that
  already landed.

`backend/src/seed.py`:

```python
from reboot.aio.external import ExternalContext
from chain.v1.chain_rbt import Chain

CHAIN_ID = "chain"


async def seed_chain(
    context: ExternalContext,
    *,
    theaters: int,
    seats_per_row: int,
    batch_size: int = 20,
) -> None:
    await Chain.create(context, CHAIN_ID)
    chain = Chain.ref(CHAIN_ID)
    ids = [f"theater-{n:03d}" for n in range(theaters)]
    for start in range(0, len(ids), batch_size):
        batch = ids[start:start + batch_size]
        # The same method on the same actor every iteration, so each
        # call needs its own alias. Built from the ids, not a clock or
        # a random value, it is the same when the seed runs again.
        await chain.idempotently(f"add-theaters-{batch[0]}").add_theaters(
            context, theater_ids=batch, seats_per_row=seats_per_row,
        )
```

The batch transaction in `ChainServicer`:

```python
from reboot.std.collections.ordered_map.v1.ordered_map import OrderedMap
from reboot.std.item.v1.item import Item


async def add_theaters(
    self, context: TransactionContext, request: Chain.AddTheatersRequest,
) -> None:
    for theater_id in request.theater_ids:
        # Distinct actors: no alias needed.
        await Theater.create(
            context, theater_id, seats_per_row=request.seats_per_row,
        )
    # One bulk insert per batch, not one insert per theater.
    await OrderedMap.ref(self.state.theater_index_id).insert(
        context,
        entries={tid: Item(bytes=tid.encode()) for tid in request.theater_ids},
    )
```

`initialize` calls it at full size; a test calls it small, through an
app-internal context (seeding methods are usually internal-only, so a
user's context gets `PermissionDenied`):

```python
async def initialize(context: InitializeContext):
    await seed_chain(context, theaters=12, seats_per_row=20)

# In a test:
await seed_chain(
    self.rbt.create_external_context(name="seed", app_internal=True),
    theaters=2,
    seats_per_row=5,
)
```

Tests assert against the seed's constants, not literal counts, so a
change to the seed doesn't break them. Only the few tests about the
production size need the production seed.

### Demo Data in Development Only

A believable dataset makes every view show something the first time it
opens. Seed it only under `rbt dev run`:

```python
from reboot.run_environments import running_rbt_dev


async def initialize(context: InitializeContext):
    if running_rbt_dev():
        await seed_demo(context, rooms=12, guests=8)
```

`running_rbt_dev()` is true only when `rbt dev run` set the
environment, so it is false under `rbt serve`, on Reboot Cloud, and in
the test harness. Scenarios seed what each one needs.

### Seeding `User` Actors

There is no public API for it. The generated servicer has a static
`_authenticated(context, state_id, claims=None)`; call it on the
servicer class (`UserServicer._authenticated(context, state_id=user_id)`,
not `User._authenticated`). It constructs the `User` if it doesn't
exist and does nothing otherwise, so it is safe from `initialize`. A
seed can't act as a user, though: `initialize` has no user identity.

### Errors

| Error text                                  | Meaning                                              | Fix                                                                 |
| ------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------- |
| `PermissionDenied` on a seed call in a test | An internal-only method called with a user's context | Seed through `create_external_context(name=..., app_internal=True)` |

### See Also

- [`lifecycle-initialize-hook.md`](lifecycle-initialize-hook.md): how calls in `initialize` are keyed
- [`stdlib-ordered-map.md`](stdlib-ordered-map.md): bulk `insert(entries=...)`
- [`testing-harness.md`](testing-harness.md): fixtures and `app_internal=True`
