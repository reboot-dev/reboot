"""Experimental single-host Rust development runtime, without Python/Envoy bootstrap.

Cargo-native generated apps expose app --server-info and client health. Only
our own subprocess groups are signalled/reaped; the Database persists across
source rebuilds and reopens the same RocksDB directory across command runs.
"""
import asyncio
from contextlib import asynccontextmanager
import glob
from functools import wraps
import hashlib
import json
import os
from pathlib import Path
import signal
import socket
from typing import Callable


class RustDevError(RuntimeError):
    pass


async def stop_process(process: asyncio.subprocess.Process) -> None:
    # The session/group belongs to us even when its leader exited first.
    # Never discover or signal another application's processes.
    try:
        os.killpg(process.pid, signal.SIGTERM)
    except ProcessLookupError:
        pass
    try:
        await asyncio.wait_for(process.wait(), timeout=5)
    except asyncio.TimeoutError:
        pass
    try:
        os.killpg(process.pid, signal.SIGKILL)
    except ProcessLookupError:
        pass
    await process.wait()
    # On Linux the CLI is a subreaper. Reap any adopted descendants of this
    # owned process group; asyncio retains ownership of direct child waits.
    for _ in range(100):
        try:
            pid, _ = os.waitpid(-process.pid, os.WNOHANG)
        except ChildProcessError:
            break
        if pid == 0:
            await asyncio.sleep(0.01)


@asynccontextmanager
async def owned_process(*command: str, **kwargs):
    process = await asyncio.create_subprocess_exec(*command, start_new_session=True, **kwargs)
    try:
        yield process
    finally:
        await stop_process(process)


async def checked_command(*command: str, **kwargs) -> bytes:
    async with owned_process(*command, stdout=asyncio.subprocess.PIPE, **kwargs) as process:
        output, _ = await process.communicate()
        if process.returncode:
            raise RustDevError(f"Command exited {process.returncode}: {list(command)}")
        return output


def snapshot(patterns: list[str]) -> dict[str, str]:
    result = {}
    for pattern in patterns:
        for filename in glob.iglob(pattern, recursive=True):
            path = Path(filename)
            if path.is_file():
                try:
                    result[str(path)] = hashlib.sha256(path.read_bytes()).hexdigest()
                except FileNotFoundError:
                    pass  # A save may replace the watched path atomically.
    return result


async def wait_for_change(patterns: list[str], previous: dict[str, str]) -> None:
    while snapshot(patterns) == previous:
        await asyncio.sleep(0.25)


async def build_rust_app(manifest: Path, cwd: str, env: dict[str, str], watch: list[str]) -> dict[str, str]:
    # Cargo may consume an input and then keep building while it is edited.
    # Retain the pre-build snapshot so the serving watcher observes that edit
    # and schedules another build, rather than treating it as already built.
    baseline = snapshot(watch)
    await checked_command('cargo', 'build', '--bins', '--manifest-path', str(manifest), cwd=cwd, env=env)
    return baseline


async def wait_for_port(process: asyncio.subprocess.Process, port: int) -> None:
    for _ in range(100):
        if process.returncode is not None:
            raise RustDevError(f"Rust Database exited {process.returncode} during startup")
        try:
            _, writer = await asyncio.open_connection('127.0.0.1', port)
            writer.close()
            await writer.wait_closed()
            return
        except OSError:
            await asyncio.sleep(0.05)
    raise RustDevError('Rust Database startup timed out; inspect database.log')


async def wait_for_health(host, database, client: Path, env: dict[str, str]) -> None:
    # Read-only canonical health check, never retry a tested mutation.
    for _ in range(60):
        for label, process in [('host', host), ('Database', database)]:
            if process.returncode is not None:
                raise RustDevError(f'Rust {label} exited {process.returncode} during startup')
        async with owned_process(str(client), 'health', env=env,
                                 stdout=asyncio.subprocess.DEVNULL,
                                 stderr=asyncio.subprocess.DEVNULL) as probe:
            try:
                code = await asyncio.wait_for(probe.wait(), timeout=3)
            except asyncio.TimeoutError:
                code = -1
            if code == 0:
                return
        await asyncio.sleep(0.1)
    raise RustDevError('Rust gRPC health check timed out; inspect host.log')


def cancel_on_terminal_signal(operation):
    @wraps(operation)
    async def run(*args, **kwargs):
        loop = asyncio.get_running_loop()
        task = asyncio.current_task()
        assert task is not None  # This wrapper always runs inside an asyncio task.
        received = None
        def cancel(signum, _frame):
            nonlocal received
            if received is None:
                received = signum
                loop.call_soon_threadsafe(task.cancel)
        previous = {sig: signal.getsignal(sig) for sig in (signal.SIGTERM, signal.SIGINT)}
        try:
            for sig in previous:
                signal.signal(sig, cancel)
            try:
                return await operation(*args, **kwargs)
            except asyncio.CancelledError:
                if received is None:
                    raise
                return 128 + received
        finally:
            for sig, handler in previous.items():
                signal.signal(sig, handler)
    return run


