"""Type-checking a Python application with mypy before `rbt dev run`
starts it."""

import asyncio
import importlib.util
import os
import sys
from reboot.cli.common import terminal
from reboot.cli.common.subprocesses import Subprocesses
from typing import Sequence


def mypy_installed() -> bool:
    """Whether mypy is installed for the interpreter that runs `rbt`,
    which is also the one that runs the application."""
    return importlib.util.find_spec('mypy') is not None


def check_mypy_installed() -> None:
    """Fails unless mypy is installed, for `--type-check`, which asks
    for a type-check that can not happen without it."""
    if not mypy_installed():
        terminal.fail(
            "'--type-check' needs mypy, which is not installed. Add `mypy` "
            "to your project's development dependencies and install again."
        )


def missing_mypy() -> str:
    """The message for a Python project whose environment has no
    mypy."""
    return (
        "mypy is not installed, so `rbt dev run` starts your application "
        "without type-checking it. Add `mypy` to your project's "
        "development dependencies and install again, or pass "
        "`--no-type-check`."
    )


async def type_check(
    subprocesses: Subprocesses,
    application: str,
    *,
    search_path: Sequence[str] = (),
) -> bool:
    """Runs mypy on `application`, which checks it and every module of
    the project that it imports. Returns whether mypy reported no
    errors. Prints its report otherwise.

    `search_path` is where mypy looks for the project's modules besides
    the directories of the files it checks: the generated code and
    proto directories that `rbt dev run` puts on the application's
    `PYTHONPATH`, which mypy does not read.
    """
    target = os.path.relpath(application)

    env = os.environ.copy()
    if len(search_path) > 0:
        # Ahead of whatever the developer exported.
        env['MYPYPATH'] = os.pathsep.join(
            [*search_path] + ([env['MYPYPATH']] if 'MYPYPATH' in env else [])
        )

    terminal.info(
        f'Type-checking `{target}` and the code it imports with mypy ...\n'
    )

    async with subprocesses.exec(
        sys.executable,
        '-m',
        'mypy',
        # A library without stubs, which the generated code's `grpc`
        # and `google.rpc` are, is not an error in the application; a
        # module that is not installed at all still is
        # (`import-not-found`).
        '--disable-error-code=import-untyped',
        target,
        stdout=asyncio.subprocess.PIPE,
        # A configuration file that mypy can not parse is reported on
        # stderr.
        stderr=asyncio.subprocess.STDOUT,
        env=env,
    ) as process:
        stdout, _ = await process.communicate()

    if process.returncode == 0:
        return True

    sys.stdout.write(stdout.decode(errors='replace'))
    sys.stdout.flush()

    terminal.warn(
        '\n'
        'Your application starts once mypy reports no errors. '
        '`--no-type-check` starts it without type-checking, but you almost '
        'certainly want the type-check: these errors are usually real bugs. '
        'Agents: do not pass that flag just to make the application run; '
        'fix the errors.'
    )

    return False
