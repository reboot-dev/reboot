---
title: Split an Object Type That Holds Multiple Concerns
impact: HIGH
impactDescription: One instance holding many unrelated concerns serializes all writers across them and turns `User` into a God object.
tags: state, decomposition, responsibility, instances, user, serialization, contention
---

## Split an Object Type That Holds Multiple Concerns

> **Critical:** one object type should hold **one concern**. When a
> single instance has accreted multiple unrelated responsibilities —
> auth/session fields alongside persona config alongside background-
> engine config alongside a UI cache — split each concern into its
> own object type and have the `User` instance reference them by
> ID. Beyond hygiene, this is a **runtime** rule: writers on the same
> instance serialize (see `servicer-writer.md`), so unrelated concerns
> stacked on one instance create false contention that a concern-based
> split removes entirely.

`state-collections.md` covers decomposing **collections of entities**
into their own `Type`s. This file covers the orthogonal decomposition:
**a single instance whose state has accreted multiple unrelated
concerns** — split it by concern, regardless of whether any field is
a collection.

### Signals That You Should Split

If a single object type shows any of the following, it's holding
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
  concerns, same instance, false contention.
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
  same instance. Caches have a different lifecycle and a different read
  pattern; promote them to their own `Type` (or a standard library `Item`).

### Why It Matters in Reboot Specifically

Two reasons, one per layer:

1. **Writers on the same instance serialize.** This is the explicit
   contract in `servicer-writer.md`: "writers on the same instance are
   serialized; writers across instances run independently." A login
   step, a persona edit, a monitoring-config change, and a
   background workflow's state writes all queueing on one `User`
   instance is false contention — splitting by concern across multiple
   `Type`s lets them run independently with no application-level
   change.
2. **`User` turns into a container without this rule.** Chat
   apps and similar Reboot apps create and find everything through a
   `User` `Type`. `User` **locates and delegates**; it is not a
   _container for all application state_ — see "`User` and Application
   Types" in `mcp-app-concepts.md`. Without responsibility
   decomposition, every new feature lands on `User` and the instance
   becomes a God object.

### How to Split

Keep `User` as the way in and the **owner of IDs
of concern-specific instances**. Each concern becomes its own `Type`
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
    # IDs of the concern-specific instances this user owns.
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

### What Stays on `User`

`User` keeps:

- **Identity fields** that name the instance itself (e.g. the user's
  display name).
- **References (IDs)** to concern-specific instances it owns.
- **Methods that locate or create** — typically `Transaction`s that locate or
  create concern-specific instances and return their IDs, and any
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
- `mcp-app-concepts.md` — "`User` and Application Types": **`User`
  locates and delegates; it is not a container.**
