---
title: Error Handling Patterns
impact: MEDIUM
impactDescription: Inconsistent error handling makes failures opaque to callers
tags: patterns, errors, MethodAborted, raise, catch
---

## Error Handling Patterns

> **Critical:** raise `<Service>.<Method>Aborted(<ErrorMessage>(...))`
> from inside the Servicer (the exception class is named after the
> **method**, not the error). Catch the same `<Method>Aborted` at the
> call site and inspect `.error`. Don't smuggle errors as `None`
> returns or `ValueError`s — the framework's typed-error contract is
> what callers depend on.

Reboot has one canonical failure mode for typed business errors: declare
the error message in the proto, list it in `errors: [...]` on the method,
and `raise <Service>.<Method>Aborted(<ErrorMessage>(...))` from inside the
Servicer. Callers catch the same `<Method>Aborted` class and inspect
`.error`.

**Incorrect (smuggling errors as `None` returns):**

```python
async def withdraw(self, context, request):
    if self.state.balance < request.amount:
        return None  # ambiguous, untyped
    self.state.balance -= request.amount
    return WithdrawResponse()
```

**Correct (typed error):**

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

```python
async def withdraw(
    self, context: WriterContext, request: WithdrawRequest,
) -> WithdrawResponse:
    self.state.balance -= request.amount
    if self.state.balance < 0:
        raise Account.WithdrawAborted(
            OverdraftError(amount=-self.state.balance)
        )
    return WithdrawResponse()
```

## Catching at the Caller

```python
try:
    await account.withdraw(context, amount=request.amount)
except Account.WithdrawAborted as e:
    if isinstance(e.error, OverdraftError):
        # e.error.amount tells the caller how much over the limit.
        ...
```

## Errors Roll Back Mutations

A `<Method>Aborted` raised inside a writer or transaction rolls back any
state it had already mutated. Don't write compensating-undo logic; the
runtime handles it.

## Avoid `except Exception:` Around Servicer Calls

Catching the broad `Exception` class swallows infrastructure failures and
makes diagnosis harder. Catch the typed `<Method>Aborted` you declared,
and let unexpected errors propagate.

## Don't Catch Errors Just to Log Them

If the caller needs to act on a typed error, catch and act. If it just
needs to log, let the error propagate; Reboot's logging will already show
the typed payload at the call site.
