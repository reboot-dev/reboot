"""Describes what the developer's methods call.

Reads every source file in a directory and analyzes the whole tree at
once, because a call crosses files: a method may reach a state through
a helper written somewhere else entirely. What keeps that affordable is
that only methods whose code actually changed are analyzed again; see
`reboot.dashboard.call_analysis`.
"""
import os
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


def _files(source_directory: Path) -> list[str]:
    """Every file the developer wrote, relative to the directory."""
    return sorted(
        str(path.relative_to(source_directory))
        for path in source_directory.glob(SOURCE_GLOB)
        if path.is_file() and not str(path).endswith(GENERATED_SUFFIXES)
    )


def read(
    source_directory: str,
    cache: Optional[dict[str, Analysis]] = None,
) -> tuple[dict[str, Analysis], str]:
    """Analyzes the methods in one directory of source files.

    Returns what each method calls, and a message naming the files that
    could not be read. A half-written file is the normal case while
    somebody is typing, so the files that did parse are still analyzed
    and the rest are reported.
    """
    directory = Path(source_directory).resolve()

    if not directory.is_dir():
        # Worth saying rather than showing an application that calls
        # nothing: a directory that is not there is a typo, or one that
        # has yet to be made.
        return {}, f'{source_directory}: no such directory'

    modules: dict[str, Module] = {}
    errors: list[str] = []

    for filename in _files(directory):
        name = module_name(filename)

        try:
            modules[name] = parse(name, (directory / filename).read_text())
        except SyntaxError as e:
            errors.append(
                f'{os.path.join(source_directory, filename)}: '
                f'line {e.lineno}: {e.msg}'
            )
        except OSError as e:
            errors.append(
                f'{os.path.join(source_directory, filename)}: {e.strerror}'
            )

    return analyze(modules, cache), '\n'.join(errors)


def method_calls(analyses: dict[str, Analysis]) -> list[MethodCalls]:
    """What every method calls, in a settled order, so that reading
    the same tree twice writes the same thing twice."""
    return [
        analyses[key].method_calls
        for key in sorted(analyses)
        if len(analyses[key].method_calls.calls) > 0 or
        len(analyses[key].method_calls.unanalyzed) > 0
    ]
