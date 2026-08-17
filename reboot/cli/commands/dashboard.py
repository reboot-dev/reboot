"""The `rbt dashboard` command, which runs the developer dashboard."""
import argparse
import asyncio
import os
import secrets
import shutil
import sys
from pathlib import Path
from reboot.aio.backoff import Backoff
from reboot.cli.commands.dev import (
    check_local_envoy_mode,
    try_and_become_child_subreaper_on_linux,
)
from reboot.cli.common import terminal
from reboot.cli.common.directories import (
    add_working_directory_options,
    dot_rbt_directory,
    use_working_directory,
)
from reboot.cli.common.rc import ArgumentParser
from reboot.cli.common.subprocesses import Subprocesses
from reboot.dashboard.constants import (
    DASHBOARD_PATH,
    DEFAULT_DASHBOARD_PORT,
    ENVVAR_RBT_API_DIRECTORY,
)
from reboot.settings import (
    ENVVAR_RBT_DEV,
    ENVVAR_RBT_FRONTEND_DIST_PATH,
    ENVVAR_RBT_FRONTEND_HOST,
    ENVVAR_RBT_FRONTEND_ROOT_PATH,
    ENVVAR_RBT_NAME,
    ENVVAR_RBT_NODEJS,
    ENVVAR_RBT_SERVERS,
    ENVVAR_RBT_STATE_DIRECTORY,
    ENVVAR_REBOOT_CRYPTO_ROOT_KEYS,
    ENVVAR_REBOOT_EXPECTED_VERSION,
    ENVVAR_REBOOT_LOCAL_ENVOY,
    ENVVAR_REBOOT_LOCAL_ENVOY_PORT,
    ENVVAR_REBOOT_OAUTH_SIGNING_SECRET,
)
from reboot.version import REBOOT_VERSION
from typing import Optional

# The dashboard application's name, which names its state directory
# under `.rbt/`. A sibling of `.rbt/dev/` rather than inside it, so
# that it can never collide with a developer's application, whose
# state lives at `.rbt/dev/<application-name>/`.
DASHBOARD_STATE_DIRECTORY_NAME = 'dashboard'


def dashboard_subcommands() -> list[str]:
    return ['dashboard']


def register_dashboard(parser: ArgumentParser):
    add_working_directory_options(parser.subcommand('dashboard'))

    parser.subcommand('dashboard').add_argument(
        '--port',
        type=int,
        help='port on which the dashboard will serve traffic; defaults to '
        f'{DEFAULT_DASHBOARD_PORT}',
    )


def _api_directory(parser: ArgumentParser) -> str:
    """Returns the directory holding the developer's API files, which
    is the directory they tell `rbt generate` to read them from.

    Taken from there rather than named again here, so that moving the
    API files is one edit and the dashboard cannot end up watching a
    directory the rest of the tooling has stopped using.
    """
    for argument in parser.dot_rc_arguments('generate'):
        if not argument.startswith('-'):
            return argument

    terminal.fail(
        'Could not tell where your API files are. `rbt dashboard` reads '
        f'that from the same place `rbt generate` does, so name a '
        f'directory for it in your {parser.dot_rc_filename}:\n'
        '\n'
        '    generate api/\n'
    )


