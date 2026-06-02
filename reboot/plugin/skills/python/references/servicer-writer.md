---
title: Implement Writer Methods
impact: HIGH
impactDescription: Writer methods are the only path to mutate single-actor state
tags: servicer, writer, WriterContext, state, mutation
---

## Implement Writer Methods

> **Critical:** writer scope is **mutating one actor**. Cross-actor
> mutations belong in a `transaction` method (a writer may still
> call readers on other actors — cross-actor reads are fine). **No
> external side effects in a writer — none, not even idempotent
> ones.** Two reasons stack: (a) a writer can be invoked inside a
> `Transaction`, and a transaction is all-or-nothing — if it aborts,
> every mutation rolls back but the external call already happened,
> breaking atomicity; (b) writer bodies also re-execute under
> retries and dev-mode effect validation, so any external call
> fires more than once. External calls — SMS, email, payment,
> LLM/model — belong in a `Workflow`; the writer only
> `schedule()`s the workflow, and the workflow picks the right
> primitive per `servicer-workflow.md`. A writer calling another
> actor's writer is a category error.

A method declared with `Writer(...)` in the API file receives a
`WriterContext` and is the only legal place to mutate `self.state`
for **one** actor. Writers on the same actor are serialized; writers
across actors run independently.

The runtime may re-execute a writer's body — both on transient
retries and, in development, as part of **effect validation**, which
re-runs the body and asserts the state mutations match. So a
writer body must be safe to run more than once: confine it to
`self.state` mutations and in-system calls (including readers on
other actors), and push any external work to a `Workflow` — the
workflow picks the right primitive per
`servicer-workflow.md`.

**Incorrect (calling another actor's writer from inside a writer):**

```python
async def deposit(
    self, context: WriterContext, request: Account.DepositRequest,
) -> None:
    self.state.balance += request.amount
    # WRONG — cross-actor mutation requires a transaction (cross-actor
    # reads are fine; this call mutates another actor).
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

## Writer Scope Is Mutating One Actor

A writer can read its own state freely, mutate its own state, and
schedule work on itself. It **can** call **readers** on other
actors — cross-actor reads are fine. It **cannot** mutate another
actor's state — for cross-actor mutation use a `Transaction` method
(see `servicer-transaction.md`).

A writer also **cannot** make external calls — network, filesystem,
third-party APIs — **even idempotent ones**. Writers can be invoked
inside a `Transaction`, so an external call here breaks
transactional atomicity (the transaction may still abort and roll
back state, but the external call already happened); writer bodies
also re-execute under retries and effect validation. External calls
belong in a `Workflow` (see `servicer-workflow.md` for the
right primitive); the writer only `schedule()`s the workflow.

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
- `servicer-workflow.md` — the home for **all** external side
  effects (even idempotent ones); writers/transactions only
  `schedule()` the workflow, which picks the right primitive there.
- `api-errors.md` — typed errors that roll back state automatically.
