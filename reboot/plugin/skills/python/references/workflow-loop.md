---
title: Drive Workflow Iteration with `context.loop(...)`
impact: HIGH
impactDescription: Plain `while True` loses replay safety; `context.loop` checkpoints each iteration
tags: workflow, loop, iteration, checkpoint, control-loop
---

## Drive Workflow Iteration with `context.loop(...)`

> **Critical:** loop name is a stable replay-correlation key — pick it
> once and don't rename. Each iteration is a checkpoint; on restart the
> workflow resumes at the **next** iteration, not back at the start.
> Setup code before the `async for` runs once per workflow lifetime.

A workflow that should run a body repeatedly uses `context.loop(name)` —
an async iterator that checkpoints each iteration. The name is a stable
string identifier used for replay correlation.

**Incorrect (`while True` inside a workflow):**

```python
@classmethod
async def control_loop(cls, context: WorkflowContext, request):
    while True:
        # No iteration boundary — replay re-runs all iterations from the
        # start, not from the latest one.
        await do_work(context)
```

**Correct (control loop pattern):**

```python
@classmethod
async def control_loop(
    cls,
    context: WorkflowContext,
    request: ControlLoopRequest,
):
    channel = Channel.ref(request.channel_id)
    pub_sub = PubSub.ref(f"{request.channel_id}-pub-sub")
    queue = Queue.ref(f"{context.state_id}-messages-queue")

    await pub_sub.subscribe(
        context, topic="messages", queue_id=queue.state_id,
    )

    async for iteration in context.loop("Control loop"):
        dequeue = await queue.dequeue(context, bulk=True)

        message_ids = [as_str(item.value) for item in dequeue.items]
        # ... process this iteration's batch ...
```

## Each Iteration Is a Checkpoint

The runtime persists progress at the boundary of each `async for`
iteration. After a restart, the workflow resumes at the next iteration —
not back at the start of the loop. Long-running poll/work loops should
always use `context.loop`.

## Use `iteration` for Per-Iteration Idempotency

The `iteration` value is the iteration index. Combined with the
`PER_ITERATION` idempotency scope, it lets primitives like `until` and
`at_least_once` replay independently per iteration (see
`workflow-idempotency-scopes.md`).

## Loop Names Must Be Stable

The string passed to `context.loop("...")` is used for replay
correlation; renaming it after work has started invalidates progress
tracking. Pick a clear name once and don't change it.

## Setup Code Outside the Loop Runs Once

Lines before `async for iteration in context.loop(...)` run once per
workflow instance (and again only if the workflow restarts before any
iteration completed). Use them for one-shot setup like subscribing to a
PubSub topic, as in the example above.
