"""Pinned Hello Tasks public chains and missing-ID Pending/retry restart proof."""
from pathlib import Path
import hashlib
import json
import os
import re
import shutil
import subprocess
import tempfile
import time
import uuid
from rust_process_ownership import (RequestedShutdown, process_start, enable_subreaper, discover_owned, protected_owned_exit)
enable_subreaper()
owned = {}
import signal
import sys


def finalize_receipt(result, evidence, owned, stage, failure=None):
    def observe_final():
        if failure == 'receipt':
            raise OSError('injected final receipt write failure')
        result.write_text(json.dumps(evidence, indent=2))
        if failure == 'discover':
            raise OSError('injected preliminary ownership observation failure')
        discover_owned(owned, os.getpid())
    protected_owned_exit(owned, stage / 'retained-owners.json', observe_final, root_pid=os.getpid())
    evidence['live_owned_processes'] = list(discover_owned(owned, os.getpid()))
    evidence['owned_process_starttimes'] = dict(owned)
    evidence['passed'] = bool(evidence.get('checks_passed')) and not evidence['live_owned_processes']
    result.write_text(json.dumps(evidence, indent=2))


if len(sys.argv) > 1 and sys.argv[1] == '--ownership-failure-probe':
    import fcntl
    stage = Path(sys.argv[2])
    mode = sys.argv[3]
    with (stage / 'owner.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        # The immediate parent exits before sampling; the dedicated subreaper
        # must discover/reap the unsampled orphan, never kill another process.
        parent = subprocess.Popen([sys.executable, '-c',
            'import os,time,sys\npid=os.fork()\nif pid==0:\n while not os.path.exists(sys.argv[1]):time.sleep(.01)\nos._exit(0)',
            str(stage / 'release-child')])
        parent.wait(timeout=5)
        try:
            raise AssertionError('injected standalone harness failure')
        finally:
            finalize_receipt(stage / 'result.json', {'passed': False}, owned, stage, mode)
    raise AssertionError('unreachable acceptance')

ROOT = Path(__file__).resolve().parents[3]
SOURCE = ROOT / 'reboot/rust/tests/fixtures/reboot_examples'
SDK = ROOT / 'reboot/rust'
STAGE = Path(tempfile.mkdtemp(prefix='reboot-rust-upstream-tasks-'))
print('STAGE', STAGE, flush=True)
TARGET = Path(os.environ['CARGO_TARGET_DIR'])
RBT = Path('/tmp/reboot-rust-app-dx-loop2-venv310/bin/rbt')
APP = STAGE / 'examples/hello-tasks'
shutil.copytree(SOURCE / 'api', STAGE / 'examples/api')
shutil.copytree(SOURCE / 'hello-tasks', APP)
shutil.copytree(SOURCE / 'src', STAGE / 'examples/src')
cargo = APP / 'backend/Cargo.toml'
cargo.write_text(cargo.read_text().replace('"../../../../../"', json.dumps(str(SDK))))
build = APP / 'backend/build.rs'
build.write_text(build.read_text().replace('here.join("../../../../../../..")', 'std::path::PathBuf::from(' + json.dumps(str(ROOT)) + ')'))
ENV = dict(os.environ, RBT_RUST_DATABASE_BINARY='/home/openclaw/worktrees/reboot-rust-rich-errors/bazel-bin/reboot/server/database', RBT_RUST_URL='http://127.0.0.1:14991')
# Reboot UUIDv7 timestamp encodes expiry, not creation. One hour bounds this run;
# all client invocations share the exact prefix across both starts.
ENV['RBT_TEST_TASKS_KEY_BASE'] = str(uuid.UUID(int=(((time.time_ns() // 1_000_000) + 3_600_000) << 80) | (7 << 76) | (2 << 62)))
evidence = {'passed': False, 'sessions': [], 'commands': [], 'source_hashes': {str(p): hashlib.sha256(p.read_bytes()).hexdigest() for p in SOURCE.rglob('*') if p.is_file() and '.rbt' not in p.parts}}
RESULT = STAGE / 'result.json'
ENV['RBT_TEST_TASKS_EVIDENCE'] = str(STAGE)
ENV['RBT_TEST_TASKS_INVOCATIONS'] = str(STAGE / 'invocations.log')
pinned = json.loads((SOURCE / 'upstream.json').read_text())
assert pinned['revision'] == '5c332a2910122d6035799bfaf2a314bf1de830b8'
assert all(hashlib.sha256((SOURCE / entry['upstream_path']).read_bytes()).hexdigest() == entry['sha256'] for entry in pinned['files'])
freeze = [p for d in [SDK, ROOT / 'reboot/cli', ROOT / 'tests/reboot/cli'] for p in d.rglob('*') if p.is_file() and p.suffix != '.pyc' and not {'target', '__pycache__', '.rbt'}.intersection(p.parts)]
freeze += [Path(ENV['RBT_RUST_DATABASE_BINARY'])]
evidence['source_hashes'].update({str(p): hashlib.sha256(p.read_bytes()).hexdigest() for p in freeze})

def budget():
    size = int(subprocess.check_output(['du', '-sb', str(TARGET)]).split()[0])
    free = shutil.disk_usage('/tmp').free
    ceiling = int(os.environ.get('RUST_DX_TARGET_CEILING_BYTES', '10000000000'))
    assert ceiling > 0, ceiling
    assert size <= ceiling and free >= 8 * 1024**3, (size, free, ceiling)
    evidence.setdefault('budgets', []).append({'target_bytes': size, 'free_bytes': free, 'target_ceiling_bytes': ceiling})


timeout_seen = False

def command(*args):
    process = subprocess.Popen([str(x) for x in args], cwd=APP, env=ENV, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    global timeout_seen
    owned[str(process.pid)] = process_start(process.pid)
    try:
        stdout, stderr = process.communicate(timeout=240)
    except subprocess.TimeoutExpired:
        timeout_seen = True
        evidence['commands'].append({'argv': [str(x) for x in args], 'pid': process.pid, 'timeout': True, 'live': True})
        RESULT.write_text(json.dumps(evidence, indent=2))
        raise
    evidence['commands'].append({'argv': [str(x) for x in args], 'pid': process.pid, 'exit': process.returncode, 'stdout': stdout, 'stderr': stderr})
    RESULT.write_text(json.dumps(evidence, indent=2))
    assert process.returncode == 0, (stdout, stderr)
    print(stdout.strip(), flush=True)


def start(name):
    log_path = STAGE / (name + '.log')
    log = log_path.open('w')
    process = subprocess.Popen([str(RBT), 'dev', 'run', '--rust-allow-insecure-database', '--port=14991'], cwd=APP, env=ENV, stdout=log, stderr=subprocess.STDOUT)
    record = {'pid': process.pid, 'name': name, 'log': str(log_path), 'process_starttime': process_start(process.pid)}
    owned[str(process.pid)] = process_start(process.pid)
    evidence['sessions'].append(record)
    # CLI's documented signal exit is 128 + SIGTERM; direct HTTP hosts retain
    # the strict default of exit 0 in the shared helper.
    owner = RequestedShutdown(process, log, record, expected_exits=(0, 128 + signal.SIGTERM, -signal.SIGTERM))
    deadline = time.monotonic() + 240
    while time.monotonic() < deadline:
        text = log_path.read_text()
        assert process.poll() is None, text
        if 'SERVING (canonical gRPC health check)' in text:
            record['children'] = [int(x) for x in re.findall(r'Rust (?:Database|app) PID=(\d+)', text)]
            assert len(record['children']) == 2, text
            record['child_starttimes'] = {str(pid): process_start(pid) for pid in record['children']}
            assert all(record['child_starttimes'].values()), record
            owned.update(record['child_starttimes'])
            database_match = re.search(r'Rust Database PID=(\d+)', text)
            assert database_match is not None, text
            database_pid = int(database_match.group(1))
            database_args = Path(f'/proc/{database_pid}/cmdline').read_bytes().split(b'\0')
            ENV['RBT_TEST_DATABASE_URL'] = 'http://127.0.0.1:' + database_args[3].decode()
            record['rocksdb'] = database_args[1].decode()
            record['server_info'] = database_args[2].decode()
            return owner, record
        time.sleep(0.1)
    record['timeout'] = True
    RESULT.write_text(json.dumps(evidence, indent=2))
    raise TimeoutError('readiness; preserve exact owned processes: ' + json.dumps(record))


def stop(owner, record):
    owner.close()
    record['children_absent'] = all(process_start(pid) != start for pid, start in record['child_starttimes'].items())
    assert record['children_absent'], record
    RESULT.write_text(json.dumps(evidence, indent=2))

def inspect_shutdown(record, client, inspection_command):
    # Reopen only the CLI-owned durable directory, with no application running.
    # This proves Pending at shutdown, not merely "we restarted and it passed".
    import socket
    with socket.socket() as listener:
        listener.bind(('127.0.0.1', 0))
        database_port = listener.getsockname()[1]
    log = (STAGE / f'{inspection_command}-database.log').open('w')
    database = subprocess.Popen([ENV['RBT_RUST_DATABASE_BINARY'], record['rocksdb'], record['server_info'], str(database_port)], stdout=log, stderr=subprocess.STDOUT)
    inspection = {'pid': database.pid, 'process_starttime': process_start(database.pid)}
    evidence.setdefault('shutdown_inspections', []).append(inspection)
    owned[str(database.pid)] = process_start(database.pid)
    inspection_owner = RequestedShutdown(database, log, inspection, expected_exits=(0, -signal.SIGTERM))
    ENV['RBT_TEST_DATABASE_URL'] = f'http://127.0.0.1:{database_port}'
    try:
        deadline = time.monotonic() + 10
        while True:
            assert database.poll() is None, (STAGE / f'{inspection_command}-database.log').read_text()
            try:
                with socket.create_connection(('127.0.0.1', database_port), timeout=.2):
                    break
            except OSError:
                assert time.monotonic() < deadline, 'inspection Database startup timeout'
                time.sleep(.05)
        command(client, inspection_command)
        if inspection_command == 'inspect-pending':
            assert (STAGE / 'pending-warning.pb').read_bytes() == (STAGE / 'shutdown-pending-warning.pb').read_bytes()
            evidence['pending_at_shutdown_exact'] = True
        else:
            for i, name in enumerate(['warning', 'erase']):
                assert (STAGE / f'missing-{name}.pb').read_bytes() == (STAGE / f'shutdown-missing-{i}.pb').read_bytes()
            evidence['missing_pending_at_shutdown_exact'] = True
    finally:
        if not timeout_seen:
            inspection_owner.close()
            inspection['process_absent'] = process_start(database.pid) != owned[str(database.pid)]
            assert inspection['process_absent']

# Cargo generation is driven by actual public rbt dev run; no prebuilt host substitute.
try:
    budget()
    owner, record = start('initial')
    client = TARGET / 'debug/client'
    try:
        command(client, 'scenario')
        command(client, 'seed')
    finally:
        if not timeout_seen:
            stop(owner, record)
    budget()
    inspect_shutdown(record, client, 'inspect-pending')
    owner, record = start('restart')
    try:
        command(client, 'recover')
        command(client, 'verify')
        command(client, 'missing-seed')
    finally:
        if not timeout_seen:
            stop(owner, record)
    inspect_shutdown(record, client, 'inspect-missing')
    owner, record = start('missing-restart')
    try:
        command(client, 'missing-recover')
    finally:
        if not timeout_seen:
            stop(owner, record)
    command('cargo', 'clippy', '--manifest-path', 'backend/Cargo.toml', '--locked', '--all-targets', '--', '-D', 'warnings')
    budget()
    counts = {method: sum(line.startswith(method + ' ') for line in (STAGE / 'invocations.log').read_text().splitlines()) for method in ['Send', 'WarningBefore', 'WarningAfter', 'Erase']}
    assert counts == {'Send': 4, 'WarningBefore': 5, 'WarningAfter': 5, 'Erase': 4}, counts
    evidence['invocation_counts'] = counts
    assert len({session['rocksdb'] for session in evidence['sessions']}) == 1
    assert all(hashlib.sha256(Path(p).read_bytes()).hexdigest() == h for p, h in evidence['source_hashes'].items())
    # Explicit assertion markers are checked by the aggregate, not only exit status.
    output = '\n'.join(c['stdout'] for c in evidence['commands'])
    for marker in ['TYPED_WAIT_CHAIN_ACCEPTED scenario', 'PENDING_BEFORE_SHUTDOWN', 'PENDING_AT_SHUTDOWN_EXACT', 'TYPED_WAIT_CHAIN_ACCEPTED recover', 'SAME_KEY_COMPLETED_NO_RESURRECTION', 'FAITHFUL_PUBLIC_SEND_USABLE_DURING_MISSING_RETRY', 'MISSING_IDS_PENDING_AT_SHUTDOWN_EXACT', 'MISSING_IDS_PUBLIC_PENDING_RETRY_ACCEPTED missing-seed', 'MISSING_IDS_PUBLIC_PENDING_RETRY_ACCEPTED missing-recover']:
        assert marker in output, marker
    evidence['checks_passed'] = True
finally:
    finalize_receipt(RESULT, evidence, owned, STAGE)
assert evidence['passed'] and not evidence['live_owned_processes']
print('UPSTREAM_TASKS_ACCEPTED', RESULT, flush=True)
