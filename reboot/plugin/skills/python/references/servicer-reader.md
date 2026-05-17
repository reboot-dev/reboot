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

A method marked `reader: {}` in the proto receives a `ReaderContext` and
must return its declared response type. Inside a reader, `self.state` is
read-only — mutations are not allowed and will fail.

**Incorrect (mutating state in a reader):**

```python
async def messages(
    self,
    context: ReaderContext,
    request: MessagesRequest,
) -> MessagesResponse:
    self.state.messages.append("seen")  # NEVER mutate in a reader
    return MessagesResponse(messages=self.state.messages)
```

**Correct (matches the [`reboot-hello`](https://github.com/reboot-dev/reboot-hello) example, `backend/src/chat_room_servicer.py`):**

```python
from chat_room.v1.chat_room_rbt import (
    ChatRoom, MessagesRequest, MessagesResponse,
)
from reboot.aio.contexts import ReaderContext


class ChatRoomServicer(ChatRoom.Servicer):

    async def messages(
        self,
        context: ReaderContext,
        request: MessagesRequest,
    ) -> MessagesResponse:
        return MessagesResponse(messages=self.state.messages)
```

## Method Signature Matches the Proto

The Python method name is the proto RPC name in `snake_case`. For a proto
RPC `Messages`, the Servicer method is `messages`. Arguments are always
`(self, context, request)` and the return type is the declared response
message.

## Readers Run Concurrently

Multiple readers on the same actor can run in parallel; they don't block
each other. They are blocked by an in-flight writer/transaction on that
actor and resume after it completes.

## Calling Other Actors Is Allowed (But Read-Only)

A reader may call `await Service.ref(other_id).reader_method(context)` —
the call propagates the `ReaderContext`. Calling a `writer` or
`transaction` from a `reader` is a category error; use a `transaction`
method if the work is genuinely cross-actor.

[`reboot-bank`](https://github.com/reboot-dev/reboot-bank), `backend/src/main.py`, shows fan-out reads from a
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
