---
title: Use `Queue` for Durable FIFO Work Queues
tags: stdlib, Queue, FIFO, enqueue, dequeue, durable
impact: HIGH
impactDescription: Workflows pulling work from a Queue is the canonical "consumer loop" pattern
---

## Use `Queue` for Durable FIFO Work Queues

> **Critical:** Reach for the stdlib `Queue` for any durable FIFO —
> work queues, job queues, intake queues, jobs-pulled-off-a-queue.
> Do **not** define your own `Queue` proto type or hand-roll a
> list-as-queue on actor state — both lose durability, ordering,
> and the blocking-`dequeue` consumer pattern. The stdlib `Queue` > _is_ the primitive.
>
> Implementation rules:
>
> - `dequeue` is a **workflow** method — blocks until an item is
>   available; only callable from a `WorkflowContext`.
> - For a non-blocking pull from a transaction, use `try_dequeue`.
> - Register `queue.servicers()` (transitively pulls in
>   `sorted_map.servicers()`) AND `sorted_map_library()` in your
>   `Application(...)`. Forgetting either fails at boot with
>   "unknown actor type."

`Queue` (`reboot.std.collections.queue.v1.queue`) is a durable FIFO of
`Item` values. Producers `enqueue` from any context; consumers `dequeue`
from inside a `WorkflowContext` (the dequeue blocks until an item is
available). A `try_dequeue` exists for one-shot non-blocking pulls from
`TransactionContext`.

### Methods

| Method        | Type        | Notes                                                                   |
| ------------- | ----------- | ----------------------------------------------------------------------- |
| `enqueue`     | transaction | one of `value` / `bytes` / `any` (single) or `items: list[Item]` (bulk) |
| `dequeue`     | workflow    | blocks until at least one item; `bulk: bool`, `at_most?: int`           |
| `try_dequeue` | transaction | non-blocking; returns empty if nothing to dequeue                       |
| `empty`       | reader      | returns whether the queue is currently empty                            |

### Register the Library

`Queue` depends on `SortedMap`, so its servicers list pulls
`sorted_map.servicers()` in. Use the `queue.servicers()` helper:

```python
from reboot.std.collections.queue.v1 import queue
from reboot.std.collections.v1.sorted_map import sorted_map_library


async def main():
    await Application(
        servicers=[MyServicer] + queue.servicers(),
        libraries=[sorted_map_library()],
    ).run()
```

### Producer Pattern

```python
from reboot.std.collections.queue.v1.queue import Queue
from reboot.std.item.v1.item import Item


class ProducerServicer(Producer.Servicer):

    async def submit(
        self, context: TransactionContext, request: SubmitRequest,
    ) -> SubmitResponse:
        await Queue.ref(WORK_QUEUE_ID).enqueue(
            context, value=request.payload,
        )
        return SubmitResponse()
```

`Item` accepts `value` (`google.protobuf.Value`), `bytes`, or `any`
(`google.protobuf.Any`). For bulk enqueue, build `Item` objects:

```python
items = [Item(value=p) for p in payloads]
await Queue.ref(WORK_QUEUE_ID).enqueue(context, items=items)
```

### Consumer Pattern (Workflow)

`dequeue` blocks the workflow until at least one item is available — no
polling needed.

```python
from reboot.std.collections.queue.v1.queue import Queue
from reboot.aio.contexts import WorkflowContext


class ConsumerServicer(Consumer.Servicer):

    @classmethod
    async def control_loop(
        cls, context: WorkflowContext, request,
    ):
        queue = Queue.ref(f"{context.state_id}-work")

        async for iteration in context.loop("Consume"):
            response = await queue.dequeue(context, bulk=True)
            for item in response.items:
                # `item.value`, `item.bytes`, or `item.any` —
                # whichever was set at enqueue time.
                ...
```

`bulk=True` returns up to `DEFAULT_BULK_COUNT` (64) items; pass
`at_most=N` to cap the batch.

### Try-Dequeue from a Transaction

For one-shot non-blocking dequeues from a transaction (e.g. checking
whether work is available without entering a workflow):

```python
response = await Queue.ref(WORK_QUEUE_ID).try_dequeue(
    context, bulk=True, at_most=10,
)
```

The response shape is the same as `dequeue`; an empty queue returns no
items rather than blocking.

### Watch the Workflow Method Type

`dequeue` is a `workflow` method (not a `writer`). Calling it from a
`writer` or `transaction` is a context-type error. Set up a workflow
that owns the consume loop, started from `initialize` or a transaction.

## See Also

If you're consuming from a Queue, you're writing a workflow — load the
workflow primitives now so you don't trip on durable-execution rules
mid-implementation:

- `workflow-method.md` — `@classmethod`, `WorkflowContext`, scheduling
  the workflow's first run.
- `workflow-loop.md` — `async for iteration in context.loop(...)` for
  the consume loop's iteration boundary.
- `workflow-state-write.md` — workflows have no `self.state`; mutate
  via `Service.ref().write(context, fn)`.
- `workflow-at-most-once.md` / `workflow-at-least-once.md` — for
  non-trivial per-item processing where you want memoization across
  replays.
- `lifecycle-application-entry.md` — register `queue.servicers()`
  (transitively pulls `sorted_map.servicers()`) and
  `sorted_map_library()`.

For the producer side, any context that mutates state can `enqueue` —
no workflow needed there.
