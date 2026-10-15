---
title: Test Failure Recovery — `rbt.down()` and `rbt.up(revision=...)`
impact: MEDIUM
impactDescription: Durability is the reason to build on Reboot; a suite that never restarts the app never tests it
tags: testing, recovery, restart, down, up, revision, crash, effect-validation, exactly-once, mocking, tasks, workflows, idempotency
---

## Test Failure Recovery — `rbt.down()` and `rbt.up(revision=...)`

The harness can take the application down mid-flight and bring it
back, which turns "survives a crash" into an ordinary assertion.

**Don't spend a test on "the data is still there".** Committed state
surviving a restart is Reboot's own guarantee, and the framework's
test suite covers it; re-asserting it in an application test checks
Reboot, not the application. What's worth testing is what the app
had **in flight** when the process died — a task half-run, a
workflow between steps, an effect that must land exactly once — and
the app-level invariants a partial recovery could plausibly break:
a counter that must not double-count, a payment that must not go out
twice.

## The Restart Primitive

`up()` returns an `ApplicationRevision`. Keep it, and pass it back
to bring the _same_ application up again:

```python
revision = await self.rbt.up(Application(servicers=[OrderServicer]))

context = self.rbt.create_external_context(name=f"test-{self.id()}")
order = Order.ref(f"order-{self.id()}")
await order.place(context, sku="ABC", quantity=2)

# The process dies.
await self.rbt.down()

# ...and comes back.
await self.rbt.up(revision=revision)
```

That is the whole API. Nothing above is yet a test worth keeping —
it restarts an idle application, which recovers trivially. The next
section is where the test earns its place.

The rules the harness enforces:

- **`revision=` goes alone.** Passing `revision=` together with
  `application=` / `servicers=` raises `ValueError`. The revision
  already carries the configuration.
- **`down()` before a second `up()`.** Calling `up()` on an
  application that is already up raises
  `ValueError("This application is already up; ...")`.
- **A new configuration is allowed.** Instead of the same
  `revision=`, a second `up()` may register a _different_
  `Application(...)` — how a test exercises an upgrade across a
  restart (pair it with `api-schema-evolution.md`).
- **`asyncTearDown` is unchanged** — still just
  `await self.rbt.stop()`. `down()` stops the servers; `stop()`
  tears down the harness itself.

**While the app is down, don't `await` a unary call from the test's
context.** Calls made through an `ExternalContext` — the only
context type that retries individual calls — are retried on
`Unavailable` in a loop with no attempt limit, so the call waits for
the app to come back instead of failing. Take the app down, assert
what you can offline, and bring it up before the next call.

Calls made from _inside_ the app aren't retried per-call at all. A
`Workflow` recovers by **re-executing its body from the top**: the
steps it already completed don't run again, because every memoizing
primitive (`at_least_once`, `at_most_once`, `until`,
`until_changes`, and Reboot calls scoped with `.per_workflow(...)` /
`.per_iteration(...)`) returns its recorded result on replay instead
of doing the work a second time. That replay behavior — not the
transport — is what the tests below are about.

## Put the Crash Exactly Where You Want It

A restart between two calls only tests recovery at a boundary the
app would survive anyway. The interesting failures are _inside_ a
method: half a workflow done, a task picked up but not finished.
To land the crash there, patch the servicer method under test with
one that blocks until the test has taken the app down:

```python
import asyncio
from unittest import mock


async def test_fulfillment_survives_a_crash_mid_flight(self) -> None:
    reached_mark_paid = asyncio.Event()
    app_is_down = asyncio.Event()

    # `mark_paid` is the writer the `fulfill` workflow calls once the
    # payment goes through.
    original_mark_paid = OrderServicer.mark_paid

    async def stalling_mark_paid(self, context, request):
        reached_mark_paid.set()
        # Hold the method open until the test kills the app, so the
        # crash lands inside `mark_paid` rather than between calls.
        await app_is_down.wait()
        return await original_mark_paid(self, context, request)

    with mock.patch(
        "servicers.orders.OrderServicer.mark_paid",
        stalling_mark_paid,
    ):
        revision = await self.rbt.up(
            Application(servicers=[OrderServicer]),
        )
        context = self.rbt.create_external_context(
            name=f"test-{self.id()}"
        )

        order = Order.ref(f"order-{self.id()}")
        await order.place(context, sku="ABC", quantity=2)
        task = await order.spawn().fulfill(context)

        # Wait until the app is provably inside `mark_paid`.
        await reached_mark_paid.wait()

        await self.rbt.down()
        app_is_down.set()

        await self.rbt.up(revision=revision)

        # The workflow was picked back up and ran to completion.
        await task

    # The payment was recorded exactly once, despite the crash.
    response = await order.get(context)
    self.assertEqual(response.status, "fulfilled")
    self.assertEqual(len(response.payments), 1)
```

The two `asyncio.Event`s are what make this deterministic rather
than a sleep race: `reached_mark_paid` proves the app got into the
method before the kill, and `app_is_down` releases the method only
after it. Patch the method by its **import location in the
consuming module** — the same rule as any `unittest.mock.patch`
(see "Mocking External Services and LLM Calls" in
[testing-external-context.md](testing-external-context.md)).

Subclassing the servicer and overriding the method works too, and
reads better when several tests need the same stall — but the
`authorizer()` exception still applies: never override that.

## Assert On State, Not On Call Counts

After recovery, the question is almost always "did this happen
exactly once?". Prefer asserting the **state** that the work
produced — one charge recorded, one email row, a balance that moved
once — over counting invocations. State is what the user is
promised, and it is the thing recovery is defined against:

```python
# GOOD — the invariant the app actually promises.
response = await order.get(context)
self.assertEqual(len(response.payments), 1)

# WEAK — this only re-tests Reboot's durability guarantee.
self.assertEqual(response.quantity, 2)
```

**If you do count invocations of a writer or transaction body, turn
effect validation off for that test.** In unit tests the harness
enables effect validation by default: it deliberately re-runs
writer and transaction bodies and compares the resulting mutations,
to catch bodies that aren't safe to re-execute (see
`servicer-writer.md`). A `nonlocal` counter therefore reports more
calls than the test made, and the assertion fails for a reason that
has nothing to do with recovery:

```python
from reboot.aio.contexts import EffectValidation

revision = await self.rbt.up(
    Application(servicers=[OrderServicer]),
    # This test counts calls with a `nonlocal`, which effect
    # validation's deliberate re-execution would inflate.
    effect_validation=EffectValidation.DISABLED,
)
```

## What's Worth a Recovery Test

- **A spawned task** — it is cancelled when the app goes down and
  picked up again on `up()`; assert it completes and its effect
  happened once.
- **A `Workflow`** — its body re-executes from the top on replay, so
  assert the steps it had already finished did not happen twice: the
  writer and transaction calls it made under a `.per_workflow(...)` /
  `.per_iteration(...)` scope, and any `at_least_once` /
  `at_most_once` external call.
- **`schedule()`d work** — assert it still fires after a restart
  that spans its due time.
- **A half-finished multi-actor transaction** — assert it is either
  fully applied or fully rolled back, never half.
