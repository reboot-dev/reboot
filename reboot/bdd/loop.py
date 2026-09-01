"""The per-scenario event loop that `reboot.bdd`'s Reboot calls run
on.

pytest and pytest-bdd call step functions and fixtures synchronously,
while everything Reboot is `async`. Each scenario runs one event loop
on a background thread, created before its first step and closed
after its last; `run()` submits a coroutine to the current scenario's
loop and blocks until the coroutine completes. Everything in a
scenario that must share a loop (the `Reboot` harness, its contexts,
the calls the steps make) runs on that one loop.

One loop per scenario matches both `unittest.IsolatedAsyncioTestCase`
(one loop per test) and production (one application runs on one event
loop for its lifetime under `rbt dev run` and `rbt serve`), and it
keeps anything a scenario leaks from running on into later scenarios.
"""

import asyncio
import threading
from typing import Any, Coroutine, Optional, TypeVar

T = TypeVar('T')


class EventLoopThread:
    """An event loop running on its own daemon thread from
    construction until `stop()`.

    The loop's lifecycle belongs to `asyncio.run()`, so stopping gets
    the standard library's shutdown: any still pending tasks are
    cancelled and waited for (with unretrieved exceptions reported
    through the loop's exception handler), async generators and the
    default executor are shut down, and the loop is closed.
    """

    def __init__(self) -> None:
        self._started = threading.Event()
        self._thread = threading.Thread(
            target=lambda: asyncio.run(self._run_until_stopped()),
            name="reboot-bdd-event-loop",
            daemon=True,
        )
        self._thread.start()
        self._started.wait()

    async def _run_until_stopped(self) -> None:
        """Publishes the running event loop and blocks until `stop()`,
        keeping the loop serving `run()` submissions in between."""
        self._loop = asyncio.get_running_loop()
        self._stopped = asyncio.Event()
        self._started.set()
        await self._stopped.wait()

    def run(self, coroutine: Coroutine[Any, Any, T]) -> T:
        """Runs the coroutine on this event loop, blocking the calling
        thread until the coroutine completes, and returning its result
        or raising its exception."""
        return asyncio.run_coroutine_threadsafe(coroutine, self._loop).result()

    def stop(self) -> None:
        """Stops and closes the event loop, cancelling any still
        pending tasks the way `unittest.IsolatedAsyncioTestCase` ends
        a test, and joins the loop's thread."""
        self._loop.call_soon_threadsafe(self._stopped.set)
        self._thread.join()


# The current scenario's event loop, which `run()` submits to; one is
# current from `start_event_loop()` until `stop_event_loop()`.
_current_event_loop: Optional[EventLoopThread] = None


def start_event_loop() -> EventLoopThread:
    """Starts an event loop and makes it the one `run()` submits to.
    One at a time: the previously started one must have been
    stopped."""
    global _current_event_loop
    assert _current_event_loop is None
    _current_event_loop = EventLoopThread()
    return _current_event_loop


def stop_event_loop(event_loop: EventLoopThread) -> None:
    """Stops the given event loop, which must be the one `run()`
    submits to, leaving `run()` without an event loop."""
    global _current_event_loop
    assert _current_event_loop is event_loop
    _current_event_loop = None
    event_loop.stop()


def run(coroutine: Coroutine[Any, Any, T]) -> T:
    """Runs the coroutine on the current scenario's event loop,
    blocking the calling thread until the coroutine completes, and
    returning its result or raising its exception."""
    if _current_event_loop is None:
        raise ValueError(
            "`run()` submits to the current scenario's event loop, so "
            "it can only be called while a scenario is running"
        )
    return _current_event_loop.run(coroutine)
