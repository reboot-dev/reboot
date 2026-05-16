import asyncio
from typing import Iterable, Optional


async def wait_for_tasks(
    tasks: Iterable[Optional[asyncio.Task]],
    *,
    cancel: bool,
) -> None:
    """Wait for every (non-`None`) task in `tasks` to finish. When
    `cancel` is `True`, cancel them first; when `False`, just wait -
    for tasks that stop on their own, e.g. a server stopped via an
    event/flag rather than `.cancel()`, or a cleanup task that must
    run to completion.

    If THIS (parent) task was cancelled while waiting, raise
    `CancelledError` once every task has finished.

    `asyncio.wait()` never raises a child task's own exception; it only
    raises `CancelledError` if the awaiting (parent) task is itself
    cancelled. So a `CancelledError` observed here unambiguously means
    the parent was cancelled, and must be propagated.
    """
    non_none_tasks = [task for task in tasks if task is not None]

    if cancel:
        for task in non_none_tasks:
            task.cancel()

    parent_was_cancelled = False
    pending = [task for task in non_none_tasks if not task.done()]
    while pending:
        try:
            await asyncio.wait(pending)
        except asyncio.CancelledError:
            parent_was_cancelled = True
        pending = [task for task in non_none_tasks if not task.done()]

    if parent_was_cancelled:
        raise asyncio.CancelledError()
