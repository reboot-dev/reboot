import os
import signal
from collections import defaultdict
from contextlib import contextmanager
from reboot.settings import ENVVAR_SIGNALS_AVAILABLE
from typing import Any, Callable, Optional

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
# NOTE: this is not a generic signal handler mechanism as after all of
# the handlers are executed the default signal handler will be
# re-installed and the signal will be raised again. We can extend the
# functionality to that in the future if necessary, but it needs to be
# considered carefully because it can lead to brittle usage due to not
# every handler knowing whether or not one of the handlers will induce
# a program exit.

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


def _signal_handler(signum, frame):
    """Global signal handler function. Executes signal handlers installed
    via 'install_cleanup()'."""
    global _cleanup_handlers
    global _raised_signal

    _raised_signal = signum

    for handler in _cleanup_handlers[signum]:
        handler()

    # Raise the signal again but with the default handler.
    _signal(signum, signal.SIG_DFL)
    os.kill(os.getpid(), signum)


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

    setattr(signal, 'signal', _signal_unless_initialized)


def install_cleanup(signums: list[int], handler: Callable[[], None]):
    """Installs a callable to be executed when the specified signal is
    raised."""
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
