import asyncio
import atexit
import os
import signal
from collections import defaultdict
from contextlib import asynccontextmanager, contextmanager
from dataclasses import dataclass
from reboot.settings import ENVVAR_SIGNALS_AVAILABLE
from typing import Any, AsyncIterator, Callable, Optional

# Helpers for creating a safe(r) mechanism for being able to run
# handlers when signals have been raised and before their default
# handling occurs.
#
# A process must call 'initialize()' from its main thread before it
# installs any cleanup handlers, with the signals that it wants to be
# able to install cleanup handlers for. Calling it again does nothing,
# but must ask for the same signals. From then on those signals are
# ours: anybody else trying to install a signal handler for one of
# them gets an error that points them to cleanup handlers, rather than
# silently replacing our signal handler, whether they use
# 'signal.signal()' directly or through an event loop's
# 'add_signal_handler()'.
#
# NOTE: this is not a generic signal handler mechanism. After all of
# the cleanup handlers are executed one of two things happens:
#
# - Within 'cancel_on_signal()' the task that entered it gets
#   cancelled, so that the process can finish what it is doing, e.g.,
#   terminate its subprocesses, after which the process exits, and
#   at exit the signal is raised again, terminating the process.
#
# - Otherwise the default signal handler will be re-installed and the
#   signal will be raised again, terminating the process, so a cleanup
#   handler must tolerate that. This is what a process that has no
#   task of ours to cancel gets, e.g., a test.

# Collection of cleanup handlers that have been installed.
#
# Do not use directly, instead call 'install_cleanup()'.
_cleanup_handlers: defaultdict[
    int,
    list[Callable[[], None]],
] = defaultdict(lambda: [])

# The signals that 'initialize()' was called with, or None if it has
# not been called yet.
_signums: Optional[list[int]] = None


# The task that a signal cancels, instead of terminating the process,
# while 'cancel_on_signal()' is entered, with the event loop it runs
# on, which is the only safe way to cancel it from a signal handler.
@dataclass(frozen=True, kw_only=True)
class _TaskToCancel:
    loop: asyncio.AbstractEventLoop
    task: asyncio.Task


_task_to_cancel: Optional[_TaskToCancel] = None

# Global to indicate whether or not a signal has been raised.
#
# Do not use directly, instead call 'raised_signal()'.
_raised_signal: Optional[int] = None

# The real 'signal.signal()', which 'initialize()' replaces with
# '_signal_unless_initialized()'.
_signal = signal.signal

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


def _raise_with_default_handler(signum: int):
    """Raises the signal again but with the default handler."""
    _signal(signum, signal.SIG_DFL)
    os.kill(os.getpid(), signum)


def _signal_handler(signum, frame):
    """Global signal handler function. Executes signal handlers installed
    via 'install_cleanup()', and then cancels the task that entered
    'cancel_on_signal()', if any, or raises the signal again."""
    global _cleanup_handlers
    global _raised_signal
    global _task_to_cancel

    _raised_signal = signum

    for handler in _cleanup_handlers[signum]:
        handler()

    if _task_to_cancel is None:
        _raise_with_default_handler(signum)
    else:
        _task_to_cancel.loop.call_soon_threadsafe(_task_to_cancel.task.cancel)


def _terminate_at_exit():
    """Terminates the process with the signal that has been raised, if
    any, and if it is one of 'TERMINATING_SIGNALS', so that whoever
    is waiting for the process sees it terminated by that signal
    rather than exiting.

    Registered with 'atexit' by 'initialize()', so that it runs after
    everything else, 'asyncio.run()' shutting down its event loop
    included."""
    global _raised_signal

    if _raised_signal is not None and _raised_signal in TERMINATING_SIGNALS:
        _raise_with_default_handler(_raised_signal)
        raise AssertionError(
            f'{signal.Signals(_raised_signal).name} did not terminate '
            'the process'
        )


@asynccontextmanager
async def cancel_on_signal() -> AsyncIterator[None]:
    """While entered, a signal cancels the current task, after executing
    the cleanup handlers, instead of terminating the process, so that
    the process can finish what it is doing. The cancellation then
    exits the process, quietly, rather than propagating, and at exit
    the signal is raised again, so that whoever is waiting for the
    process sees it terminated by the signal.

    A signal raised before entering, or after exiting, terminates the
    process right away. Can not be entered while already entered."""
    global _signums
    global _task_to_cancel
    global _raised_signal

    if _signums is None:
        raise RuntimeError(
            'Signals are not initialized; call '
            '`reboot.aio.signals.initialize()` before '
            '`reboot.aio.signals.cancel_on_signal()`'
        )

    if _task_to_cancel is not None:
        raise RuntimeError(
            '`reboot.aio.signals.cancel_on_signal()` is already entered, '
            'and can only be entered once at a time'
        )

    task = asyncio.current_task()
    assert task is not None, 'Must be called from within a task'

    _task_to_cancel = _TaskToCancel(
        loop=asyncio.get_running_loop(),
        task=task,
    )

    try:
        yield
    except asyncio.CancelledError:
        # A cancellation without a signal behind it is somebody else's.
        if _raised_signal is None:
            raise
        # NOTE: `SystemExit` still gets `asyncio.run()` to shut down
        # its event loop on the way out, but exits quietly, and with
        # the status a shell gives a process the signal terminated,
        # for the signals whose default handler does not.
        raise SystemExit(128 + _raised_signal)
    finally:
        _task_to_cancel = None


