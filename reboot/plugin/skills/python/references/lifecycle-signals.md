---
title: Cleaning Up on a Signal
impact: LOW
impactDescription: Usually nothing to do; Reboot stops the application on SIGTERM/SIGINT itself. A handler of your own, installed the wrong way, is refused.
tags: signals, SIGTERM, SIGINT, cleanup, install_cleanup, shutdown
---

## Cleaning Up on a Signal

**Usually you need nothing.** `rbt dev run` stops an application with
`SIGTERM`, Reboot Cloud and Kubernetes do the same, and a developer's
Ctrl-C sends `SIGINT`. Reboot handles those: it stops the servers, the
local Envoy, and everything else it started, and then the process dies
by the signal, the way any process does. Nothing in a servicer, a
workflow, or `main.py` has to notice.

**If you do need to do something when a signal arrives**, install a
cleanup handler with `reboot.aio.signals.install_cleanup()`. Do not
install a signal handler of your own, with `signal.signal()` or an
event loop's `add_signal_handler()`: Reboot handles the same signals,
and once it does the call is refused with an error that points here.
A cleanup handler is how yours composes with Reboot's handling, and
with everybody else's cleanup.

```python
import reboot.aio.signals
from reboot.aio.applications import Application

def flush_metrics() -> None:
    ...

# From the main thread, whenever you like: before or after creating
# the `Application`, as long as it is before `run()`.
reboot.aio.signals.install_cleanup(
    reboot.aio.signals.TERMINATING_SIGNALS_FOR_SERVERS,
    flush_metrics,
)

await Application(servicers=[...]).run()
```

What a cleanup handler is, and is not:

- It runs **inside the signal handler**, synchronously, on the main
  thread, in the middle of whatever that thread was doing, before
  Reboot starts stopping anything. Keep it short and never block.
- To do anything with the event loop from it, use
  `loop.call_soon_threadsafe(...)`, which also wakes the loop.
- The signal is raised again, with its default handler, once Reboot
  has stopped, and the process dies by it. A `try`/`finally` or
  `async with` around `await application.run()` is **not** a way to
  clean up on a signal: the process is gone before it runs.
- Only the first signal is handled; a second Ctrl-C from an impatient
  developer is ignored rather than interrupting the cleanup.

`uninstall_cleanup()` removes a handler installed this way.
