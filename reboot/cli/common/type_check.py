"""Type-checking a Python application with mypy before `rbt dev run`
starts it."""

import asyncio
import importlib.util
import os
import sys
from reboot.cli.common import terminal
from reboot.cli.common.subprocesses import Subprocesses


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


async def type_check(subprocesses: Subprocesses, application: str) -> bool:
    """Runs mypy on `application`, which checks it and every module of
    the project that it imports. Returns whether mypy reported no
    errors. Prints its report otherwise.
    """
    target = os.path.relpath(application)

    terminal.info(
        f'Type-checking `{target}` and the code it imports with mypy ...\n'
    )

    async with subprocesses.exec(
        sys.executable,
        '-m',
        'mypy',
        target,
        stdout=asyncio.subprocess.PIPE,
        # A configuration file that mypy can not parse is reported on
        # stderr.
        stderr=asyncio.subprocess.STDOUT,
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
