---
title: Pick the Right Shape for Each Collection
impact: HIGH
impactDescription: Putting an unbounded collection in-state, or flattening an entity into `list[Sub]` when it has its own identity, forces a full data-model rewrite once the app grows.
tags: state, collections, list, dict, OrderedMap, decomposition, sub-records, entity, ids
---

## Pick the Right Shape for Each Collection

> **Critical:** if a contained item has its own identity, lifecycle,
> or methods, it must be its **own state `Type`** — not a nested
> `Model` inside the parent. The parent then stores **IDs**, not the
> full objects. Choosing `list[X]` for an entity collection ("each
> user has many People") works in a 10-row demo but forces a full
> data-model rewrite the moment the collection grows or each entity
> grows its own methods / auth / lifecycle.

### Step 1: Decompose Before Choosing a Container

Before picking a container shape, consider whether the **item** wants to
be its own state `Type`. If **any** of these is true, it does:

- It has a lifecycle of its own (created, edited, deleted on its
  own schedule independent of the parent).
- It has methods you'd want to call on it directly
  (`Person.add_event(...)`, `Account.deposit(...)`).
- It needs its own authorizer (different auth from the parent).
- Multiple parents could reference it.
- It has nested collections of its own that will grow over time.
- It's a noun your domain talks about (`Person`, `Order`, `Post`,
  `Account`, `Message`, `Event`) rather than a field group
  (`Address`, `Preferences`, `LineItem`).

If yes → declare `Type(state=ItemState, methods=...)` for it and
have the parent reference items by their **string IDs**. Each
container mutation then touches only the parent's index, not the
full payload of every item; each item edit touches only that item.

If no — the item is a flat sub-record that lives and dies with the
parent (an address on an Order, tags on a Post, a preferences blob
on a Guest) — keep it inline. See `state-nested-models.md`.

> **Warning signs in prompts.** Nouns combined with verbs like "add /
> remove / list / find / show one" is almost always its own state
> `Type`. "Each user has N of them" = **N actors**, not N rows on one
> actor.

> **Externally-synced collections are unbounded — and the verb
> test above misses them.** A collection mirrored from an outside
> source — a GitHub repo's issues and PRs, a mailbox's messages,
> an RSS feed's entries, rows pulled from a third-party API —
> never shows up with the user "add"-ing to it, so none of the
> verbs above fire. It is still an entity collection, and it is
> unbounded by definition: size it to the **source** (a repo has
> thousands of issues; an inbox has tens of thousands of
> messages), never to the demo you happen to test against. Each
> synced item is its own state `Type`; the parent indexes them
> with Shape C below.

### Step 2: Pick the Container Shape

Three shapes show up. They differ along two axes: **what's stored**
(sub-records vs. IDs of other state actors) and **how big the
collection can get**.

| Shape                                                       | When to pick                                                                                                                                                                                            | Pitfalls                                                                                                      |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| **A. `list[Sub]` / `dict[str, Sub]` of non-state `Model`s** | Sub-records with **no identity of their own** that live and die with the parent. Bounded — dozens at most. E.g. line items on an Order, tags on a Post, fields in a Config blob.                        | Every write rewrites the full list. No pagination. Cannot grow without bound.                                 |
| **B. `list[str]` / `dict[str, str]` of foreign state IDs**  | Items are their own state `Type` (Step 1 said yes) **and** the collection stays bounded — typically a few hundred, low thousands at most. You almost always read the whole index. No pagination needed. | Each parent write rewrites the full list of IDs. Doesn't scale past low thousands.                            |
| **C. `OrderedMap` of foreign state IDs**                    | Items are their own state `Type` **and** the collection grows without bound, **or** needs pagination, range queries, or ordered iteration.                                                              | Extra hop to a stdlib actor. Entry values use the `value` / `bytes` / `any` envelope. `range` needs `limit=`. |

> **"Bounded" is a domain fact, not a knob you control.** You do
> not get to make a collection bounded by adding a size cap. If
> you are reaching for `MAX_ITEMS = 40` or "keep only the latest
> 50" so a collection qualifies as bounded and lands in Shape A
> or B, stop — it is **unbounded**. The cap is a product decision
> (how much to _show_ the user), not a data-modeling one, and it
> belongs in a reader or view, never in the state shape. A
> genuine bound is one the domain itself fixes: a board has 9
> cells, an order has at most 100 line items. An invented cap is
> a Shape C collection in disguise — model it as Shape C and let
> the product decide later whether to display only the first 40.

Shapes B and C agree on the underlying decomposition — items are
their own state `Type` referenced by ID. They differ only in **how
the parent indexes** them. Migrating B → C later is a real piece of
work (every method that touches the index changes shape); choose C
up front if the collection might grow without bound. Migrating A →
B/C is much harder still — every method moves to a different actor.

#### Shape A — `list[Sub]` of Non-State `Model`s

For sub-records that conceptually belong **to** the parent and have
no identity of their own:

```python
from reboot.api import API, Field, Methods, Model, Reader, Type, Writer


class LineItem(Model):
    sku: str = Field(tag=1, default="")
    quantity: int = Field(tag=2, default=0)


class OrderState(Model):
    items: list[LineItem] = Field(tag=1, default_factory=list)
```

```python
async def add_item(
    self, context: WriterContext, request: Order.AddItemRequest,
) -> None:
    self.state.items.append(
        LineItem(sku=request.sku, quantity=request.quantity),
    )
```

OK because an Order's line items have no lifecycle of their own,
are bounded in practice, and are always read alongside the parent.

