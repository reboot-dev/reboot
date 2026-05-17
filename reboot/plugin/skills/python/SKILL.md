---
name: python
description: Reboot Python framework for building transactional microservices with durable actor state. APIs can be defined in `.proto` or in pydantic Python. Use this skill when writing Python code for a Reboot application, defining APIs with reader/writer/transaction/workflow methods, implementing Servicers, calling actor refs across services, scheduling work, building durable workflows with `at_most_once`/`at_least_once`/`until` primitives, or testing Reboot applications with the `Reboot()` test harness.
license: Apache-2.0
metadata:
  author: reboot
  version: "1.0.0"
  organization: Reboot
  date: April 2026
  abstract: Comprehensive guide for building Reboot Python applications. Covers proto and pydantic API definitions, the Servicer pattern, reader/writer/transaction/workflow contexts, durable workflow primitives (at_most_once / at_least_once / until / until_changes), actor refs, scheduling, the standard library (SortedMap), and testing.
---

# Reboot Python Best Practices

Guide for building transactional microservices in Python with the Reboot
framework. Reboot APIs are defined in **either `.proto` files or pydantic
Python (`reboot.api`)** and code-generated into typed Servicer base classes;
you implement `async` methods that receive a typed context
(`ReaderContext`, `WriterContext`, `TransactionContext`, or
`WorkflowContext`).

## When to Apply

Reference these guidelines when:

- Scaffolding a new Reboot Python project (`.rbtrc`, `pyproject.toml`,
  application entry point)
- Defining or modifying an API in `.proto` or in pydantic Python (state,
  reader/writer/transaction/workflow methods, errors, constructors)
- Implementing or modifying a Servicer
- Calling another actor via `Service.ref(id).method(context, ...)`
- Building a durable workflow with `WorkflowContext` and the `at_most_once`
  / `at_least_once` / `until` / `until_changes` primitives
- Scheduling work via `ref.schedule(when=...).method(context)`
- Using the standard library (`SortedMap`, mailgun, etc.)
- Writing tests with the `Reboot()` harness

## Rule Categories by Priority

| Priority | Category   | Impact     | Prefix        |
| -------- | ---------- | ---------- | ------------- |
| 1        | Lifecycle  | CRITICAL   | `lifecycle-`  |
| 2        | API        | CRITICAL   | `api-`        |
| 3        | Servicer   | HIGH       | `servicer-`   |
| 4        | Workflow   | HIGH       | `workflow-`   |
| 5        | Stdlib     | HIGH       | `stdlib-`     |
| 6        | State      | HIGH       | `state-`      |
| 7        | Auth       | HIGH       | `auth-`       |
| 8        | RPC        | MEDIUM     | `rpc-`        |
| 9        | Scheduling | MEDIUM     | `scheduling-` |
| 10       | Testing    | LOW-MEDIUM | `testing-`    |
| 11       | Patterns   | LOW-MEDIUM | `patterns-`   |

## Critical Rules

### Servicer Pattern

A Reboot Servicer subclasses the generated `<State>.Servicer` base class and
implements one `async def` per RPC. Each method takes a typed context as the
second argument; that type is determined by the proto method marker
(`reader`/`writer`/`transaction`):

```python
from chat_room.v1.chat_room_rbt import (
    ChatRoom, MessagesRequest, MessagesResponse, SendRequest, SendResponse,
)
from reboot.aio.auth.authorizers import allow
from reboot.aio.contexts import ReaderContext, WriterContext


class ChatRoomServicer(ChatRoom.Servicer):

    def authorizer(self):
        return allow()

    async def messages(
        self,
        context: ReaderContext,
        request: MessagesRequest,
    ) -> MessagesResponse:
        return MessagesResponse(messages=self.state.messages)

    async def send(
        self,
        context: WriterContext,
        request: SendRequest,
    ) -> SendResponse:
        self.state.messages.extend([request.message])
        return SendResponse()
```

### Application Entry

A Reboot application's `main` constructs an `Application` with the list of
Servicer classes and runs it under `asyncio`:

```python
import asyncio
from reboot.aio.applications import Application
from reboot.aio.external import InitializeContext
from chat_room.v1.chat_room_rbt import ChatRoom
from chat_room_servicer import ChatRoomServicer


async def initialize(context: InitializeContext):
    # Implicitly construct the singleton on first write.
    await ChatRoom.ref("reboot-chat-room").send(context, message="Hello!")


async def main():
    await Application(
        servicers=[ChatRoomServicer],
        initialize=initialize,
    ).run()


if __name__ == '__main__':
    asyncio.run(main())
```

