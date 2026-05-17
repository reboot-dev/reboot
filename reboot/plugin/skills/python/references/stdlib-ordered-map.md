---
title: Use `OrderedMap` for Tree-Backed Sorted Key/Value Storage
impact: MEDIUM
impactDescription: Tree-backed map is the right choice when concurrent inserts/removes need to scale
tags: stdlib, OrderedMap, B-tree, collections, range, ordered
---

## Use `OrderedMap` for Tree-Backed Sorted Key/Value Storage

> **Critical:** unlike `SortedMap`, `OrderedMap` has an explicit
> `create` constructor that takes `degree=` (B-tree branching factor —
> 100 is a typical value). Must register `ordered_map_library()` in
> `Application(libraries=[...])`.

`OrderedMap` (`reboot.std.collections.ordered_map.v1.ordered_map`) is a
B-tree-backed sorted map. It exposes the same logical API as `SortedMap`
(insert/remove/get/range/reverse_range) but stores entries across many
`Node` actors so concurrent writes scale better. Pick `OrderedMap` when
you expect heavy contention or large per-actor footprints; pick
`SortedMap` when the collection is moderate-sized and a single
storage shard is fine.

### Methods (`OrderedMap`)

| Method          | Type                                   |
| --------------- | -------------------------------------- |
| `create`        | writer (constructor; `degree: uint32`) |
| `insert`        | transaction                            |
| `remove`        | transaction                            |
| `search`        | reader                                 |
| `range`         | reader                                 |
| `reverse_range` | reader                                 |
| `stringify`     | reader (debug)                         |

`range`/`reverse_range` raise `OrderedMap.RangeAborted(InvalidRangeError(...))`
on invalid inputs.

### Register the Library

```python
from reboot.std.collections.ordered_map.v1.ordered_map import (
    OrderedMap, ordered_map_library,
)


async def main():
    await Application(
        servicers=[MyServicer],
        libraries=[ordered_map_library()],
    ).run()
```

`ordered_map_library()` accepts an optional `authorizer=` parameter.

### Construct Before Use

Unlike `SortedMap`, `OrderedMap` has an explicit constructor and `degree`
parameter (B-tree branching factor):

```python
from reboot.std.collections.ordered_map.v1.ordered_map import OrderedMap

async def create(
    self, context: TransactionContext, request: CreateRequest,
) -> CreateResponse:
    self.state.map_id = str(uuid4())
    await OrderedMap.create(
        context, self.state.map_id, degree=100,
    )
    return CreateResponse()
```

A typical `degree` is 100; raise it for shallower trees, lower it for
narrower ones. The right number depends on key/value sizes and
write/read mix.

### When to Pick Which Map

| Choose `SortedMap` when...  | Choose `OrderedMap` when... |
| --------------------------- | --------------------------- |
| Up to ~thousands of entries | Tens of thousands or more   |
| Modest write contention     | Heavy concurrent writes     |
| Simpler operational model   | You need write-side scaling |

If unsure, start with `SortedMap`. It's simpler and has wider example
coverage in the codebase.

### `Node` Is an Implementation Detail

`OrderedMap` is composed of `Node` actors at runtime. You should not
typically interact with `Node` directly — use the `OrderedMap` methods.
The `Node` API is exported for advanced cases (custom traversal,
debugging) but isn't the day-to-day surface.
