import asyncio
import os
import signal
from collections import defaultdict
from contextlib import contextmanager
from reboot.aio.once import Once
from reboot.settings import ENVVAR_SIGNALS_AVAILABLE
from typing import Any, Callable, NoReturn, Optional

# The one place where a Reboot process installs signal handlers. A
# signal is handled in one of two ways:
#
# - Cleanup, then the default action: the handlers installed for the
#   signal via `install_cleanup()` run when it is raised, after which
#   the default handler is re-installed and the signal is raised again.
#   For `SIGTERM` and `SIGQUIT` that means the process still exits, so
#   this is not a generic signal handler mechanism, and every cleanup
#   handler must tolerate the process exiting right after it runs.
#
# - Cancelling the main `asyncio` task, via `cancel_main_task_on()`,
#   for a process that owns subprocesses and needs its `async with`
#   cleanup to run before it exits. Once the task has unwound,
#   `exit_by_raised_signal()` runs the signal's cleanup handlers and
#   takes the default action, so the process still ends by the signal.
#
# The two serve different callers. Library code registers with
# `install_cleanup()` and may assume nothing about how the process
# ends: the callback runs right before it dies, whichever way handled
# the signal. Only a process entry point decides, once, that the
# signals which would kill it unwind it first, and it must then catch
# the resulting `CancelledError` at the top and finish with
# `exit_by_raised_signal()`. A process that never calls
# `cancel_main_task_on()` dies immediately on every signal, after its
# cleanup handlers.
#
# Invariants, each enforced below rather than assumed: a signal has at
# most one handler, ours, and a foreign one fails at install time; the
# first signal that starts an unwinding wins and later ones are
# dropped, so the cleanup underway cannot be interrupted; and
# `SIGKILL` runs none of this, so anything that must survive it needs
# another mechanism, such as the Envoy nanny's pipe.

# Collection of cleanup handlers that have been installed.
#
# Do not use directly, instead call 'install_cleanup()'.
_cleanup_handlers: defaultdict[
    int,
    list[Callable[[], None]],
] = defaultdict(lambda: [])

# Global to indicate whether or not a signal has been raised.
#
# Do not use directly, instead call 'raised_signal()'.
_raised_signal: Optional[int] = None

# The signals that `cancel_main_task_on()` has taken over, which
# `_initialize_signals()` therefore leaves alone.
#
# Do not use directly, instead call 'cancel_main_task_on()'.
_signals_cancelling_main_task: set[int] = set()

# Whether or not signals are available, e.g., because Python might be
# embedded within a Node process.
_signals_available: bool = os.environ.get(
    ENVVAR_SIGNALS_AVAILABLE,
    'true',
).lower() == 'true'


def raised_signal() -> Optional[int]:
    """Returns the currently raised signal or None if no signal has been
    raised."""
    global _raised_signal
    return _raised_signal


def _signal_handler(signum, frame):
    """Global signal handler function. Executes signal handlers installed
    via 'install_cleanup()'."""
    global _cleanup_handlers
    global _raised_signal

    _raised_signal = signum

    for handler in _cleanup_handlers[signum]:
        handler()

    # Raise the signal again but with the default handler.
    signal.signal(signum, signal.SIG_DFL)
    os.kill(os.getpid(), signum)


# Signals that are supported for installing cleanup handlers.
#
# NOTE: SIGINT is left to Python, which raises `KeyboardInterrupt`,
# except where `cancel_main_task_on()` takes it over.
supported_signals = [signal.SIGTERM, signal.SIGQUIT]


def _initialize_signals():
    """Helper for initializing the process signal handlers."""
    global _signals_available
    global _signals_cancelling_main_task

    if not _signals_available:
        return

    for signum in supported_signals:
        # A signal that cancels the main task already has its handler.
        if signum in _signals_cancelling_main_task:
            continue

        handler = signal.signal(signum, _signal_handler)

        if handler not in (signal.SIG_DFL, signal.SIG_IGN):
            raise RuntimeError(
                'Custom signal handlers are not (yet) supported; '
                'please remove your signal handler'
            )


