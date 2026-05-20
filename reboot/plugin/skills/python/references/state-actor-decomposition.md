---
title: Split a State Type That Holds Multiple Concerns
impact: HIGH
impactDescription: One actor holding many unrelated concerns serializes all writers across them and turns the front door into a God actor.
tags: state, decomposition, responsibility, actors, front-door, serialization, contention
---

## Split a State Type That Holds Multiple Concerns

> **Critical:** one state `Type` should hold **one concern**. When a
> single actor has accreted multiple unrelated responsibilities —
> auth/session fields alongside persona config alongside background-
> engine config alongside a UI cache — split each concern into its
> own state `Type` and have the front-door actor reference them by
> ID. Beyond hygiene, this is a **runtime** rule: writers on the same
> actor serialize (see `servicer-writer.md`), so unrelated concerns
> stacked on one actor create false contention that a concern-based
> split removes entirely.

`state-collections.md` covers decomposing **collections of entities**
into their own `Type`s. This file covers the orthogonal decomposition:
**a single actor whose state has accreted multiple unrelated
concerns** — split it by concern, regardless of whether any field is
a collection.

### Signals That You Should Split

If a single state `Type` shows any of the following, it's holding
more than one concern and should be split:

- **Fields fall into clusters that don't move together.** The auth
  cluster (phone, session token, login phase) churns at login; the
  persona cluster (display name, persona notes) churns when the user
  edits their profile; the engine cluster (monitoring active, poll
  interval, watched IDs) churns when configuration changes. A single
  reader rarely needs all three together.
- **A background workflow's state writes contend with on-demand
  user actions.** The monitor workflow writing "last scanned at"
  serializes against the user editing their persona. Different
  concerns, same actor, false contention.
- **You catch yourself prefixing fields to disambiguate concerns**
  (`monitoring_active`, `monitoring_poll_interval`,
  `monitoring_chat_ids`). The prefix is the concern asking to be its
  own `Type`.
- **The method list on the Servicer crosses ~15 and groups by
  prefix** (`start_login`, `complete_login`, `set_persona`,
  `start_monitoring`, `stop_monitoring`, `scan_once`, …). Each
  prefix group is a separate concern.
- **A "transient" cache field** — a picker snapshot, a draft
  scratchpad, a UI hint — sits next to durable business state on the
  same actor. Caches have a different lifecycle and a different read
  pattern; promote them to their own `Type` (or a stdlib `Item`).

### Why It Matters in Reboot Specifically

Two reasons, one per layer:

1. **Writers on the same actor serialize.** This is the explicit
   contract in `servicer-writer.md`: "writers on the same actor are
   serialized; writers across actors run independently." A login
   step, a persona edit, a monitoring-config change, and a
   background workflow's state writes all queueing on one `User`
   actor is false contention — splitting by concern across multiple
   `Type`s lets them run independently with no application-level
   change.
2. **The front-door framing degenerates without this rule.** Chat
   apps and similar Reboot apps use a `User` `Type` as the AI's
   entry point. "Front door" means **entry point + delegation**, not
   _container for all application state_ — see the chat-app skill's
   "User and Application Types" section. Without responsibility
   decomposition, every new feature lands on `User` and the actor
   becomes a God actor.

### How to Split

Keep the front-door actor as the entry point and the **owner of IDs
of concern-specific actors**. Each concern becomes its own `Type`
with the fields and methods that belong to that concern:

```python
class TelegramSessionState(Model):
    phone: str = Field(tag=1, default="")
    login_phase: str = Field(tag=2, default="")
    session_string: str = Field(tag=3, default="")
    phone_code_hash: str = Field(tag=4, default="")


class MonitoringManagerState(Model):
    active: bool = Field(tag=1, default=False)
    poll_interval_seconds: int = Field(tag=2, default=0)
    # IDs of monitored chats; chats are their own `Type` when they have
    # lifecycle/methods.
    monitored_chat_ids_index_id: str = Field(tag=3, default="")


class UserState(Model):
    display_name: str = Field(tag=1, default="")
    # IDs of the concern-specific actors this user owns.
    telegram_session_id: str = Field(tag=2, default="")
    monitoring_manager_id: str = Field(tag=3, default="")
```

The `User` constructor allocates IDs once and calls each concern's
`create`:

```python
class UserServicer(User.Servicer):

    async def create(
        self, context: TransactionContext, request: User.CreateRequest,
    ) -> None:
        if context.constructor:
            self.state.display_name = request.display_name
            session, _ = await TelegramSession.create(context)
            self.state.telegram_session_id = session.state_id
            manager, _ = await MonitoringManager.create(context)
            self.state.monitoring_manager_id = manager.state_id
```

Per-concern methods then live on the concern's own `Type` — login
flows on `TelegramSession`, the `monitor` workflow on
`MonitoringManager` — and only the cross-concern orchestration stays
on `User`.

### What Stays on the Front Door

The front-door `Type` keeps:

- **Identity fields** that name the actor itself (e.g. the user's
  display name).
- **References (IDs)** to concern-specific actors it owns.
- **Front-door methods** — typically `Transaction`s that locate or
  create concern-specific actors and return their IDs, and any
  user-scoped UI (`dashboard`, `home`).

Everything else — auth/session, configuration, background-engine
state, transient caches, per-concern workflows — moves to its own
`Type`.

### See Also

- `state-collections.md` — the orthogonal decomposition (per-item:
  promote each item in a collection to its own `Type`).
- `state-nested-models.md` — the rule against nesting state `Model`s
  inside state `Model`s; the same "store the ID, not the object"
  principle applies here.
- `servicer-writer.md` — the serialization contract that makes this
  a runtime rule, not just hygiene.
- `chat-app/SKILL.md` — "User and Application Types": **"front door"
  means entry point + delegation, not container.**
