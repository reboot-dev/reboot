---
title: Use `at_least_once` for Retryable Idempotent Work
impact: HIGH
impactDescription: Default workflow primitive; retries to success and memoizes the result
tags: workflow, at_least_once, memoize, retry, idempotent
---

## Use `at_least_once` for Retryable Idempotent Work

> **Critical:** alias must be stable across replays (it's the
> memoization key). Result type is inferred from `callable`'s return
> annotation — if you don't annotate the callable, pass `type=...`
> explicitly. Retries forever until success; if you need bounded
> retries, catch failures inside `callable` and return them as data.

`at_least_once(alias, context, callable)` runs `callable`, retries on
failure, and memoizes the eventual successful result. Use it for work
that's safe to retry: idempotent API calls, fetching data, computing
results from inputs that don't change.

It's the default choice for workflow steps. If the operation is not
idempotent (e.g. charging a card), use `at_most_once` instead.

**Incorrect (re-running expensive idempotent work on every replay):**

```python
@classmethod
async def control_loop(cls, context: WorkflowContext, request):
    # Hits the embedding service every time the workflow replays — wasteful.
    embeddings = await compute_embeddings(request.docs)

    async for iteration in context.loop("..."):
        ...
```

**Correct (memoize once with `at_least_once`):**

```python
from reboot.aio.workflows import at_least_once


@classmethod
async def control_loop(cls, context: WorkflowContext, request):
    async def fetch_embeddings():
        return await compute_embeddings(request.docs)

    embeddings = await at_least_once(
        "Embeddings", context, fetch_embeddings,
    )

    async for iteration in context.loop("..."):
        # Use `embeddings` — it's persisted, so replay is free.
        ...
```

## Failures Retry Until Success

`callable` may raise; the runtime catches and retries. The memoized result
is the **first successful** return value. There's no built-in retry-budget
or backoff configuration on the call itself; if you need bounded retries,
catch failures inside `callable` and convert them to a return value.

## Use Stable Aliases

Like `at_most_once`, the alias is the memoization key. Stable across
replays, unique per logical step within the workflow.

## Type Inference

`at_least_once` infers the result type from `callable`'s return
annotation. Provide an explicit `type=` only when the callable is dynamic
or the annotation isn't expressive enough.

```python
embeddings = await at_least_once(
    "Embeddings", context, fetch_embeddings, type=list[Vector],
)
```

## Per-Workflow Sugar

`at_least_once_per_workflow(alias, context, callable)` is shorthand for
`at_least_once((alias, PER_WORKFLOW), context, callable)`. The plain form
without an explicit scope defaults to `PER_ITERATION` when called inside
a `context.loop`. See `workflow-idempotency-scopes.md`.
