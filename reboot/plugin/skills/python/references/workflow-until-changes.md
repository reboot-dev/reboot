---
title: React to Value Changes with `until_changes`
impact: MEDIUM
impactDescription: `until` waits for truthy; `until_changes` waits for movement
tags: workflow, until_changes, reactive, change-detection, polling-replacement
---

## React to Value Changes with `until_changes`

> **Critical:** only meaningful **inside** a `context.loop`. Equality
> defaults to `==`; pass `equals=` for non-scalar return types where
> `==` is wrong. First iteration returns immediately (no previous
> value to compare against).

`until_changes(alias, context, callable)` runs `callable` each iteration
of a `context.loop` and returns when the result differs from the previous
iteration's result. By default, equality is `==`; pass `equals=` for a
custom comparison.

Use it to drive an iteration on **state changes** — the workflow body
runs once per change, not on every tick.

**Incorrect (polling state and self-comparing manually):**

```python
@classmethod
async def control_loop(cls, context: WorkflowContext, request):
    last_seen = None
    async for iteration in context.loop("Watch order"):
        state = await Order.ref(request.order_id).read(context)
        if state.status == last_seen:
            continue
        last_seen = state.status
        # ... handle change ...
```

**Correct (use `until_changes`):**

```python
from reboot.aio.workflows import until_changes


@classmethod
async def control_loop(cls, context: WorkflowContext, request):
    async def order_status() -> str:
        state = await Order.ref(request.order_id).read(context)
        return state.status

    async for iteration in context.loop("Watch order"):
        new_status = await until_changes(
            "Order status", context, order_status,
        )
        # `new_status` is guaranteed different from the previous iteration.
        # ... handle the new status ...
```

## Custom Equality

For non-scalar return types where `==` is too strict (or too loose),
pass an `equals=` callback:

```python
from typing import Set

async def tag_set() -> Set[str]:
    state = await Doc.ref(doc_id).read(context)
    return set(state.tags)

new_tags = await until_changes(
    "Doc tags",
    context,
    tag_set,
    equals=lambda prev, curr: prev == curr,  # the default; shown for clarity
)
```

## First Iteration

On the first iteration there's no previous value to compare against, so
`until_changes` returns the result of the first run as soon as it's
available.

## When to Use Which

- **`until`** — "do not proceed until X is true" (idle most of the time).
- **`until_changes`** — "iterate every time X changes" (process per
  change, e.g. drive a state-machine reaction).
