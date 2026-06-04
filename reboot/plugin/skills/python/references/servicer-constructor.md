---
title: Handle Constructor Methods
impact: HIGH
impactDescription: Initial state set in the wrong place leaks across actors or never runs
tags: servicer, constructor, context.constructor, create, initialization
---

## Handle Constructor Methods

> **Critical:** invoke a constructor as `await Service.create(context, id)`
> (or `await Service.<CtorMethod>(context, id, **kwargs)`), **never**
> as `Service.ref(id).method(...)` — the latter skips creation
> semantics. Inside the implementation, branch on
> `context.constructor` for set-once initial state.

A method declared with `factory=True` on its `Writer(...)` or
`Transaction(...)` factory is the explicit creation path for an actor.
The Servicer implementation is just an ordinary writer/transaction
method — the _constructor-ness_ shows up in two places:

1. **Caller side**: use `await Service.create(context, id)` (not
   `Service.ref(id).method(...)`) to invoke it.
2. **Servicer side**: branch on `context.constructor` to set initial state
   only on the creation pass.

**Incorrect (initial state set in `__init__`):**

```python
class AccountServicer(Account.Servicer):

    def __init__(self):
        # WRONG — runs on every Servicer instantiation, not on create.
        self.state.balance = 0
```

**Correct (set initial state in the constructor method):**

`api/bank/v1/pydantic/account.py`:

```python
open=Writer(
    request=OpenRequest,
    response=None,
    factory=True,
    mcp=None,
),
```

`account_servicer.py`:

```python
from reboot.aio.contexts import WriterContext


class AccountServicer(Account.Servicer):

    async def open(
        self,
        context: WriterContext,
        request: Account.OpenRequest,
    ) -> None:
        if context.constructor:
            self.state.name = request.name
            self.state.balance = 0
```

## `context.constructor` Distinguishes Create from Re-Open

A constructor method may also be invokable on an existing actor; branch
on `context.constructor` so set-once fields aren't overwritten on a
second call.

## Calling from Initialize

```python
async def initialize(context: InitializeContext):
    await Bank.create(context, SINGLETON_BANK_ID)
```

`Service.create(context, id)` is **idempotent** when called from the
`initialize` hook, so it's safe to invoke on every application start.

## Calling from a Transaction

A transaction can create and operate on a new actor in one atomic step:

```python
async def sign_up(
    self, context: TransactionContext, request: Bank.SignUpRequest,
) -> None:
    account, _ = await Account.open(context, request.account_id)
    await account.deposit(context, amount=request.initial_deposit)
```

`Account.open(context, id)` here is the constructor (the `open` method
declared `factory=True`) and returns the actor reference plus the
response (or `None` when `response=None`).
