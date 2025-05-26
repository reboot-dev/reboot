from contextlib import contextmanager
from contextvars import ContextVar
from enum import Enum
from rebootdev.aio.types import ApplicationId
from typing import Iterator, Optional

# Python asyncio context variable that stores whether or not the
# current context is running a state machine, i.e., is "inside" of a
# servicer executing an RPC on behalf of a state. We use INITIALIZING to
# distinguish when a Context is permitted to be constructed.
Servicing = Enum('Servicing', [
    'NO',
    'INITIALIZING',
    'YES',
])

_servicing: ContextVar[Servicing] = ContextVar(
    'RPC servicing status of current asyncio context',
    default=Servicing.NO,
)

# Within tests we may have multiple applications running from multiple
# calls to `reboot.aio.tests.Reboot.up()` and they may all have
# set `in_process=True` meaning a single environment variable for the
# application ID will not work. Instead, we use a Python asyncio
# context variable that we ensure gets set properly in all code paths.
_application_id: ContextVar[Optional[ApplicationId]] = ContextVar(
    'Application ID of the current asyncio context',
    default=None,
)


def get_application_id() -> Optional[ApplicationId]:
    """
    Helper that returns the current application ID for the current
    asyncio context, or None.
    """
    return _application_id.get()


@contextmanager
def use_application_id(application_id: ApplicationId) -> Iterator[None]:
    """
    Context manager that sets the specified application ID for the
    current asyncio context within the scope of the `with`.
    """
    old_application_id = _application_id.get()
    try:
        _application_id.set(application_id)
        yield
    finally:
        _application_id.set(old_application_id)
