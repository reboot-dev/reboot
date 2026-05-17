---
title: Wait for a Condition with `until`
impact: HIGH
impactDescription: Polling loops without `until` either spin or miss the wakeup
tags: workflow, until, reactive, wait, condition, convergence
---

## Wait for a Condition with `until`

> **Critical:** `until` returns the **truthy value** the callable
> returned, not just `True`. Workflow suspends between attempts (no
> polling — reactive). Memoizes after the first truthy result; reuse
> the same alias and you'll get the cached answer, not a fresh check.

`until(alias, context, callable)` reactively re-runs `callable` until it
returns a truthy value, then memoizes that value. The runtime suspends
the workflow between attempts — there's no busy loop, no polling
interval to tune.

Use it whenever a workflow needs to wait for **something to become true**:
state to reach a particular shape, an external job to complete, an
approval to land, etc.

**Incorrect (busy-waiting with sleep):**

```python
@classmethod
async def control_loop(cls, context: WorkflowContext, request):
    while True:
        state = await Order.ref(request.order_id).read(context)
        if state.approved:
            break
        await asyncio.sleep(5)  # naive poll — burns ticks, not durable
```

**Correct (use `until`):**

```python
from reboot.aio.workflows import until


@classmethod
async def control_loop(cls, context: WorkflowContext, request):
    async def is_approved() -> bool:
        state = await Order.ref(request.order_id).read(context)
        return state.approved

    await until("Order approval", context, is_approved)
    # Execution resumes here only after `is_approved()` returns True.
```

## `until` Returns the Truthy Value

If `callable` returns a value other than `True` (e.g. a settled `Order`
object), `until` returns that value. The conventional shape is
`Callable[[], Awaitable[bool]]`, but anything truthy works:

```python
async def get_settled() -> Optional[Order]:
    order = await Order.ref(request.order_id).read(context)
    return order if order.settled else None  # None is falsy

settled_order = await until("Settlement", context, get_settled)
# settled_order is the populated Order, not just True.
```

## Reactive, Not Polled

The runtime detects state changes the callable depends on and re-runs it
when they change. There's no fixed polling interval; you don't choose
one. The callable runs when there's a chance the answer might have
changed.

## Stops After First Truthy Result

`until` resolves once and memoizes. Subsequent replays see the memoized
value without re-running the callable. To wait again on a fresh
condition, use a different alias.

## See Also

- `workflow-until-changes.md` for "wait until the value changes" rather
  than "wait until truthy".
- `workflow-idempotency-scopes.md` for how the alias scope (`ALWAYS`,
  `PER_WORKFLOW`, `PER_ITERATION`) interacts with replay.
