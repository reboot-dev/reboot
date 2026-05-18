---
title: Pick the Right Collection — `list[T]` / `dict[str, T]` vs. `SortedMap`
impact: MEDIUM
impactDescription: Wrong choice degrades scalability or makes queries impossible
tags: state, collections, list, dict, SortedMap, stdlib
---

## Pick the Right Collection — `list[T]` / `dict[str, T]` vs. `SortedMap`

Reboot offers two ways to model a collection inside an actor:

1. **In-state collections** (`list[T]`, `dict[str, T]`) — lives entirely
   inside the one actor's state. Best for **bounded**, small-to-medium
   collections.
2. **`SortedMap` (from `reboot.std.collections.v1`)** — a separate
   distributed actor that stores ordered key/value entries. Use when the
   collection is large, paginated, or shared.

**Use in-state collections for bounded lists / maps:**

```python
class ChatRoomState(Model):
    messages: list[str] = Field(tag=1, default_factory=list)
```

```python
async def send(
    self, context: WriterContext, request: ChatRoom.SendRequest,
) -> None:
    self.state.messages.append(request.message)
```

**Use `SortedMap` for a distributed, paginated map (matches `bank-pydantic`):**

`api/bank/v1/pydantic/bank.py`:

```python
class BankState(Model):
    # ID of the underlying SortedMap actor.
    account_ids_map_id: str = Field(tag=1, default="")
```

`main.py`:

```python
from reboot.std.collections.v1.sorted_map import SortedMap, sorted_map_library
from uuid7 import create as uuid7
from uuid import uuid4


class BankServicer(Bank.Servicer):

    async def create(
        self, context: TransactionContext,
    ) -> None:
        self.state.account_ids_map_id = str(uuid4())
        await SortedMap.ref(self.state.account_ids_map_id).insert(
            context, entries={},
        )

    async def sign_up(
        self, context: TransactionContext, request: Bank.SignUpRequest,
    ) -> None:
        # ... open account, etc.
        # Use a UUIDv7 key for time-ordered iteration.
        await SortedMap.ref(self.state.account_ids_map_id).insert(
            context,
            entries={str(uuid7()): request.account_id.encode()},
        )

    async def account_balances(
        self, context: ReaderContext,
    ) -> Bank.AccountBalancesResponse:
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

## When to Switch from In-State Lists to `SortedMap`

Move to `SortedMap` when any of:

- The collection grows unboundedly.
- You need pagination/range queries (`range(context, limit=N)`).
- Multiple actors need to share or scan the collection.