### Proto or Pydantic Drives Code Generation

Never hand-edit generated `*_rbt.py` files. The API definition file is the
source of truth — pick proto **or** pydantic per project:

**Proto:**

```proto
message ChatRoom {
  option (rbt.v1alpha1.state) = {};
  repeated string messages = 1;
}

service ChatRoomMethods {
  rpc Messages(MessagesRequest) returns (MessagesResponse) {
    option (rbt.v1alpha1.method).reader = {};
  }
  rpc Send(SendRequest) returns (SendResponse) {
    option (rbt.v1alpha1.method).writer = {};
  }
}
```

**Pydantic** (see `references/api-pydantic.md`):

```python
from reboot.api import API, Field, Methods, Model, Reader, Type, Writer


# Every Field needs an explicit default (see Key Constraints below).
class ChatRoomState(Model):
    messages: list[str] = Field(tag=1, default_factory=list)

class SendRequest(Model):
    message: str = Field(tag=1, default="")

class MessagesResponse(Model):
    messages: list[str] = Field(tag=1, default_factory=list)

api = API(
    ChatRoom=Type(
        state=ChatRoomState,
        methods=Methods(
            messages=Reader(request=None, response=MessagesResponse),
            send=Writer(request=SendRequest, response=None),
        ),
    ),
)
```

`rbt generate` (run automatically by `rbt dev run`) emits
`<pkg>/<v>/<name>_rbt.py` with the `<State>` class, request/response messages,
the `Servicer` base class, and the `.ref(id)` factory — the same import
surface either way.

### Key Constraints

- The context type in each method **must match** the API method marker. A
  method marked `reader: {}` (or `Reader(...)` in pydantic) requires
  `ReaderContext`; `writer: {}` / `Writer(...)` requires `WriterContext`;
  `transaction: {}` / `Transaction(...)` requires `TransactionContext`;
  `workflow: {}` / `Workflow(...)` requires `WorkflowContext`.
- `self.state` is read-only inside `ReaderContext`. Mutate it only inside
  `WriterContext` or `TransactionContext`. Workflows mutate state by
  calling `Service.ref().write(context, callback)` — not `self.state` —
  because workflows can re-execute on replay.
- `.rbtrc` is **line-based**, not YAML. Each line is `<subcommand> <flag>`.
  Use `--application-name=<app>` (canonical on `reboot>=1.0.4`; `--name`
  still works as a deprecated alias but warns).
- The actor's ID is `self.ref().state_id` inside writer/reader/
  transaction methods, and `context.state_id` inside workflows.
  `self.state_id` does not exist and raises `AttributeError`.
- **Pydantic API definitions: every `Field(tag=N)` needs an explicit
  zero-value default** (`default=""`, `default=0`, `default=0.0`,
  `default=False`, `default_factory=list`, etc.). Two layered rules:
  (1) `model_construct()` drops fields lacking declared defaults, so
  reads `AttributeError`; (2) only the type's zero value is accepted —
  non-zero defaults raise `UserPydanticError` at import time. Set
  domain defaults (`turn="r"`, `delay=1.0`, etc.) inside the
  constructor method, not on the Field. Applies to state,
  request/response, and error Models.
- Pydantic codegen does **not** support `list[<Model>]` (or
  `dict[str, <Model>]`) — those fields are silently dropped. Encode
  records as `list[str]` (e.g. JSON) instead.
- Cross-actor and external-service calls belong in `TransactionContext`
  (one-shot) or `WorkflowContext` (durable, long-running).
- Pass arguments to actor methods as **kwargs**, not as Request wrappers:
  `await ref.deposit(context, amount=10)`, not
  `await ref.deposit(context, DepositRequest(amount=10))`.
