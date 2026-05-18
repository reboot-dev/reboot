---
title: Build Recurring Schedules by Self-Rescheduling
impact: MEDIUM
impactDescription: Without a self-reschedule the recurring tick stops after one fire
tags: scheduling, recurring, periodic, self-reschedule
---

## Build Recurring Schedules by Self-Rescheduling

> **Critical:** `schedule(when=...)` fires **once**. For a recurring
> tick, the scheduled method must re-schedule itself before returning.
> Stop the chain by guarding the re-schedule on a state flag — a tick
> that doesn't re-schedule simply ends the chain.

Reboot's `ref.schedule(when=...)` fires once. To make a recurring
schedule, the scheduled method itself schedules the next firing before it
returns. The persisted schedule chain survives restarts.

**Incorrect (one-shot schedule, expecting recurrence):**

```python
async def open(
    self, context: WriterContext, request: Account.OpenRequest,
) -> None:
    # Fires once at +1s and never again.
    await self.ref().schedule(when=timedelta(seconds=1)).interest(context)


async def interest(
    self, context: WriterContext,
) -> None:
    self.state.balance += 1
```

**Correct (matches the [`reboot-bank-pydantic`](https://github.com/reboot-dev/reboot-bank-pydantic) example, `backend/src/main.py`):**

```python
import random
from datetime import timedelta


class AccountServicer(Account.Servicer):

    async def open(
        self, context: WriterContext, request: Account.OpenRequest,
    ) -> None:
        # Kick off the first tick.
        await self.ref().schedule(when=timedelta(seconds=1)).interest(context)

    async def interest(
        self, context: WriterContext,
    ) -> None:
        self.state.balance += 1

        # Schedule the next tick before returning.
        await self.ref().schedule(
            when=timedelta(seconds=random.randint(1, 4))
        ).interest(context)
```

## The Re-Schedule Is Part of the Same Writer

Because the next schedule is set inside the same writer, it commits
atomically with the state mutation. Either both happen or neither: there's
no window where the balance updated but the next tick failed to enqueue.

## Stopping a Recurring Schedule

Add a state flag and check it before re-scheduling:

```python
async def interest(
    self, context: WriterContext,
) -> None:
    self.state.balance += 1
    if self.state.active:
        await self.ref().schedule(
            when=timedelta(seconds=1)
        ).interest(context)


async def deactivate(
    self, context: WriterContext,
) -> None:
    self.state.active = False
```

The next tick that fires after `deactivate` simply doesn't schedule
another one, ending the chain.
