---
title: Choose the Right Idempotency Scope for Memoized Steps
impact: MEDIUM
impactDescription: Wrong scope makes work re-run when it shouldn't, or never run again when it should
tags: workflow, idempotency, ALWAYS, PER_WORKFLOW, PER_ITERATION, scopes
---

## Choose the Right Idempotency Scope for Memoized Steps

> **Critical:** the default scope **flips** depending on whether
> you're inside a `context.loop`. Outside a loop:
> `PER_WORKFLOW` (run once for the whole workflow). Inside a loop:
> `PER_ITERATION` (re-run each iteration). When in doubt, pass the
> tuple `(alias, scope)` to be explicit.

Workflow primitives (`at_most_once`, `at_least_once`, `until`,
`until_changes`) memoize results under an alias. The **scope** controls
how broadly that alias is shared:

- **`PER_WORKFLOW`** — one memoization per workflow instance. The
  callable runs at most once across the whole workflow lifetime.
- **`PER_ITERATION`** — one memoization per `context.loop` iteration.
  Each iteration starts fresh.
- **`ALWAYS`** (only for `until`) — never memoize the result; always
  re-run reactively.

The scope is set by passing a tuple `(alias, scope)` instead of a plain
string alias, or by using the `*_per_workflow` sugar variants.

**Incorrect (default scope inside a loop, expecting per-iteration freshness):**

```python
async for iteration in context.loop("Watch"):
    # Plain string alias defaults to PER_ITERATION inside a loop.
    # If you actually wanted "once for the whole workflow",
    # this is the wrong call.
    embeddings = await at_least_once(
        "Embeddings", context, fetch_embeddings,
    )
```

**Correct (be explicit about scope):**

```python
from reboot.aio.workflows import (
    PER_WORKFLOW, PER_ITERATION,
    at_least_once, at_least_once_per_workflow,
)


@classmethod
async def control_loop(cls, context: WorkflowContext, request):
    # One-time setup for the entire workflow:
    embeddings = await at_least_once_per_workflow(
        "Embeddings", context, fetch_embeddings,
    )
    # Equivalent explicit form:
    #   embeddings = await at_least_once(
    #       ("Embeddings", PER_WORKFLOW), context, fetch_embeddings,
    #   )

    async for iteration in context.loop("Process"):
        # Per-iteration: re-runs each loop iteration.
        batch = await at_least_once(
            ("Batch", PER_ITERATION), context, fetch_batch,
        )
        # ...
```

## Default Scopes

| Primitive       | Default scope outside a loop                          | Default scope inside a loop |
| --------------- | ----------------------------------------------------- | --------------------------- |
| `at_most_once`  | `PER_WORKFLOW`                                        | `PER_ITERATION`             |
| `at_least_once` | `PER_WORKFLOW`                                        | `PER_ITERATION`             |
| `until`         | `PER_WORKFLOW`                                        | `PER_ITERATION`             |
| `until_changes` | (always per-iteration; only meaningful inside a loop) | `PER_ITERATION`             |

If you're not sure where you are, pass the tuple form to be explicit.

## Sugar Variants

For each primitive, there's a `*_per_workflow` variant that's equivalent
to `(alias, PER_WORKFLOW)`:

- `at_most_once_per_workflow(alias, context, callable)`
- `at_least_once_per_workflow(alias, context, callable)`
- `until_per_workflow(alias, context, callable)`

There are no `*_per_iteration` sugar variants — that's the inside-a-loop
default.

## `ALWAYS` Is `until`-Only

`ALWAYS` skips memoization entirely; the callable runs every replay
opportunity. Only valid as a scope for `until`, where it expresses "keep
checking; never cache the answer".

## Picking a Scope

- **One-time bootstrap inside the workflow** (load embeddings, compute
  config) → `PER_WORKFLOW`.
- **Per-iteration work inside a loop** (process a batch, generate a
  response per round) → `PER_ITERATION`.
- **Reactively wait for a condition that may flip back** (e.g. live
  health-check) → `ALWAYS` with `until`.
