---
title: Implement Writer Methods
impact: HIGH
impactDescription: Writer methods are the only path to mutate single-actor state
tags: servicer, writer, WriterContext, state, mutation
---

## Implement Writer Methods

> **Critical:** writer scope is **one actor**. Cross-actor mutations
> belong in a `transaction` method. **Non-idempotent** external side
> effects — SMS, email, payment, third-party write APIs, LLM/model
> calls — must go in a `Workflow` wrapped in `at_most_once`: a writer
> body may re-execute (retries and dev-mode effect validation), so a
> non-idempotent call inside a writer fires more than once. The
> on-demand entry point is a writer/transaction that only
> `schedule()`s the workflow. A writer calling another actor's writer
> is a category error.

A method declared with `Writer(...)` in the API file receives a
`WriterContext` and is the only legal place to mutate `self.state`
for **one** actor. Writers on the same actor are serialized; writers
across actors run independently.

The runtime may re-execute a writer's body — both on transient
retries and, in development, as part of **effect validation**, which
re-runs the body and asserts the state mutations match. So a
writer body must be safe to run more than once: confine it to
`self.state` mutations and in-system calls, and push any
non-idempotent external work to a `Workflow` wrapped in
`at_most_once` (see `workflow-at-most-once.md`).

**Incorrect (calling another actor's writer from inside a writer):**

```python
async def deposit(
    self, context: WriterContext, request: Account.DepositRequest,
) -> None:
    self.state.balance += request.amount
    # WRONG — cross-actor calls require a transaction.
    await Account.ref("audit-log").record(context, ...)
```

**Correct (matches the [`reboot-bank-pydantic`](https://github.com/reboot-dev/reboot-bank-pydantic) example's `AccountServicer`):**

```python
from bank.v1.pydantic.account_rbt import Account
from reboot.aio.contexts import WriterContext


class AccountServicer(Account.Servicer):

    async def deposit(
        self,
        context: WriterContext,
        request: Account.DepositRequest,
    ) -> None:
        self.state.balance += request.amount
```

## Mutate `self.state` Directly

`self.state` is the typed state `Model`; assignments and collection
mutations apply to the actor's persistent state when the writer
commits:

```python
async def send(
    self, context: WriterContext, request: ChatRoom.SendRequest,
) -> None:
    self.state.messages.append(request.message)
```

## Writer Scope Is One Actor

A writer can read its own state freely, mutate its own state, and
schedule work on itself. It **cannot** reach into another actor's
state — for cross-actor mutation use a `Transaction` method (see
`servicer-transaction.md`). For **non-idempotent** external calls
(SMS, email, payment, third-party write APIs, LLM/model calls),
schedule a `Workflow` that wraps the call in `at_most_once` (see
`workflow-at-most-once.md`); the writer must not make the call
itself, because writer bodies re-execute under retries and
effect validation, firing the call more than once.

A writer **can** call `ref.schedule(...).method(context)` on its own actor
to defer work (see `scheduling-basic.md`).

## Errors Roll Back the Mutation

If the writer raises a `<Method>Aborted` error after mutating `self.state`,
the mutations are rolled back. There's no need to undo manually.

```python
async def withdraw(
    self, context: WriterContext, request: Account.WithdrawRequest,
) -> None:
    self.state.balance -= request.amount
    if self.state.balance < 0:
        # The decrement above rolls back automatically.
        raise Account.WithdrawAborted(
            OverdraftError(amount=-self.state.balance)
        )
```

## Writers May Have No Response

`Writer(... response=None ...)` is a valid shape for writers that have
no payload to return to the caller. The method's return type is then
`-> None` and the body has no `return` statement (or `return` with no
value). See `api-pydantic.md` for the cross-method rule.

```python
async def increment(
    self, context: WriterContext, request: Counter.IncrementRequest,
) -> None:
    self.state.count += request.by
    # No return — the API declared `response=None`.
```

## See Also

- `rpc-refs.md` — `self.ref().state_id` (not `self.state_id`) for this
  actor's ID; `self.ref().schedule(...)` for self-scheduling.
- `rpc-calls.md` — kwargs convention for calling other actors.
- `scheduling-basic.md` / `scheduling-recurring.md` — the canonical
  pattern for deferred work driven from a writer.
- `servicer-transaction.md` — when a writer can't (cross-actor
  mutation).
- `workflow-at-most-once.md` — the home for **non-idempotent**
  external side effects; writers/transactions only `schedule()` it.
- `api-errors.md` — typed errors that roll back state automatically.
