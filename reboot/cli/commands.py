import asyncio
import subprocess
from reboot.cli import terminal
from typing import Optional


async def run_command(
    command: list[str],
    icon: str,
    command_name: str,
    explanation: str,
    capture_output: bool,
    only_show_if_verbose: bool = False,
    cwd: Optional[str] = None,
) -> str:
    """
    Run a command, showing appropriate info to the user.

    In regular, non-verbose mode, successful output might look like:

        [🐳] building container from './Dockerfile'... ✅

    An error is shown like this:

        [🐳] building container from './Dockerfile'... 🛑 failed:
        COMMAND OUTPUT HERE

    In verbose mode, the output of the command is shown directly, like this:

       [🐳] building container from './Dockerfile'...
       COMMAND OUTPUT HERE
       ... build complete ✅

    With errors shown like this:

        [🐳] building container from './Dockerfile'...
        COMMAND OUTPUT HERE
        🛑 failed
    """

    capture_output = capture_output or not terminal.is_verbose()
    show = terminal.is_verbose() or not only_show_if_verbose

    if show:
        terminal.info(
            f"[{icon}] {explanation}...",
            end="\n" if terminal.is_verbose() else " ",
        )
    else:
        # When we're not showing this step, we must capture the output so that
        # it also doesn't appear on the terminal.
        assert capture_output

    if terminal.is_verbose():
        assert show
        print(f">> {' '.join(command)}")

    process = await asyncio.create_subprocess_exec(
        *command,
        stdout=subprocess.PIPE if capture_output else None,
        stderr=subprocess.STDOUT if capture_output else None,
    )
    stdout: Optional[bytes] = None

    if capture_output:
        # Don't directly show the developer the output; either we need it or we
        # think it would be too much log spam.
        stdout, _ = await process.communicate()
    else:
        # When verbose (and we don't otherwise need the output) the output is
        # shown directly, not captured.
        await process.communicate()

    if process.returncode != 0:
        # If we captured the output, print it now so the user can debug.
        stdout_suffix = "" if stdout is None else f": \n{stdout.decode()}\n"
        terminal.fail(f"🛑 {command_name} failed" + stdout_suffix)
    elif show:
        if terminal.is_verbose() and stdout is not None:
            # We captured the output, but the user wanted to see it. Print it
            # now.
            print(stdout.decode().strip())
        verbose_prefix = f"... {command_name} complete " if terminal.is_verbose(
        ) else ""
        terminal.info(verbose_prefix + "✅")

    assert not capture_output or stdout is not None
    return stdout.decode().strip() if stdout is not None else ""
