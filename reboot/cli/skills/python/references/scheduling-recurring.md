---
title: Recurring and "Cron" Schedules by Self-Rescheduling
impact: MEDIUM
impactDescription: Without a self-reschedule the recurring tick stops after one fire; reaching for an OS cron daemon loses durability
tags: scheduling, recurring, periodic, cron, wall-clock, daily, hourly, self-reschedule, workflow
---

## Recurring and "Cron" Schedules by Self-Rescheduling

> **Critical:** Reboot has **no separate cron daemon**. A recurring
> ("cron") job is just `ref.schedule(when=...)` plus a method that
> re-schedules itself before returning. `schedule(when=...)` fires
> **once**; the next firing exists only because the current one
> enqueued it. Stop the chain by guarding the re-schedule on a state
> flag — a tick that doesn't re-schedule simply ends the chain.

This is how you do "cron" in Reboot: instead of an external scheduler,
a scheduled method schedules its own next firing. The persisted
schedule chain survives restarts, so the recurrence is durable without
any infrastructure outside the application.

Reboot's `ref.schedule(when=...)` fires once. To make a recurring
schedule, the scheduled method itself schedules the next firing before
it returns.

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
atomically with the state mutation. Either both happen or neither:
there's no window where the balance updated but the next tick failed to
enqueue.

## Cron: Schedule at an Absolute Wall-Clock Time

A `timedelta` recurrence (`every ~N seconds`) drifts and isn't anchored
to the clock. For true cron semantics — "every day at 02:00", "the top
of every hour" — pass an **absolute `datetime`** to `when=` instead of a
`timedelta`. `schedule(when=...)` accepts either: a `timedelta` (fire
after that delay) or a `datetime` (fire at that wall-clock instant).

Compute the _next_ absolute run time each time you schedule:

```python
from datetime import datetime, timedelta, timezone


def _next_2am_utc(now: datetime) -> datetime:
    # The next 02:00 UTC strictly after `now`.
    target = now.replace(hour=2, minute=0, second=0, microsecond=0)
    if target <= now:
        target += timedelta(days=1)
    return target
```

> **Critical:** make the `datetime` **timezone-aware** (e.g.
> `datetime.now(timezone.utc)`, or construct with
> `tzinfo=timezone.utc`). The dispatcher requires a timezone on the
> schedule. A _naive_ `datetime` is silently interpreted in the
> **server's local zone**, which makes "02:00" mean different instants
> on different machines.

Anchoring to the wall clock matters: scheduling `+timedelta(days=1)`
from "now" lets the run time drift later every day (each run starts a
little after the last). Recomputing the next absolute target each time
keeps it pinned.

## The Recurring-Job Shape: `start` / `tick` / `run`

The canonical shape for a recurring job is three methods on **one**
actor:

1. **`start()`** — a `factory=True` writer that kicks off the first
   tick.
2. **`tick()`** — a writer that schedules `run()` for immediate
   execution, then re-schedules the next `tick()` at the next
   wall-clock time.
3. **`run()`** — a workflow that does the work for one occurrence.

```python
from datetime import datetime, timezone
from reboot.aio.contexts import WorkflowContext, WriterContext


class NightlyReportServicer(NightlyReport.Servicer):

    # `start` is a `Writer(factory=True)`, `tick` a `Writer`, and `run`
    # a `Workflow`.

    async def start(
        self, context: WriterContext, request: StartRequest,
    ) -> None:
        self.state.active = True
        # Kick off the first tick at the next 02:00 UTC.
        await self.ref().schedule(
            when=_next_2am_utc(datetime.now(timezone.utc)),
        ).tick(context)

    async def tick(self, context: WriterContext) -> None:
        # Run this occurrence now — `schedule()` with no `when=` fires
        # immediately — then line up the next tick.
        await self.ref().schedule().run(context)

        if self.state.active:
            await self.ref().schedule(
                when=_next_2am_utc(datetime.now(timezone.utc)),
            ).tick(context)

    @classmethod
    async def run(
        cls, context: WorkflowContext, request: RunRequest,
    ) -> None:
        # The durable per-occurrence work: external API calls, LLM
        # calls, multiple steps. See `servicer-workflow.md`.
        ...
```

Create the actor once (e.g. from the `initialize` hook, idempotently)
and the chain runs forever; stop it by clearing `active` (see
[Stopping a recurring schedule](#stopping-a-recurring-schedule)).

Keeping `tick()` thin — it only schedules — means the work in `run()`
never holds up the cadence:

- **A slow or failing `run()` doesn't delay the schedule.** `tick()`
  returns as soon as it has scheduled `run()` and the next tick, so a
  run that takes longer than one interval, or that retries for a while,
  doesn't push the next occurrence later.
- **Each `run()` is independently durable and retryable.** As a
  workflow it checkpoints its own progress and retries transient
  failures via replay without breaking the recurrence.

### Variants

- **`run()` doesn't have to be a workflow.** If one occurrence is just
  a state mutation — no external calls, no multi-step durability — make
  `run()` a `Writer` (or a `Transaction` if it spans several actors).
  Pick the method type by the usual rules (see `servicer-workflow.md`,
  `servicer-writer.md`, `servicer-transaction.md`).
- **Pause the recurrence while a `run()` can't complete.** The shape
  above never skips an occurrence — a failed `run()` doesn't interrupt
  the `tick()` chain. That's the safe default: most recurring jobs are
  "better late than never" (granting interest, sending a report). If a
  job should instead wait for each run to succeed before scheduling the
  next, drop `tick()` and have `run()` re-schedule the next `run()` as
  its **last** step. The next occurrence is then scheduled only once the
  current one has finished — which also means runs can never overlap.

### Capturing "Now" Inside the Workflow

There's no clock on `WorkflowContext` — `datetime.now()` read directly
in a workflow body returns a different value on every replay and makes
derived state diverge. Capture "now" once via `at_least_once` so every
replay reuses the memoized value; see the `at_least_once` guidance on
capturing "now" deterministically in `servicer-workflow.md`. (In a
plain `Writer` tick, reading `datetime.now(timezone.utc)` to compute
the next `when=` is fine — scheduled-task timing isn't replay-validated.
What to avoid is _persisting_ a wall-clock or random value into
`self.state` from a writer: writer bodies re-execute under transient
retries and dev-mode effect validation, so a stored non-deterministic
value would differ across runs. See `servicer-writer.md`.)

## Catch-Up After Downtime Fires Once, Not a Backfill

Schedules are persisted with the surrounding writer, so a tick whose
time arrives while the app is down is **not lost**: when the app comes
back, a past-due schedule fires immediately. But because each tick only
schedules the _next_ one, you get a **single** catch-up fire, not one
fire per missed window. If a daily 02:00 job is down for three days, it
fires once on restart, then resumes the daily cadence — it does not run
three times to backfill. If you need to detect or backfill missed
windows, compare the wall clock against the last-run timestamp in state
and act explicitly.

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
