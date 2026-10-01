import asyncio
import atexit
import functools
import os
import signal
import threading
from collections import defaultdict
from contextlib import asynccontextmanager, contextmanager
from dataclasses import dataclass
from reboot.settings import ENVVAR_SIGNALS_AVAILABLE
from typing import Any, AsyncIterator, Callable, Optional

# Helpers for creating a safe(r) mechanism for being able to run
# handlers when signals have been raised and before their default
# handling occurs.
#
# A process must call 'initialize()' before it installs any cleanup
# handlers. Our signal handler is then installed for a signal when it is
# first needed: by 'install_cleanup()' or by
# 'cancel_on_signal_and_raise_system_exit()', the first of which for a
# signal must be called from the main thread. From then on that signal
# is ours: anybody else trying to install a signal handler for it gets
# an error that points them to cleanup handlers, rather than silently
# replacing our signal handler, whether they use 'signal.signal()'
# directly or through an event loop's 'add_signal_handler()'.
#
# Our signal handler executes the cleanup handlers itself, i.e., on
# the main thread, in the middle of whatever that thread was doing
# when the signal was raised. A cleanup handler that needs anything
# else, e.g., to run on an event loop, arranges that itself.
#
# NOTE: this is not a generic signal handler mechanism. After all of
# the cleanup handlers are executed one of two things happens:
#
# - Within 'cancel_on_signal_and_raise_system_exit()' the task that
#   entered it gets cancelled, so that the process can finish what it is
#   doing, e.g., terminate its subprocesses, after which the process
#   exits, and at exit the signal is raised again, terminating the
#   process.
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

# Whether or not 'initialize()' has been called.
_initialized: bool = False

# The signals that our signal handler is installed for.
#
# Do not use directly, instead call 'install_cleanup()'.
_signums: set[int] = set()


# The task that a signal cancels, instead of terminating the process,
# while 'cancel_on_signal_and_raise_system_exit()' is entered, with the
# event loop it runs on, which is the only safe way to cancel it from a
# signal handler.
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
# '_signal_unless_registered()'.
_signal = signal.signal

# Whether or not signals are available, e.g., because Python might be
# embedded within a Node process.
_signals_available: bool = os.environ.get(
    ENVVAR_SIGNALS_AVAILABLE,
    'true',
).lower() == 'true'


def raised_signal() -> Optional[int]:
    """Returns the first signal that has been raised, which is the only
    one that gets handled, or None if no signal has been raised."""
    global _raised_signal
    return _raised_signal


def _raise_with_default_handler(signum: int):
    """Raises the signal again but with the default handler."""
    _signal(signum, signal.SIG_DFL)
    os.kill(os.getpid(), signum)


def _signal_handler(signum, frame):
    """Global signal handler function. Executes signal handlers installed
    via 'install_cleanup()', and then cancels the task that entered
    'cancel_on_signal_and_raise_system_exit()', if any, or raises the
    signal again."""
    global _cleanup_handlers
    global _raised_signal
    global _task_to_cancel

    # Only the first signal is handled. Any further signal, e.g., a
    # second Ctrl-C from a user who is tired of waiting, would
    # otherwise execute the cleanup handlers again, and cancel the
    # task again, interrupting the cleanup that the first signal
    # started.
    if _raised_signal is not None:
        return

    _raised_signal = signum

    for handler in _cleanup_handlers[signum]:
        handler()

    if _task_to_cancel is None:
        _raise_with_default_handler(signum)
    else:
        _task_to_cancel.loop.call_soon_threadsafe(_task_to_cancel.task.cancel)