@cancel_on_terminal_signal
async def run_rust_dev(*, manifest: Path, database_binary: Path, state: Path,
                       application_name: str, port: int = 9990,
                       watch: list[str] | None = None,
                       env: dict[str, str] | None = None,
                       terminate_after_health_check: bool = False,
                       allow_insecure_database: bool = False,
                       report: Callable[[str], None] = print) -> int:
    manifest = manifest.resolve()
    database_binary = database_binary.resolve()
    state = state.resolve()
    if not manifest.is_file() or manifest.name != 'Cargo.toml':
        raise RustDevError('--application must name a Rust Cargo.toml')
    if not database_binary.is_file() or not os.access(database_binary, os.X_OK):
        raise RustDevError('Set RBT_RUST_DATABASE_BINARY to the compatible C++ Database executable')
    if not allow_insecure_database:
        raise RustDevError('The C++ Database binds 0.0.0.0 without authentication. '
                           'Use an isolated trusted development network and explicitly pass '
                           '--rust-allow-insecure-database to opt in; not for production/cloud.')
    report('WARNING: raw C++ Database listens on ALL interfaces without authentication; '
           'use only an isolated trusted development network. Rust public host remains loopback.')
    if not application_name or not 1 <= port <= 65535:
        raise RustDevError('Rust dev requires an application name and a valid TCP port')
    environment = dict(os.environ if env is None else env)
    environment['RBT_NAME'] = application_name
    environment['RBT_RUST_LISTEN_ADDR'] = f'127.0.0.1:{port}'
    environment['RBT_RUST_URL'] = f'http://127.0.0.1:{port}'
    cwd = str(manifest.parent)
    metadata = json.loads(await checked_command('cargo', 'metadata', '--no-deps', '--format-version=1',
                                                '--manifest-path', str(manifest), cwd=cwd, env=environment))
    package = next((p for p in metadata['packages'] if Path(p['manifest_path']).resolve() == manifest), None)
    names = {t['name'] for t in package['targets'] if 'bin' in t['kind']} if package else set()
    if not {'app', 'client'} <= names:
        raise RustDevError("Rust dev requires Cargo binaries 'app' and 'client' (see rbt init --backend=rust)")
    target = Path(metadata['target_directory']) / 'debug'
    host_binary, client = target / 'app', target / 'client'
    state.mkdir(parents=True, exist_ok=True)
    # Advisory lock held for the entire session: two dev commands must never
    # open one RocksDB directory or replace its immutable shard identity.
    import fcntl
    with (state / 'dev.lock').open('a') as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as error:
            raise RustDevError(f'Rust dev state already in use: {state}') from error
        baseline = await build_rust_app(manifest, cwd, environment, watch or [])
        await checked_command(str(host_binary), '--server-info', str(state / 'server-info.pb'), env=environment)
        # Allocate sidecar listener outside the outbound ephemeral range when
        # possible. This avoids startup connect claiming a released listener.
        database_port = None
        for candidate in range(20000, 30000):
            if candidate == port:
                continue
            with socket.socket() as listener:
                try:
                    listener.bind(('127.0.0.1', candidate))
                except OSError:
                    continue
                database_port = candidate
                break
        if database_port is None:
            raise RustDevError('No free Rust development Database port')
        environment['RBT_RUST_DATABASE_URL'] = f'http://127.0.0.1:{database_port}'
        with (state / 'database.log').open('ab') as database_log, (state / 'host.log').open('ab') as host_log:
            async with owned_process(str(database_binary), str(state / 'rocksdb'),
                                     str(state / 'server-info.pb'), str(database_port),
                                     stdout=database_log, stderr=database_log, env=environment) as database:
                report(f'Rust Database PID={database.pid}, durable state={state / "rocksdb"}')
                await wait_for_port(database, database_port)
                while True:
                    async with owned_process(str(host_binary), env=environment,
                                             stdout=host_log, stderr=host_log) as host:
                        report(f'Rust app PID={host.pid}, endpoint={environment["RBT_RUST_URL"]}')
                        await wait_for_health(host, database, client, environment)
                        report('Rust app SERVING (canonical gRPC health check)')
                        if terminate_after_health_check:
                            return 0
                        host_wait = asyncio.create_task(host.wait())
                        database_wait = asyncio.create_task(database.wait())
                        change = asyncio.create_task(wait_for_change(watch, baseline)) if watch else None
                        tasks = [host_wait, database_wait] + ([change] if change else [])
                        try:
                            done, _ = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
                            if database_wait in done:
                                raise RustDevError(f'Rust Database exited {database.returncode}; inspect database.log')
                            if host_wait in done:
                                raise RustDevError(f'Rust app exited {host.returncode}; inspect host.log')
                        finally:
                            for task in tasks:
                                task.cancel()
                            await asyncio.gather(*tasks, return_exceptions=True)
                    report('Rust sources changed; rebuilding host (Database retained)')
                    baseline = await build_rust_app(manifest, cwd, environment, watch or [])


def validate_rust_args(args) -> None:
    unsupported = []
    for flag in ['python', 'nodejs', 'chaos', 'generate_watch', 'open_dashboard',
                 'frontend_host', 'frontend_dist_path', 'frontend_root_path',
                 'tls_certificate', 'tls_key', 'tls_root_certificate', 'transpile', 'background_command']:
        if getattr(args, flag, None):
            unsupported.append('--' + flag.replace('_', '-'))
    if getattr(args, 'servers', 1) != 1:
        unsupported.append('--servers (only 1 is supported)')
    if getattr(args, 'tracing', 'none') != 'none':
        unsupported.append('--tracing')
    if getattr(args, 'effect_validation', 'quiet') != 'quiet':
        unsupported.append('--effect-validation')
    if unsupported:
        raise RustDevError('Rust direct gRPC mode does not support: ' + ', '.join(unsupported))
