"""Timing one check a watcher makes of the developer's files."""
import time
from rbt.dashboard.v1.dashboard_pb2 import Check
from typing import Awaitable, Callable, TypeVar

T = TypeVar('T')


async def timed(body: Callable[[], Awaitable[T]]) -> tuple[T, Check]:
    """Runs the body, returning its result with the check it made: when
    it finished and how long it took."""
    started = time.monotonic()
    result = await body()
    took_nanoseconds = int((time.monotonic() - started) * 1_000_000_000)
    check = Check()
    check.at.GetCurrentTime()
    check.took.FromNanoseconds(took_nanoseconds)
    return result, check
