"""Watches the developer's API files and updates what they declare.

The dashboard may start before the application exists: in an agentic
flow the API files are written first, then generated code, then
servicers, then a build, then a running process. So the watcher reads
the files themselves.

It reads per file, all at once, and writes what every file declares
once per change, so that a file which does not parse, the normal
case while someone is typing, loses only its own types.

Which files to read is decided from the disk, not from the event
that woke the watch: every candidate file is walked, and one whose
bytes are unchanged, and whose imports lead to unchanged files, is
neither read nor imported again. So a change to a file that
declares nothing but is imported by one that does reads the
importer, and a burst of saves loses nothing however many events
the watch failed to hear.
"""
from dataclasses import dataclass
from functools import partial
from google.protobuf.timestamp_pb2 import Timestamp
from pathlib import Path
from rbt.dashboard.v1.dashboard_pb2 import API as APIState
from rbt.dashboard.v1.dashboard_pb2 import Change, File
from rbt.dashboard.v1.dashboard_rbt import API
from rbt.v1alpha1.pydantic import api_pb2
from reboot.aio.concurrently import concurrently
from reboot.aio.contexts import WorkflowContext
from reboot.aio.workflows import at_least_once
from reboot.cli.common.watch import file_watcher
from reboot.dashboard.api_reader import read_api_file
from reboot.dashboard.changelog import changes_between
from reboot.dashboard.walk import (
    GENERATED_SUFFIXES,
    SOURCE_GLOB,
    Dependency,
    Digest,
    _standardized_path,
    _walk,
)
from typing import Mapping, Optional


@dataclass(frozen=True, kw_only=True)
class ReadFile:
    """What reading one of the developer's API files found."""

    # The file this is, in the spelling `_standardized_path` returns.
    filename: Path

    # Of the bytes the file held, saying whether reading it again
    # would say anything new.
    digest: Digest

    # What each import observed when this file was read, keyed by
    # possible module path, e.g. `shop/v1/models`. A change in which
    # file is at a module path, or in that file's bytes, is what
    # calls for reading this file again. Empty for a file that would
    # not parse, whose imports could not be followed.
    dependencies: Mapping[str, Dependency]

    # The files outside the API directory reading this file read:
    # none, since the reader follows nothing beyond the directory.
    external: tuple[Dependency, ...]

    # What the file declares, as `api_of` read it; `None` for a file
    # declaring no `api`, or one that could not be read.
    api: Optional[api_pb2.API]

    # Why the file could not be read, when it could not be.
    error: Optional[str]

    # When the file was last modified, as the filesystem records it,
    # as of the listing that read it: what, against the generated
    # files' times, says whether generated code is older than this.
    modified: Timestamp


def _api_files(api_directory: Path) -> list[Path]:
    """Every candidate API file under `api_directory`, in the spelling
    `_standardized_path` returns, sorted.

    Candidate, because an API is a Python object, built when the
    module executes, so only reading a file tells whether it declares
    one.
    """
    return sorted(
        _standardized_path(path)
        for path in api_directory.glob(SOURCE_GLOB)
        if not path.name.endswith(GENERATED_SUFFIXES)
    )


def _reconstitute_known(
    state: APIState,
    *,
    api_directory: Path,
) -> dict[Path, ReadFile]:
    """Returns the files a previous run recorded, joined back together
    from the state: each `File` with what was recorded as declared by
    its file. What a restarted watch starts from, so that only files
    that changed while the dashboard was down are read again."""
    known: dict[Path, ReadFile] = {}
    for relative, file in state.files.items():
        filename = _standardized_path(api_directory / relative)
        known[filename] = ReadFile(
            filename=filename,
            digest=file.digest,
            dependencies=dict(file.dependencies),
            external=tuple(file.external),
            api=state.apis[relative] if relative in state.apis else None,
            error=file.error if file.HasField('error') else None,
            modified=file.modified,
        )
    return known


def _apis(
    known: Mapping[Path, ReadFile],
    *,
    api_directory: Path,
) -> dict[str, api_pb2.API]:
    """What each file declaring an `api` declares, keyed by the file
    relative to the API directory, the way `API.apis` is keyed."""
    return {
        _relative(filename, api_directory): file.api
        for filename, file in sorted(known.items())
        if file.api is not None
    }


def _error(
    known: Mapping[Path, ReadFile],
    *,
    api_directory: Path,
) -> Optional[str]:
    """Why the files could not be read, one line per file that could
    not be, and `None` when every file read."""
    lines = [
        f'{_relative(filename, api_directory)}: {known[filename].error}'
        for filename in sorted(known)
        if known[filename].error is not None
    ]
    if len(lines) == 0:
        return None
    return '\n'.join(lines)


def _relative(filename: Path, api_directory: Path) -> str:
    """The file's path relative to the API directory, which is how
    the reader is asked for it and how a state type names it."""
    return str(filename.resolve().relative_to(api_directory))


def _files(
    known_now: Mapping[Path, ReadFile],
    *,
    api_directory: Path,
) -> dict[str, File]:
    """Each file as read, keyed relative to the API directory, the
    way the state records them."""
    files: dict[str, File] = {}
    for filename, file in known_now.items():
        recorded = File(
            digest=file.digest,
            dependencies=file.dependencies,
            external=file.external,
        )
        if file.error is not None:
            recorded.error = file.error
        recorded.modified.CopyFrom(file.modified)
        files[_relative(filename, api_directory)] = recorded
    return files


