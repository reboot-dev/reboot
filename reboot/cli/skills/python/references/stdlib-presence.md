---
title: Track Online Subscribers with `Presence`
impact: MEDIUM
impactDescription: Connection-aware UIs need a durable presence model; rolling your own duplicates this
tags: stdlib, Presence, Subscriber, MousePosition, online, connected
---

## Track Online Subscribers with `Presence`

> **Critical:** `presence.servicers()` returns three Servicers
> (`PresenceServicer, SubscriberServicer, MousePositionServicer`).
> Connection lifecycle uses a long-lived `Subscriber.connect` reader
> RPC plus a `wait_for_disconnect` workflow that fires when the RPC
> is cancelled — don't roll your own ping/pong.

The `reboot.std.presence` package provides three cooperating servicers
for tracking which subscribers (e.g. browser tabs) are currently
connected to your application:

- **`Subscriber`** — represents one user/tab. Tracks connection toggle
  count.
- **`Presence`** — registry of currently-present subscribers for some
  scope (e.g. a chat room).
- **`MousePosition`** — optional per-subscriber mouse position, useful
  for collaborative cursors.

### Methods

`Subscriber` (`reboot.std.presence.subscriber.v1.subscriber`):

| Method                | Type     | Notes                                               |
| --------------------- | -------- | --------------------------------------------------- |
| `create`              | writer   | construct                                           |
| `connect`             | reader   | long-lived RPC; resolves when client disconnects    |
| `toggle`              | writer   | bump on connect; schedules `wait_for_disconnect`    |
| `status`              | reader   | currently-connected?                                |
| `wait_for_disconnect` | workflow | observes `connect` cancellation, decrements toggles |

`Presence` (`reboot.std.presence.v1.presence`):

| Method      | Type     | Notes                                               |
| ----------- | -------- | --------------------------------------------------- |
| `subscribe` | writer   | mark a subscriber as present in this presence scope |
| `list`      | reader   | current `subscriber_ids`                            |
| `watch`     | workflow | auto-removes a subscriber when it disconnects       |

`MousePosition`
(`reboot.std.presence.mouse_tracker.v1.mouse_position`):

| Method     | Type                               |
| ---------- | ---------------------------------- |
| `update`   | writer (`left: int32, top: int32`) |
| `position` | reader                             |

### Register the Servicers

`presence.servicers()` returns
`[PresenceServicer, SubscriberServicer, MousePositionServicer]`:

```python
from reboot.std.presence.v1 import presence


async def main():
    await Application(
        servicers=[MyServicer] + presence.servicers(),
    ).run()
```

### Connection Lifecycle

The intended dance, per the type's docs:

1. Client `Subscriber.create(context, subscriber_id)` — once.
2. Client opens a long-lived `Subscriber.ref(id).connect(context)`
   reader RPC; this stays open as long as the client is connected.
3. Client `Subscriber.ref(id).toggle(context)` to mark itself as live;
   this schedules the `wait_for_disconnect` workflow that watches the
   `connect` call.
4. App-level scope: `Presence.ref(scope_id).subscribe(context, subscriber_id=...)` — also schedules `Presence.watch(...)` which
   auto-cleans on disconnect.

When the client closes the tab, the `connect` RPC is cancelled. The
`wait_for_disconnect` workflow notices and decrements `toggles`;
`Presence.watch` notices and removes the subscriber from the present
list.

### React Hooks Live in `reboot.std.react.presence`

For browser-side integration, `reboot.std.react.presence` provides React
hooks that wrap this protocol. Server-side Python code should use the
servicer-level API above; client-side TS uses the React hook.

### Building on Top

Treat the presence servicers as a foundation: your app's "channel" or
"room" actor calls `Presence.ref(channel_id).subscribe(context, subscriber_id=...)` and `Presence.ref(channel_id).list(context)` to
render the participant list.
