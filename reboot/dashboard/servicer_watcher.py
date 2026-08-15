"""Keeps what the developer's methods call up to date.

The same shape as `reboot.dashboard.api_watcher`, over the source
directory rather than the API directory. It differs in reading the
whole tree on every change rather than only the files that changed,
because a call crosses files: editing a helper changes what its
callers call.

What a pass works out is written down beside the answer, so a
dashboard started again reads only what has changed since the last one
ran.
"""
from pathlib import Path
from rbt.dashboard.v1.dashboard_pb2 import APIAnalysisResponse
from rbt.dashboard.v1.dashboard_pb2 import FileState as FileStateMessage
from rbt.dashboard.v1.dashboard_pb2 import MethodCalls, MethodHashes
from rbt.dashboard.v1.dashboard_rbt import API
from reboot.aio.contexts import WorkflowContext
from reboot.cli.common.watch import file_watcher
from reboot.dashboard.call_analysis import VERSION, Analysis, method_key
from reboot.dashboard.constants import API_ID
from reboot.dashboard.servicer_reader import (
    SOURCE_GLOB,
    FileState,
    Sources,
    method_calls,
    read,
)


def _restored(response: APIAnalysisResponse) -> Sources:
    """What the last dashboard worked out, if this one can trust it.

    Only when the same analysis produced it: one that has since changed
    would reach different conclusions from the very same files, and
    nothing on disk would say so.
    """
    if VERSION == '' or response.analyzer_version != VERSION:
        return Sources()

    calls = {
        method_key(one.state_type, one.method): one
        for one in response.method_calls
    }

    analyses: dict[str, Analysis] = {}

    for one in response.method_hashes:
        key = method_key(one.state_type, one.method)
        analyses[key] = Analysis(
            # A method that calls nothing is not written down among
            # the calls, so the empty result is what it had.
            method_calls=calls.get(
                key,
                MethodCalls(state_type=one.state_type, method=one.method),
            ),
            hashes=dict(one.hashes),
        )

    return Sources(
        files={
            state.filename:
                FileState(
                    modified_ns=state.modified_ns,
                    size=state.size,
                ) for state in response.file_states
        },
        analyses=analyses,
        error=response.error,
    )


def _file_states(sources: Sources) -> list[FileStateMessage]:
    return [
        FileStateMessage(
            filename=filename,
            modified_ns=state.modified_ns,
            size=state.size,
        ) for filename, state in sorted(sources.files.items())
    ]


def _method_hashes(sources: Sources) -> list[MethodHashes]:
    return [
        MethodHashes(
            state_type=sources.analyses[key].method_calls.state_type,
            method=sources.analyses[key].method_calls.method,
            hashes=sources.analyses[key].hashes,
        ) for key in sorted(sources.analyses)
    ]


async def watch(context: WorkflowContext, *, source_directory: str) -> None:
    """Updates what the methods call, for as long as this runs."""
    directory = Path(source_directory).resolve()

    response = await API.ref(API_ID).Analysis(context)

    sources = _restored(response)

    # What is already written, so that a dashboard starting against a
    # tree nobody has touched writes nothing at all.
    updated = (
        (list(response.method_calls),
         response.error) if len(sources.files) > 0 else None
    )

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
                sources, error = read(source_directory, sources)

                current = (method_calls(sources.analyses), error)

                if current != updated:
                    updated = current
                    # Every write from a workflow needs an identity,
                    # and this one writes at most once an iteration.
                    await API.ref(API_ID).per_iteration('analyze').UpdateCalls(
                        context,
                        method_calls=current[0],
                        error=current[1],
                        file_states=_file_states(sources),
                        method_hashes=_method_hashes(sources),
                        analyzer_version=VERSION,
                    )

                await event
