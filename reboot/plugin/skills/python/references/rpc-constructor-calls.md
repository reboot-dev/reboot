---
title: Use `Service.factory.create` and `Service.factory.<ctor>` for Constructor Calls
impact: MEDIUM
impactDescription: Calling a constructor through `.ref(...).method(...)` skips creation semantics
tags: rpc, constructor, create, factory
---

## Use `Service.factory.create` and `Service.factory.<ctor>` for Constructor Calls

> **Critical:** never invoke a constructor through `Service.ref(id).method(...)`
> — that skips creation semantics. Use
> `await Service.factory.create(context, id)` for default constructors and
> `await Service.factory.<CtorMethod>(context, id, ...)` for named ones.
> Both return a `(ref, response)` tuple.

A method declared with `factory=True` is the actor's creation path.
Invoke it through the `factory` namespace on the state type:

- `await Service.factory.create(context, id)` — for the implicit/default
  constructor (e.g., `Bank.factory.create(context, SINGLETON_BANK_ID)`).
- `await Service.factory.<CtorMethod>(context, id, **kwargs)` — for a named
  constructor method (e.g., `Account.factory.open(context, account_id)`).

Both return a `(ref, response)` tuple. Routing constructors through the
`factory` namespace keeps the top level of the state type free for
framework methods like `ref()`.

**Incorrect (using `.ref(...).method(...)` for a constructor):**

```python
# Treats the call as a regular method, bypassing constructor semantics.
await Account.ref(account_id).open(context)
```

**Correct (matches the [`reboot-bank-pydantic`](https://github.com/reboot-dev/reboot-bank-pydantic) example):**

`api/bank/v1/account.py`:

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
account, _ = await Account.factory.open(context, account_id)
await account.deposit(context, amount=request.initial_deposit)
```

## `Service.factory.create(context, id)` Is the Idempotent Default

When the `Type` has no explicit factory (no `factory=True` method),
use `Service.factory.create` from the `initialize` hook:

```python
async def initialize(context: InitializeContext):
    await Bank.factory.create(context, SINGLETON_BANK_ID)
```

This is safe to call on every application start; existing actors aren't
re-initialized.

## Reuse the Returned Ref

The first element of the returned tuple is the ref. Prefer using it
directly rather than re-constructing one with `Service.ref(...)`:

```python
account, _ = await Account.factory.open(context, account_id)
# Use the returned ref:
await account.deposit(context, amount=100)

# Slightly slower (extra construction):
await Account.ref(account_id).deposit(context, amount=100)
```
