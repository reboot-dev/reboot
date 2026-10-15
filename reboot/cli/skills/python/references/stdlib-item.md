---
title: Use `Item` for Heterogeneous Values in Stdlib Containers
impact: LOW-MEDIUM
impactDescription: Queue/Topic accept Items; picking the right value field affects ergonomics across languages
tags: stdlib, Item, value, bytes, any, Queue, Topic
---

## Use `Item` for Heterogeneous Values in Stdlib Containers

> **Critical:** an `Item` carries **exactly one** of `value`, `bytes`,
> or `any`. Setting two raises at runtime. Single-item enqueue/publish
> calls take a top-level `value=` / `bytes=` / `any=` keyword; bulk
> calls take `items=[Item(...), Item(...)]`.

`Item` (`rbt.std.item.v1.Item`) is the value envelope used by `Queue`
and `Topic`. It carries exactly one of three fields:

| Field   | Type                    | When to use                                                                                                        |
| ------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `value` | `google.protobuf.Value` | JSON-shaped data (numbers, strings, lists, dicts, bools). Best ergonomics in TypeScript and for ad-hoc structures. |
| `bytes` | `bytes`                 | Opaque payloads. Use for raw binary or pre-serialized data.                                                        |
| `any`   | `google.protobuf.Any`   | A typed wire-format message. Best when both ends know the same schema.                                             |

Single-item `enqueue`/`publish` calls accept a top-level `value=` /
`bytes=` / `any=` keyword (whichever you set, only one). Bulk calls take
`items=[Item(value=...), Item(bytes=...)]` directly.

### Single-Item Forms

```python
from reboot.std.collections.queue.v1.queue import Queue
from google.protobuf.struct_pb2 import Value
from google.protobuf.any_pb2 import Any
from my.api.v1.things_rbt import Thing


# Plain JSON-shaped value:
await Queue.ref(qid).enqueue(context, value=Value(string_value="hello"))

# Opaque bytes:
await Queue.ref(qid).enqueue(context, bytes=b"raw payload")

# Typed message:
typed = Any()
typed.Pack(Thing(name="foo"))
await Queue.ref(qid).enqueue(context, any=typed)
```

### Bulk Form

```python
from reboot.std.item.v1.item import Item

items = [Item(value=Value(string_value=s)) for s in batch]
await Queue.ref(qid).enqueue(context, items=items)
```

### Reading Items Back

`dequeue`/`subscribe`-via-queue returns items with the same field set
that was used at enqueue time. Use `HasField` to discriminate:

```python
batch = await queue.dequeue(context, bulk=True)
for item in batch.items:
    if item.HasField("value"):
        ...  # google.protobuf.Value
    elif item.HasField("bytes"):
        ...  # bytes
    elif item.HasField("any"):
        ...  # google.protobuf.Any — Unpack into your message type
```

### Helper: `reboot.protobuf` for `Value` <-> Python

`reboot.protobuf` exposes `from_str` / `as_str` / `to_json` helpers used
in stdlib examples (e.g. `from_str(message_id)` to wrap a string into a
`Value`). These keep call sites compact:

```python
from reboot.protobuf import as_str, from_str, to_json

await Topic.ref(tid).publish(context, value=from_str(message_id))

batch = await queue.dequeue(context, bulk=True)
ids = [as_str(item.value) for item in batch.items]
```

### Don't Mix Forms in One Item

An `Item` with multiple fields set is rejected at runtime by the topic
servicer (which checks `sum([HasField('value'), HasField('bytes'), HasField('any')]) == 1`). Pick one field per item.