#### Shape B — `list[str]` / `dict[str, str]` of Foreign State IDs

When each item is its own state `Type` **and** the collection is
naturally bounded — e.g. board members of an Organization (single
digits to low hundreds), the rooms a House has (dozens), accounts
a Bank seeded at startup (fixed set):

```python
class OrgState(Model):
    member_user_ids: list[str] = Field(tag=1, default_factory=list)


class OrgServicer(Org.Servicer):

    async def add_member(
        self, context: TransactionContext, request: Org.AddMemberRequest,
    ) -> None:
        # `User` is its own state Type.
        self.state.member_user_ids.append(request.user_id)

    async def members(
        self, context: ReaderContext,
    ) -> Org.MembersResponse:
        return Org.MembersResponse(
            user_ids=self.state.member_user_ids,
        )
```

Each member is fully addressable as `User.ref(user_id)`. The Org's
state grows linearly with member count, which is fine up to low
thousands. Past that, the per-add write cost of rewriting the full
list becomes noticeable — switch to Shape C.

#### Shape C — `OrderedMap` of Foreign State IDs

When the collection can grow without bound, needs pagination, or
needs ordered iteration. The parent stores the **map's ID** (once,
at construction) and forwards reads/writes through the map:

```python
from reboot.std.collections.ordered_map.v1.ordered_map import (
    OrderedMap, ordered_map_library,
)
from uuid import uuid4
from uuid7 import create as uuid7


class UserState(Model):
    # ID of the OrderedMap actor that indexes this user's People.
    # Allocated once at User construction; never changes.
    people_index_id: str = Field(tag=1, default="")


class UserServicer(User.Servicer):

    async def create(self, context: WriterContext) -> None:
        if context.constructor:
            # Just allocate the ID — the OrderedMap is constructed
            # implicitly on the first `insert`.
            self.state.people_index_id = str(uuid4())

    async def add_person(
        self,
        context: TransactionContext,
        request: User.AddPersonRequest,
    ) -> User.AddPersonResponse:
        # `Person` is its own state Type with `factory=True` `create`.
        person, _ = await Person.create(
            context,
            name=request.name,
            birthday=request.birthday,
        )
        # UUIDv7 keys give time-ordered iteration for free; for
        # name-sorted iteration, use a name-prefixed key instead.
        await OrderedMap.ref(self.state.people_index_id).insert(
            context,
            key=str(uuid7()),
            bytes=person.state_id.encode(),
        )
        return User.AddPersonResponse(person_id=person.state_id)

    async def list_people(
        self,
        context: ReaderContext,
        request: User.ListPeopleRequest,
    ) -> User.ListPeopleResponse:
        page = await OrderedMap.ref(
            self.state.people_index_id,
        ).range(
            context, start_key=request.cursor, limit=32,
        )
        return User.ListPeopleResponse(
            person_ids=[e.bytes.decode() for e in page.entries],
            next_cursor=(
                page.entries[-1].key if page.entries else ""
            ),
        )
```

Register `ordered_map_library()` in `Application(libraries=[...])`
— see `stdlib-ordered-map.md` for the full method surface and the
value-field options (`value` / `bytes` / `any`).

### Decision Flow (Summary)

1. **Does the item have identity / lifecycle / its own methods?**
   - **No** → Shape A (`list[Sub]` of non-state `Model`s).
   - **Yes** → Make it its own `Type(state=...)`, then continue.
2. **How many?**
   - Bounded, ≲ low thousands, always read whole → **Shape B**
     (`list[str]` of IDs).
   - Unbounded, or needs pagination / range / ordered iteration →
     **Shape C** (`OrderedMap`).

### Anti-Patterns

- **`UserState.people: list[Person]`** when `Person` looks like a
  domain entity (has methods, lifecycle, nested events). Flattens
  N actors into one. Promote `Person` to its own `Type` and switch
  to Shape B or C.
- **`Type(state=X)` _and_ `list[X]` (or `dict[str, X]`) somewhere
  as a state field.** The "state inside state" regression —
  `state-nested-models.md` covers the same rule from the nested-
  Models angle.
- **`list[str]` for an unbounded collection** because "it's
  simpler". It is, until it isn't — and the migration rewrites
  every method that touches the parent. Use Shape C from the start
  if the collection can grow without bound.
- **Inventing a size cap to qualify for Shape A or B.** Adding a
  `MAX_ITEMS` constant to a synced or open-ended collection so it
  "fits" a `list`. The cap truncates the collection; it does not
  make the domain bounded. Model as Shape C and cap the _view_ in
  a reader, never the _state_.
- **An externally-synced collection held in-state.** A repo's
  issues, an inbox's mail, or a feed's entries as `list[Sub]` on
  one parent actor: every sync rewrites the whole list, editing
  one item rewrites all of them, and the parent actor grows
  toward Reboot's per-actor state-size limit. Promote each synced
  item to its own `Type` and index them with Shape C.
- **`OrderedMap` for a clearly bounded, sub-dozen collection.** The
  extra hop is wasted; `list[Sub]` (Shape A) or `list[str]`
  (Shape B) is fine.

### See Also

- `state-nested-models.md` — the same "state inside state" rule
  from the nested-`Model` angle.
- `stdlib-ordered-map.md` — concrete API for Shape C, library
  registration, pagination details.
- `chat-app/references/api-state-shapes.md` (chat-app skill) — the
  chat-app-specific corollary: `list[Item]` is for sub-records,
  not for application-type instances.
