---
title: Use `Service.create` and `Service.<ctor>` for Constructor Calls
impact: MEDIUM
impactDescription: Calling a constructor through `.ref(...).method(...)` skips creation semantics
tags: rpc, constructor, create, factory
---

## Use `Service.create` and `Service.<ctor>` for Constructor Calls

> **Critical:** never invoke a constructor through `Service.ref(id).method(...)`
> — that skips creation semantics. Use `await Service.create(context, id)`
> for default constructors and `await Service.<CtorMethod>(context, id, ...)`
> for named ones. Both return a `(ref, response)` tuple.

A method declared with `factory=True` is the actor's creation path.
Invoke it via the generated factory call:

- `await Service.create(context, id)` — for the implicit/default
  constructor (e.g., `Bank.create(context, SINGLETON_BANK_ID)`).
- `await Service.<CtorMethod>(context, id, **kwargs)` — for a named
  constructor method (e.g., `Account.open(context, account_id)`).

Both return a `(ref, response)` tuple.

**Incorrect (using `.ref(...).method(...)` for a constructor):**

```python
# Treats the call as a regular method, bypassing constructor semantics.
await Account.ref(account_id).open(context)
```

**Correct (matches the [`reboot-bank-pydantic`](https://github.com/reboot-dev/reboot-bank-pydantic) example):**

`api/bank/v1/pydantic/account.py`:

```python
open=Writer(
    request=OpenRequest,
    response=None,
    factory=True,
    mcp=None,
),
```

`main.py`:

```python
account, _ = await Account.open(context, account_id)
await account.deposit(context, amount=request.initial_deposit)
```

## `Service.create(context, id)` Is the Idempotent Default

When the `Type` has no explicit factory (no `factory=True` method),
use `Service.create` from the `initialize` hook:

```python
async def initialize(context: InitializeContext):
    await Bank.create(context, SINGLETON_BANK_ID)
```

This is safe to call on every application start; existing actors aren't
re-initialized.

## Reuse the Returned Ref

The first element of the returned tuple is the ref. Prefer using it
directly rather than re-constructing one with `Service.ref(...)`:

```python
account, _ = await Account.open(context, account_id)
# Use the returned ref:
await account.deposit(context, amount=100)

# Slightly slower (extra construction):
await Account.ref(account_id).deposit(context, amount=100)
```