@asynccontextmanager
async def cancel_on_signal_and_raise_system_exit(
    signums: list[int]
) -> AsyncIterator[None]:
    """Registers 'signums', if they are not yet.

    While entered, a signal cancels the current task, after executing
    the cleanup handlers, instead of terminating the process, so that
    the process can finish what it is doing. The cancellation then
    exits the process, quietly, rather than propagating, and at exit
    the signal is raised again, so that whoever is waiting for the
    process sees it terminated by the signal.

    A signal raised before entering, or after exiting, terminates the
    process right away. Can not be entered while already entered."""
    global _task_to_cancel
    global _raised_signal

    _register(signums)

    if _task_to_cancel is not None:
        raise RuntimeError(
            '`reboot.aio.signals.cancel_on_signal_and_raise_system_exit()` '
            'is already entered, and can only be entered once at a time'
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
        # its event loop on the way out, but exits quietly. Its status
        # is the one a shell gives a process the signal terminated,
        # which only matters for a signal that does not terminate us
        # when it is raised again at exit, e.g., SIGWINCH.
        raise SystemExit(128 + _raised_signal)
    finally:
        _task_to_cancel = None

        # A signal that was raised while we were entered did not
        # terminate the process, so we raise it again once the process
        # exits: whoever is waiting for the process then still sees it
        # terminated by the signal. At exit, so that it happens after
        # everything else, `asyncio.run()` shutting down its event loop
        # included, and however we are left: the task may also finish,
        # or fail, before the cancellation gets to it.
        if _raised_signal is not None:
            atexit.register(_raise_with_default_handler, _raised_signal)


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

# The signals that an application and its servers handle.
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


def _custom_signal_handler_message(signum: int) -> str:
    return (
        f'Reboot handles {signal.Signals(signum).name} itself, so '
        'custom signal handlers for it are not supported; install a '
        'cleanup handler with `reboot.aio.signals.install_cleanup()` '
        'or `reboot.aio.signals.cleanup_on_signal()` instead'
    )


def _signal_unless_registered(signum: int, handler: Any) -> Any:
    """Replacement for 'signal.signal()' that fails for the signals
    that our signal handler is installed for."""
    global _signums

    if signum in _signums:
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


def _installed_by_python(handler: Any) -> bool:
    """Whether 'handler' is a signal handler that Python itself
    installs, rather than a custom one, so that we may replace it."""
    # NOTE: Python itself installs `signal.default_int_handler` for
    # SIGINT, which is what raises `KeyboardInterrupt`.
    if handler in (
        signal.SIG_DFL,
        signal.SIG_IGN,
        signal.default_int_handler,
    ):
        return True

    # Since Python 3.11 `asyncio.run()` installs a SIGINT handler of
    # its own while it runs, so that Ctrl-C cancels the main task.
    # That handler is a `functools.partial` of a method of the
    # `asyncio.Runner` that `asyncio.run()` creates, which is how we
    # recognize it. Replacing it is fine: when `asyncio.run()` finishes
    # it only restores Python's handler if its own is still installed.
    runner_type = getattr(asyncio, 'Runner', None)
    if runner_type is None or not isinstance(handler, functools.partial):
        return False
    return isinstance(getattr(handler.func, '__self__', None), runner_type)


def initialize():
    """Makes 'signal.signal()' fail for the signals that our signal
    handler gets installed for. Must be called before anything else
    here. Calling it again does nothing."""
    global _initialized
    global _signals_available

    if _initialized:
        return

    _initialized = True

    if not _signals_available:
        return

    setattr(signal, 'signal', _signal_unless_registered)


def _register(signums: list[int]):
    """Installs our signal handler for those of 'signums' that it is
    not installed for yet. Fails if one of those has a custom signal
    handler, or if not called from the main thread, which is the only
    thread that Python lets install a signal handler."""
    global _initialized
    global _signals_available
    global _signums

    if not _initialized:
        raise RuntimeError(
            'Signals are not initialized; call '
            '`reboot.aio.signals.initialize()` first'
        )

    if not _signals_available:
        return

    for signum in signums:
        if signum in _signums:
            continue

        if threading.current_thread() is not threading.main_thread():
            raise RuntimeError(
                f'Reboot can only start handling '
                f'{signal.Signals(signum).name} from the main thread; '
                'call `reboot.aio.signals.install_cleanup()` with it from the '
                'main thread first'
            )

        if not _installed_by_python(signal.getsignal(signum)):
            raise RuntimeError(_custom_signal_handler_message(signum))

        _signal(signum, _signal_handler)

        _signums.add(signum)


def install_cleanup(
    signums: list[int],
    handler: Optional[Callable[[], None]] = None,
):
    """Installs a callable to be executed when the specified signal is
    raised, after installing our signal handler for those of 'signums'
    that it is not installed for yet, which only the main thread can.
    Without a callable it only does the latter, which is how a process
    that installs its cleanup handlers from another thread gets our
    signal handler installed from its main thread first.

    NOTE: the callable is executed by the signal handler, i.e., on the
    main thread, in the middle of whatever that thread was doing when
    the signal was raised. To do anything with an event loop from it
    use 'loop.call_soon_threadsafe()', which also wakes up the loop."""
    global _signals_available
    global _cleanup_handlers

    _register(signums)

    if not _signals_available or handler is None:
        return

    for signum in signums:
        if handler in _cleanup_handlers[signum]:
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
