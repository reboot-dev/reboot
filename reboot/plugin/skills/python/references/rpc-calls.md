---
title: Call Actor Methods with Kwargs and a Context
impact: HIGH
impactDescription: Calling with Request wrappers fails at type-check or runtime
tags: rpc, call, kwargs, context, await
---

## Call Actor Methods with Kwargs and a Context

> **Critical:** pass arguments as **kwargs**, not as a Request wrapper.
> `await ref.deposit(context, amount=10)` — not
> `await ref.deposit(context, DepositRequest(amount=10))`. Constructor
> calls return a `(ref, response)` tuple — reuse the returned ref
> instead of re-constructing one.

Actor methods are called as `await ref.method(context, **kwargs)`. The
context is always positional; the request fields are passed as **keyword
arguments** matching the request `Model`. Do not construct and pass
a `Request` wrapper.

**Incorrect (passing a Request wrapper):**

```python
# DON'T — pass kwargs, not the Request type.
await account.deposit(context, DepositRequest(amount=100))
```

**Correct (matches the [`reboot-bank`](https://github.com/reboot-dev/reboot-bank) example):**

```python
await account.deposit(context, amount=100)
```

## The Context Type Must Match the Method

`reader` methods accept any of `ReaderContext`, `WriterContext`,
`TransactionContext`. `writer` methods require a `WriterContext` (own
actor) or `TransactionContext`. `transaction` methods require a
`TransactionContext`.

When in doubt, call from a `transaction` context — it can call any method
on any actor.

## Returns the Response Message

`await ref.method(...)` returns the response `Model`. Read its
fields directly:

```python
response = await chat_room.messages(context)
print(response.messages)
```

Constructor calls return a `(ref, response)` tuple — the ref to the
newly-constructed actor and the response from the method:

```python
account, _ = await Account.open(context, request.account_id)
await account.deposit(context, amount=request.initial_deposit)
```

## Concurrent Calls with `asyncio.gather`

Within a transaction, parallelize independent calls with
`asyncio.gather`:

```python
import asyncio

await asyncio.gather(
    from_account.withdraw(context, amount=request.amount),
    to_account.deposit(context, amount=request.amount),
)
```
