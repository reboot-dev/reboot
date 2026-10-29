---
title: Shape Reads Across Many Actors
impact: MEDIUM
impactDescription: A page that subscribes to the full reader of every row, or a counter every write touches, is the usual slow load and the usual lock timeout
tags: reader, fan-out, forall, reactive, summary, derived, projection, cohesion, contention, per-caller view
---

## Shape Reads Across Many Actors

Read this when deciding whether items live inline on one actor or as an
actor each, whether a value is stored or derived, and which readers a
page over many actors calls. The mechanics of splitting are in
[`state-actor-decomposition.md`](state-actor-decomposition.md) and of
the containers in [`state-collections.md`](state-collections.md).

### Keep What Changes Together on One Actor

The signals for splitting (identity, lifecycle, methods of its own) say
when to split. The counter-test says when not to: **must one user action
change several items all or nothing?** Holding four seats, or moving
three cards, is that kind of action.

- Seats inline as a `list[Seat]` on one `Showing`: a four-seat hold is
  one writer, the per-customer cap is checked in the writer that grants
  it, and two customers racing for the same seat are ordered, the loser
  getting a typed error.
- An actor per seat: the same hold is a transaction over four actors.

Splitting doesn't help when every write still touches one shared actor.
Per-seat actors with occupancy counters on the `Showing` queued
concurrent customers on the `Showing`'s lock until they failed with
`Timed out waiting 30.0s to acquire exclusive lock; retry the
transaction.` (observed at 1.4.0; the wait is
`LOCK_ACQUIRE_DEADLINE_DEFAULT`, 30 s). Derive the bookkeeping in a
reader instead.

### Derive What Is a Projection of State You Already Have

Before adding a `Type` or a field, check whether it can be computed. A
cart computed in a reader as "seats on this showing held by me" can't
disagree with the holds, and needs no cleanup when a hold expires. A
wrong `Type` is expensive to take back: persisted schemas only evolve
additively ([`api-schema-evolution.md`](api-schema-evolution.md)).

**Reactivity follows mutations, not computed values.** A reader that
decides at read time that a hold has lapsed changes no state, so no
other subscriber re-renders. Keep the check in the reader for
correctness, and add a scheduled writer that commits the transition so
everyone sees it ([`scheduling-basic.md`](scheduling-basic.md)).

### Declare a Summary Reader Beside the Detail Reader

Which reader a page calls decides its payload. A list page over many
actors wants a small summary; the detail page wants everything. Declare
both with the API, before the frontend:

```python
class ShowingSummary(Model):
    available: int = Field(tag=1, default=0, description="Seats free now.")
    held: int = Field(tag=2, default=0, description="Seats held, unsold.")
    sold: int = Field(tag=3, default=0, description="Seats sold.")
    mine: int = Field(tag=4, default=0, description="Seats the caller holds.")


ShowingMethods = Methods(
    seat_map=Reader(
        request=None, response=SeatMapResponse,
        description="Every seat with its status, for the seat-map page.",
        mcp=None,
    ),
    summary=Reader(
        request=None, response=ShowingSummary,
        description="Seat counts only, for list and lobby pages.",
        mcp=None,
    ),
)
```

Forty-eight lobby cards each subscribed to `seat_map` ship every seat of
every showing, again on every hold; `summary` carries the same
reactivity at about 2% of the payload (observed at 1.4.1).

### Aggregate on the Server, One Level Deep

A subscribed reader is **transitively reactive**: when it calls readers
on other actors, including through `forall`, it re-runs whenever any of
those actors changes. Give the parent a reader that fans out, and have
the page subscribe to that one reader:

```python
async def marquee(
    self,
    context: ReaderContext,
) -> Theater.MarqueeResponse:
    # One `Showing.SummaryResponse` per id, in the order of the ids.
    cards = await Showing.forall(self.state.showing_ids).summary(context)
    return Theater.MarqueeResponse(cards=cards)
```

What the 1.6.0 source does (`reboot/aio/stubs.py`, `reboot/aio/contexts.py`,
class `React`):

- Only unary reader calls made inside a reactive reader become reactive.
- The calls are tracked again on every run: a call the reader stopped
  making is cancelled.
- A call that fails is retried with backoff (at most 5 s apart), not
  pushed as an error.

Keep the fan-out one level deep. For a second level, copy the facts the
page needs onto the parent from the methods that change them. For a very
wide fan-out (about 150 children at 1.4.0, which didn't complete inside
the request window), do the same: each child's change notes itself on
the parent, and the reader reads only the parent. An `OrderedMap`
range inside each fanned-out actor multiplies the cost: a reader over 11
actors that each ranged a map took about 3 s (observed at 1.6.0). Keep
what a listing shows inline on the actor being listed.

### Return a Per-Caller View, Not Stored Records

When items carry per-owner fields (who holds a seat, private notes) and
callers don't own every item, return a view with fields computed from
`context.auth`, so the browser never receives other users' ids:

```python
async def seat_map(
    self,
    context: ReaderContext,
) -> Showing.SeatMapResponse:
    me = context.auth.user_id if context.auth is not None else None
    return Showing.SeatMapResponse(
        seats=[
            SeatView(
                label=seat.label,
                status=seat.status,
                mine=me is not None and seat.held_by == me,
                hold_expires_at=(
                    seat.hold_expires_at if seat.held_by == me else 0
                ),
            ) for seat in self.state.seats
        ],
    )
```

### A Period-Keyed Aggregate Must Answer for Any Period

An aggregate keyed by date (today's sales) is constructed by its first
write, so until then its reader aborts with `StateNotConstructed` and a
dashboard shows an empty day as an error. Give it a long-lived owner
that answers for every period: a ledger actor whose reader returns zeros
for a period with no entry ([`stdlib-ordered-map.md`](stdlib-ordered-map.md)
for keyed storage). Or catch the abort and return the zero value.

### Anti-Patterns

- Returning `self.state.<collection>` as is from a shared reader when
  the items carry other users' ids: it leaks them.
- Making an item its own `Type` because it is a noun with a status, when
  one action changes several of them together.
- Counters or indexes on a shared actor that every hold updates: every
  write queues on its lock. Derive them in a reader.
- A user-visible transition computed only at read time: other viewers
  never see it. Also commit it with a scheduled writer.
- A list page subscribed to every row's detail reader: declare a summary
  reader.
- One subscription per row when the rows share a parent: subscribe to a
  fan-out reader on the parent.

### See Also

- [`state-actor-decomposition.md`](state-actor-decomposition.md): when
  to split a type
- [`state-collections.md`](state-collections.md): inline lists and
  `OrderedMap`
- [`rpc-forall.md`](rpc-forall.md): `forall` and its return order
- [`react-generated-client.md`](react-generated-client.md): reader hooks
  are live subscriptions
