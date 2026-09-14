"""The `rbt dashboard` command, which runs the developer dashboard."""
import argparse
import asyncio
import fcntl
import json
import os
import secrets
import shutil
import sys
import time
import webbrowser
from dataclasses import dataclass
from pathlib import Path
from reboot.aio.backoff import Backoff
from reboot.cli.commands.dev import (
    _dashboard_reachable,
    _open_on_restart,
    _viewers,
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
    DASHBOARD_PATH,
    DEFAULT_DASHBOARD_PORT,
    ENVVAR_RBT_API_DIRECTORY,
    ENVVAR_RBT_APPLICATION,
    ENVVAR_RBT_GENERATED_DIRECTORY,
)
from reboot.settings import (
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
from typing import NoReturn, Optional

# The dashboard application's name, which names its state directory
# under `.rbt/`. A sibling of `.rbt/dev/` rather than inside it, so
# that it can never collide with a developer's application, whose
# state lives at `.rbt/dev/<application-name>/`.
DASHBOARD_STATE_DIRECTORY_NAME = 'dashboard'

# The file an `rbt dashboard` holds an exclusive advisory lock on for
# as long as it runs, in the dashboard's state directory, with the
# holder's process id and port inside. The operating system releases
# the lock however the holder ends, so the file outliving a dashboard
# never makes it look like one is still running.
LOCK_FILE_NAME = 'rbt-dashboard.lock'

# How long the holder of the lock gets to write its record before a
# reader concludes that it never will.
_LOCK_RECORD_TIMEOUT_SECONDS = 2.0

# How long a second `rbt dashboard` waits for the one already running
# to answer before giving up on opening it.
_REUSE_TIMEOUT_SECONDS = 15.0


@dataclass(frozen=True)
class RunningDashboard:
    """An `rbt dashboard` that holds the lock on a state directory."""
    pid: int
    port: int


class DashboardLock:
    """The exclusive advisory lock on a dashboard state directory, so
    that at most one `rbt dashboard` runs on it at a time. A second one
    would fail to open the same RocksDB, and the restart loop's answer
    to a failed start is to delete the state directory, out from under
    the first; its Envoy would also share the first's port, and answer
    for a backend that never came up.

    The lock belongs to the open file, so a dashboard application
    that inherits `fd` holds it too, and keeps holding it if the
    `rbt dashboard` that started it dies without stopping it.
    """

    def __init__(self, state_directory: Path):
        self._path = state_directory / LOCK_FILE_NAME
        self._fd: Optional[int] = None

    def acquire(self, *, port: int) -> Optional[RunningDashboard]:
        """Takes the lock for this process, recording its process id
        and `port`, or returns the dashboard that holds it. A process
        that holds the lock keeps it."""
        if self._fd is not None:
            return None
        self._path.parent.mkdir(parents=True, exist_ok=True)
        fd = os.open(self._path, os.O_RDWR | os.O_CREAT, 0o644)
        try:
            fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError:
            try:
                return _holder(fd)
            finally:
                os.close(fd)
        os.ftruncate(fd, 0)
        os.write(fd, json.dumps({'pid': os.getpid(), 'port': port}).encode())
        self._fd = fd
        return None

    @property
    def fd(self) -> int:
        """The locked file's descriptor, for a child to inherit."""
        assert self._fd is not None, 'The lock is not held'
        return self._fd

    def release(self) -> None:
        """Releases the lock. The file stays: a process that opened it
        just before it was removed would lock an orphaned inode while a
        later one locks a fresh file, and the two would never see each
        other."""
        if self._fd is not None:
            os.close(self._fd)
            self._fd = None


def _holder(fd: int) -> RunningDashboard:
    """The record the holder of the lock on `fd` wrote. It writes the
    record right after taking the lock, so a reader that arrives in
    between waits briefly for it."""
    deadline = time.monotonic() + _LOCK_RECORD_TIMEOUT_SECONDS
    while True:
        os.lseek(fd, 0, os.SEEK_SET)
        try:
            record = json.loads(os.read(fd, 4096))
            return RunningDashboard(
                pid=int(record['pid']), port=int(record['port'])
            )
        except (ValueError, KeyError, TypeError):
            if time.monotonic() >= deadline:
                terminal.fail(
                    'Another `rbt dashboard` is starting for this project; '
                    'try again in a moment.'
                )
            time.sleep(0.05)


def _alive(pid: int) -> bool:
    """Whether a process with `pid` exists."""
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    except PermissionError:
        return True
    return True


def _fail_for_orphaned_dashboard(running: RunningDashboard) -> NoReturn:
    """Refuses to start over a dashboard application whose
    `rbt dashboard` is gone: it still holds the state, and a start
    that failed on it would delete that state out from under it."""
    terminal.fail(
        f'The `rbt dashboard` that ran this project\'s dashboard (process '
        f'{running.pid}) is gone, but the dashboard application it started '
        f'is still running and holds the dashboard\'s state, so a new one '
        f'cannot start. Stop it (`lsof {LOCK_FILE_NAME}` in the '
        f'`.rbt/{DASHBOARD_STATE_DIRECTORY_NAME}/` directory names it, and '
        f'so does `lsof -i :{running.port}` while it still answers there), '
        'then run `rbt dashboard` again.'
    )


async def _reuse_running_dashboard(
    running: RunningDashboard,
    *,
    requested_port: int,
) -> int:
    """What `rbt dashboard` does when a dashboard is already running for
    the project: says where it is and opens it, the way starting one
    would have, and leaves it running."""
    page_url = f'http://127.0.0.1:{running.port}{DASHBOARD_PATH}/'
    on_port = (
        '' if requested_port == running.port else
        f', on port {running.port} rather than {requested_port}'
    )
    terminal.info(
        f'A dashboard is already running for this project (process '
        f'{running.pid}{on_port}); it is at {page_url}\n'
    )
    try:
        await asyncio.wait_for(
            _open_when_serving(port=running.port),
            timeout=_REUSE_TIMEOUT_SECONDS,
        )
    except asyncio.TimeoutError:
        terminal.warn(
            f'It is not answering yet; if it never does, stop process '
            f'{running.pid} and run `rbt dashboard` again.'
        )
    return 0


async def _fail_if_port_taken(port: int) -> None:
    """Refuses to start on a port something else is already serving
    on, since two servers on it would each answer some of the
    requests."""
    if await _dashboard_reachable(port):
        terminal.fail(
            f'Port {port} is already in use, and not by an `rbt dashboard` '
            'for this project, which would have been reused. A dashboard '
            'for another project, or an Envoy left over from a dashboard '
            'that did not exit cleanly, are the usual causes: stop '
            f'whatever is listening on the port (`lsof -i :{port}` names '
            'it), or pass `--port` to use another one.'
        )


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
    api_directory: str,
    application: Optional[str],
    generated_directory: Optional[str],
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
    lock: DashboardLock,
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
            # The application holds the lock too, so that one left
            # behind by an `rbt dashboard` that died without stopping
            # it is found rather than started over.
            pass_fds=(lock.fd,),
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


async def _open_when_serving(*, port: int) -> None:
    """Opens the dashboard once it is serving, unless somebody is
    already looking at one: the page subscribes to `Presence` for as
    long as it is open, so a tab left up keeps a second one from
    appearing, and a tab that was closed is replaced.

    Also stays shut when the developer clicked "Don't reopen
    automatically" in the notice an automatic open shows.
    """
    dashboard_url = f'http://127.0.0.1:{port}'
    page_url = f'{dashboard_url}{DASHBOARD_PATH}/'

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
        # not to be.
        if not await asyncio.to_thread(
            webbrowser.open, f'{page_url}?opened=automatically'
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

        port = args.port or DEFAULT_DASHBOARD_PORT

        # One `rbt dashboard` per project at a time; a second one
        # points at the first rather than fighting it for its state
        # and its port.
        lock = DashboardLock(
            dot_rbt_directory(args, parser) / DASHBOARD_STATE_DIRECTORY_NAME
        )
        running = lock.acquire(port=port)
        if running is not None:
            if not _alive(running.pid):
                _fail_for_orphaned_dashboard(running)
            return await _reuse_running_dashboard(
                running, requested_port=port
            )

        try:
            await _fail_if_port_taken(port)

            subprocesses = Subprocesses()

            # Pick the mode in which we'll run a local Envoy proxy and
            # check that the mode is usable, e.g. that Docker is
            # running and can access the Envoy proxy image, or that
            # the `envoy` executable runs. Fail otherwise.
            await check_local_envoy_mode(subprocesses)

            env = _dashboard_env(
                args,
                parser,
                port=port,
                api_directory=_api_directory(parser),
                application=_application(parser),
                generated_directory=_generated_directory(parser),
            )

            terminal.info(
                'Your dashboard is at '
                f'http://127.0.0.1:{port}{DASHBOARD_PATH}/\n'
            )

            open_task = asyncio.create_task(
                _open_when_serving(port=port),
                name=f'_open_when_serving(...) in {__name__}',
            )

            try:
                await _run_dashboard(
                    env=env,
                    state_directory=Path(env[ENVVAR_RBT_STATE_DIRECTORY]),
                    subprocesses=subprocesses,
                    lock=lock,
                )
            finally:
                open_task.cancel()
        finally:
            lock.release()

    return 0


async def handle_dashboard_subcommand(
    args: argparse.Namespace,
    *,
    parser: ArgumentParser,
) -> Optional[int]:
    if args.subcommand == 'dashboard':
        return await dashboard(args, parser)
    return None
