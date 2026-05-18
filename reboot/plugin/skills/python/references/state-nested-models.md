---
title: Compose State with Nested `Model`s
impact: MEDIUM
impactDescription: Flat-only state forces unwieldy parallel field naming as state grows
tags: state, nested, models, sub-objects, structure
---

## Compose State with Nested `Model`s

> **Critical:** only **non-state** `Model`s should be nested fields.
> Don't put a state `Model` (one bound as `state=` in a `Type(...)`)
> inside another state `Model` — store its **string ID** instead and
> reference via `<OtherType>.ref(id)`.

A state `Model`'s fields can themselves be `Model`s. Use nested
models to group related fields and keep the state shape readable.

**Incorrect (parallel flat fields):**

```python
class OrderState(Model):
    shipping_street: str = Field(tag=1, default="")
    shipping_city: str = Field(tag=2, default="")
    shipping_zip: str = Field(tag=3, default="")
    billing_street: str = Field(tag=4, default="")
    billing_city: str = Field(tag=5, default="")
    billing_zip: str = Field(tag=6, default="")
```

**Correct (nested model):**

```python
class Address(Model):
    street: str = Field(tag=1, default="")
    city: str = Field(tag=2, default="")
    zip: str = Field(tag=3, default="")


class OrderState(Model):
    # `Model`-typed fields owned 1:1 by the parent must be Optional with
    # `default=None` — see `api-pydantic.md` for the zero-default rule.
    shipping: Optional[Address] = Field(tag=1, default=None)
    billing: Optional[Address] = Field(tag=2, default=None)
```

## Mutating Nested Models

Inside a writer/transaction, assign sub-models directly or assign
field-by-field:

```python
async def update_shipping(
    self, context: WriterContext, request: Order.UpdateShippingRequest,
) -> None:
    self.state.shipping = Address(
        street=request.street,
        city=request.city,
        zip=request.zip,
    )
```

## Avoid Nesting State `Model`s Inside State `Model`s

Only **non-state** `Model`s should be used as nested fields. A state
`Model` (one bound as `state=` in a `Type(...)`) used as a nested
field would mean "state inside state", which Reboot does not model
that way. Instead, keep the nested actor as its own state machine
and store its **ID** (a string) in the parent.
