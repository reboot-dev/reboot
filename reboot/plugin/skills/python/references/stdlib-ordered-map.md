---
title: Use `OrderedMap` for Distributed Sorted Key/Value Storage
impact: HIGH
impactDescription: Without a stdlib sorted map, large or paginated collections must be hand-rolled
tags: stdlib, OrderedMap, B-tree, collections, range, paginated, ordered
---

## Use `OrderedMap` for Distributed Sorted Key/Value Storage

> **Critical:** must register `ordered_map_library()` in
> `Application(libraries=[...])`. Forgetting it produces a runtime
> error about an unknown actor type. `range` / `reverse_range`
> require a non-zero `limit=`. Each entry's value is one of
> `value` (`google.protobuf.Value`), `bytes`, or `any`
> (`google.protobuf.Any`) — pick **one** per entry.

`OrderedMap` (`reboot.std.collections.ordered_map.v1.ordered_map`) is
a B-tree-backed sorted `(string key → value)` map. It stores entries
across many `Node` actors so concurrent writes scale, and exposes
single-key and bulk variants of `insert` / `remove`, plus `search`,
`range`, and `reverse_range`. Each `OrderedMap` is its own actor
identified by a string ID — your code **must** persist that ID as a
field on the parent's state (e.g. `<thing>_index_id: str`),
allocate it once in the parent's constructor, and reference the map
via `OrderedMap.ref(self.state.<id>)`.

> **Anti-pattern — do not synthesize the map ID inline from the
> owner's `state_id`** (e.g.
> `OrderedMap.ref(f"{self.ref().state_id}-drafts")` or
> `OrderedMap.ref(f"{context.state_id}-drafts")` inside a workflow).
> It "works" but hides the parent → map relationship from the state
> schema, repeats the magic string at every callsite, and skips the
> constructor allocation that marks ownership. The full rationale,
> and the generalization to every cross-`Type` reference (stdlib or
> user-defined), is in `state-collections.md`'s "Relationships
> Between State Types" section.

### Methods

| Method          | Type        | Signature                                                                                                                                                   |
| --------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `create`        | transaction | `degree?: int = 128, maintain_size?: bool = False` (constructor)                                                                                            |
| `insert`        | transaction | single: `key: str` + one of `value` / `bytes` / `any`; bulk: `entries: dict[str, Item]`. May also pass `degree` / `maintain_size` on implicit construction. |
| `remove`        | transaction | single: `key: str`; bulk: `keys: list[str]`                                                                                                                 |
| `search`        | reader      | `key: str` → `SearchResponse(found: bool, value? / bytes? / any?)`                                                                                          |
| `range`         | reader      | `start_key?: str, limit: int` (required, non-zero) → `RangeResponse(entries, total_size?)`                                                                  |
| `reverse_range` | reader      | `start_key?: str, limit: int` (required, non-zero)                                                                                                          |
| `stringify`     | reader      | debug; renders the tree                                                                                                                                     |

`range` / `reverse_range` raise
`OrderedMap.RangeAborted(InvalidRangeError(...))` on `limit=0`.
`create` and the construction-option fields on `insert` raise
`InvalidArgument` if `degree < 2`, or `StateAlreadyConstructed` if
the map was already constructed with different options.

### Register the Library

Always pass `ordered_map_library()` to the `Application`:

```python
from reboot.std.collections.ordered_map.v1.ordered_map import (
    OrderedMap, ordered_map_library,
)


async def main():
    await Application(
        servicers=[BankServicer, AccountServicer],
        libraries=[ordered_map_library()],
        initialize=initialize,
    ).run()
```

`ordered_map_library()` accepts an optional `authorizer=` parameter
if you need something stricter than the default
(`allow_if(all=[is_app_internal])`).

### Construct Explicitly or Implicitly

You can construct the map up front with `create`:

