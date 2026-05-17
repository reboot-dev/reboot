---
title: Use Proto3 Scalar Fields for Simple State
impact: MEDIUM
impactDescription: Wrong field types cause silent default-value bugs at runtime
tags: state, scalar, fields, defaults, proto3
---

## Use Proto3 Scalar Fields for Simple State

> **Critical:** field defaults are the type's **zero value** only —
> proto3 doesn't carry custom defaults, and pydantic codegen mirrors
> that constraint. Set non-zero domain defaults inside the constructor
> method (`if context.constructor: ...`).

Reboot state is a proto3 message. Scalar fields work the way proto3 scalars
always do: every field has a zero-value default, there's no concept of
"unset", and there's no way to declare a different default in the proto.

**Incorrect (trying to declare a non-zero default in the proto):**

```proto
message Account {
  option (rbt.v1alpha1.state) = {};
  int64 balance = 1 [default = 100];  // proto3 doesn't support this
}
```

**Correct (zero-value defaults, set non-zero values in the constructor):**

```proto
message Account {
  option (rbt.v1alpha1.state) = {};
  string name = 1;
  int64 balance = 2;
}
```

```python
async def open(
    self, context: WriterContext, request: OpenRequest,
) -> OpenResponse:
    if context.constructor:
        self.state.name = request.name
        self.state.balance = 100  # initial balance applied here
    return OpenResponse()
```

## Common Scalar Defaults

| Type                                 | Default                            |
| ------------------------------------ | ---------------------------------- |
| `int32`, `int64`, `uint32`, `uint64` | `0`                                |
| `float`, `double`                    | `0.0`                              |
| `bool`                               | `false`                            |
| `string`                             | `""`                               |
| `bytes`                              | `b""`                              |
| `repeated <T>`                       | `[]`                               |
| `enum`                               | first declared variant (value `0`) |

## Read Without Mutation Inside Readers

Reading scalar fields inside a reader is always allowed:

```python
async def balance(
    self, context: ReaderContext, request: BalanceRequest,
) -> BalanceResponse:
    return BalanceResponse(amount=self.state.balance)
```

Trying to assign (`self.state.balance = ...`) inside a reader raises at
runtime. Mutate inside writers/transactions only.
