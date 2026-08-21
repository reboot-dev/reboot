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
from google.protobuf.struct_pb2 import Value
from log.log import get_logger
from pathlib import Path
from rbt.dashboard.v1.dashboard_rbt import API
from reboot.aio.contexts import WorkflowContext
from reboot.cli.common.watch import file_watcher
from reboot.dashboard.api_reader import read
from reboot.dashboard.changelog import changes
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

    def state_types(self) -> list[dict]:
        described = []
        for filename in sorted(self._state_types):
            described.extend(self._state_types[filename])
        return described

    def error(self) -> Optional[str]:
        """Why the files that failed to read failed, or `None` if none
        did."""
        if not self._errors:
            return None
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

    # The files that were on disk at startup and have not yet been
    # read (without error). Each file's first good read is its
    # baseline, so if broken at startup it still gets one once fixed:
    # what it declares predates this dashboard, so it is shown but not
    # recorded as a change.
    unread = set(_files(directory))

    async def update_if_changed(
        alias: str,
        *,
        is_baseline: bool = False,
    ) -> None:
        nonlocal updated

        current = (descriptions.state_types(), descriptions.error())
        if current == updated:
            return
        before = [] if updated is None else updated[0]
        updated = current
        state_types, error = current

        if not is_baseline:
            await record(alias, before, state_types)

        async def update(state: API.State) -> None:
            ParseDict(state_types, state.state_types)
            if error is None:
                state.ClearField('error')
            else:
                state.error = error

        await API.ref().per_iteration(alias).write(context, update)

    async def record(
        alias: str,
        before: list[dict],
        after: list[dict],
    ) -> None:
        """Records what changed, for the changelog.

        One call for the whole batch, so a save that touches several
        types is one transaction. The alias names the file, so it is
        the same every time the file is read; `per_iteration` adds
        which read this is, making each a new call rather than a
        replay of the first.
        """
        recorded = list(changes(before, after))

        if len(recorded) == 0:
            return

        await API.ref().per_iteration(f'history {alias}').RecordChanges(
            context,
            changes=ParseDict(recorded, Value()),
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

                    is_baseline = error is None and filename in unread
                    if is_baseline:
                        unread.discard(filename)

                    await update_if_changed(
                        f'read {filename}',
                        is_baseline=is_baseline,
                    )

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
