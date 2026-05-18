---
title: Use `SortedMap` for Distributed Sorted Key/Value Storage
impact: HIGH
impactDescription: Without a stdlib map, large or paginated collections must be handrolled
tags: stdlib, SortedMap, collections, range, paginated, ordered
---

## Use `SortedMap` for Distributed Sorted Key/Value Storage

> **Critical:** must register `sorted_map_library()` in
> `Application(libraries=[...])`. Forgetting it produces a runtime
> error about an unknown actor type. Values are stored as `bytes` —
> `.encode()`/`.decode()` strings yourself. `range`/`reverse_range`
> require a non-zero `limit=`.

`SortedMap` (`reboot.std.collections.v1.sorted_map`) is a Reboot stdlib
state type that stores ordered `(string key → bytes value)` entries with
batch insert/remove and ascending/descending range queries. Each
`SortedMap` is its own actor identified by a string ID — your code stores
the ID in your own state and references the map via `SortedMap.ref(id)`.

### Methods

| Method          | Type   | Signature                                                         |
| --------------- | ------ | ----------------------------------------------------------------- |
| `insert`        | writer | `entries: dict[str, bytes]`                                       |
| `remove`        | writer | `keys: list[str]`                                                 |
| `get`           | reader | `key: str` → `GetResponse(value: bytes \| None)`                  |
| `range`         | reader | `start_key?: str, end_key?: str, limit: int` (required, non-zero) |
| `reverse_range` | reader | `start_key?: str, end_key?: str, limit: int`                      |

`range`/`reverse_range` raise `SortedMap.RangeAborted(InvalidRangeError(...))`
on bad ranges (`start_key >= end_key` for `range`, vice versa for
`reverse_range`, or `limit=0`).

### Register the Library

Always pass `sorted_map_library()` to the `Application`:

```python
from reboot.std.collections.v1.sorted_map import (
    SortedMap, sorted_map_library,
)


async def main():
    await Application(
        servicers=[BankServicer, AccountServicer],
        libraries=[sorted_map_library()],
        initialize=initialize,
    ).run()
```

### Canonical Usage (matches the [`reboot-bank`](https://github.com/reboot-dev/reboot-bank) example)

```python
from reboot.std.collections.v1.sorted_map import SortedMap
from uuid import uuid4
from uuid7 import create as uuid7


class BankServicer(Bank.Servicer):

    async def create(
        self, context: TransactionContext, request: CreateRequest,
    ) -> CreateResponse:
        # Allocate a fresh ID for our SortedMap and remember it.
        self.state.account_ids_map_id = str(uuid4())
        await SortedMap.ref(self.state.account_ids_map_id).insert(
            context, entries={},
        )
        return CreateResponse()

    async def sign_up(
        self, context: TransactionContext, request: SignUpRequest,
    ) -> SignUpResponse:
        # ... open the account ...
        # UUIDv7 keys give time-ordered iteration for free.
        await SortedMap.ref(self.state.account_ids_map_id).insert(
            context,
            entries={str(uuid7()): request.account_id.encode()},
        )
        return SignUpResponse()

    async def account_balances(
        self, context: ReaderContext, request: AccountBalancesRequest,
    ) -> AccountBalancesResponse:
        account_ids_map = SortedMap.ref(self.state.account_ids_map_id)
        # First "page" of 32 entries:
        page = await account_ids_map.range(context, limit=32)
        for entry in page.entries:
            key = entry.key            # str
            value = entry.value        # bytes
        ...
```

### Encode Values as Bytes

The value type is `bytes`. For strings use `value.encode()` /
`value.decode()`; for structured payloads, serialize/deserialize as
needed (e.g. `json.dumps(...).encode()` and `json.loads(...)`). The
JSON-as-string convention works fine for ad-hoc schemas.

### Pagination

Hand back the last `entry.key` as the next call's `start_key` to page
forward. `range`'s `start_key` is inclusive, so add a one-byte suffix or
remember to skip the duplicate first row when paging.

### Authorizer

Pass an authorizer to `sorted_map_library(authorizer=...)` if you need
something stricter than the default (`allow_if(all=[is_app_internal])`).

### Don't Confuse with `OrderedMap`

`OrderedMap` is also a stdlib state type with similar API but different
implementation tradeoffs (B-tree of `Node` actors). See
`stdlib-ordered-map.md`.