async def _walk_and_read(
    *,
    api_directory: str,
    directory: Path,
    known: Mapping[Path, ReadFile],
) -> tuple[Optional[dict[Path, ReadFile]], list[Change]]:
    """Returns what is known of the files now, each file as read,
    and what changed since `known`, what the state records; and
    `None` and nothing when nothing differs.

    Memoized by the caller per iteration, so that a retry of the
    iteration updates with what this read found rather than with
    what a later read finds, which is what keeps the update's
    request the same however many times it is made. So everything
    returned is a plain value pickle can keep.
    """
    unchanged, parsed, unparseable, _ = await _walk(
        entries=_api_files(directory),
        roots=[directory],
        known=known,
    )

    # Every parsed file is read, all at once: each read
    # is an interpreter importing the file, and none
    # waits on another.
    reads: dict[Path, tuple[Optional[api_pb2.API], Optional[str]]] = {
        filename: read async for filename, read in concurrently(
            lambda filename: read_api_file(
                api_directory,
                _relative(filename, directory),
            ),
            for_each=sorted(parsed),
        )
    }

    # What is known now: the unchanged files, each parsed file as
    # read, and each unparseable file, which declares nothing and
    # whose imports could not be followed, with why the walk could
    # not parse it, spelled the way the reader spells an error. A
    # candidate that is gone, or could not be read, is in none of
    # these.
    known_now: dict[Path, ReadFile] = dict(unchanged)
    for filename, (api, error) in reads.items():
        known_now[filename] = ReadFile(
            filename=filename,
            digest=parsed[filename].digest,
            dependencies=dict(parsed[filename].dependencies),
            external=(),
            api=api,
            error=error,
            # The parsed bytes' time, from the open file they came
            # from, so a time and a digest always describe one file.
            # The reader opens the file again, though, and a save
            # landing in between gives declarations from bytes newer
            # than this. That is okay: the time is then older than
            # the content, never newer, so the page can only
            # under-report generated code as stale, and only until
            # the next iteration, which that save's event, on a
            # watch armed before this walk, starts at once; its walk
            # finds the digest moved, reads the file again, and
            # records the newer time with the same declarations, so
            # nothing reaches the changelog.
            modified=parsed[filename].modified,
        )
    for filename, unparseable_file in unparseable.items():
        known_now[filename] = ReadFile(
            filename=filename,
            digest=unparseable_file.digest,
            dependencies={},
            external=(),
            api=None,
            error=(
                f'{type(unparseable_file.error).__name__}: '
                f'{unparseable_file.error}'
            ),
            modified=unparseable_file.modified,
        )

    if known_now == known:
        return None, []

    changes = list(
        changes_between(
            _apis(known, api_directory=directory),
            _apis(known_now, api_directory=directory),
        )
    )

    return known_now, changes


async def watch(context: WorkflowContext, *, api_directory: str) -> None:
    """Keeps the API state matching what the API files declare, until
    cancelled."""
    directory = Path(api_directory).resolve()

    # What a previous run recorded: starting from it, only files that
    # changed while the dashboard was down are read again.
    state = await API.ref().always().read(context)
    known: Mapping[
        Path, ReadFile] = _reconstitute_known(state, api_directory=directory)

    # Whether this process has yet to wait for a save: a restart
    # is itself a reason to walk the files again.
    restarted = True

    with file_watcher() as watcher:
        async for _ in context.loop('Read what changed'):
            # The loop opens the watch before it reads anything, so a
            # save made during a read resolves `event` instead of
            # firing between watches, where nothing would notice it.
            # A watch resolves once, so each iteration opens a new one,
            # as `rbt dev run` does. The event is only a wake-up:
            # what to read is decided by walking the files.
            async with watcher.watch(
                [SOURCE_GLOB],
                root_dir=str(directory),
            ) as event:

                # Memoized per iteration.
                known_now, changes = await at_least_once(
                    'Walk and read',
                    context,
                    partial(
                        _walk_and_read,
                        api_directory=api_directory,
                        directory=directory,
                        known=known,
                    ),
                )

                # An update wakes every browser reading `Get`, so one
                # is only made for a difference, and it is one
                # transaction for the whole iteration, so that a save
                # that touches several files is one entry's worth of
                # history.
                if known_now is not None:
                    await API.ref().per_iteration('Update').Update(
                        context,
                        api_directory=api_directory,
                        error=_error(known_now, api_directory=directory),
                        files=_files(known_now, api_directory=directory),
                        apis=_apis(known_now, api_directory=directory),
                        changes=changes,
                    )
                    known = known_now

                # If we're restarting this workflow we might be in an
                # iteration that has already memoized `_walk_and_read`
                # and thus we don't want to wait on an `event` because
                # there may be changes that we want to walk and handle
                # immediately. Thus, we always go to the next
                # iteration immediately when we've `restarted`. Worse
                # case we have an iteration where `known_now` is
                # `None` so we just wait on the `event`.
                if restarted:
                    restarted = False
                    continue

                await event
