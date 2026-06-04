---
title: API State Shapes — List and Nested Sub-Objects
impact: HIGH
impactDescription: Two recurring chat-app state patterns. `list[Item]` of non-state Models is for **bounded sub-records** that have no identity of their own; entity collections (people, posts, messages, anything addressable on its own) must be promoted to their own state `Type`. Single nested `Model` sub-objects must be `Optional` with `default=None` and hydrated in the factory `create` Writer — non-Optional `Model`-typed fields reject both `default=` and `default_factory=` (Gotcha #13).
tags: state, list, nested, sub-object, optional, model, default, default_factory, gotcha-13, decomposition
---

## API State Shapes — List and Nested Sub-Objects

The pydantic foundation rules (zero-value defaults; non-Optional
`Model`-typed fields reject defaults) are in
`python/references/api-pydantic.md`. The full three-way decision
between in-state `list[Sub]`, in-state `list[str]` of foreign IDs,
and a stdlib `OrderedMap` of foreign IDs — including when to
**decompose** an entity collection into its own state `Type` —
lives in `python/references/state-collections.md`. **Read it
before settling on a list-based state shape.** This file covers
the chat-app-specific corollaries.

## List State Patterns (for Bounded Sub-Records Only)

> **Don't reach for `list[Item]` to model an entity collection.** If
> "Item" has its own identity, lifecycle, or methods (e.g. `Person`,
> `Post`, `Message`, `Task`, `Account`, `Event`), it must be its own
> `Type(state=ItemState, methods=...)`. The parent then stores IDs,
> not full objects. Putting an entity collection in-state as
> `list[Item]` works in a 10-row demo and falls over the moment the
> collection grows or items need their own auth/methods — see
> `python/references/state-collections.md`.

> **"Bounded" means the domain bounds it — not that you added a
> cap.** `list[Sub]` is correct only when the collection cannot
> grow past a few dozen _by its nature_ (an order has a handful
> of line items; a config blob has a fixed field set). If you are
> adding a `MAX_ITEMS` constant to keep a collection small enough
> for `list[Sub]`, the collection is unbounded and this is the
> wrong shape — see the boundedness guard in
> `python/references/state-collections.md`. A collection **synced
> or scraped from an external system** (issues in a repo, mail in
> a mailbox, entries in a feed) is never Shape A: it is an
> unbounded entity collection and belongs in an `OrderedMap` of
> IDs.

For application types whose state actually is a **bounded sub-record
list** — line items on an Order, tags on a Post, fields in a Config
blob, attachments on a single Message — and where the items have no
identity of their own:

- Define helper Model types as standalone classes (e.g.
  `class LineItem(Model)`) — NOT nested on the application type.
- Use `list[LineItem]` in the state with `default_factory=list`.
- Add CRUD Writers: `add`, `remove`, `toggle`, `reorder` as needed.
- Each Writer validates indices before mutating.
- The `reorder` pattern uses `pop` + `insert`.
- In the servicer, import helpers standalone:
  `from <pkg>.v1.<name> import LineItem`.

If the items are themselves entities (Step 1 of `state-collections.md`
came out "yes"), promote them to their own state `Type` and pick
between in-state `list[str]` of IDs (bounded) or an `OrderedMap`
of IDs (unbounded or paginated) — full code patterns in
`python/references/state-collections.md`.

> **The `OrderedMap`'s ID is a persisted field on the parent**
> (e.g. `items_index_id: str`), allocated once in the parent's
> constructor and referenced via
> `OrderedMap.ref(self.state.items_index_id)`. **Do not** synthesize
> it inline from the parent's `state_id`
> (`OrderedMap.ref(f"{self.ref().state_id}-items")`). Same rule for
> any cross-`Type` reference, stdlib or user-defined — full
> rationale and code in "Relationships Between State Types" in
> `python/references/state-collections.md`.

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
actors. That's the same rule covered in
`python/references/state-nested-models.md` — only **non-state**
`Model`s may be nested fields. To compose one state actor into
another, store its **string ID** in the parent and reach the
nested actor via `<Type>.ref(<id>)`. A Model referenced as
`state=X` in `Type(...)` should never also appear as
`<field>: X = Field(...)` on another state Model.

The corollary is that **collections of state actors** also live in
the parent as collections-of-IDs, not collections-of-objects: in
the parent's state you store `list[str]`, `dict[str, str]`, or the
ID of a stdlib `OrderedMap` — never `list[<StateModel>]`. See
`python/references/state-collections.md` for the three shapes and
when to pick each.
