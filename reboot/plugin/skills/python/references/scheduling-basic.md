---
title: Schedule Future Work with `ref.schedule(when=...)`
impact: MEDIUM
impactDescription: Without scheduling, deferred work has to live in external timers
tags: scheduling, schedule, timedelta, datetime, deferred, async
---

## Schedule Future Work with `ref.schedule(when=...)`

> **Critical:** schedules are **persisted** as part of the surrounding
> writer/transaction — they survive restarts. Don't use
> `asyncio.create_task` or `asyncio.sleep` for delayed work; those
> disappear on restart.

Reboot can defer a method call into the future. Inside any
writer/transaction, call `ref.schedule(when=timedelta(...))` and chain the
method to fire later:

```python
await self.ref().schedule(when=timedelta(seconds=1)).interest(context)
```

The runtime persists the schedule, survives restarts, and fires the call
at (or after) the requested time.

**Incorrect (using OS-level timers / asyncio sleep):**

```python
# DON'T — these don't survive restarts and aren't transactional.
import asyncio
asyncio.create_task(self._fire_later())  # disappears on restart
```

**Correct (matches the [`reboot-bank-pydantic`](https://github.com/reboot-dev/reboot-bank-pydantic) example, `backend/src/main.py`):**

`api/bank/v1/pydantic/account.py`:

```python
open=Writer(
    request=OpenRequest, response=None, factory=True, mcp=None,
),
interest=Writer(
    request=None, response=None, mcp=None,
),
```

`main.py`:

```python
from datetime import timedelta


class AccountServicer(Account.Servicer):

    async def open(
        self, context: WriterContext, request: Account.OpenRequest,
    ) -> None:
        await self.ref().schedule(when=timedelta(seconds=1)).interest(context)
```

## `when=` Also Takes an Absolute `datetime`

`when=` accepts either a `timedelta` (fire after that delay) or a
**timezone-aware `datetime`** (fire at that wall-clock instant). The
absolute form is what you want for "cron" — running at a fixed time of
day. See `scheduling-recurring.md` for the recurring/cron pattern.

```python
from datetime import datetime, timezone

await self.ref().schedule(
    when=datetime(2030, 1, 1, 2, 0, tzinfo=timezone.utc),
).interest(context)
```

## Schedule Other Actors, Not Just `self`

`ref.schedule(...)` works on any ref, not only `self.ref()`:

```python
await Account.ref(other_id).schedule(
    when=timedelta(minutes=5),
).interest(context)
```

## Schedules Survive Restarts

Schedules are persisted as part of the surrounding writer/transaction.
That means: if the application restarts before the scheduled time, the
schedule is still there and will fire.

## Failure Behavior

If the scheduled method raises a `<Method>Aborted`, Reboot surfaces it as
the error result — the scheduled invocation does not retry by default.
