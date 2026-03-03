import asyncio
import os
import threading
import time
from log.log import get_logger
from reboot.settings import (
    ENVVAR_REBOOT_ENABLE_EVENT_LOOP_BLOCKED_WATCHDOG,
    ENVVAR_REBOOT_ENABLE_EVENT_LOOP_LAG_MONITORING,
)
from typing import Optional

logger = get_logger(__name__)

LAG_STANDARD_HIGHWATER_SECONDS = 0.07
LAG_STANDARD_INTERVAL_SECONDS = 0.5

# A dampening factor.  When determining average calls per second
# or current lag, we weigh the current value against the previous
# value 2:1 to smooth spikes.
# See https://en.wikipedia.org/wiki/Exponential_smoothing
LAG_SMOOTHING_FACTOR = 1 / 3

# Threshold for detecting a completely blocked event loop
# (e.g., a synchronous call that prevents the loop from
# running).
BLOCKED_HIGHWATER_SECONDS = 2.0


def _blocked_event_loop_watchdog(
    loop: asyncio.AbstractEventLoop,
    server_id: Optional[str],
    stop: threading.Event,
) -> None:
    """Detect a blocked event loop from a separate thread.

    Schedules a no-op callback on the event loop and waits
    for it to execute. If it doesn't execute within the
    threshold, logs a warning immediately (while the loop
    is still blocked).
    """
    server_info = (f" (server: {server_id})" if server_id else "")

    while not stop.wait(timeout=BLOCKED_HIGHWATER_SECONDS):
        responded = threading.Event()
        schedule_time = time.perf_counter()
        try:
            # When the event loop is not blocked, this callback
            # should be executed within a few milliseconds. If
            # the loop is blocked by a synchronous call, the
            # callback won't be executed until the loop is
            # unblocked, which allows us to detect the blockage
            # in real time.
            loop.call_soon_threadsafe(responded.set)
        except RuntimeError:
            # Event loop is closed.
            return

        if not responded.wait(timeout=BLOCKED_HIGHWATER_SECONDS):
            logger.warning(
                f"Reboot event loop is blocked{server_info}. "
                "A synchronous/blocking call is "
                "preventing the event loop from "
                "running. Use `asyncio.to_thread()` "
                "or `loop.run_in_executor()` to run "
                "blocking calls in a separate thread."
            )
            # Wait for the event loop to unblock.
            responded.wait()
            duration_ms = int((time.perf_counter() - schedule_time) * 1000)
            logger.warning(
                "Reboot event loop unblocked after "
                f"~{duration_ms}ms{server_info}."
            )


async def _monitor_event_loop_lag(
    server_id: Optional[str],
) -> None:
    high_water = LAG_STANDARD_HIGHWATER_SECONDS
    interval = LAG_STANDARD_INTERVAL_SECONDS
    smoothing_factor = LAG_SMOOTHING_FACTOR
    current_lag = 0.0
    last_time = time.perf_counter()

    while True:
        await asyncio.sleep(interval)
        now = time.perf_counter()
        lag = now - last_time
        lag = max(0, lag - interval)
        # Dampen lag.
        current_lag = smoothing_factor * lag + (
            1 - smoothing_factor
        ) * current_lag
        last_time = now

        if current_lag > high_water:
            server_info = (f" (server: {server_id})" if server_id else "")
            logger.warning(
                f"Reboot event loop lag: {int(lag * 1000)}ms"
                f"{server_info}. "
                "This may indicate a blocking "
                "operation on the main thread "
                "(e.g., CPU-intensive task). If "
                "you are not running such tasks, "
                "please report this issue to the "
                "maintainers."
            )


async def monitor_event_loop(
    server_id: Optional[str] = None,
) -> None:
    loop = asyncio.get_running_loop()

    watchdog_enabled = os.environ.get(
        ENVVAR_REBOOT_ENABLE_EVENT_LOOP_BLOCKED_WATCHDOG,
        'false',
    ).lower() == 'true'

    lag_monitoring_enabled = os.environ.get(
        ENVVAR_REBOOT_ENABLE_EVENT_LOOP_LAG_MONITORING,
        'false',
    ).lower() == 'true'

    if not watchdog_enabled and not lag_monitoring_enabled:
        return

    stop = threading.Event()
    watchdog = None

    if watchdog_enabled:
        # Start a watchdog thread to detect blocked event
        # loops in real time (while they're still blocked).
        watchdog = threading.Thread(
            target=_blocked_event_loop_watchdog,
            args=(loop, server_id, stop),
            daemon=True,
        )
        watchdog.start()

    try:
        if not lag_monitoring_enabled:
            # Watchdog is enabled but lag monitoring is not.
            # Keep the task alive until cancelled so the
            # `finally` block can stop the watchdog.
            await asyncio.Future()

        await _monitor_event_loop_lag(server_id)
    finally:
        # This will be executed when the
        # `monitor_event_loop` task is cancelled and
        # allows us to clean up the watchdog thread.
        stop.set()
        if watchdog is not None:
            await asyncio.to_thread(watchdog.join)
