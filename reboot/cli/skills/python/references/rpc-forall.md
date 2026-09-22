---
title: Fan Out Calls with `Service.forall(ids).method(context)`
impact: MEDIUM
impactDescription: Hand-rolled gather over many actors is more code and misses framework optimizations
tags: rpc, forall, fan-out, batch, parallel
---

## Fan Out Calls with `Service.forall(ids).method(context)`

> **Critical:** prefer `Service.forall(ids).method(context, ...)` over
> `asyncio.gather(*[Service.ref(id).method(...)])` — the framework can
> batch internally. Returns a list in the same order as the input ids.
> Same context-type rules as a single call.

`Service.forall(ids).method(context, **kwargs)` calls the same method on
many actors at once and returns the list of responses, in the same order
as the input ids. It's the framework-native fan-out, more compact than
`asyncio.gather` and able to batch internally.

**Incorrect (handrolled gather over `Service.ref(id)`):**

```python
import asyncio

# Verbose; doesn't get framework-side batching:
results = await asyncio.gather(
    *[Message.ref(mid).get(context) for mid in message_ids]
)
```

**Correct (`Service.forall(...).method(...)`):**

```python
from chat.v1.message_rbt import Message

responses = await Message.forall(message_ids).get(context)

# `responses` is a list of `Message.GetResponse` in the same order
# as `message_ids`.
for response in responses:
    print(response.details)
```

## Returns a List, Same Order as Inputs

`Service.forall([a, b, c]).method(context)` returns
`[response_a, response_b, response_c]`. Iterate in parallel with the
input id list when you need both:

```python
for mid, response in zip(message_ids, responses):
    print(mid, response.details)
```

## Method Type Restrictions

Apply the same context-type rules as a single call: a `reader` method
needs a `ReaderContext` (or higher); a `writer`/`transaction`/`workflow`
needs the matching context. `forall` doesn't change semantics — it
parallelizes the call shape you'd write anyway.

## Use for Read-Mostly Fan-Out

The canonical use is reading many actors of the same type in parallel:

```python
# Fetch each message's details from a list of message IDs.
responses = await Message.forall(message_ids).get(context)
messages = [r.details for r in responses]

# Filter, transform, etc.
mine = [m for m in messages if m.author == request.name]
```

## Use for Cross-Cutting Writes from Workflows

Workflow brokers in stdlib use `forall` to fan items out to many queues
in one call:

```python
# Fan one batch of items out to every subscribed queue.
await Queue.forall(queue_ids).enqueue(context, items=items)
```

## Pass an Iterable

`forall(ids)` accepts any iterable of strings. List, generator, or set
all work; the response order matches the iteration order at call time.
