import os
import signal
from collections import defaultdict
from contextlib import contextmanager
from rebootdev.aio.once import Once
from rebootdev.settings import ENVVAR_SIGNALS_AVAILABLE
from typing import Callable, Optional

# Helpers for creating a safe(r) mechanism for being able to run
# handlers when signals have been raised and before their default
# handling occurs.
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

# Global to indicate whether or not a signal has been raised.
#
# Do not use directly, instead call 'raised_signal()'.
_raised_signal: Optional[int] = None

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
# NOTE: we deliberately DO NOT support SIGINT because that behavior is
# currently handled cleanly by Python by raising `KeyboardInterrupt`
# which when using `asyncio.run()` will cancel outstanding tasks for
# you.
#
# TODO(benh): investigate how to install a global signal handler that
# works similar to SIGINT and cancels all outstanding tasks.
supported_signals = [signal.SIGTERM, signal.SIGQUIT]


def _initialize_signals():
    """Helper for initializing the process signal handlers."""
    global _signals_available

    if not _signals_available:
        return

    assert signal.SIGTERM in supported_signals

    handler = signal.signal(signal.SIGTERM, _signal_handler)

    if handler not in (signal.SIG_DFL, signal.SIG_IGN):
        raise RuntimeError(
            'Custom signal handlers are not (yet) supported; '
            'please remove your signal handler'
        )

    assert signal.SIGQUIT in supported_signals

    handler = signal.signal(signal.SIGQUIT, _signal_handler)

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
