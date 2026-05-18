---
title: Get Actor References with `Service.ref(id)`
impact: MEDIUM
impactDescription: Wrong ref-construction calls hit nonexistent actors or crash at startup
tags: rpc, ref, actor, identity
---

## Get Actor References with `Service.ref(id)`

> **Critical:** `self.state_id` does **not** exist on a Servicer
> instance. Use `self.ref().state_id` inside writer/reader/transaction
> methods, and `context.state_id` inside `@classmethod` workflows. Plain
> `self.state_id` raises `AttributeError`.

`Service.ref(id)` returns a typed handle to the actor with the given
string ID. The ref is cheap to construct, doesn't hit storage, and can be
made anywhere a context is in scope.

**Incorrect (instantiating the Servicer directly):**

```python
# DON'T — Servicer instances are managed by Reboot, not callers.
servicer = ChatRoomServicer()
await servicer.send(...)
```

**Correct (use `.ref(id)`):**

```python
from chat_room.v1.chat_room_rbt import ChatRoom

chat_room = ChatRoom.ref("reboot-chat-room")
await chat_room.send(context, message="Hello!")
```

## IDs Are Caller-Supplied Strings

The actor ID is whatever string the caller chooses. Common patterns:

- A semantic key (account ID, room name).
- A UUID generated at creation time.

```python
from uuid import uuid4

self.state.account_ids_map_id = str(uuid4())
# OrderedMap is constructed implicitly on the first `insert`.
```

## `self.ref()` Inside a Servicer Refers to the Current Actor

A Servicer can get a ref to itself with `self.ref()`. Useful for
self-scheduling:

```python
async def open(
    self, context: WriterContext, request: OpenRequest,
) -> OpenResponse:
    await self.ref().schedule(when=timedelta(seconds=1)).interest(context)
    return OpenResponse()
```

## Use `self.ref().state_id` (Not `self.state_id`) Inside Servicers

A Servicer instance does **not** carry the actor's ID as `self.state_id`
— that attribute doesn't exist and accessing it raises `AttributeError`.
The right form depends on the context type:

| Context                                                  | Get the actor's state ID via |
| -------------------------------------------------------- | ---------------------------- |
| `ReaderContext` / `WriterContext` / `TransactionContext` | `self.ref().state_id`        |
| `WorkflowContext`                                        | `context.state_id`           |

**Incorrect (raises `AttributeError: 'XServicer' object has no attribute 'state_id'`):**

```python
async def tick(self, context: WriterContext, request) -> None:
    rng = random.Random(hash((self.state_id, ...)))  # self.state_id doesn't exist
```

**Correct (writer/reader/transaction):**

```python
async def tick(self, context: WriterContext, request) -> None:
    rng = random.Random(hash((self.ref().state_id, ...)))
```

**Correct (workflow):**

```python
@classmethod
async def control_loop(cls, context: WorkflowContext, request):
    queue = Queue.ref(f"{context.state_id}-messages-queue")
    ...
```

This is also why composite-key patterns (e.g. naming an `OrderedMap`
after the parent actor) reach for `self.ref().state_id` from a writer/
transaction and `context.state_id` from a workflow.

## Refs Don't Materialize Actors

Calling `Service.ref(id)` does **not** create the actor. The actor exists
when its constructor (explicit or implicit) has been called. A reader call
on a non-existent actor returns the zero-valued state; a writer
call against a state without an explicit constructor implicitly creates
the actor and proceeds.
