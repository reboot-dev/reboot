"""Timing one check a watcher makes of the developer's files."""
import time
from rbt.dashboard.v1.dashboard_pb2 import Check
from typing import Awaitable, Callable, TypeVar

T = TypeVar('T')


class CheckError(Exception):
    """A check that failed, carrying the `Check` that says when, how
    long it ran and why."""

    def __init__(self, check: Check):
        super().__init__(check.failure)
        self.check = check


async def timed(body: Callable[[], Awaitable[T]]) -> tuple[T, Check]:
    """Runs the body, returning its result with the check it made: when
    it finished and how long it took. A body that raises raises
    `CheckError`, from what it raised, with the check saying when it
    failed, how long it ran and why."""
    started = time.monotonic()
    check = Check()
    try:
        return await body(), check
    except Exception as exception:
        check.failure = str(exception) or type(exception).__name__
        raise CheckError(check) from exception
    finally:
        # Whether the body returned or raised: when, and how long it
        # ran.
        check.at.GetCurrentTime()
        check.took.FromNanoseconds(
            int((time.monotonic() - started) * 1_000_000_000)
        )
