---
title: Implement Transaction Methods
impact: HIGH
impactDescription: Cross-actor atomic work requires a transaction
tags: servicer, transaction, TransactionContext, atomic, multi-actor
---

## Implement Transaction Methods

> **Critical:** transactions are **all-or-nothing across actors** —
> any `<Method>Aborted` rolls back **all** mutations in the
> transaction. Reboot may also retry transactions internally, so the
> body must be safe to re-run with the same input — and must **never**
> call outside the system (see below).

A method declared with `Transaction(...)` in the API file receives a
`TransactionContext` and is the only place where you can atomically
mutate multiple actors. The runtime serializes transactions that touch
overlapping actors.

**Incorrect (multi-actor work in a writer):**

```python
async def transfer(
    self, context: WriterContext, request: Bank.TransferRequest,
) -> None:
    # WRONG — writers can only mutate one actor.
    await Account.ref(request.from_id).withdraw(context, ...)
    await Account.ref(request.to_id).deposit(context, ...)
```

**Correct (matches the [`reboot-bank-pydantic`](https://github.com/reboot-dev/reboot-bank-pydantic) example's `BankServicer`):**

`api/bank/v1/bank.py`:

```python
transfer=Transaction(
    request=TransferRequest,
    response=None,
    mcp=None,
),
```

`main.py`:

```python
import asyncio
from bank.v1.account_rbt import Account
from bank.v1.bank_rbt import Bank
from reboot.aio.contexts import TransactionContext


class BankServicer(Bank.Servicer):

    async def transfer(
        self,
        context: TransactionContext,
        request: Bank.TransferRequest,
    ) -> None:
        from_account = Account.ref(request.from_account_id)
        to_account = Account.ref(request.to_account_id)

        await asyncio.gather(
            from_account.withdraw(context, amount=request.amount),
            to_account.deposit(context, amount=request.amount),
        )
```

## Transactions Are Atomic Across Actors

If any call inside a transaction fails (raises a `<Method>Aborted`), the
runtime rolls back **all** the mutations made within that transaction —
across every actor it touched.

## External Calls Belong in a Workflow, Not a Transaction

A transaction is **all-or-nothing**: if it aborts, the semantics are
that **no effect has taken place** — every mutation it made is rolled
back. A call that leaves the system — sending email, hitting a
third-party API, an **LLM / model API call**, charging a payment, an
SMS login code — **cannot be rolled back**. A transaction making
such a call directly breaks that guarantee: the transaction can
still abort, but the external call already happened. Reboot may
also retry a transaction internally, and in development re-run its
body for **effect validation** (asserting the mutations are
deterministic) — both fire the external call more than once.

So a transaction must **never** make an external call itself. It may
freely call other **in-system actors**, and the correct pattern is for
one of those actors to **schedule a `Workflow`** that performs the
external call. The
[`reboot-bank-pydantic`](https://github.com/reboot-dev/reboot-bank-pydantic)
`sign_up` transaction sends a welcome email this way:

```python
async def sign_up(
    self, context: TransactionContext, request: SignUpRequest,
) -> SignUpResponse:
    if mailgun_api_key := await self._mailgun_api_key():
        await mailgun.Message.send(
            context, None, Options(bearer_token=mailgun_api_key),
            recipient=request.account_id,
            sender='team@reboot.dev',
            domain='reboot.dev',
            subject='Welcome',
            html=self._html_email,
            text=self._text_email,
        )

    account, _ = await Account.open(context, request.account_id)
    await account.deposit(context, amount=request.initial_deposit)
    return SignUpResponse()
```

`mailgun.Message.send` is a `Writer` on an in-system mailgun actor — it
does not hit the network itself; it **schedules a workflow** that makes
the actual HTTP send. So the transaction only ever issues in-system
RPCs, and the un-rollback-able external call lives safely in that
workflow.

When _you_ are the one making the external call — an LLM / model API
call, a payment charge, an SMS — put it in a `Workflow` method and
pick the right primitive (`at_least_once`, `at_most_once`, or
`Agent`) per `servicer-workflow.md`.

How to wire it up:

- Make the external call inside a `Workflow` method, with the
  primitive chosen above.
- A `Transaction` (or `Writer`) reaches that workflow only by
  **scheduling** it —
  `await self.ref().schedule().<workflow_method>(context)` — never by
  performing the external call itself.

Rule of thumb: **if a call leaves the system, it belongs in a
workflow, not a transaction.**

## Use `asyncio.gather` for Concurrent Sub-Calls

Independent calls inside a transaction can run concurrently with
`asyncio.gather`. Reboot serializes them as needed at the storage layer; the
gather only parallelizes the network/RPC roundtrips.

## Don't Hold State Outside the Context

Don't stash data on `self` inside a transaction — every call may run on a
fresh Servicer instance, and instance attributes don't persist. State lives
in `self.state` (per-actor) or external systems.

## Transactions May Have No Response

`Transaction(... response=None ...)` is a valid shape for transactions
that have no payload to return. The method's return type is then
`-> None` and the body has no `return` statement — common for
orchestration calls where the caller only needs success/failure
(raised errors). See `api-pydantic.md` for the cross-method rule.

## See Also

- `rpc-refs.md` — `self.ref().state_id` (not `self.state_id`).
- `rpc-calls.md` — kwargs convention; `await ref.method(context, k=v)`.
- `rpc-forall.md` — `Service.forall(ids).method(context, ...)` for
  fan-out across many actors.
- `servicer-constructor.md` — when a transaction also constructs an
  actor (e.g. `Account.open(context, id)`).
- `api-errors.md` — typed errors that roll back the entire transaction.
- `servicer-workflow.md` — when one-shot atomicity isn't enough and you
  need durable, long-running orchestration.