# The signals whose default action terminates the process: Ctrl-C
# (SIGINT), Ctrl-\ (SIGQUIT), the parent terminal going away (SIGHUP),
# a reader like `head` closing our output pipe early (SIGPIPE), and
# whatever runs a process in the background (IDEs, agents, process
# managers, Kubernetes) stopping it (SIGTERM).
TERMINATING_SIGNALS: list[int] = [
    signal.SIGINT,
    signal.SIGQUIT,
    signal.SIGHUP,
    signal.SIGPIPE,
    signal.SIGTERM,
]

# The signals that 'initialize()' initializes when it is not given any,
# which is what an application and its servers get.
#
# NOTE: we deliberately DO NOT include SIGINT because that behavior is
# handled cleanly by Python by raising `KeyboardInterrupt` which when
# using `asyncio.run()` will cancel outstanding tasks for you.
#
# NOTE: we deliberately DO NOT include SIGPIPE because Python ignores
# it so that writing to a socket or pipe whose reader has gone raises
# `BrokenPipeError`; handling it would instead terminate a server every
# time a client disconnects in the middle of a response.
DEFAULT_SIGNALS: list[int] = [signal.SIGTERM, signal.SIGQUIT]


def _uninitialized_signal_error(signum: int) -> ValueError:
    return ValueError(
        f'{signal.Signals(signum).name} was not initialized; pass it to '
        '`reboot.aio.signals.initialize()`'
    )


def _custom_signal_handler_message(signum: int) -> str:
    return (
        f'Reboot handles {signal.Signals(signum).name} itself, so '
        'custom signal handlers for it are not supported; install a '
        'cleanup handler with `reboot.aio.signals.install_cleanup()` '
        'or `reboot.aio.signals.cleanup_on_signal()` instead'
    )


def _signal_unless_initialized(signum: int, handler: Any) -> Any:
    """Replacement for 'signal.signal()' that fails for the signals
    that 'initialize()' was called with."""
    global _signums

    if _signums is not None and signum in _signums:
        # NOTE: an `OSError` because that is what `signal.signal()`
        # raises for a signal that can not be handled, and what an
        # event loop's `add_signal_handler()` therefore expects: it
        # then forgets the handler it was about to install and
        # re-raises, while any other exception leaves it believing
        # that it installed the handler, so that it would run the
        # handler on our signal after all and fail when the loop is
        # closed. Without an `errno`, or asyncio would replace our
        # message for `EINVAL`.
        raise OSError(_custom_signal_handler_message(signum))

    return _signal(signum, handler)


def initialize(signums: Optional[list[int]] = None):
    """Initializes the process signal handlers for 'signums', or for
    'DEFAULT_SIGNALS' if not given. Must be called from the main
    thread, before installing any cleanup handlers. Only the first call
    does anything, and every later call must ask for the same
    signals.

    Fails if any of the signals has a custom signal handler, and makes
    'signal.signal()' fail for them afterwards."""
    global _signals_available
    global _signums

    signums = list(signums or DEFAULT_SIGNALS)

    if _signums is not None:
        if set(signums) != set(_signums):
            raise RuntimeError(
                'Signals are already initialized with '
                f'{[signal.Signals(signum).name for signum in _signums]}, '
                'and can not be initialized with '
                f'{[signal.Signals(signum).name for signum in signums]}'
            )
        return

    if not _signals_available:
        _signums = signums
        return

    for signum in signums:
        # NOTE: Python itself installs `signal.default_int_handler`
        # for SIGINT, which is what raises `KeyboardInterrupt`.
        if signal.getsignal(signum) not in (
            signal.SIG_DFL,
            signal.SIG_IGN,
            signal.default_int_handler,
        ):
            raise RuntimeError(_custom_signal_handler_message(signum))

    # Only now, so that a failure above leaves us not initialized.
    _signums = signums

    for signum in _signums:
        _signal(signum, _signal_handler)

    atexit.register(_terminate_at_exit)

    setattr(signal, 'signal', _signal_unless_initialized)


def install_cleanup(signums: list[int], handler: Callable[[], None]):
    """Installs a callable to be executed when the specified signal is
    raised.

    NOTE: the callable is executed by the signal handler, i.e., on the
    main thread, in the middle of whatever that thread was doing when
    the signal was raised. To do anything with an event loop from it
    use 'loop.call_soon_threadsafe()', which also wakes up the loop."""
    global _signals_available
    global _signums
    global _cleanup_handlers

    if not _signals_available:
        return

    if _signums is None:
        raise RuntimeError(
            'Signals are not initialized; call '
            '`reboot.aio.signals.initialize()` before installing a '
            'cleanup handler'
        )

    for signum in signums:
        if signum not in _signums:
            raise _uninitialized_signal_error(signum)
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

    for signum in signums:
        if handler not in _cleanup_handlers[signum]:
            raise ValueError('Handler not installed')
        _cleanup_handlers[signum].remove(handler)


@contextmanager
def cleanup_on_signal(signums: list[int], *, handler: Callable[[], None]):
    """Helper context manager that installs and uninstalls cleanup
    handlers on the callers behalf."""
    install_cleanup(signums, handler)
    try:
        yield
    finally:
        uninstall_cleanup(signums, handler)
