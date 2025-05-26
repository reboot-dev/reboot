import asyncio
import threading
from typing import Callable, Coroutine


class Once:
    """Takes a function and ensures 'call once' semantics.
    e.g. print_me_once = Once(lambda: print('print me'))
         print_me_once() # Prints 'print me'.
         print_me_once() # Does nothing.
    """

    def __init__(self, f: Callable):
        self._f = f
        self._lock = threading.Lock()
        self._called = False

    def __call__(self, *args, **kwargs) -> None:
        """Execute, exactly once, the function passed to the constructor."""
        # More than one caller might have a handle to an instance of Once at
        # the same time. Acquire a lock so that only one runs to completion.
        with self._lock:
            if not self._called:
                try:
                    self._f(*args, **kwargs)
                finally:
                    self._called = True


class AsyncOnce:
    """Takes an async function and ensures 'call once' semantics."""

    def __init__(self, f: Callable[[], Coroutine]):
        self._f = f
        self._lock = asyncio.Lock()
        self._called = False

    async def __call__(self) -> None:
        """Execute, exactly once, the async coroutine passed to the constructor.
        """
        # More than one caller might have a handle to an instance of AsyncOnce at
        # the same time. Acquire a lock so that only one runs to completion.
        async with self._lock:
            if not self._called:
                try:
                    await self._f()
                finally:
                    self._called = True
