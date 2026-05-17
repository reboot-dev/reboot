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

Typed errors in Reboot are ordinary proto messages, listed in a method's
`errors: [...]` option. The generated code produces a `<Method>Aborted`
exception class on the Servicer — raise that from inside the method to
fail with a typed payload.

**Incorrect (untyped exception):**

```python
async def withdraw(self, context: WriterContext, request: WithdrawRequest):
    if self.state.balance < request.amount:
        raise ValueError("not enough funds")  # opaque at the call site
    ...
```

**Correct (matches the [`reboot-bank`](https://github.com/reboot-dev/reboot-bank) example):**

`bank.proto`:

```proto
rpc Withdraw(WithdrawRequest) returns (WithdrawResponse) {
  option (rbt.v1alpha1.method) = {
    writer: {},
    errors: [ "OverdraftError" ],
  };
}

message OverdraftError {
  uint64 amount = 1;
}
```

`account_servicer.py`:

```python
from bank.v1.bank_rbt import (
    Account, OverdraftError, WithdrawRequest, WithdrawResponse,
)
from reboot.aio.contexts import WriterContext


class AccountServicer(Account.Servicer):

    async def withdraw(
        self,
        context: WriterContext,
        request: WithdrawRequest,
    ) -> WithdrawResponse:
        self.state.balance -= request.amount
        if self.state.balance < 0:
            raise Account.WithdrawAborted(
                OverdraftError(amount=-self.state.balance)
            )
        return WithdrawResponse()
```

## `<Method>Aborted` Is Generated Per Method

For each `rpc Withdraw(...)` with `errors: ["OverdraftError"]`, the codegen
emits `Account.WithdrawAborted(OverdraftError(...))`. The exception class is
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

A `<Method>Aborted` raised inside a `writer` or `transaction` rolls back any
state changes made by that method. Code that has already mutated
`self.state` doesn't need to undo it manually.
