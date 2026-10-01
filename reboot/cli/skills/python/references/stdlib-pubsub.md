---
title: Use `Topic` for Publish/Subscribe Fan-Out to Queues
impact: MEDIUM
impactDescription: Pub/sub fan-out without `Topic` requires hand-rolling broadcast and per-subscriber buffers
tags: stdlib, Topic, pubsub, publish, subscribe, broker, fan-out
---

## Use `Topic` for Publish/Subscribe Fan-Out to Queues

> **Critical:** A `Topic` is only half of pub/sub — **`publish`
> alone delivers nothing**. The broker fans items out to
> registered subscriber Queues; with no subscribers, items
> accumulate in the topic and reach nobody. Build BOTH sides:
>
> - **Producer:** `await Topic.ref(<id>).publish(context, value=…)`.
> - **Consumer:** each subscriber owns its own `Queue` actor,
>   registers it via
>   `await Topic.ref(<id>).subscribe(context, queue_id=<their-id>)`,
>   and pulls items in a workflow with
>   `await Queue.ref(<their-id>).dequeue(context, bulk=True)`.
>
> Other implementation rules:
>
> - `Topic` is built on `Queue`, which is in turn backed by an
>   internal stdlib sorted-map actor — register
>   `pubsub.servicers()` (transitively pulls Queue's servicers)
>   AND `sorted_map_library()`.
> - The internal `broker` workflow auto-schedules on first
>   publish/subscribe — don't start it manually.
> - Subscribers must consume from their **own** `Queue`, never
>   from the topic directly.

`Topic` (`reboot.std.pubsub.v1.pubsub`) implements pub/sub on top of
`Queue`. Publishers `publish` items to the topic; subscribers register a
`Queue` actor as a destination and pull items from that queue. A
background `Broker` workflow inside the topic moves items from the
topic's buffer into each subscriber's queue.

### Methods

| Method      | Type     | Notes                                                                   |
| ----------- | -------- | ----------------------------------------------------------------------- |
| `publish`   | writer   | one of `value` / `bytes` / `any` (single) or `items: list[Item]` (bulk) |
| `subscribe` | writer   | `queue_id: str` — the `Queue` actor that will receive items             |
| `broker`    | workflow | internal; auto-scheduled on first publish/subscribe                     |

### Register the Library

`Topic` is built on `Queue`, which is itself backed by an internal
stdlib sorted-map actor:

```python
from reboot.std.pubsub.v1 import pubsub
from reboot.std.collections.v1.sorted_map import sorted_map_library


async def main():
    await Application(
        servicers=[MyServicer] + pubsub.servicers(),
        libraries=[sorted_map_library()],
    ).run()
```

`pubsub.servicers()` returns `[TopicServicer] + queue.servicers()`, so
you don't need to add `queue.servicers()` separately. The
`sorted_map_library()` registration is the only place you mention
the backing sorted-map actor — for a user-facing sorted key/value
collection, use `OrderedMap` (see `stdlib-ordered-map.md`).

### Subscribe a Queue to a Topic

```python
from reboot.std.collections.queue.v1.queue import Queue
from reboot.std.pubsub.v1.pubsub import Topic


class SubscriberServicer(Subscriber.Servicer):

    async def attach(
        self, context: WriterContext, request: AttachRequest,
    ) -> AttachResponse:
        queue_id = f"{self.ref().state_id}-inbox"
        # Make sure the destination queue exists, then subscribe it.
        await Topic.ref(request.topic_id).subscribe(
            context, queue_id=queue_id,
        )
        return AttachResponse()
```

Each subscriber owns its own `Queue` actor; the topic's broker copies
each published item into every subscriber's queue.

### Publish

```python
await Topic.ref(topic_id).publish(context, value=some_value)
```

Single-item publishes accept exactly one of `value`, `bytes`, or `any`.
Bulk publishes pass `items=[Item(...), Item(...)]`.

### Consume from the Subscriber Side

Each subscriber pulls from its own queue using the `Queue.dequeue`
workflow pattern (see `stdlib-queue.md`):

```python
@classmethod
async def control_loop(
    cls, context: WorkflowContext, request,
):
    queue = Queue.ref(f"{context.state_id}-inbox")
    async for iteration in context.loop("Consume"):
        batch = await queue.dequeue(context, bulk=True)
        for item in batch.items:
            ...
```

### Broker Is Internal

The first `publish` or `subscribe` schedules the topic's `broker`
workflow if it isn't already running. You don't need to start it
manually. The broker reads accumulated items from the topic's state and
fans them out to subscribed queues.

### One Topic Per Logical Channel

A `Topic.ref(...)` is identified by a string ID. Use a stable ID per
logical channel (e.g. `f"{room_id}-events"`); subscribers and publishers
must agree on it.