```python
from reboot.std.collections.ordered_map.v1.ordered_map import OrderedMap
from uuid import uuid4


async def create(
    self, context: TransactionContext, request: CreateRequest,
) -> CreateResponse:
    self.state.account_ids_map_id = str(uuid4())
    await OrderedMap.create(
        context, self.state.account_ids_map_id,
    )
    return CreateResponse()
```

Or skip `create` and let the first `insert` construct the map
implicitly (pass `degree=` / `maintain_size=` on that first call if
you want to override the defaults; once constructed, those fields
are validated against the existing configuration on every subsequent
call). `degree` defaults to 128 — raise it for shallower trees,
lower it for narrower ones. The right number depends on key/value
sizes and write/read mix.

### Canonical Usage

Single-key inserts take `key=` plus one of `value=` / `bytes=` /
`any=`:

```python
from reboot.std.collections.ordered_map.v1.ordered_map import OrderedMap
from uuid import uuid4
from uuid7 import create as uuid7


class BankServicer(Bank.Servicer):

    async def create(
        self, context: TransactionContext, request: CreateRequest,
    ) -> CreateResponse:
        # Allocate a fresh ID for our OrderedMap and remember it.
        # Construction happens implicitly on the first `insert`.
        self.state.account_ids_map_id = str(uuid4())
        return CreateResponse()

    async def sign_up(
        self, context: TransactionContext, request: SignUpRequest,
    ) -> SignUpResponse:
        # ... open the account ...
        # UUIDv7 keys give time-ordered iteration for free.
        await OrderedMap.ref(self.state.account_ids_map_id).insert(
            context,
            key=str(uuid7()),
            bytes=request.account_id.encode(),
        )
        return SignUpResponse()

    async def account_balances(
        self, context: ReaderContext, request: AccountBalancesRequest,
    ) -> AccountBalancesResponse:
        account_ids_map = OrderedMap.ref(self.state.account_ids_map_id)
        # First "page" of 32 entries:
        page = await account_ids_map.range(context, limit=32)
        for entry in page.entries:
            key = entry.key            # str
            value = entry.bytes        # whichever value field was set
        ...
```

### Bulk `insert` Uses `Item`

For multi-key writes, pass `entries={key: Item(...)}` — the same
`Item` envelope `Queue` / `Topic` use (see `stdlib-item.md`):

```python
from reboot.std.collections.ordered_map.v1.ordered_map import OrderedMap
from reboot.std.item.v1.item import Item

await OrderedMap.ref(self.state.account_ids_map_id).insert(
    context,
    entries={
        str(uuid7()): Item(bytes=account_id.encode()),
        # ...
    },
)
```

Bulk and single-key fields are mutually exclusive on a given call.

### Pick a Value Field

`value` (`google.protobuf.Value`), `bytes`, and `any`
(`google.protobuf.Any`) are alternatives; set exactly one per entry.
For storing string IDs, `bytes=value.encode()` is the simplest
choice. For JSON-shaped payloads, `value=from_str(...)` (or other
`google.protobuf.Value` constructors) is more ergonomic. For typed
messages, pack into `Any`. See `stdlib-item.md` for the same
discrimination on `Queue` / `Topic` and the
`reboot.protobuf.from_str` / `as_str` helpers.

### Pagination

Hand back the last `entry.key` as the next call's `start_key` to
page forward. `range`'s `start_key` is inclusive, so add a one-byte
suffix or remember to skip the duplicate first row when paging.

### `maintain_size`

`create(..., maintain_size=True)` (or `insert(..., maintain_size=True)`
on the first call) makes the map track a running total. The size is
returned as `total_size` on each `range` response. This requires a
write to the root on every insert/remove, which serializes all
mutations — only opt in when you actually need the count.

### `Node` Is an Implementation Detail

`OrderedMap` is composed of `Node` actors at runtime. You should not
typically interact with `Node` directly — use the `OrderedMap`
methods. The `Node` API is exported for advanced cases (custom
traversal, debugging) but isn't the day-to-day surface.
