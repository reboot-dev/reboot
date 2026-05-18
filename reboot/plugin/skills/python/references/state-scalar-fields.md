---
title: Use Zero-Value Defaults for Scalar State Fields
impact: MEDIUM
impactDescription: Non-zero defaults are rejected at import time
tags: state, scalar, fields, defaults
---

## Use Zero-Value Defaults for Scalar State Fields

> **Critical:** every scalar `Field(tag=N)` needs an explicit
> zero-value default (`""`, `0`, `0.0`, `False`). Non-zero defaults
> raise `UserPydanticError` at import time. Set non-zero domain
> defaults inside the constructor method (`if context.constructor: ...`).

State is a pydantic `Model`. Each field needs an explicit
zero-value default — see `api-pydantic.md` for the full rule.

**Incorrect (trying to declare a non-zero default on the Field):**

```python
class AccountState(Model):
    balance: int = Field(tag=1, default=100)  # rejected at import
```

```text
reboot.api.UserPydanticError: Field `balance` in model `AccountState`
uses `default` with an unsupported value. Supported default value
for `int` is `0`.
```

**Correct (zero default on the Field, real value applied in the constructor):**

```python
class AccountState(Model):
    name: str = Field(tag=1, default="")
    balance: int = Field(tag=2, default=0)
```

```python
async def open(
    self, context: WriterContext, request: Account.OpenRequest,
) -> None:
    if context.constructor:
        self.state.name = request.name
        self.state.balance = 100  # initial balance applied here
```

## Common Scalar Defaults

| Type           | Default                |
| -------------- | ---------------------- |
| `int`          | `0`                    |
| `float`        | `0.0`                  |
| `bool`         | `False`                |
| `str`          | `""`                   |
| `bytes`        | `b""`                  |
| `list[T]`      | `default_factory=list` |
| `dict[str, T]` | `default_factory=dict` |

## Read Without Mutation Inside Readers

Reading scalar fields inside a reader is always allowed:

```python
async def balance(
    self, context: ReaderContext,
) -> Account.BalanceResponse:
    return Account.BalanceResponse(amount=self.state.balance)
```

Trying to assign (`self.state.balance = ...`) inside a reader raises at
runtime. Mutate inside writers/transactions only.
