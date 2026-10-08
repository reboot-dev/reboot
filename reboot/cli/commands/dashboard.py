"""The `rbt dashboard` command, which runs the developer dashboard."""
import argparse
import asyncio
import os
import secrets
import shutil
import socket
import sys
import webbrowser
from contextlib import AsyncExitStack, suppress
from pathlib import Path
from reboot.aio.backoff import Backoff
from reboot.cli.commands.dev import (
    _dashboard_reachable,
    _open_on_restart,
    _viewers,
    automatically_opened_url,
    check_local_envoy_mode,
    try_and_become_child_subreaper_on_linux,
)
from reboot.cli.common import terminal
from reboot.cli.common.dev_extra import dev_extra_installed, missing_dev_extra
from reboot.cli.common.directories import (
    add_working_directory_options,
    dot_rbt_directory,
    use_working_directory,
)
from reboot.cli.common.rc import ArgumentParser
from reboot.cli.common.subprocesses import Subprocesses
from reboot.dashboard.backend.constants import (
    DEFAULT_DASHBOARD_PORT,
    ENVVAR_RBT_API_DIRECTORY,
    ENVVAR_RBT_APPLICATION,
    ENVVAR_RBT_DASHBOARD_TOKEN,
    ENVVAR_RBT_GENERATED_DIRECTORY,
)
from reboot.dashboard.gateway import (
    DashboardTunnel,
    TunnelError,
    cloudflare_tunnel,
    dashboard_gateway,
)
from reboot.settings import (
    ENVVAR_LOCAL_ENVOY_PUBLIC_HOST,
    ENVVAR_LOCAL_ENVOY_USE_TLS,
    ENVVAR_RBT_DEV,
    ENVVAR_RBT_EFFECT_VALIDATION,
    ENVVAR_RBT_FRONTEND_DIST_PATH,
    ENVVAR_RBT_FRONTEND_HOST,
    ENVVAR_RBT_FRONTEND_ROOT_PATH,
    ENVVAR_RBT_NAME,
    ENVVAR_RBT_NODEJS,
    ENVVAR_RBT_SERVE,
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
        '--tunnel',
        type=bool,
        default=True,
        help='open a Cloudflare tunnel so that an MCP host such as Claude '
        'can show the dashboard as an MCP App; `--no-tunnel` serves the '
        'dashboard to this machine only',
    )

    parser.subcommand('dashboard').add_argument(
        '--port',
        type=int,
        help='port on which the dashboard will serve traffic; defaults to '
        f'{DEFAULT_DASHBOARD_PORT}',
    )


def _api_directory(parser: ArgumentParser) -> str:
    """Returns the directory holding the developer's API files, which
    is the directory they tell `rbt generate` to read them from.

    Everything the dashboard reads of the developer's project comes
    from `.rbtrc` and nowhere else: a pydantic API under
    `generate api/`, the application under `dev run --application=`,
    and the Python `rbt generate` writes under `generate --python=`.
    `rbt dashboard` runs apart from `rbt dev run` and `rbt generate`,
    so a flag given to either on the command line reaches nothing
    here; it has to be in `.rbtrc`.

    Taken from there rather than named again here, so that moving the
    API files is one edit and the dashboard cannot end up watching a
    directory the rest of the tooling has stopped using.
    """
    for argument in parser.dot_rc_arguments('generate'):
        # The directory is the one thing `rbt generate` takes that is
        # not a flag; its flags say where to put what it generates.
        if not argument.startswith('-'):
            return argument

    terminal.fail(
        'Could not tell where your API files are. `rbt dashboard` reads '
        f'that from the same place `rbt generate` does, so name a '
        f'directory for it in your {parser.dot_rc_filename}:\n'
        '\n'
        '    generate api/\n'
    )


def _application(parser: ArgumentParser) -> Optional[str]:
    """Returns the developer's application, which is the one they tell
    `rbt dev run` to run, and `None` when they tell it none.

    Read rather than asked for again, so that moving the application
    is one edit; a second place to name it is a second place to forget
    to change. `None` is what an application this cannot read looks
    like -- a Node.js one names no Python for the servicers to be in.
    """
    for argument in parser.dot_rc_arguments('dev run'):
        name, separator, value = argument.partition('=')
        if name == '--application' and separator == '=':
            return value

    return None


