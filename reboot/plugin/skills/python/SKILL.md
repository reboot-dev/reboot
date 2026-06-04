---
name: python
description: Reboot Python framework for building transactional microservices with durable actor state. APIs are defined in pydantic Python (`reboot.api`). Use this skill when writing Python code for a Reboot application, defining APIs with reader/writer/transaction/workflow methods, implementing Servicers, calling actor refs across services, scheduling work, building durable workflows with the right call primitive (`.per_workflow(alias)` / `.per_iteration(alias)` / `.always()` for Reboot calls; `at_least_once` / `at_most_once` for external calls; `until` / `until_changes` for reactive waiting on Reboot state), calling an LLM / building an AI agent in the backend via the durable `reboot.agents.pydantic_ai.Agent`, or testing Reboot applications with the `Reboot()` test harness.
license: Apache-2.0
metadata:
  author: reboot
  version: "1.0.0"
  organization: Reboot
  date: April 2026
  abstract: Comprehensive guide for building Reboot Python applications. Covers pydantic API definitions, the Servicer pattern, reader/writer/transaction/workflow contexts, the workflow call-classification model (Reboot scopes `.per_workflow` / `.per_iteration` / `.always()` for Reboot calls; external-call primitives `at_least_once` / `at_most_once`; reactive-waiting primitives `until` / `until_changes`), actor refs, scheduling, the standard library (OrderedMap, Queue, PubSub, Presence, Item), and testing.
---

# Reboot Python Best Practices

Guide for building transactional microservices in Python with the Reboot
framework. Reboot APIs are defined in pydantic Python
(`reboot.api`) and code-generated into typed Servicer base classes;
you implement `async` methods that receive a typed context
(`ReaderContext`, `WriterContext`, `TransactionContext`, or
`WorkflowContext`).

## When to Apply

Reference these guidelines when:

- Scaffolding a new Reboot Python project (`.rbtrc`, `pyproject.toml`,
  application entry point)
- Defining or modifying an API in pydantic Python (state,
  reader/writer/transaction/workflow methods, errors, constructors)
- Implementing or modifying a Servicer
- Calling another actor via `Service.ref(id).method(context, ...)`
- Building a durable workflow with `WorkflowContext`, picking the right
  primitive per `servicer-workflow.md` (Reboot calls use
  `.per_workflow(alias)` / `.per_iteration(alias)` / `.always()`;
  external calls default to `at_least_once`, with `at_most_once` for
  the rare non-retryable call)
  plus `until` / `until_changes` for reactive waiting
- Scheduling work via `ref.schedule(when=...).method(context)`
- Calling an LLM or building an AI agent in the backend via the
  durable `reboot.agents.pydantic_ai.Agent`
- Using the standard library (`OrderedMap`, mailgun, etc.)
- Writing tests with the `Reboot()` harness

## Rule Categories by Priority

| Priority | Category   | Impact     | Prefix        |
| -------- | ---------- | ---------- | ------------- |
| 1        | Lifecycle  | CRITICAL   | `lifecycle-`  |
| 2        | API        | CRITICAL   | `api-`        |
| 3        | Servicer   | HIGH       | `servicer-`   |
| 4        | Agent      | HIGH       | `agent-`      |
| 5        | Stdlib     | HIGH       | `stdlib-`     |
| 6        | Crypto     | HIGH       | `crypto-`     |
| 7        | State      | HIGH       | `state-`      |
| 8        | Auth       | HIGH       | `auth-`       |
| 9        | RPC        | MEDIUM     | `rpc-`        |
| 10       | Scheduling | MEDIUM     | `scheduling-` |
| 11       | Testing    | LOW-MEDIUM | `testing-`    |
| 12       | Patterns   | LOW-MEDIUM | `patterns-`   |

The `Workflow(...)` context method is the fourth servicer context
type alongside reader / writer / transaction; its (large) reference
is `servicer-workflow.md`.

## Critical Rules

### Servicer Pattern

A Reboot Servicer subclasses the generated `<Type>.Servicer` base class and
implements one `async def` per RPC. Each method takes a typed context as the
second argument; that type is determined by the API method factory
(`Reader`/`Writer`/`Transaction`/`Workflow`):

