"""Native hello application proof with original-process exact-child custody.

Requires HELLO_NATIVE_EVIDENCE, HELLO_APP_BIN, HELLO_CLIENT_BIN,
HELLO_NATIVE_TEST_BIN, REBOOT_NATIVE2PC_CXX_DATABASE. No builds or installs.
"""
from pathlib import Path
import fcntl
import hashlib
import json
import os
import signal
import socket
import sys
import time
import traceback

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[5]
sys.path.insert(0, str(ROOT / 'tests/reboot/cli'))
sys.path.insert(0, str(ROOT / 'reboot/rust/tests/fixtures/workflow_cursor_results_app'))
from rust_process_ownership import enable_subreaper, protected_owned_exit
import cursor_custody as custody


def main():
    assert __debug__
    stage = Path(os.environ['HELLO_NATIVE_EVIDENCE'])
    stage.mkdir(exist_ok=False)
    lock = (stage / 'owner.lock').open('x')
    fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    report = {'pid': os.getpid(), 'complete': False, 'scope': 'native Rust only; debug binary; no Docker or shared Python proof'}
    result = stage / 'owner.json'
    def save(): result.write_text(json.dumps(report, indent=2) + '\n')
    def sha(path): return hashlib.sha256(Path(path).read_bytes()).hexdigest()
    def cancel(sig, frame):
        custody._owner.cancellation = f'owner received signal {sig}'
        custody._owner.failure = custody._owner.failure or custody._owner.cancellation
    for sig in (signal.SIGTERM, signal.SIGINT): signal.signal(sig, cancel)
    enable_subreaper()
    custody._owner.active_gate = True
    app, client, test, database = [Path(os.environ[k]).resolve(strict=True) for k in ('HELLO_APP_BIN', 'HELLO_CLIENT_BIN', 'HELLO_NATIVE_TEST_BIN', 'REBOOT_NATIVE2PC_CXX_DATABASE')]
    sources = [p for p in (ROOT / 'reboot/rust').rglob('*') if p.is_file() and p.suffix in ('.rs', '.py', '.proto', '.toml', '.lock') and not {'target', '__pycache__'}.intersection(p.parts)]
    frozen = sorted(set(sources + [app, client, test, database, ROOT / 'tests/reboot/cli/rust_process_ownership.py']))
    report['source_hashes'] = {str(p): sha(p) for p in frozen}
    report['revision'] = custody.run(['git', '-C', ROOT, 'rev-parse', 'HEAD']).stdout.strip()
    report['artifact_hashes'] = {str(p): sha(p) for p in (app, client, test, database)}
    report['interruption_boundary'] = 'test-only generated service wrapper parks Send after real durable Create ACK; same production Startup lifecycle and native adapter, no fake'
    save()
    sockets = []
    def reserve():
        sock = socket.socket(); sock.bind(('127.0.0.1', 0)); sockets.append(sock); return sock.getsockname()[1]
    dbport, appport = reserve(), reserve()
    os.environ.update(RBT_NAME='hello-native-application', RBT_RUST_DATABASE_URL=f'http://127.0.0.1:{dbport}', RBT_RUST_LISTEN_ADDR=f'127.0.0.1:{appport}', RBT_RUST_URL=f'http://127.0.0.1:{appport}', HELLO_NATIVE_AFTER_CREATE_MARKER=str(stage / 'after-create'))
    import uuid
    os.environ['RBT_TEST_CONSTRUCTOR_KEY_BASE'] = str(uuid.uuid5(uuid.NAMESPACE_URL, str(stage)))
    # Existing client uses bounded UUIDv7; native test accepts the same key base.
    os.environ['RBT_TEST_CONSTRUCTOR_KEY_BASE'] = str(uuid.UUID(int=(((time.time_ns() // 1_000_000) + 3_600_000) << 80) | (7 << 76) | (2 << 62)))
    os.environ.pop('RBT_RUST_UNAUTHORIZED_DEVELOPMENT', None)
    report['environment'] = {k: v for k, v in os.environ.items() if k.startswith(('RBT_', 'HELLO_NATIVE_AFTER'))}
    handles = []
    def spawn(args, name):
        log = (stage / f'{name}.log').open('x'); handles.append(log)
        child = custody.spawn(args, stdout=log, stderr=log); save(); return child
    def command(args, name):
        child = spawn(args, name).join(30)
        assert child.returncode == 0, (name, child.returncode)
    def wait_port(child, port):
        deadline = time.monotonic() + 20
        while time.monotonic() < deadline:
            child.require_owned_alive()
            try:
                with socket.create_connection(('127.0.0.1', port), .1): return
            except OSError: time.sleep(.03)
        raise TimeoutError('listener not ready')
    def start_database(name):
        db = spawn([database, stage / 'rocksdb', stage / 'server-info.pb', str(dbport)], name)
        wait_port(db, dbport); return db
    def start_app(name):
        child = spawn([app], name); wait_port(child, appport)
        command([client, 'health'], name + '-health'); return child
    try:
        command([app, '--server-info', stage / 'server-info.pb'], 'server-info')
        for sock in sockets: sock.close()
        db = start_database('database-1')
        parked = spawn([test, '--ignored', '--exact', 'native_park_initializer_after_create', '--nocapture'], 'interrupted-initializer')
        deadline = time.monotonic() + 20
        while not (stage / 'after-create').exists():
            parked.require_owned_alive()
            if time.monotonic() > deadline: raise TimeoutError('missing durable Create marker')
            time.sleep(.03)
        try:
            with socket.create_connection(('127.0.0.1', appport), .1): raise AssertionError('initializer advertised listener before Send')
        except OSError: pass
        signal.pidfd_send_signal(parked.fd, signal.SIGKILL)
        parked.join(15); assert parked.returncode == -signal.SIGKILL
        db.retire(); assert db.returncode == 0
        # Full native process restart, same RocksDB path and server-info bytes.
        db = start_database('database-2')
        live = start_app('app-recovery')
        os.environ['HELLO_NATIVE_FRESH'] = '1'
        command([test, '--ignored', '--exact', 'native_public_contract', '--nocapture'], 'public-fresh')
        os.environ.pop('HELLO_NATIVE_FRESH')
        live.retire(); assert live.returncode == 0
        live = start_app('app-only-restart')
        command([test, '--ignored', '--exact', 'native_public_contract', '--nocapture'], 'public-app-replay')
        live.retire(); assert live.returncode == 0
        db.retire(); assert db.returncode == 0
        db = start_database('database-3')
        live = start_app('app-full-restart')
        command([test, '--ignored', '--exact', 'native_public_contract', '--nocapture'], 'public-full-replay')
        live.retire(); assert live.returncode == 0
        db.retire(); assert db.returncode == 0
        for child in custody.children: child.assert_joined()
        assert not custody._owner.failure
        assert all(sha(p) == digest for p, digest in report['source_hashes'].items())
        report['body_passed'] = True
    except BaseException as error:
        report.update(failure=repr(error), traceback=traceback.format_exc()); save(); raise
    finally:
        try:
            protected_owned_exit(custody._owner.owned, stage / 'retained-owners.json', save, root_pid=os.getpid())
            report['complete'] = bool(report.get('body_passed') and not custody._owner.failure and all(c.joined_exact and c.failure is None for c in custody.children))
        finally:
            report['children'] = [c.row for c in custody.children]
            report['custody_failure'] = custody._owner.failure
            save(); lock.close()
            for handle in handles: handle.close()
    assert report['complete']
    print('HELLO_NATIVE_APPLICATION_ACCEPTED', result, flush=True)

if __name__ == '__main__': main()
