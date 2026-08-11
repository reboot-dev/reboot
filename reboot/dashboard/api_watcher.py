"""Watches the developer's API files and updates what they declare.

The dashboard may start before the application exists. In an agentic
flow the API files are written first, then generated code, then
servicers, then a build, then a running process, so asking the
application would say nothing for minutes. Reading the files says
something immediately, and says more with each file that lands.

Per file, so that state types appear as they are written rather than
all at once at the end, and so that one file which does not parse,
the normal case while someone is typing, costs only its own types.
"""
from google.protobuf.json_format import ParseDict
from log.log import get_logger
from pathlib import Path
from rbt.dashboard.v1.dashboard_pb2 import StateTypeInfo
from rbt.dashboard.v1.dashboard_rbt import API
from reboot.aio.contexts import WorkflowContext
from reboot.cli.common.watch import file_watcher
from reboot.dashboard.api_reader import read
from reboot.dashboard.constants import API_ID
from typing import Optional
from watchdog.events import FileSystemEvent

logger = get_logger(__name__)

# Only Pydantic APIs can be read so far. `.proto` and `.ts` are the
# other two forms `rbt generate` accepts; both are static parses and
# neither is written yet.
API_GLOB = '**/*.py'

# Suffixes of the files `rbt generate` writes, which it therefore
# skips on the way back in. The same three appear in
# `reboot/cli/commands/generate.py`, which decides what to generate
# from, and in `reboot/cli/commands/dev.py`, which decides what to
# watch. Keep the three lists in step.
GENERATED_SUFFIXES = ('_rbt.py', '_pb2.py', '_pb2_grpc.py')


def _files(api_directory: Path) -> list[str]:
    """Every candidate API file, relative to `api_directory`.

    Every `.py` the developer wrote, which is the rule `rbt generate`
    uses. Whether one of them declares an API is answered by reading
    it: an API is a Python object, built when the module executes, so
    no amount of looking at the text settles it. A file that declares
    none costs one subprocess and describes nothing, and `rbt dev run`
    is already importing all of these on every save to regenerate.
    """
    return sorted(
        str(path.relative_to(api_directory))
        for path in api_directory.glob(API_GLOB)
        if not path.name.endswith(GENERATED_SUFFIXES)
    )


class _Descriptions:
    """What each file last declared, and what went wrong reading it.

    Keyed by file so that a file which stops parsing keeps the types
    it last had: blanking the dashboard on every keystroke would make
    it unreadable exactly while it is being used.
    """

    def __init__(self) -> None:
        self._state_types: dict[str, list[dict]] = {}
        self._errors: dict[str, str] = {}

    def update(
        self,
        filename: str,
        state_types: list[dict],
        error: Optional[str],
    ) -> None:
        if error is None:
            self._state_types[filename] = state_types
            self._errors.pop(filename, None)
        else:
            self._errors[filename] = error

    def retain(self, filenames: set[str]) -> None:
        """Forgets files that are no longer there."""
        for stored in list(self._state_types):
            if stored not in filenames:
                del self._state_types[stored]
        for stored in list(self._errors):
            if stored not in filenames:
                del self._errors[stored]

    def state_types(self) -> list[StateTypeInfo]:
        described = []
        for filename in sorted(self._state_types):
            for state_type in self._state_types[filename]:
                described.append(ParseDict(state_type, StateTypeInfo()))
        return described

    def error(self) -> str:
        return '\n'.join(
            f'{filename}: {self._errors[filename]}'
            for filename in sorted(self._errors)
        )


def _event_filenames(event: FileSystemEvent, directory: Path) -> set[str]:
    """The filenames an event names, relative to `directory`.

    Both of its paths, because a rename reports where the file went as
    well as where it was. A path that is not under the directory is
    left out, and an event that names nothing under it is the caller's
    signal that it could not place the event at all.
    """
    filenames = set()
    for path in (event.src_path, event.dest_path):
        if not path:
            continue
        try:
            filenames.add(str(Path(path).relative_to(directory)))
        except ValueError:
            continue
    return filenames


async def watch(context: WorkflowContext, *, api_directory: str) -> None:
    """Updates what the API files declare, for as long as this runs."""
    directory = Path(api_directory).resolve()
    descriptions = _Descriptions()
    updated: Optional[tuple] = None

    async def update_if_changed(alias: str) -> None:
        nonlocal updated

        current = (descriptions.state_types(), descriptions.error())
        if current != updated:
            updated = current
            # Every write from a workflow needs an identity, and this
            # one writes once per file that changed, on every
            # iteration.
            await API.ref(API_ID).per_iteration(alias).Update(
                context,
                state_types=descriptions.state_types(),
                error=descriptions.error(),
            )

    # Everything, once: the developer may have written the whole API
    # before the dashboard started. After this only what changes is
    # read again.
    previous_listing = set(_files(directory))
    pending = set(previous_listing)

    with file_watcher() as watcher:
        async for iteration in context.loop('read what changed'):
            # The watch is armed before anything is read, so a save
            # made during a read is not missed: it resolves `event`
            # rather than arriving while nothing is listening. A watch
            # is consumed by one event, so it is re-entered for each,
            # the same shape `rbt dev run` uses.
            async with watcher.watch(
                [API_GLOB],
                root_dir=str(directory),
            ) as event:
                # Updating after each file rather than after the
                # batch is what makes the types appear as they are
                # written.
                for filename in sorted(pending):
                    state_types, error = await read(api_directory, filename)
                    descriptions.update(filename, state_types, error)
                    await update_if_changed(f'read {filename}')

                changed = await event

            # A listing is a glob and no file reads, so it is taken on
            # every change: it is what notices a file added or deleted,
            # which an event naming one path cannot.
            filenames = set(_files(directory))
            event_filenames = _event_filenames(changed, directory)
            pending = (
                (filenames - previous_listing) | (event_filenames & filenames)
            )
            previous_listing = filenames

            if not event_filenames:
                # The glob only matches `.py` under this directory, so
                # an event that names nothing under it means its paths
                # did not resolve the way this one did. Read every file
                # rather than let the page go quietly stale on a
                # mismatch this cannot see.
                pending = filenames

            descriptions.retain(filenames)
            await update_if_changed('retain')