```python
from chat_room.v1.chat_room_rbt import ChatRoom
from reboot.aio.contexts import ReaderContext, WriterContext


class ChatRoomServicer(ChatRoom.Servicer):
    # No `authorizer()` defined — fine for `rbt dev` (the runtime
    # warns and allows). Before going to production, add a
    # `TokenVerifier` and a real `authorizer()` rule (see
    # references/servicer-authorizer.md).

    async def messages(
        self,
        context: ReaderContext,
    ) -> ChatRoom.MessagesResponse:
        return ChatRoom.MessagesResponse(messages=self.state.messages)

    async def send(
        self,
        context: WriterContext,
        request: ChatRoom.SendRequest,
    ) -> None:
        self.state.messages.append(request.message)
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

### The API File Drives Code Generation

Never hand-edit generated `*_rbt.py` files. The pydantic API definition
file is the source of truth (see `references/api-pydantic.md`):

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
            messages=Reader(request=None, response=MessagesResponse, mcp=None),
            send=Writer(request=SendRequest, response=None, mcp=None),
        ),
    ),
)
```

`rbt generate` (run automatically by `rbt dev run`) emits
`<pkg>/<v>/<name>_rbt.py` with the `<Type>` class, request/response
messages nested as attributes, the `Servicer` base class, and the
`.ref(id)` factory.

### Key Constraints

- The context type in each method **must match** the API method
  factory. `Reader(...)` requires `ReaderContext`; `Writer(...)`
  requires `WriterContext`; `Transaction(...)` requires
  `TransactionContext`; `Workflow(...)` requires `WorkflowContext`.
- `self.state` is read-only inside `ReaderContext`. Mutate it only inside
  `WriterContext` or `TransactionContext`. Workflows mutate state by
  calling `Service.ref().write(context, callback)` — not `self.state` —
  because workflows can re-execute on replay.
- `.rbtrc` is **line-based**, not YAML. Each line is `<subcommand> <flag>`.
  Use `--application-name=<app>` (canonical since Reboot 1.0.4; `--name`
  still works as a deprecated alias but warns).
- The actor's ID is `self.ref().state_id` inside writer/reader/
  transaction methods, and `context.state_id` inside workflows.
  `self.state_id` does not exist and raises `AttributeError`.
- **Every `Field(tag=N)` needs an explicit zero-value default**
  (`default=""`, `default=0`, `default=0.0`, `default=False`,
  `default_factory=list`, etc.). Two layered rules:
  (1) `model_construct()` drops fields lacking declared defaults, so
  reads `AttributeError`; (2) only the type's zero value is accepted —
  non-zero defaults raise `UserPydanticError` at import time. Set
  domain defaults (`turn="r"`, `delay=1.0`, etc.) inside the
  constructor method, not on the Field. Applies to state,
  request/response, and error Models.
- Cross-actor and external-service calls belong in `TransactionContext`
  (one-shot) or `WorkflowContext` (durable, long-running).
- Pass arguments to actor methods as **kwargs**, not as Request wrappers:
  `await ref.deposit(context, amount=10)`, not
  `await ref.deposit(context, DepositRequest(amount=10))`.
