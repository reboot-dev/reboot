"""Describes what the developer's methods call.

Reads a directory of source files and analyzes the whole tree at once,
because a call crosses files: a method may reach a state through a
helper written somewhere else entirely.

What keeps that affordable is that each pass keeps what the one before
it worked out. A file whose modified time and size are unchanged is
not read or parsed again, and a method is analyzed again only when its
own code, or the code of something it calls, has changed.
"""
import os
from dataclasses import dataclass, field
from pathlib import Path
from rbt.dashboard.v1.dashboard_pb2 import MethodCalls
from reboot.dashboard.call_analysis import (
    Analysis,
    Module,
    analyze,
    module_name,
    parse,
)
from typing import Optional

SOURCE_GLOB = '**/*.py'

# What `rbt generate` writes, which the developer did not. The same
# list is in `reboot/cli/commands/generate.py`, in
# `reboot/cli/commands/dev.py` and in `reboot/dashboard/api_watcher.py`;
# keep them in step.
GENERATED_SUFFIXES = ('_rbt.py', '_pb2.py', '_pb2_grpc.py')


@dataclass(frozen=True)
class FileState:
    """One file as a pass last saw it.

    Compared for being different rather than for being newer: checking
    out an older branch moves a file's time backwards, and that is as
    much an edit as any other. Size comes along because two edits a
    moment apart can land on one timestamp.
    """
    modified_ns: int
    size: int


@dataclass
class Sources:
    """What one pass leaves for the next.

    Every module stays, whether it was parsed this pass or kept from a
    previous one, because what a method depends on may live in a file
    nobody has touched: dropping those would make every method that
    calls into them look changed, and the keeping would undo itself.

    `modules` is the one part a dashboard cannot leave for its
    successor -- a parsed file is not something to write down -- which
    is why a pass that finds every file as it was left skips itself
    entirely rather than parsing them all again to learn nothing.
    """
    files: dict[str, FileState] = field(default_factory=dict)
    modules: dict[str, Module] = field(default_factory=dict)
    analyses: dict[str, Analysis] = field(default_factory=dict)
    error: str = ''


def _files(source_directory: Path) -> list[str]:
    """Every file the developer wrote, relative to the directory."""
    return sorted(
        str(path.relative_to(source_directory))
        for path in source_directory.glob(SOURCE_GLOB)
        if path.is_file() and not str(path).endswith(GENERATED_SUFFIXES)
    )


def _states(directory: Path) -> dict[str, FileState]:
    """Every file as it is right now.

    A file that cannot be stat'ed is left out, so that it reads as a
    change and the pass that follows reports why it could not be read.
    """
    states: dict[str, FileState] = {}

    for filename in _files(directory):
        try:
            stat = (directory / filename).stat()
        except OSError:
            continue
        states[filename] = FileState(
            modified_ns=stat.st_mtime_ns,
            size=stat.st_size,
        )

    return states


def read(
    source_directory: str,
    sources: Optional[Sources] = None,
) -> tuple[Sources, str]:
    """Analyzes the methods in one directory of source files.

    Returns what to hand the next pass, and a message naming the files
    that could not be read. A half-written file is the normal case
    while somebody is typing, so the files that did parse are still
    analyzed and the rest are reported.
    """
    directory = Path(source_directory).resolve()

    if not directory.is_dir():
        # Worth saying rather than showing an application that calls
        # nothing: a directory that is not there is a typo, or one that
        # has yet to be made.
        error = f'{source_directory}: no such directory'
        return Sources(error=error), error

    states = _states(directory)

    if sources is not None and states == sources.files:
        # Every file is as the last pass left it, so what that pass
        # concluded is what this one would conclude. Said before
        # anything is read, which is what makes a dashboard that
        # starts again against an untouched tree cost nothing.
        return sources, sources.error

    kept = sources or Sources()

    files: dict[str, FileState] = {}
    modules: dict[str, Module] = {}
    errors: list[str] = []

    for filename, state in states.items():
        name = module_name(filename)

        if kept.files.get(filename) == state and name in kept.modules:
            files[filename] = state
            modules[name] = kept.modules[name]
            continue

        try:
            modules[name] = parse(name, (directory / filename).read_text())
            files[filename] = state
        except SyntaxError as e:
            errors.append(
                f'{os.path.join(source_directory, filename)}: '
                f'line {e.lineno}: {e.msg}'
            )
        except OSError as e:
            errors.append(
                f'{os.path.join(source_directory, filename)}: {e.strerror}'
            )

    # Files that could not be stat'ed at all are left out of `states`,
    # so they are named here rather than passing silently.
    for filename in sorted(set(_files(directory)) - set(states)):
        errors.append(
            f'{os.path.join(source_directory, filename)}: could not be read'
        )

    error = '\n'.join(errors)

    return Sources(
        files=files,
        modules=modules,
        analyses=analyze(modules, kept.analyses),
        error=error,
    ), error


def method_calls(analyses: dict[str, Analysis]) -> list[MethodCalls]:
    """What every method calls, in a settled order, so that reading
    the same tree twice writes the same thing twice."""
    return [
        analyses[key].method_calls
        for key in sorted(analyses)
        if len(analyses[key].method_calls.calls) > 0 or
        len(analyses[key].method_calls.unanalyzed) > 0
    ]
