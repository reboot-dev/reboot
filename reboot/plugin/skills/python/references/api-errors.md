---
title: Define and Raise Typed Errors
impact: HIGH
impactDescription: Untyped failures become opaque RPC errors at the call site
tags: errors, MethodAborted, errors-list, typed-failures
---

## Define and Raise Typed Errors

> **Critical:** the exception class is named after the **method**, not
> the error: `Account.WithdrawAborted(OverdraftError(...))`. Raising a
> `<Method>Aborted` inside a writer/transaction rolls back its
> mutations automatically — no compensating undo needed.

Typed errors in Reboot are ordinary pydantic `Model`s, listed in a
method's `errors=[...]` argument. The generated code produces a
`<Method>Aborted` exception class on the Servicer — raise that from
inside the method to fail with a typed payload.

**Incorrect (untyped exception):**

```python
async def withdraw(self, context: WriterContext, request: WithdrawRequest):
    if self.state.balance < request.amount:
        raise ValueError("not enough funds")  # opaque at the call site
    ...
```

**Correct (matches the [`reboot-bank-pydantic`](https://github.com/reboot-dev/reboot-bank-pydantic) example):**

`api/bank/v1/pydantic/account.py`:

```python
from reboot.api import API, Field, Methods, Model, Type, Writer


class OverdraftError(Model):
    amount: float = Field(tag=1, default=0.0)


class WithdrawRequest(Model):
    amount: float = Field(tag=1, default=0.0)


AccountMethods = Methods(
    withdraw=Writer(
        request=WithdrawRequest,
        response=None,
        errors=[OverdraftError],
        mcp=None,
    ),
    # ... other methods ...
)
```

`backend/src/account_servicer.py`:

```python
from bank.v1.pydantic.account import OverdraftError
from bank.v1.pydantic.account_rbt import Account
from reboot.aio.contexts import WriterContext


class AccountServicer(Account.Servicer):

    async def withdraw(
        self,
        context: WriterContext,
        request: Account.WithdrawRequest,
    ) -> None:
        self.state.balance -= request.amount
        if self.state.balance < 0:
            raise Account.WithdrawAborted(
                OverdraftError(amount=-self.state.balance)
            )
```

## `<Method>Aborted` Is Generated Per Method

For each `Writer(...)` (or other factory) that declares
`errors=[OverdraftError]`, the codegen emits
`Account.WithdrawAborted(OverdraftError(...))`. The exception class is
named after the method, not the error.

## Catching Typed Errors at the Call Site

```python
try:
    await Account.ref(account_id).withdraw(context, amount=100)
except Account.WithdrawAborted as e:
    if isinstance(e.error, OverdraftError):
        # e.error.amount tells us how much over the limit we'd be.
        ...
```

## Errors Roll Back

A `<Method>Aborted` raised inside a `Writer` or `Transaction` rolls
back any state changes made by that method. Code that has already
mutated `self.state` doesn't need to undo it manually.
