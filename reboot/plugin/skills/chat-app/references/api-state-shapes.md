---
title: API State Shapes — List and Nested Sub-Objects
impact: HIGH
impactDescription: Two recurring chat-app state patterns. Lists are straightforward (`list[Item]` with `default_factory=list`); single nested `Model` sub-objects must be `Optional` with `default=None` and hydrated in the factory `create` Writer — non-Optional `Model`-typed fields reject both `default=` and `default_factory=` (Gotcha #13).
tags: state, list, nested, sub-object, optional, model, default, default_factory, gotcha-13
---

## API State Shapes — List and Nested Sub-Objects

The pydantic foundation rules (zero-value defaults; non-Optional
`Model`-typed fields reject defaults) are in `python`
references/`api-pydantic.md`. This file covers the two chat-app
state shapes that come up most often: list-based state and
single-nested-Model state.

## List State Patterns

For application types with list-based state (items, entries, messages,
etc.):

- Define helper Model types as standalone classes (e.g.
  `class Item(Model)`) — NOT nested on the application type.
- Use `list[Item]` in the state with `default_factory=list`.
- Add CRUD Writers: `add`, `remove`, `toggle`, `reorder` as needed.
- Each Writer validates indices before mutating.
- The `reorder` pattern uses `pop` + `insert`.
- In the servicer, import helpers standalone:
  `from <pkg>.v1.<name> import Item`.

## Nested Model State Patterns

For application types that own a single nested `Model` sub-object
(preferences blob, profile, config, etc.):

- Declare the field as `Optional[Sub] = Field(tag=N, default=None)`.
  Non-Optional nested `Model` types reject both `default=` and
  `default_factory=` (Gotcha #13 in the gotchas reference).
- Hydrate the sub-object in the parent's factory `create` Writer, so
  callers never observe the `None`:

```python
from reboot.api import (
    API, Field, Methods, Model, Transaction, Type, Writer,
)
from typing import Optional

class GuestPreferences(Model):
    meal_type: str = Field(tag=1, default="")
    calorie_level: str = Field(tag=2, default="")
    dietary_restrictions: str = Field(tag=3, default="")

class Guest(Model):
    name: str = Field(tag=1, default="")
    # Single nested Model: Optional + default=None, populated by the
    # factory `create` below.
    preferences: Optional[GuestPreferences] = Field(tag=2, default=None)

class CreateRequest(Model):
    name: str = Field(tag=1, default="")
    meal_type: str = Field(tag=2, default="")
    calorie_level: str = Field(tag=3, default="")
    dietary_restrictions: str = Field(tag=4, default="")


# Servicer side (in `backend/src/servicers/<name>.py`):
class GuestServicer(Guest.Servicer):
    async def create(
        self, context, *, name, meal_type, calorie_level, dietary_restrictions,
    ):
        self.state.name = name
        self.state.preferences = GuestPreferences(
            meal_type=meal_type,
            calorie_level=calorie_level,
            dietary_restrictions=dietary_restrictions,
        )
```

If the prompt suggests _plural_ sub-objects ("each guest's
preferences"), prefer `list[GuestPreferences]` with
`default_factory=list` — lists are exempt from this rule.

## The Two Failure Modes (Gotcha #13 — full text)

Both raise `UserPydanticError` at startup, not at field-construction
time, so they look like runtime errors but are static schema problems:

- `default_factory=` is only supported for `list` and `dict`.
  `Field(tag=N, default_factory=MyModel)` raises
  `Field <X> in model <Y> uses default_factory which is not supported for type <T>. Only list, dict types can have a default_factory currently.`
- A non-Optional `Model`-typed field also can't take `default=`,
  even with an instance: `Field <X> in model <Y> is a non-optional Model type and cannot have a default value. Use Optional for Model types with empty default.`

The fix is to declare the field optional and construct lazily —
`preferences: Optional[UserPreferences] = Field(tag=N, default=None)`
— then materialize it inside the factory `create` method when the
parent state is first written.

## Don't Nest State `Model`s Inside Other State `Model`s

State actors (whatever has `Type(state=<X>)` registered in your
`API(...)`) must NOT appear as nested fields on other state
actors. That's the same rule covered in `python`
references/`state-nested-models.md` — only **non-state**
`Model`s may be nested fields. To compose one state actor into
another, store its **string ID** in the parent and reach the
nested actor via `<Type>.ref(<id>)`. A Model referenced as
`state=X` in `Type(...)` should never also appear as
`<field>: X = Field(...)` on another state Model.
