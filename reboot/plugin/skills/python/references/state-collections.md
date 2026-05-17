---
title: Pick the Right Collection: `repeated` vs. `SortedMap`
impact: MEDIUM
impactDescription: Wrong choice degrades scalability or makes queries impossible
tags: state, collections, repeated, SortedMap, stdlib
---

## Pick the Right Collection: `repeated` vs. `SortedMap`

> **Critical:** in pydantic API definitions, `list[<Model>]` is
> silently dropped by the codegen — use `list[str]` (JSON-encoded)
> for record collections. Scalar `list[str]` / `list[int]` /
> `list[float]` / `list[bool]` work in both proto and pydantic.

Reboot offers two ways to model a collection inside an actor:

1. **proto `repeated <T>`** — an in-state list. Lives entirely inside the
   one actor's state. Best for **bounded**, small-to-medium collections.
2. **`SortedMap` (from `reboot.std.collections.v1`)** — a separate
   distributed actor that stores ordered key/value entries. Use when the
   collection is large, paginated, or shared.

**Use `repeated` for bounded, in-state lists (matches `chat-room`):**

```proto
message ChatRoom {
  option (rbt.v1alpha1.state) = {};
  repeated string messages = 1;
}
```

```python
async def send(
    self, context: WriterContext, request: SendRequest,
) -> SendResponse:
    self.state.messages.extend([request.message])
    return SendResponse()
```

**Use `SortedMap` for a distributed, paginated map (matches `bank`):**

`bank.proto`:

```proto
message Bank {
  option (rbt.v1alpha1.state) = {};
  string account_ids_map_id = 1;  // ID of the underlying SortedMap actor.
}
```

`main.py`:

```python
from reboot.std.collections.v1.sorted_map import SortedMap, sorted_map_library
from uuid7 import create as uuid7
from uuid import uuid4


class BankServicer(Bank.Servicer):

    async def create(
        self, context: TransactionContext, request: CreateRequest,
    ) -> CreateResponse:
        self.state.account_ids_map_id = str(uuid4())
        await SortedMap.ref(self.state.account_ids_map_id).insert(
            context, entries={},
        )
        return CreateResponse()

    async def sign_up(
        self, context: TransactionContext, request: SignUpRequest,
    ) -> SignUpResponse:
        # ... open account, etc.
        # Use a UUIDv7 key for time-ordered iteration.
        await SortedMap.ref(self.state.account_ids_map_id).insert(
            context,
            entries={str(uuid7()): request.account_id.encode()},
        )
        return SignUpResponse()

    async def account_balances(
        self, context: ReaderContext, request: AccountBalancesRequest,
    ) -> AccountBalancesResponse:
        account_ids_map = SortedMap.ref(self.state.account_ids_map_id)
        # First "page" of 32 entries.
        account_ids = await account_ids_map.range(context, limit=32)
        ...
```

## Register `sorted_map_library()` in `Application(...)`

To use `SortedMap`, register the library when constructing the
`Application`:

```python
await Application(
    servicers=[AccountServicer, BankServicer],
    libraries=[sorted_map_library()],
    initialize=initialize,
).run()
```

Without the library registration the actor type is unknown and calls fail.

## When to Switch from `repeated` to `SortedMap`

Move to `SortedMap` when any of:

- The collection grows unboundedly.
- You need pagination/range queries (`range(context, limit=N)`).
- Multiple actors need to share or scan the collection.
