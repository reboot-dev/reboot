"""Type-checking a Python application with mypy before `rbt dev run`
starts it."""

import asyncio
import importlib.util
import os
import re
import sys
from reboot.cli.common import terminal
from reboot.cli.common.subprocesses import Subprocesses
from typing import Optional

# The start of an error or a note in mypy's report, e.g.:
#   backend/src/main.py:3: error: Name "foo" is not defined  [name-defined]
_ERROR_OR_NOTE = re.compile(
    r'^(?P<path>.+?\.pyi?):\d+(?::\d+)?: (?P<severity>error|note): '
)


def mypy_installed() -> bool:
    """Whether mypy is installed for the interpreter that runs `rbt`,
    which is also the one that runs the application."""
    return importlib.util.find_spec('mypy') is not None


def missing_mypy() -> str:
    """The message for a Python project whose environment has no
    mypy."""
    return (
        "mypy is not installed, so `rbt dev run` starts your application "
        "without type-checking it. Add `mypy` to your project's "
        "development dependencies and install again, or pass "
        "`--no-type-check`."
    )


def _in_directory(path: str, directory: str) -> bool:
    """Whether the file at `path` is in `directory` or below it."""
    return os.path.abspath(path
                          ).startswith(os.path.abspath(directory) + os.sep)


def developers_report(
    report: str,
    *,
    generated_directory: Optional[str],
) -> tuple[str, int, int]:
    """mypy's `report` without the errors and notes for files in
    `generated_directory`, where `rbt generate` writes Python, followed
    by the number of errors it still has and the number of errors left
    out.

    mypy reports the errors of every module that the application
    imports from the project. The generated ones are not the
    developer's to fix.
    """
    lines: list[str] = []
    errors = 0
    left_out = 0

    # Whether the line is kept. A line that is not the start of an
    # error or a note, e.g. the source that `--pretty` prints below
    # an error, goes where the line before it went.
    keep = True

    for line in report.splitlines(keepends=True):
        error_or_note = _ERROR_OR_NOTE.match(line)
        if error_or_note is not None:
            keep = generated_directory is None or not _in_directory(
                error_or_note.group('path'),
                generated_directory,
            )
            if error_or_note.group('severity') == 'error':
                if keep:
                    errors += 1
                else:
                    left_out += 1
        if keep:
            lines.append(line)

    return ''.join(lines), errors, left_out


async def type_check(
    subprocesses: Subprocesses,
    application: str,
    *,
    generated_directory: Optional[str],
) -> bool:
    """Runs mypy on `application`, which checks it and every module of
    the project that it imports. Returns whether mypy reported no
    errors outside of `generated_directory`, where `rbt generate`
    writes Python. Prints the errors it reported there.
    """
    target = os.path.relpath(application)

    terminal.info(
        f'Type-checking `{target}` and the code it imports with mypy ...\n'
    )

    async with subprocesses.exec(
        sys.executable,
        '-m',
        'mypy',
        # The summary counts the errors in generated code.
        '--no-error-summary',
        target,
        stdout=asyncio.subprocess.PIPE,
        # A configuration file that mypy can not parse is reported on
        # stderr.
        stderr=asyncio.subprocess.STDOUT,
    ) as process:
        stdout, _ = await process.communicate()

    if process.returncode == 0:
        return True

    report, errors, left_out = developers_report(
        stdout.decode(errors='replace'),
        generated_directory=generated_directory,
    )

    # mypy exits with status 1 when all it has to report is errors.
    if process.returncode == 1 and errors == 0 and left_out > 0:
        return True

    sys.stdout.write(report)
    sys.stdout.flush()

    terminal.warn(
        '\n' + (
            f'mypy reports {errors} error{"" if errors == 1 else "s"} in '
            'your code.' if errors >
            0 else f'mypy exited with status {process.returncode}.'
        ) + ' Your application starts once mypy reports no errors. '
        '`--no-type-check` starts it without type-checking, but you almost '
        'certainly want the type-check: these errors are usually real bugs. '
        'Agents: do not pass that flag just to make the application run; '
        'fix the errors.'
    )

    return False
