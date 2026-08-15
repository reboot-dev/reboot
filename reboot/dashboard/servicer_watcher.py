"""Keeps what the developer's methods call up to date.

The same shape as `reboot.dashboard.api_watcher`, over the source
directory rather than the API directory. It differs in reading the
whole tree on every change rather than only the files that changed,
because a call crosses files: editing a helper changes what its
callers call. `reboot.dashboard.call_analysis` is what keeps that
cheap, by analyzing again only the methods whose code actually
changed.
"""
from pathlib import Path
from rbt.dashboard.v1.dashboard_rbt import API
from reboot.aio.contexts import WorkflowContext
from reboot.cli.common.watch import file_watcher
from reboot.dashboard.call_analysis import Analysis
from reboot.dashboard.constants import API_ID
from reboot.dashboard.servicer_reader import SOURCE_GLOB, method_calls, read
from typing import Optional


async def watch(context: WorkflowContext, *, source_directory: str) -> None:
    """Updates what the methods call, for as long as this runs."""
    directory = Path(source_directory).resolve()

    analyses: dict[str, Analysis] = {}
    updated: Optional[tuple] = None

    with file_watcher() as watcher:
        async for iteration in context.loop('analyze what changed'):
            # The watch is armed before anything is read, so a save
            # made during an analysis is not missed: it resolves
            # `event` rather than arriving while nothing is listening.
            # A watch is consumed by one event, so it is re-entered for
            # each.
            async with watcher.watch(
                [SOURCE_GLOB],
                root_dir=str(directory),
            ) as event:
                analyses, error = read(source_directory, analyses)

                current = (method_calls(analyses), error)

                if current != updated:
                    updated = current
                    # Every write from a workflow needs an identity,
                    # and this one writes at most once an iteration.
                    await API.ref(API_ID).per_iteration('analyze').UpdateCalls(
                        context,
                        method_calls=current[0],
                        error=current[1],
                    )

                await event
