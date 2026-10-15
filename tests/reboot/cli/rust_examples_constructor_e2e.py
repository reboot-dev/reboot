"""Pinned upstream constructor sample: public Rust CLI and persisted restart."""
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
from rust_process_ownership import RequestedShutdown, process_start
import signal
from rust_examples_runtime import select_runtime, record_runtime_launch

ROOT = Path(__file__).resolve().parents[3]
SOURCE = ROOT / 'reboot/rust/tests/fixtures/reboot_examples'
SDK = ROOT / 'reboot/rust'
RBT, ENV, runtime = select_runtime(os.environ)
STAGE = Path(tempfile.mkdtemp(prefix='reboot-rust-upstream-constructors-'))
print('STAGE', STAGE, flush=True)
TARGET = Path(os.environ['CARGO_TARGET_DIR'])

APP = STAGE / 'examples/hello-constructors'
shutil.copytree(SOURCE / 'api', STAGE / 'examples/api', copy_function=shutil.copyfile)
shutil.copytree(SOURCE / 'hello-constructors', APP, copy_function=shutil.copyfile)
cargo = APP / 'backend/Cargo.toml'
cargo.write_text(cargo.read_text().replace('"../../../../../"', json.dumps(str(SDK))))
build = APP / 'backend/build.rs'
build.write_text(build.read_text().replace('here.join("../../../../../../..")', 'std::path::PathBuf::from(' + json.dumps(str(ROOT)) + ')'))
ENV['RBT_RUST_URL'] = 'http://127.0.0.1:13991'
# Reboot UUIDv7 timestamp encodes expiry, not creation. One hour bounds this run;
# all client invocations share the exact prefix across both starts.
ENV['RBT_TEST_CONSTRUCTOR_KEY_BASE'] = str(uuid.UUID(int=(((time.time_ns() // 1_000_000) + 3_600_000) << 80) | (7 << 76) | (2 << 62)))
evidence = {'passed': False, 'sessions': [], 'commands': [], 'source_hashes': {str(p): hashlib.sha256(p.read_bytes()).hexdigest() for p in SOURCE.rglob('*') if p.is_file() and '.rbt' not in p.parts}}
RESULT = STAGE / 'result.json'
evidence['runtime'] = runtime
RESULT.write_text(json.dumps(evidence, indent=2))
timeout_seen = False

def command(*args):
    process = subprocess.Popen([str(x) for x in args], cwd=APP, env=ENV, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    global timeout_seen
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
    record_runtime_launch(RESULT, evidence, ENV, RBT, name)
    log_path = STAGE / (name + '.log')
    log = log_path.open('w')
    process = subprocess.Popen([str(RBT), 'dev', 'run', '--rust-allow-insecure-database', '--port=13991'], cwd=APP, env=ENV, stdout=log, stderr=subprocess.STDOUT)
    record = {'pid': process.pid, 'name': name, 'log': str(log_path)}
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

# Generated Rust clients drive the public application listener, never internal stores.
command('cargo', 'build', '--manifest-path', 'backend/Cargo.toml', '--locked', '--bins')
client = TARGET / 'debug/client'
owner, record = start('initial')
try:
    command(client, 'missing', 'absent-hello')
    command(client, 'initialize', 'reboot-hello')
    command(client, 'scenario', 'testing-hello')
finally:
    if not timeout_seen:
        stop(owner, record)
owner, record = start('restart')
try:
    command(client, 'verify', 'testing-hello')
    command(client, 'verify', 'reboot-hello')
    # Replaying stable initializer/feature keys must not append duplicate messages.
    command(client, 'initialize', 'reboot-hello')
    command(client, 'scenario', 'testing-hello')
finally:
    if not timeout_seen:
        stop(owner, record)
assert all(hashlib.sha256(Path(p).read_bytes()).hexdigest() == h for p, h in evidence['source_hashes'].items())
evidence['passed'] = True
RESULT.write_text(json.dumps(evidence, indent=2))
print('UPSTREAM_CONSTRUCTORS_ACCEPTED', RESULT, flush=True)