- **`Queue`, `Topic`, `OrderedMap`, `Presence`, `Item` are
  stdlib actor names — use them, don't redefine them.** If a
  design or task names any of these (e.g. "publish to a
  `Topic`", "track members in an `OrderedMap`", "subscribe a
  `Queue`", "presence shows who's online"), the answer is to
  _import_ the stdlib actor — not to declare a pydantic `Model`
  with the same name. Defining your own `Topic` / `Queue` /
  etc. forfeits durability, ordering, blocking semantics, and
  concurrency guarantees the stdlib already provides. See the
  trigger table under "How to Use → Using stdlib state types"
  below.

## How to Use

Most footguns in this skill are **distributed across reference files**
— skipping the right reference means hitting a runtime error that the
docs would have prevented. Before writing code, load the references
the task actually requires from the lists below. "Common gotchas"
should be loaded for almost every task.

### Building a workflow

- `references/servicer-workflow.md` — **the** single, comprehensive
  workflow reference; read it top to bottom before writing the body.
  Covers the `@classmethod` / `WorkflowContext` declaration shape and
  scheduling; the call-classification model that routes each call
  to the right primitive (Reboot scope `.per_workflow(alias)` /
  `.per_iteration(alias)` / `.always()` vs. external `at_least_once` /
  `at_most_once`); `context.loop(...)` iteration; inline state
  mutation via `Service.ref().<scope>.write(context, fn)`;
  `until` / `until_changes` reactive waiting; and the declared-vs-
  undeclared exception rule for how a workflow exits

### Calling an LLM / building an AI agent

Backend LLM calls — chat completions, AI agents, tool-using
assistants — go through the durable `reboot.agents.pydantic_ai.Agent`,
**never** a raw `anthropic` / `openai` SDK or a bare
`pydantic_ai.Agent`. A raw call re-hits (and re-bills) the provider
on every workflow replay. Read both before writing agent code:

- `references/agent-pydantic-ai.md` — **always read** for any
  backend LLM work: constructing the `Agent`, the required
  `name=`, running it inside a `WorkflowContext`, `variant=` for
  repeated runs, and the streaming / replay caveats
- `references/agent-tools.md` — `@agent.tool` /
  `@agent.tool_plain` so the agent can read and mutate Reboot
  state

The `Agent` runs only inside a `WorkflowContext`, so also read the
"Building a workflow" references above.

### Defining an API

- `references/api-pydantic.md` — **always read**: the zero-default
  rule bites at import time
- `references/api-methods.md` — `Reader` / `Writer` / `Transaction` /
  `Workflow` factories and the `factory=True` constructor option
- `references/api-errors.md` — typed error declaration
- `references/state-collections.md` — **always read when modeling
  any collection**: decide whether each contained item should be
  its own state `Type`, and pick between in-state `list[Sub]`,
  in-state `list[str]` of foreign IDs, or an `OrderedMap` of
  foreign IDs. The most common modeling mistake — packing an
  entity collection like `list[Person]` into one parent's state —
  fails silently in demos and forces a full rewrite later.
- `references/state-nested-models.md` — same rule from the nested-
  `Model` angle: state Models never appear as fields of other
  state Models

### Implementing a Servicer

- `references/servicer-{reader,writer,transaction,workflow,constructor,authorizer}.md`
  — one per context type and the constructor / authorizer concerns.
  `servicer-workflow.md` is the large one — see "Building a workflow"
  above for when to reach for it
- `references/rpc-refs.md` — **always read**: `self.ref().state_id` vs.
  `self.state_id` (which doesn't exist) is a recurring trip
- `references/rpc-calls.md` — **always read**: the kwargs-not-Request
  trap (`await ref.deposit(context, DepositRequest(amount=10))`) is a
  recurring miss; passes type-check and fails at runtime
- `references/rpc-constructor-calls.md` — **always read** when the
  agent invokes a constructor: use `<X>.create(context, id, ...)` or
  `<X>.<CtorMethod>(context, id, ...)`, NEVER `<X>.ref(id).<ctor>(...)`
  (the trap that skips creation semantics). The factory-declaration
  side is `servicer-constructor.md`; the call-site side is here

### Using stdlib state types

If your design calls for any of the concepts in the left column,
the stdlib already provides the canonical actor. Read the
reference **before** writing your own actor type — defining your
own `Queue` / `OrderedMap` / etc. is almost always wrong
and forfeits durability, ordering, and concurrency guarantees:

| You need...                                       | Use          | Reference               |
| ------------------------------------------------- | ------------ | ----------------------- |
| Durable FIFO — work queue, job queue, intake      | `Queue`      | `stdlib-queue.md`       |
| Sorted key-value with pagination / ordering       | `OrderedMap` | `stdlib-ordered-map.md` |
| Presence — who's online / connected               | `Presence`   | `stdlib-presence.md`    |
| Pubsub / broadcast / fan-out to subscribers       | `PubSub`     | `stdlib-pubsub.md`      |
| Item builder for `Queue` / `PubSub` payloads      | `Item`       | `stdlib-item.md`        |
| Encrypt at rest / crypto-shred (right-to-erasure) | `Ciphertext` | `stdlib-ciphertext.md`  |

Each stdlib reference also lists its library registration —
forgetting `<thing>_library()` and the stdlib actor's
`<thing>.servicers()` in your `Application(...)` fails at boot
with "unknown actor type."

### Encryption & key derivation

- `references/stdlib-ciphertext.md` — **encrypting sensitive data at
  rest** or **crypto-shredding** (GDPR right-to-erasure): the
  `Ciphertext` library handles envelope encryption, per-scope erasure,
  and automatic root-key rotation for you. Reach here before
  hand-rolling any encryption.
- `references/crypto-root-keys.md` — only when building your **own**
  key-deriving library/feature: HKDF-deriving purpose-specific keys
  from Reboot's managed root keys, and the rotation control loop +
  `use_root_key_version` / `disuse_root_key_version` markers. Most apps
  want `Ciphertext` instead.

### Authorization

- `references/auth-allow-deny.md` — minimal/correct shape
- `references/auth-allow-if.md` and `references/auth-built-in-predicates.md`
  — composition patterns
- `references/auth-custom-predicates.md` — for app-specific rules

### Testing

- `references/testing-project-setup.md` — `backend/tests/` layout,
  `.pytest.ini`, dev-deps, `uv run pytest`
- `references/testing-harness.md` — `Reboot()` harness, multi-servicer
  `Application(...)`, permissive authorizers, bearer tokens,
  `_auto_construct`
- `references/testing-external-context.md` — `create_external_context`,
  asserting on `<Method>Aborted`, waiting on tasks/workflows, mocking
  external services / LLMs, one-test-per-user-story

### Always relevant

- `references/patterns-common-gotchas.md` — the consolidated trip-list
  including the pydantic zero-default rule, `self.state_id`
  non-existence, and `--name` vs. `--application-name`. Read it once
  per task.

## Available Reference Files

Reference files live in `references/` and are named
`{prefix}-{topic}.md` (e.g., `servicer-transaction.md`). Load only
the files relevant to the current task; the "How to Use" section
above lists the right ones grouped by task type. The full catalog:

**Lifecycle** (`lifecycle-`):

- `references/lifecycle-project-setup.md`
- `references/lifecycle-rbtrc.md`
- `references/lifecycle-application-entry.md`
- `references/lifecycle-initialize-hook.md`
- `references/lifecycle-secrets.md`
- `references/lifecycle-dockerfile.md`
- `references/lifecycle-reboot-cloud.md`

**API** (`api-`):

- `references/api-pydantic.md`
- `references/api-methods.md`
- `references/api-errors.md`

**Servicer** (`servicer-`):

- `references/servicer-reader.md`
- `references/servicer-writer.md`
- `references/servicer-transaction.md`
- `references/servicer-workflow.md` — the single, comprehensive
  workflow reference (declaration, call-classification, scopes,
  `context.loop`, external `at_least_once` / `at_most_once`,
  `until` / `until_changes`, and workflow exit semantics)
- `references/servicer-constructor.md`
- `references/servicer-authorizer.md`

**Agent** (`agent-`):

- `references/agent-pydantic-ai.md`
- `references/agent-tools.md`

**Stdlib** (`stdlib-`):

- `references/stdlib-ordered-map.md`
- `references/stdlib-queue.md`
- `references/stdlib-pubsub.md`
- `references/stdlib-presence.md`
- `references/stdlib-item.md`
- `references/stdlib-ciphertext.md`

**Crypto** (`crypto-`):

- `references/crypto-root-keys.md`

**State** (`state-`):

- `references/state-scalar-fields.md`
- `references/state-collections.md`
- `references/state-nested-models.md`

**Auth** (`auth-`):

- `references/auth-allow-deny.md`
- `references/auth-allow-if.md`
- `references/auth-built-in-predicates.md`
- `references/auth-custom-predicates.md`

**RPC** (`rpc-`):

- `references/rpc-refs.md`
- `references/rpc-calls.md`
- `references/rpc-constructor-calls.md`
- `references/rpc-forall.md`

**Scheduling** (`scheduling-`):

- `references/scheduling-basic.md`
- `references/scheduling-recurring.md`

**Testing** (`testing-`):

- `references/testing-project-setup.md`
- `references/testing-harness.md`
- `references/testing-external-context.md`

**Patterns** (`patterns-`):

- `references/patterns-error-handling.md`
- `references/patterns-idempotency.md`
- `references/patterns-common-gotchas.md`

## External References

- https://docs.reboot.dev/
- Public examples:
  - https://github.com/reboot-dev/reboot-bank-pydantic (pydantic API definition)