# Once for initializing signals.
#
# Do not use, instead call 'initialize_signals_once()'.
_initialize_signals_once = Once(_initialize_signals)


def initialize_signals_once():
    """Initializes signals once."""
    global _signals_available
    global _initialize_signals_once

    if not _signals_available:
        return

    _initialize_signals_once()


def install_cleanup(signums: list[int], handler: Callable[[], None]):
    """Installs a callable to be executed when the specified signal is
    raised."""
    global _signals_available
    global _cleanup_handlers

    if not _signals_available:
        return

    initialize_signals_once()

    for signum in signums:
        if signum not in supported_signals:
            raise ValueError(f'Signal {signum} is not supported')
        elif handler in _cleanup_handlers[signum]:
            raise ValueError('Handler already installed')
        _cleanup_handlers[signum].append(handler)


def uninstall_cleanup(signums: list[int], handler: Callable[[], None]):
    """Uninstalls a callable that should already have been installed via
    'install_cleanup()'."""
    global _signals_available
    global _cleanup_handlers

    if not _signals_available:
        return

    initialize_signals_once()

    for signum in signums:
        if handler not in _cleanup_handlers[signum]:
            raise ValueError('Handler not installed')
        _cleanup_handlers[signum].remove(handler)


@contextmanager
def cleanup_on_raise(signums: list[int], *, handler: Callable[[], None]):
    """Helper context manager that installs and uninstalls cleanup
    handlers on the callers behalf."""
    install_cleanup(signums, handler)
    try:
        yield
    finally:
        uninstall_cleanup(signums, handler)


def cancel_main_task_on(signums: list[int]) -> None:
    """Makes each of the signals in `signums` cancel the current `asyncio`
    task, which must be the main task, instead of taking its default
    action, so that the task's cleanup context managers run before the
    process exits. Once the task has unwound, the caller finishes the
    signal's handling with `exit_by_raised_signal()`, which runs the
    signal's `install_cleanup()` handlers and takes its default action.

    Must be called from the main thread, from within a running event
    loop, and at most once per signal."""
    global _signals_available
    global _signals_cancelling_main_task

    if not _signals_available:
        return

    main_task = asyncio.current_task()
    if main_task is None:
        raise AssertionError("May only be called from within asyncio.")

    def cancel_main_task(main_task: asyncio.Task[Any], signum: int) -> None:
        global _raised_signal
        # A further signal while the main task is unwinding, e.g., a
        # second Ctrl-C, would inject another cancellation into the
        # cleanup underway and abandon it, so only the first one counts.
        if _raised_signal is not None:
            return
        _raised_signal = signum
        main_task.cancel()

    loop = asyncio.get_running_loop()

    for signum in signums:
        # `asyncio` replaces whatever handler a signal has without
        # telling us, so first check that it is not somebody else's.
        # Python itself starts with `default_int_handler` on SIGINT.
        previous = signal.getsignal(signum)
        if previous not in (
            signal.SIG_DFL,
            signal.SIG_IGN,
            None,
            signal.default_int_handler,
            _signal_handler,
        ):
            raise RuntimeError(
                f"Only one handler may be installed for signal {signum}; "
                f"found {previous}"
            )
        _signals_cancelling_main_task.add(signum)
        loop.add_signal_handler(signum, cancel_main_task, main_task, signum)


def exit_by_raised_signal() -> NoReturn:
    """Finishes handling a signal that `cancel_main_task_on()` turned into
    a cancellation, now that the main task has unwound: runs the
    signal's `install_cleanup()` handlers and then re-raises it with its
    default action, so that the process ends the way the signal would
    have ended it. Requires that such a signal was raised."""
    signum = raised_signal()
    assert signum is not None, "No signal was raised"
    _signal_handler(signum, None)
    raise AssertionError(f"Signal {signum} did not end the process")
