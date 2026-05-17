---
title: Implement Transaction Methods
impact: HIGH
impactDescription: Cross-actor and external-effect work requires a transaction
tags: servicer, transaction, TransactionContext, atomic, multi-actor
---

## Implement Transaction Methods

> **Critical:** transactions are **atomic across actors and external
> side effects** — any `<Method>Aborted` rolls back **all** mutations
> in the transaction. Reboot may retry transactions internally, so the
> body must be safe to re-run with the same input.

A method marked `transaction: {}` in the proto receives a
`TransactionContext` and is the only place where you can atomically mutate
multiple actors, call external services, or both. The runtime serializes
transactions that touch overlapping actors.

**Incorrect (multi-actor work in a writer):**

```python
async def transfer(
    self, context: WriterContext, request: TransferRequest,
) -> TransferResponse:
    # WRONG — writers can only mutate one actor.
    await Account.ref(request.from_id).withdraw(context, ...)
    await Account.ref(request.to_id).deposit(context, ...)
    return TransferResponse()
```

**Correct (matches the [`reboot-bank`](https://github.com/reboot-dev/reboot-bank) example's `BankServicer`):**

`bank.proto`:

```proto
rpc Transfer(TransferRequest) returns (TransferResponse) {
  option (rbt.v1alpha1.method) = { transaction: {} };
}
```

`main.py`:

```python
import asyncio
from bank.v1.bank_rbt import (
    Account, Bank, TransferRequest, TransferResponse,
)
from reboot.aio.contexts import TransactionContext


class BankServicer(Bank.Servicer):

    async def transfer(
        self,
        context: TransactionContext,
        request: TransferRequest,
    ) -> TransferResponse:
        from_account = Account.ref(request.from_account_id)
        to_account = Account.ref(request.to_account_id)

        await asyncio.gather(
            from_account.withdraw(context, amount=request.amount),
            to_account.deposit(context, amount=request.amount),
        )

        return TransferResponse()
```

## Transactions Are Atomic Across Actors

If any call inside a transaction fails (raises a `<Method>Aborted`), the
runtime rolls back **all** the mutations made within that transaction —
across every actor it touched.

## External Side Effects Belong in Transactions

Transactions are also the right place for calls that leave the system —
sending email, hitting third-party APIs, etc. The pattern from
[`reboot-bank`](https://github.com/reboot-dev/reboot-bank):

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

## Use `asyncio.gather` for Concurrent Sub-Calls

Independent calls inside a transaction can run concurrently with
`asyncio.gather`. Reboot serializes them as needed at the storage layer; the
gather only parallelizes the network/RPC roundtrips.

## Don't Hold State Outside the Context

Don't stash data on `self` inside a transaction — every call may run on a
fresh Servicer instance, and instance attributes don't persist. State lives
in `self.state` (per-actor) or external systems.

## Pydantic Transactions May Have No Response

In pydantic API definitions, `Transaction(... response=None ...)`
is a valid shape for transactions that have no payload to return.
The method's return type is then `-> None` and the body has no
`return` statement — common for orchestration calls where the
caller only needs success/failure (raised errors). See
`api-pydantic.md` for the cross-method rule.

## See Also

- `rpc-refs.md` — `self.ref().state_id` (not `self.state_id`).
- `rpc-calls.md` — kwargs convention; `await ref.method(context, k=v)`.
- `rpc-forall.md` — `Service.forall(ids).method(context, ...)` for
  fan-out across many actors.
- `servicer-constructor.md` — when a transaction also constructs an
  actor (e.g. `Account.open(context, id)`).
- `api-errors.md` — typed errors that roll back the entire transaction.
- `workflow-method.md` — when one-shot atomicity isn't enough and you
  need durable, long-running orchestration.