- **`Queue`, `Topic`, `SortedMap`, `OrderedMap`, `Presence`,
  `Item` are stdlib actor names — use them, don't redefine
  them.** If a design or task names any of these (e.g. "publish
  to a `Topic`", "track members in an `OrderedMap`", "subscribe
  a `Queue`", "presence shows who's online"), the answer is to
  _import_ the stdlib actor — not to declare a proto/pydantic
  type with the same name. Defining your own proto-level `Topic`
  / `Queue` / etc. forfeits durability, ordering, blocking
  semantics, and concurrency guarantees the stdlib already
  provides. See the trigger table under "How to Use → Using
  stdlib state types" below.

## How to Use

Most footguns in this skill are **distributed across reference files**
— skipping the right reference means hitting a runtime error that the
docs would have prevented. Before writing code, load the references
the task actually requires from the lists below. "Common gotchas"
should be loaded for almost every task.

### Building a workflow

Read **all** of these before writing the body:

- `references/workflow-method.md` — declaration shape (`@classmethod`,
  `WorkflowContext`, scheduling)
- `references/workflow-loop.md` — `context.loop(...)` for iteration
- `references/workflow-at-least-once.md` — default primitive
- `references/workflow-at-most-once.md` — non-retryable side effects
  (failure poisons the alias — read the file)
- `references/workflow-until.md` — wait reactively for a condition
- `references/workflow-until-changes.md` — react inside a loop
- `references/workflow-idempotency-scopes.md` — `PER_WORKFLOW` vs.
  `PER_ITERATION` defaults flip inside a loop
- `references/workflow-state-write.md` — workflows have no
  `self.state`; mutate via `Service.ref().write(context, fn)`

### Defining an API

- `references/api-proto-basics.md` (proto) **or**
  `references/api-pydantic.md` (pydantic) — **always read pydantic if
  you're using it**: zero-default rule and `list[<Model>]` limitation
  bite at import time
- `references/api-state-message.md` (proto) — state message shape
- `references/api-methods.md` — `reader` / `writer` / `transaction` /
  `workflow` markers and constructor option
- `references/api-errors.md` — typed error declaration

### Implementing a Servicer

- `references/servicer-{reader,writer,transaction,constructor,authorizer}.md`
  — one per context type and the constructor / authorizer concerns
- `references/rpc-refs.md` — **always read**: `self.ref().state_id` vs.
  `self.state_id` (which doesn't exist) is a recurring trip
- `references/rpc-calls.md` — **always read**: the kwargs-not-Request
  trap (`await ref.deposit(context, DepositRequest(amount=10))`) is a
  recurring miss; passes type-check and fails at runtime
- `references/rpc-constructor-calls.md` — **always read** when the
  agent invokes a constructor: use `<X>.create(context, id, ...)` or
  `<X>.<CtorMethod>(context, id, ...)`, NEVER `<X>.ref(id).<ctor>(...)`
  (the trap that skips creation semantics). The proto-declaration
  side is `servicer-constructor.md`; the call-site side is here

### Using stdlib state types

If your design calls for any of the concepts in the left column,
the stdlib already provides the canonical actor. Read the
reference **before** writing your own actor type — defining your
own `Queue` / `SortedMap` / etc. proto is almost always wrong
and forfeits durability, ordering, and concurrency guarantees:

| You need...                                  | Use          | Reference               |
| -------------------------------------------- | ------------ | ----------------------- |
| Durable FIFO — work queue, job queue, intake | `Queue`      | `stdlib-queue.md`       |
| Sorted key-value, modest size                | `SortedMap`  | `stdlib-sorted-map.md`  |
| Sorted key-value, heavy concurrent writes    | `OrderedMap` | `stdlib-ordered-map.md` |
| Presence — who's online / connected          | `Presence`   | `stdlib-presence.md`    |
| Pubsub / broadcast / fan-out to subscribers  | `PubSub`     | `stdlib-pubsub.md`      |
| Item builder for `Queue` / `PubSub` payloads | `Item`       | `stdlib-item.md`        |

Each stdlib reference also lists its library registration —
forgetting `<thing>_library()` and the stdlib actor's
`<thing>.servicers()` in your `Application(...)` fails at boot
with "unknown actor type."

### Authorization

- `references/auth-allow-deny.md` — minimal/correct shape
- `references/auth-allow-if.md` and `references/auth-built-in-predicates.md`
  — composition patterns
- `references/auth-custom-predicates.md` — for app-specific rules

### Testing

- `references/testing-harness.md` — `Reboot()` test harness
- `references/testing-external-context.md` — `create_external_context`

### Always relevant

- `references/patterns-common-gotchas.md` — the consolidated trip-list
  including the pydantic zero-default rule, `list[<Model>]` limitation,
  `self.state_id` non-existence, and `--name` vs.
  `--application-name`. Read it once per task.

## References

- https://docs.reboot.dev/
- Public examples (one repo each):
  - https://github.com/reboot-dev/reboot-hello (proto, simplest reader/writer)
  - https://github.com/reboot-dev/reboot-bank (proto, transactions + scheduling + SortedMap)
  - https://github.com/reboot-dev/reboot-bank-pydantic (pydantic API definition)
  - https://github.com/reboot-dev/reboot-counter (proto, minimal transaction)
  - https://github.com/reboot-dev/reboot-boutique (proto, multi-service)