def _generated_directory(parser: ArgumentParser) -> Optional[str]:
    """Returns the directory `rbt generate` writes Python code into,
    which is where its `--python=` flag points, and `None` when it
    points nowhere.

    Read rather than asked for again, for the same reason as the
    application. `None` is what an application with no generated
    Python looks like, such as a Node.js one.
    """
    for argument in parser.dot_rc_arguments('generate'):
        name, separator, value = argument.partition('=')
        if name == '--python' and separator == '=':
            return value

    return None


def _dashboard_env(
    args,
    parser: ArgumentParser,
    *,
    port: int,
    token: str,
    api_directory: str,
    application: Optional[str],
    generated_directory: Optional[str],
) -> dict[str, str]:
    """The environment for the dashboard application, which serves on
    `port` for its gateway and requires `token` of every RPC.

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

    # Served with `rbt serve` defaults rather than `rbt dev` ones.
    # Popped rather than left unset, since `detect_run_environment`
    # reads `RBT_DEV` first.
    composed.pop(ENVVAR_RBT_DEV, None)
    composed[ENVVAR_RBT_SERVE] = 'true'

    # Also what `rbt serve` sets: `RBT_SERVE` alone is not enough to
    # produce a `rbt serve` environment.
    composed[ENVVAR_RBT_EFFECT_VALIDATION] = 'DISABLED'

    composed[ENVVAR_REBOOT_EXPECTED_VERSION] = REBOOT_VERSION
    composed[ENVVAR_REBOOT_LOCAL_ENVOY] = 'true'
    composed[ENVVAR_REBOOT_LOCAL_ENVOY_PORT] = str(port)

    # Only the gateway talks to the application, from this machine and
    # in plain HTTP; the gateway is what everything else reaches. Both
    # set rather than left to the ambient environment, where a
    # developer's export for their own application would otherwise
    # reach this one.
    composed[ENVVAR_LOCAL_ENVOY_PUBLIC_HOST] = '127.0.0.1'
    composed[ENVVAR_LOCAL_ENVOY_USE_TLS] = 'false'

    # What the gateway gives everything it forwards, and the
    # application requires of every RPC.
    composed[ENVVAR_RBT_DASHBOARD_TOKEN] = token

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

    # Where the developer's servicers are, spelled the same way and
    # for the same reason. Left out of the environment entirely when
    # the developer named no application, which is what tells the
    # dashboard there is nothing to look for.
    composed.pop(ENVVAR_RBT_APPLICATION, None)
    if application is not None:
        composed[ENVVAR_RBT_APPLICATION] = application

    # Where the developer's generated Python is, spelled the same way
    # and for the same reason. Left out when the developer named no
    # `--python` directory, which is what tells the dashboard there is
    # nothing to type the implementation with.
    composed.pop(ENVVAR_RBT_GENERATED_DIRECTORY, None)
    if generated_directory is not None:
        composed[ENVVAR_RBT_GENERATED_DIRECTORY] = generated_directory

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
            'reboot.dashboard.backend.main',
            env=env,
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


async def _serve(
    *,
    env: dict[str, str],
    port: int,
    subprocesses: Subprocesses,
) -> None:
    """Runs the dashboard application in `env`, opening a browser on
    the gateway at `port` once it serves."""
    open_task = asyncio.create_task(
        _open_when_serving(port=port),
        name=f'_open_when_serving(...) in {__name__}',
    )
    try:
        await _run_dashboard(
            env=env,
            state_directory=Path(env[ENVVAR_RBT_STATE_DIRECTORY]),
            subprocesses=subprocesses,
        )
    finally:
        open_task.cancel()
        with suppress(asyncio.CancelledError):
            await open_task


async def _open_when_serving(*, port: int) -> None:
    """Opens the dashboard once it is serving, unless somebody is
    already looking at one: the page subscribes to `Presence` for as
    long as it is open, so a tab left up keeps a second one from
    appearing, and a tab that was closed is replaced.

    Also stays shut when the developer clicked "Don't reopen
    automatically" in the notice an automatic open shows.
    """
    dashboard_url = f'http://127.0.0.1:{port}'
    # The root, which forwards to the page wherever it is served.
    page_url = f'{dashboard_url}/'

    try:
        backoff = Backoff()
        while not await _dashboard_reachable(port):
            await backoff()

        viewers: Optional[list[str]] = None
        while viewers is None:
            try:
                viewers = await _viewers(dashboard_url)
            except Exception:
                # Reachable means the proxy answers; the application
                # behind it comes up moments later.
                await backoff()

        if len(viewers) > 0:
            return

        if not await _open_on_restart(dashboard_url):
            return

        # `webbrowser` honors `$BROWSER`, which is what makes this
        # work in Codespaces and devcontainers, and returns `False`
        # rather than raising when there is no browser to open. The
        # page is told it was opened automatically, so it can offer
        # not to be, at the page's whole path rather than the root,
        # because Envoy's gRPC-JSON transcoder fails `/` with a query
        # (see `automatically_opened_url`).
        if not await asyncio.to_thread(
            webbrowser.open, automatically_opened_url(dashboard_url)
        ):
            terminal.warn(
                f"Could not open a browser; your dashboard is at {page_url}"
            )
    except Exception as e:
        # Never let this take down `rbt dashboard`; the dashboard is
        # still reachable by hand.
        terminal.warn(f"Could not open a dashboard ({e}); it is at {page_url}")


async def dashboard(
    args,
    parser: ArgumentParser,
) -> int:
    """Implementation of the 'dashboard' subcommand."""
    # The dashboard reads the application's `.feature` files with the
    # packages the `reboot[dev]` extra installs, which every
    # development environment has; without them it would show no
    # features and say why on each file, so it refuses instead.
    if not dev_extra_installed():
        terminal.fail(missing_dev_extra('`rbt dashboard` needs it'))

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

        # The port the developer knows is the gateway's; the
        # application serves on a free one behind it, which nothing but
        # the gateway is told. See `reboot/dashboard/gateway.py`.
        port = args.port or DEFAULT_DASHBOARD_PORT
        with socket.socket() as reservation:
            reservation.bind(('127.0.0.1', 0))
            backend_port = reservation.getsockname()[1]

        token = secrets.token_urlsafe(32)

        env = _dashboard_env(
            args,
            parser,
            port=backend_port,
            token=token,
            api_directory=_api_directory(parser),
            application=_application(parser),
            generated_directory=_generated_directory(parser),
        )

        async with AsyncExitStack() as stack:
            try:
                gateway = await stack.enter_async_context(
                    dashboard_gateway(
                        port=port,
                        backend_port=backend_port,
                        token=token,
                    )
                )
            except OSError as error:
                terminal.fail(
                    f'Could not serve the dashboard on port {port} ({error}); '
                    'is one running already?'
                )

            terminal.info(f'Your dashboard is at http://127.0.0.1:{port}/\n')

            # Without a tunnel the dashboard still serves, to this
            # machine; only an MCP host, whose App cannot reach this
            # machine, goes without. Said so, since the developer did
            # not ask for that.
            tunnel: Optional[DashboardTunnel] = None
            if args.tunnel:
                try:
                    tunnel = await stack.enter_async_context(
                        cloudflare_tunnel(gateway, subprocesses=subprocesses)
                    )
                except TunnelError as error:
                    terminal.warn(
                        f'{error}\n\n'
                        'Serving the dashboard without a tunnel, so an MCP '
                        'host cannot show it; pass `--no-tunnel` to skip '
                        'trying for one.\n'
                    )
                else:
                    terminal.info(
                        'Your dashboard is also an MCP App; give an MCP host '
                        f'http://127.0.0.1:{port}/mcp/\n'
                    )

            serving = _serve(env=env, port=port, subprocesses=subprocesses)
            try:
                if tunnel is None:
                    await serving
                else:
                    await tunnel.run(serving)
            except TunnelError as error:
                terminal.fail(str(error))

    return 0


async def handle_dashboard_subcommand(
    args: argparse.Namespace,
    *,
    parser: ArgumentParser,
) -> Optional[int]:
    if args.subcommand == 'dashboard':
        return await dashboard(args, parser)
    return None
