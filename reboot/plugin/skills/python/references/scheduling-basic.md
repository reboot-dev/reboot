---
title: Schedule Future Work with `ref.schedule(when=...)`
impact: MEDIUM
impactDescription: Without scheduling, deferred work has to live in external timers
tags: scheduling, schedule, timedelta, datetime, deferred, async, task, task id
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

`api/bank/v1/account.py`:

```python
open=Writer(
    request=OpenRequest, response=None, factory=True,
    description="Bring the account into existence with a zero balance.",
    mcp=None,
),
interest=Writer(
    request=None, response=None,
    description="Credit one period's interest at the current rate.",
    mcp=None,
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

## Keeping a Task's Id

`schedule(...).method(context)` returns the task's id, a
`reboot.api.TaskId`, and `spawn().method(context)` (inside a workflow)
returns a `<Service>.<Method>Task` handle whose `task_id` is one. A
`TaskId` is a `Model` (`state_id` and `task_uuid`, both `str`), so it
is stored in state or returned in a response like any other nested
model. To get back to the task later, build its handle with
`<Service>.<Method>Task.retrieve(context, task_id=...)` and `await`
it for the task's response. `<Method>` is the PascalCase form of the
method name (`generate_report` → `GenerateReportTask`).

```python
from reboot.api import Field, Model, TaskId
from typing import Optional


class ReportState(Model):
    generate_task_id: Optional[TaskId] = Field(tag=1, default=None)
```

```python
class ReportServicer(Report.Servicer):

    async def start(
        self, context: WriterContext, request: Report.StartRequest,
    ) -> None:
        self.state.generate_task_id = (
            await self.ref().schedule().generate(context)
        )

    async def generate_task_id(
        self, context: ReaderContext,
    ) -> Report.GenerateTaskIdResponse:
        return Report.GenerateTaskIdResponse(
            task_id=self.state.generate_task_id,
        )
```

Anything that gets hold of the id, e.g. a test through the reader, can
wait for the task's response:

```python
task_id = (await report.generate_task_id(context)).task_id
response = await Report.GenerateTask.retrieve(context, task_id=task_id)
```
