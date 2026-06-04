import asyncio
import gc
import os
import subprocess
import threading
import time
from log.log import get_logger
from reboot.settings import (
    ENVVAR_REBOOT_ASYNCIO_SLOW_CALLBACK_DURATION_SECONDS,
    ENVVAR_REBOOT_DISABLE_CYCLIC_GC,
    ENVVAR_REBOOT_ENABLE_EVENT_LOOP_BLOCKED_WATCHDOG,
    ENVVAR_REBOOT_ENABLE_EVENT_LOOP_LAG_MONITORING,
    ENVVAR_REBOOT_PY_SPY_DURATION_SECONDS,
    ENVVAR_REBOOT_PY_SPY_OUTPUT,
    ENVVAR_REBOOT_PY_SPY_RATE,
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


def _maybe_enable_slow_callback_warnings(
    loop: asyncio.AbstractEventLoop,
) -> None:
    """If `REBOOT_ASYNCIO_SLOW_CALLBACK_DURATION_SECONDS` is set,
    enable asyncio debug mode on the running loop and configure
    `slow_callback_duration` so asyncio logs a warning (with the
    offending callback's source location) whenever a single callback
    hogs the loop for longer than the given threshold.

    Useful for tracking down coroutines that block the loop.
    """
    slow_callback_duration_seconds = os.environ.get(
        ENVVAR_REBOOT_ASYNCIO_SLOW_CALLBACK_DURATION_SECONDS
    )
    if slow_callback_duration_seconds is None:
        return

    loop.set_debug(True)
    loop.slow_callback_duration = float(slow_callback_duration_seconds)
    logger.warning(
        "asyncio debug mode is ENABLED with "
        f"`slow_callback_duration={slow_callback_duration_seconds}s` "
        f"(via the '{ENVVAR_REBOOT_ASYNCIO_SLOW_CALLBACK_DURATION_SECONDS}' "
        "environment variable); this adds non-trivial overhead and "
        "should only be used for debugging. NOTE: consider also "
        "disabling the cyclic GC so as to avoid false positive "
        "warnings that are actually due to GC pauses. "
        "Do not use in production!"
    )


def _maybe_disable_cyclic_gc() -> None:
    """If `REBOOT_DISABLE_CYCLIC_GC` is set to "true", disable
    CPython's cyclic garbage collector entirely.

    Reference counting still frees most objects normally; only cycle
    collection is suppressed. With cyclic GC off, any remaining
    slow-callback warnings are guaranteed to be real Python work
    (not GC pauses masquerading as long handles), which makes A/B
    testing the GC contribution to event-loop stalls trivial.
    Memory will grow over time as cycles accumulate — never enable
    in production.
    """
    if os.environ.get(
        ENVVAR_REBOOT_DISABLE_CYCLIC_GC,
        "false",
    ).lower() != "true":
        return

    gc.disable()

    logger.warning(
        "CPython cyclic garbage collector is DISABLED (via the "
        f"'{ENVVAR_REBOOT_DISABLE_CYCLIC_GC}' environment variable). "
        "This is a diagnostic-only setting: memory will grow over "
        "time as cycles accumulate. Do not use in production!"
    )


def _enable_ptrace_attach() -> None:
    """Allow any process owned by the same user to `PTRACE_ATTACH` to
    us via `prctl(PR_SET_PTRACER, PR_SET_PTRACER_ANY)`.

    Without this, on systems with `kernel.yama.ptrace_scope=1` (e.g.,
    the Ubuntu default, which GitHub Codespaces inherits), py-spy
    cannot attach to its parent because the Yama LSM requires the
    *target* to be a descendant of the *caller* — and our py-spy is a
    *child* of the target, not vice versa. The `PR_SET_PTRACER_ANY`
    prctl explicitly grants ptrace permission and unblocks the attach.

    Failure here is non-fatal: on platforms without `prctl` (e.g.,
    macOS) or without libc loadable via `ctypes`, the caller still
    tries to launch py-spy and lets it fail with a clear error.
    """
    try:
        import ctypes
        libc = ctypes.CDLL("libc.so.6", use_errno=True)
        # Constants from <sys/prctl.h>:
        # PR_SET_PTRACER       = 0x59616d61
        # PR_SET_PTRACER_ANY   = (unsigned long)-1
        PR_SET_PTRACER = 0x59616d61
        PR_SET_PTRACER_ANY = ctypes.c_ulong(-1).value
        result = libc.prctl(PR_SET_PTRACER, PR_SET_PTRACER_ANY, 0, 0, 0)
        if result != 0:
            logger.warning(
                "PR_SET_PTRACER prctl failed with errno "
                f"{ctypes.get_errno()}; py-spy may be unable "
                "to attach if `kernel.yama.ptrace_scope` >= 1"
            )
    except (OSError, AttributeError) as exception:
        logger.warning(
            "Could not call PR_SET_PTRACER (likely not on "
            f"Linux): {exception}. py-spy may be unable to attach if "
            "`kernel.yama.ptrace_scope` >= 1"
        )


def _maybe_run_py_spy() -> None:
    """If `REBOOT_PY_SPY_OUTPUT` is set, launch py-spy as a subprocess
    targeting the current process and have it record a flame graph for
    a fixed duration.

    py-spy is a sampling profiler that runs out-of-process via
    `ptrace`, so it does not significantly perturb the running
    process. Fire-and-forget; the subprocess writes its output and
    exits on its own. Requires py-spy to be installed and `ptrace`
    permissions on the host (`CAP_SYS_PTRACE`, root, or
    `kernel.yama.ptrace_scope=0`). Diagnostic only, do not use in
    production!
    """
    py_spy_output = os.environ.get(ENVVAR_REBOOT_PY_SPY_OUTPUT)
    if py_spy_output is None:
        return

    py_spy_duration = os.environ.get(
        ENVVAR_REBOOT_PY_SPY_DURATION_SECONDS, "60"
    )
    py_spy_rate = os.environ.get(ENVVAR_REBOOT_PY_SPY_RATE, "100")

    _enable_ptrace_attach()

    try:
        subprocess.Popen(
            [
                "py-spy",
                "record",
                "--pid",
                str(os.getpid()),
                "--output",
                py_spy_output,
                "--duration",
                py_spy_duration,
                "--rate",
                py_spy_rate,
                # Include all threads (not just the asyncio loop
                # thread) so background threads like OpenTelemetry's
                # exporter and gRPC's worker threads show up in the
                # flame graph too.
                "--threads",
                # Include idle samples so we see time spent waiting on
                # I/O, not just CPU-bound work.
                "--idle",
            ]
        )
        logger.warning(
            f"py-spy is RECORDING this process for {py_spy_duration} "
            f"seconds at {py_spy_rate}Hz to '{py_spy_output}' "
            f"(via the '{ENVVAR_REBOOT_PY_SPY_OUTPUT}' environment variable). "
            "py-spy stdout/stderr inherits this process's, so any error "
            "appears in this process's log output. The SVG is only "
            f"written after {py_spy_duration} seconds has elapsed."
        )
    except FileNotFoundError:
        logger.warning(
            "Could not start py-spy: binary not found on "
            "PATH. Install it, e.g., with `pip install py-spy`, and "
            "ensure it is on PATH for this process."
        )


async def monitor_event_loop(
    server_id: Optional[str] = None,
) -> None:
    loop = asyncio.get_running_loop()

    # Start/enable opt-in event loop monitoring mechansism to help
    # debug performance issues. Each mechanism is gated by its own
    # environment variable and if none of them are set these are all
    # no-ops and add no overhead - the mechanisms are all independent
    # of each other and a user might want any subset of them.

    _maybe_enable_slow_callback_warnings(loop)
    _maybe_disable_cyclic_gc()
    _maybe_run_py_spy()

    # TODO: move watchdog and lag mechanisms that we start below into
    # own functions like above to keep this function cleaner.

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
