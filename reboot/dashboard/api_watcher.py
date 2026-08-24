"""Watches the developer's API files and updates what they declare.

The dashboard may start before the application exists: in an agentic
flow the API files are written first, then generated code, then
servicers, then a build, then a running process. So the watcher reads
the files themselves.

It reads per file, so that state types appear as each file is
written, and so that a file which does not parse, the normal case
while someone is typing, loses only its own types.
"""
from log.log import get_logger
from pathlib import Path
from rbt.dashboard.v1.dashboard_pb2 import StateType
from rbt.dashboard.v1.dashboard_rbt import API
from reboot.aio.contexts import WorkflowContext
from reboot.cli.common.watch import file_watcher
from reboot.dashboard.api_reader import read_api_file
from reboot.dashboard.changelog import changes_between
from typing import Optional
from watchdog.events import FileSystemEvent

logger = get_logger(__name__)

API_GLOB = '**/*.py'

# Suffixes of the files `rbt generate` writes, so it skips them
# when reading sources. `reboot/cli/commands/generate.py` (what to
# generate from) and `reboot/cli/commands/dev.py` (what to watch)
# list the same three; change all three lists together.
GENERATED_SUFFIXES = ('_rbt.py', '_pb2.py', '_pb2_grpc.py')


def _api_files(api_directory: Path) -> list[str]:
    """Every candidate API file, relative to `api_directory`.

    Candidate, because an API is a Python object, built when the
    module executes, so only reading a file tells whether it declares
    one.
    """
    return sorted(
        str(path.relative_to(api_directory))
        for path in api_directory.glob(API_GLOB)
        if not path.name.endswith(GENERATED_SUFFIXES)
    )


class _StateTypesByFile:
    """What each file last declared, and what went wrong reading it.

    A file that fails to parse keeps the state types from its last
    successful read, so the dashboard keeps showing them while the
    developer edits the file.
    """

    def __init__(self) -> None:
        self._state_types: dict[str, list[StateType]] = {}
        self._errors: dict[str, str] = {}

    def set_file(
        self,
        filename: str,
        state_types: list[StateType],
        error: Optional[str],
    ) -> None:
        if error is None:
            self._state_types[filename] = state_types
            self._errors.pop(filename, None)
        else:
            self._errors[filename] = error

    def keep_only(self, filenames: set[str]) -> None:
        """Drops the types and errors of every file not in `filenames`,
        the files that currently exist."""
        for stored in list(self._state_types):
            if stored not in filenames:
                del self._state_types[stored]
        for stored in list(self._errors):
            if stored not in filenames:
                del self._errors[stored]

    def state_types(self) -> list[StateType]:
        described = []
        for filename in sorted(self._state_types):
            described.extend(self._state_types[filename])
        return described

    def error(self) -> Optional[str]:
        if not self._errors:
            return None
        return '\n'.join(
            f'{filename}: {self._errors[filename]}'
            for filename in sorted(self._errors)
        )


def _event_filenames(event: FileSystemEvent, directory: Path) -> set[str]:
    """The filenames an event names, relative to `directory`.

    A rename reports where the file went as well as where it was, so
    both paths count. An empty result means neither path is under the
    directory, and the caller responds by reading every file.
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
    """Keeps the API state matching what the API files declare, until
    cancelled."""
    directory = Path(api_directory).resolve()
    state_types_by_file = _StateTypesByFile()
    updated: Optional[tuple] = None

    # Files on disk at startup that the watcher has not yet read
    # without error. A file's first good read is its baseline, even if
    # it was broken at startup and fixed later: what it declares
    # predates this dashboard, so the page shows it but the changelog
    # does not record it as a change.
    unread = set(_api_files(directory))

    async def write_state_if_changed(
        alias: str,
        *,
        is_baseline: bool = False,
    ) -> None:
        nonlocal updated

        current = (
            state_types_by_file.state_types(), state_types_by_file.error()
        )
        if current == updated:
            return
        before = [] if updated is None else updated[0]
        updated = current
        state_types, error = current

        if not is_baseline:
            await record_changes(alias, before, state_types)

        async def write_state(state: API.State) -> None:
            del state.state_types[:]
            state.state_types.extend(state_types)
            if error is None:
                state.ClearField('error')
            else:
                state.error = error

        await API.ref().per_iteration(alias).write(context, write_state)

    async def record_changes(
        alias: str,
        before: list[StateType],
        after: list[StateType],
    ) -> None:
        """Records what changed, for the changelog.

        One call records the whole batch, so a save that touches
        several types is one transaction. The alias names the file and
        so repeats every time the file is read; `per_iteration` adds
        which read this is, so each read is a new call rather than a
        replay of the first.
        """
        recorded = list(changes_between(before, after))

        if len(recorded) == 0:
            return

        await API.ref().per_iteration(f'history {alias}').RecordChanges(
            context,
            changes=recorded,
        )

    # The first iteration reads every file: the developer may have
    # written the whole API before the dashboard started.
    previous_listing = set(_api_files(directory))
    pending = set(previous_listing)

    with file_watcher() as watcher:
        async for iteration in context.loop('read what changed'):
            # The loop opens the watch before it reads anything, so a
            # save made during a read resolves `event` instead of
            # firing between watches, where nothing would notice it.
            # A watch resolves once, so each iteration opens a new one,
            # as `rbt dev run` does.
            async with watcher.watch(
                [API_GLOB],
                root_dir=str(directory),
            ) as event:
                # The page updates after each file so the types appear
                # as the developer writes them.
                for filename in sorted(pending):
                    state_types, error = await read_api_file(
                        api_directory, filename
                    )
                    state_types_by_file.set_file(filename, state_types, error)

                    is_baseline = error is None and filename in unread
                    if is_baseline:
                        unread.discard(filename)

                    await write_state_if_changed(
                        f'read {filename}',
                        is_baseline=is_baseline,
                    )

                changed = await event

            # The watcher lists the directory on every change because a
            # listing is one glob with no file reads, and it is what
            # notices a file added or deleted, which an event naming
            # one path cannot.
            filenames = set(_api_files(directory))
            event_filenames = _event_filenames(changed, directory)
            pending = (
                (filenames - previous_listing) | (event_filenames & filenames)
            )
            previous_listing = filenames

            if not event_filenames:
                # The watch only fires for `.py` files under this
                # directory, so an event naming nothing under it means
                # the watcher reported paths that do not resolve to
                # `directory`. The watcher cannot tell which file
                # changed, so it reads every file.
                pending = filenames

            state_types_by_file.keep_only(filenames)
            await write_state_if_changed('retain')
