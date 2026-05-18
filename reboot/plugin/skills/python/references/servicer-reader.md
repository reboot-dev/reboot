---
title: Implement Reader Methods
impact: HIGH
impactDescription: Reader methods give read-only state access; incorrect signatures fail at startup
tags: servicer, reader, ReaderContext, state, async
---

## Implement Reader Methods

> **Critical:** `self.state` is **read-only** inside a reader. Mutating
> it raises at runtime. Multiple readers on the same actor run
> concurrently — they're blocked only by an in-flight writer/transaction.

A method declared with `Reader(...)` in the API file receives a
`ReaderContext` and must return its declared response type (or `None`
if `response=None`). Inside a reader, `self.state` is read-only —
mutations are not allowed and will fail.

**Incorrect (mutating state in a reader):**

```python
async def messages(
    self,
    context: ReaderContext,
) -> ChatRoom.MessagesResponse:
    self.state.messages.append("seen")  # NEVER mutate in a reader
    return ChatRoom.MessagesResponse(messages=self.state.messages)
```

**Correct (canonical reader shape):**

```python
from chat_room.v1.chat_room_rbt import ChatRoom
from reboot.aio.contexts import ReaderContext


class ChatRoomServicer(ChatRoom.Servicer):

    async def messages(
        self,
        context: ReaderContext,
    ) -> ChatRoom.MessagesResponse:
        return ChatRoom.MessagesResponse(messages=self.state.messages)
```

## Method Signature Matches the API File

The Servicer method name matches the entry name in the
`Methods(...)` block exactly. Arguments are `(self, context)` when
`request=None`, or `(self, context, request)` when a request type
was bound, and the return type is the declared response (`None` if
`response=None`).

## Readers Run Concurrently

Multiple readers on the same actor can run in parallel; they don't block
each other. They are blocked by an in-flight writer/transaction on that
actor and resume after it completes.

## Calling Other Actors Is Allowed (But Read-Only)

A reader may call `await Service.ref(other_id).reader_method(context)` —
the call propagates the `ReaderContext`. Calling a `Writer` or
`Transaction` method from a reader is a category error; use a
`Transaction` method if the work is genuinely cross-actor.

A reader of a `Bank` actor calling into per-account readers, run from a
transaction context (which can also call readers):

```python
async def balance(account_id: str):
    account = Account.ref(account_id)
    balance = await account.balance(context)  # Account.balance is a reader
    return Balance(account_id=account_id, balance=balance.amount)
```

## See Also

- `rpc-refs.md` — getting an actor ref and the actor's ID. The
  recurring trip: `self.state_id` doesn't exist; use
  `self.ref().state_id`.
- `rpc-calls.md` — kwargs convention for calling other actors.
- `servicer-authorizer.md` — every Servicer needs `def authorizer(self)`
  returning a constructed rule.
