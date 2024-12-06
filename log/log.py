import datetime
import heapq
import logging
import os
# Re-export the log levels, so that clients can import them from this module.
from logging import CRITICAL, DEBUG, ERROR, INFO, WARNING  # noqa: F401
from typing import Callable, Optional

# Create log formatter that we'll use with log handler.
formatter = logging.Formatter(
    '%(asctime)s %(levelname)s %(module)s:%(lineno)d: %(message)s'
)

# Create log handler and connect it to formatter.
# Note: we set the log level of the stream handler to be as verbose as
# possible: any message passed to the handler from the logger should get
# considered by the stream handler.
stream_handler = logging.StreamHandler()
stream_handler.setLevel(logging.DEBUG)
stream_handler.setFormatter(formatter)

# Create our respect logger from the root logger and connect the stream
# handler.
#
# NOTE: setting the log level is deferred to the end of this module.
logger = logging.getLogger('respect')
logger.addHandler(stream_handler)

# NOTE: because we are adding our own handler we need to set
# `propagate = False` so that we don't print the logs more than once
# in the event an application that is using us sets up their own
# handler which they will do if they call `logging.basicConfig()`.
logger.propagate = False

# Create a test logger (`respect.test`) that can be used in all of our tests
# that has a default log level of DEBUG. Note, unlike the `respect` logger
# (`logger`), the log level of the test logger is not affected by the
# `RESPECT_LOGGING` environment variable.
test_logger = logger.getChild('test')
test_logger.setLevel(logging.DEBUG)

# Messages (literal strings) that won't be logged if `log_at_most_once_per(...)`
# is called with them before their silence expires.
silenced_messages: set[str] = set()
# A list managed as a heap via `heapq`, with the soonest-to-expire message
# always at the top.
silenced_messages_heaped_by_expiry: list[tuple[datetime.datetime, str]] = []


# Factored out into a method for convenient mocking in tests.
def _get_current_datetime():
    return datetime.datetime.now(datetime.timezone.utc)


def log_at_most_once_per(
    seconds: int, log_method: Callable[[str], None], message: str
):
    global silenced_messages_by_text
    global silenced_messages_heaped_by_expiry

    # Forget about any messages whose silence has expired. Doing this now, for
    # all messages, ensures that memory usage will not grow unbounded. Using a
    # heap keeps the process efficient.
    now = _get_current_datetime()
    while (
        len(silenced_messages_heaped_by_expiry) > 0 and
        silenced_messages_heaped_by_expiry[0][0] <= now
    ):
        _, expired_message = heapq.heappop(silenced_messages_heaped_by_expiry)
        silenced_messages.remove(expired_message)

    if message in silenced_messages:
        return

    log_method(message)

    expiry = now + datetime.timedelta(seconds=seconds)
    silenced_messages.add(message)
    heapq.heappush(silenced_messages_heaped_by_expiry, (expiry, message))


def set_log_level(log_level: int) -> None:
    """ Set the log level globally for this process.

    This method should usually only be called from an application's `main` method.
    To set the log level for an individual package logger, use `logger.setLevel` instead.
    """
    global logger
    logger.setLevel(log_level)


def get_logger(name: Optional[str] = None, parent=None) -> logging.Logger:
    """ Get a named logger.

    If no name is given, return the respect logger, else return a child logger
    of the default respect logger.
    """
    global logger
    parent = parent or logger
    return logger if name is None else parent.getChild(name)


def get_test_logger(name: Optional[str] = None) -> logging.Logger:
    """ Get a named test logger.

    This behaves as `get_logger` but returns a named test logger.
    """
    global test_logger
    return get_logger(name, parent=test_logger)


class DefaultLoggerMixin(object):
    """ Mixin providing class member access to the default logger.
    """

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.logger = get_logger()


class LoggerMixin(object):
    """ Mixin providing class member access to named logger.
    """

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)

        # Name of the logger is the class name.
        self.logger = get_logger(type(self).__name__)


# Initialize the log level for the respect logger.
set_log_level(
    getattr(
        logging,
        os.environ.get('RESPECT_LOGGING', '').upper(), logging.INFO
    )
)
