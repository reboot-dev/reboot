---
title: Pick a Method Factory — `Reader`, `Writer`, `Transaction`, or `Workflow`
impact: CRITICAL
impactDescription: The factory drives the context type, isolation, and access semantics
tags: method, reader, writer, transaction, workflow, factory, constructor
---

## Pick a Method Factory — `Reader`, `Writer`, `Transaction`, or `Workflow`

> **Critical:** the factory you choose for a method fixes the
> Servicer method's context type: `Reader(...)` → `ReaderContext`;
> `Writer(...)` → `WriterContext`; `Transaction(...)` →
> `TransactionContext`; `Workflow(...)` → `WorkflowContext` (and the
> implementation must be a `@classmethod`, with no `self.state`).
> Wrong context type = runtime error.

Every method in a `Methods(...)` block uses one of four factories from
`reboot.api`. The factory chooses the context type passed to the
Servicer method and the isolation level applied:

- **`Reader(...)`** — read-only access to `self.state`. Multiple readers
  may run concurrently. Servicer signature: `context: ReaderContext`.
- **`Writer(...)`** — mutates `self.state` for one actor. Serialized with
  other writes/transactions on that actor. Signature: `context: WriterContext`.
- **`Transaction(...)`** — atomic across multiple actors and external
  effects. Signature: `context: TransactionContext`.
- **`Workflow(...)`** — durable, long-running, restartable. Implemented as
  a `@classmethod` (no `self.state`). Signature: `context: WorkflowContext`.
  See `servicer-workflow.md` — the single, comprehensive workflow
  reference — to pick the right primitive for each call (Reboot
  scopes vs. `at_least_once` vs. `at_most_once`), plus
  `context.loop`, state mutation via
  `ref().<scope>.write(context, fn)`, and the rest.

**Incorrect (missing factory):**

```python
# DON'T — every entry must be a Reader/Writer/Transaction/Workflow.
AccountMethods = Methods(
    balance=BalanceResponse,   # WRONG — not a factory call
)
```

**Correct (matches the [`reboot-bank-pydantic`](https://github.com/reboot-dev/reboot-bank-pydantic) example):**

```python
from reboot.api import (
    API, Field, Methods, Model, Reader, Transaction, Type, Writer,
)

AccountMethods = Methods(
    balance=Reader(
        request=None, response=BalanceResponse, mcp=None,
    ),
    deposit=Writer(
        request=DepositRequest, response=None, mcp=None,
    ),
)

BankMethods = Methods(
    transfer=Transaction(
        request=TransferRequest, response=TransferResponse, mcp=None,
    ),
)
```

## `factory=True` Marks the Creation Method

A `Writer` or `Transaction` with `factory=True` is the explicit
creation path for the actor. The Servicer can branch on
`context.constructor` to set initial state:

```python
open=Writer(
    request=OpenRequest,
    response=None,
    factory=True,
    mcp=None,
),
```

`Reader` and `Workflow` reject `factory=True` at codegen time — see
`api-pydantic.md` ("`factory=True` Only Works on `Writer` and
`Transaction`"). To kick off a workflow on actor creation, make the
factory a `Writer(factory=True)` / `Transaction(factory=True)` and
schedule the workflow from its body.

A `Type` without an explicit factory method is created implicitly on
first write (see `lifecycle-initialize-hook.md`).

## Pick the Right Factory

- Reading `self.state` only? → `Reader`
- Mutating `self.state` for **one** actor, no calls to other actors? → `Writer`
- Mutating across multiple actors in a single one-shot transaction? → `Transaction`
- Long-running, durable, restartable work (control loops, agents,
  multi-step orchestration), or external calls? → `Workflow`

Wrong-factory symptoms include "context type mismatch" runtime errors and
deadlocks when a `Writer` tries to call into another actor.

## `errors=[...]` Declares Typed Errors

Error `Model`s declared elsewhere in the API file can be attached to a
method, making them part of the typed contract:

```python
class OverdraftError(Model):
    amount: float = Field(tag=1, default=0.0)

withdraw=Writer(
    request=WithdrawRequest,
    response=None,
    errors=[OverdraftError],
    mcp=None,
),
```

See `api-errors.md` for raising and catching them.

## Every Factory Takes `mcp=`

All four factories require an explicit `mcp=` keyword. Use
`mcp=None` when the method should not be exposed as an MCP tool;
use `mcp=Tool(...)` in MCP-Apps projects. See `api-pydantic.md` for
the full rule.

## See Also

After choosing factories, load the references that make those choices
work end-to-end:

- **Pydantic field rules**: `api-pydantic.md`. The zero-default rule
  bites at import time.
- **Implementation per factory** — read the matching servicer file:
  - `Reader(...)` → `servicer-reader.md`
  - `Writer(...)` → `servicer-writer.md`
  - `Transaction(...)` → `servicer-transaction.md`
  - `Workflow(...)` → `servicer-workflow.md` (the single,
    comprehensive workflow reference — durable primitives and all)
  - `factory=True` → `servicer-constructor.md`
- **Calling these methods**: `rpc-calls.md` (kwargs convention) and
  `rpc-refs.md` (`self.ref().state_id`, never `self.state_id`).