def _dashboard_env(
    args,
    parser: ArgumentParser,
    *,
    port: int,
    api_directory: str,
) -> dict[str, str]:
    """The environment for the dashboard application.

    Built from the ambient environment rather than from any
    application environment, so that nothing naming a developer's
    application, such as its name, state directory, port, launcher or
    frontend, reaches an application that shares none of it.
    """
    composed = os.environ.copy()

    # Every other application-flavored variable is overwritten below;
    # these four have no dashboard value to overwrite them with, so a
    # developer's shell export would leak through and make the
    # dashboard a Node.js application or serve their frontend.
    for name in (
        ENVVAR_RBT_NODEJS,
        ENVVAR_RBT_FRONTEND_HOST,
        ENVVAR_RBT_FRONTEND_DIST_PATH,
        ENVVAR_RBT_FRONTEND_ROOT_PATH,
    ):
        composed.pop(name, None)

    composed[ENVVAR_RBT_DEV] = 'true'
    composed[ENVVAR_REBOOT_EXPECTED_VERSION] = REBOOT_VERSION
    composed[ENVVAR_REBOOT_LOCAL_ENVOY] = 'true'
    composed[ENVVAR_REBOOT_LOCAL_ENVOY_PORT] = str(port)

    # A single server, so that a subscriber's `Connect` and
    # `Toggle` always land on the same process; presence tracks its
    # connections in memory there. `ENVVAR_REBOOT_LOCAL_ENVOY` is
    # set above because one server otherwise turns Envoy off, and
    # the browser has to reach this application.
    composed[ENVVAR_RBT_SERVERS] = '1'

    # Where the developer's API files are, which the dashboard can
    # read whether or not anything is running. Passed the way the
    # developer spelled it, so that a file can be shown as
    # `api/bank/v1/account.py`; the dashboard runs in this working
    # directory, where that spelling resolves.
    composed[ENVVAR_RBT_API_DIRECTORY] = api_directory

    composed[ENVVAR_RBT_NAME] = DASHBOARD_STATE_DIRECTORY_NAME

    state_directory = (
        dot_rbt_directory(args, parser) / DASHBOARD_STATE_DIRECTORY_NAME
    )
    composed[ENVVAR_RBT_STATE_DIRECTORY] = str(state_directory)

    root_keys_path = state_directory / 'crypto-root-keys'
    if root_keys_path.exists():
        composed[ENVVAR_REBOOT_CRYPTO_ROOT_KEYS] = root_keys_path.read_text()
    else:
        root_keys = f'v1:{secrets.token_urlsafe(32)}'
        root_keys_path.parent.mkdir(parents=True, exist_ok=True)
        root_keys_path.write_text(root_keys)
        composed[ENVVAR_REBOOT_CRYPTO_ROOT_KEYS] = root_keys

    composed[ENVVAR_REBOOT_OAUTH_SIGNING_SECRET] = composed[
        ENVVAR_REBOOT_CRYPTO_ROOT_KEYS]

    return composed


async def _run_dashboard(
    *,
    env: dict[str, str],
    state_directory: Path,
    subprocesses: Subprocesses,
) -> None:
    """Runs the dashboard application, restarting it if it exits.

    The dashboard's schema changes whenever Reboot's does, so the
    expected reason for it to fail at startup is a backwards
    incompatibility after an upgrade. Its state is ours and is
    disposable, so the first failure deletes it and tries again
    without asking. A second failure is something else, and gets
    reported once rather than silently retried forever.
    """
    backoff = Backoff()
    failures = 0
    reported = False

    while True:
        async with subprocesses.exec(
            sys.executable,
            '-m',
            'reboot.dashboard.main',
            env=env,
            # The application's own startup output would drown the one
            # line this command prints; anything it writes to stderr
            # still reaches the terminal.
            stdout=asyncio.subprocess.DEVNULL,
        ) as process:
            await process.wait()
            failed = process.returncode != 0

        if not failed:
            failures = 0
        else:
            failures += 1

            if failures == 1:
                await asyncio.to_thread(
                    shutil.rmtree, state_directory, ignore_errors=True
                )
            elif not reported:
                reported = True
                terminal.warn(
                    'The dashboard application keeps failing to start; '
                    'still trying.'
                )

        await backoff()


async def dashboard(
    args,
    parser: ArgumentParser,
) -> int:
    """Implementation of the 'dashboard' subcommand."""
    with use_working_directory(args, parser):
        # If on Linux try to become a child subreaper so that we can
        # properly clean up all processes descendant from us! Envoy in
        # particular is a grandchild, and one that outlives the
        # application would keep answering on the dashboard's port.
        try_and_become_child_subreaper_on_linux()

        subprocesses = Subprocesses()

        # Pick the mode in which we'll run a local Envoy proxy and
        # check that the mode is usable, e.g. that Docker is running
        # and can access the Envoy proxy image, or that the `envoy`
        # executable runs. Fail otherwise.
        await check_local_envoy_mode(subprocesses)

        port = args.port or DEFAULT_DASHBOARD_PORT

        env = _dashboard_env(
            args,
            parser,
            port=port,
            api_directory=_api_directory(parser),
        )

        terminal.info(
            'Your dashboard is at '
            f'http://127.0.0.1:{port}{DASHBOARD_PATH}/\n'
        )

        await _run_dashboard(
            env=env,
            state_directory=Path(env[ENVVAR_RBT_STATE_DIRECTORY]),
            subprocesses=subprocesses,
        )

    return 0


async def handle_dashboard_subcommand(
    args: argparse.Namespace,
    *,
    parser: ArgumentParser,
) -> Optional[int]:
    if args.subcommand == 'dashboard':
        return await dashboard(args, parser)
    return None
