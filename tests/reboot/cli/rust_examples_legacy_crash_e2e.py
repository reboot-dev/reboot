"""Public CLI Legacy crash-window proof (real Database; no synthesized records).

Run only under the integration owner's shared build flock, with CARGO_TARGET_DIR,
RBT_RUST_DATABASE_BINARY and optionally RBT_CLI_BINARY set. This standalone driver
builds through `rbt dev run`; drafting/py_compile is NOT runtime acceptance.
RBT_TEST_SOURCE_FREEZE must name the coordinator's JSON receipt with the exact
source_manifest(), workers_relinquished=true and hold_through_run=true. The
coordinator, not start/end hashes, guarantees no edit-and-restore during builds.
Linux pidfd/procfs and an explicitly frozen source stream are required.
"""
from pathlib import Path
import hashlib
import ctypes
import json
import os
import re
import shutil
import signal
import socket
import subprocess
import sys
import tempfile
import time
import uuid

from rust_process_ownership import (
    RequestedShutdown, discover_owned, enable_subreaper, process_start,
    protected_owned_exit,
)

ROOT = Path(__file__).resolve().parents[3]
SOURCE = ROOT / 'reboot/rust/tests/fixtures/reboot_examples'
SDK = ROOT / 'reboot/rust'
CASES = (
    ('pending', 'REBOOT_TEST_AT_MOST_ONCE_BEFORE_STARTED', 'Absent', 0, False),
    ('started', 'REBOOT_TEST_AT_MOST_ONCE_AFTER_STARTED_ACK', 'Started', 0, True),
    ('partial', 'RBT_TEST_LEGACY_PREFIX_MARKER', 'Started', 3, True),
    ('effects', 'REBOOT_TEST_AT_MOST_ONCE_BEFORE_STORED', 'Started', 10, True),
    ('stored', 'REBOOT_TEST_AT_MOST_ONCE_AFTER_STORED_ACK', 'Stored', 10, False),
)
HOOKS = {case[1] for case in CASES}


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def source_manifest():
    paths = set()
    for directory in (SDK, ROOT / 'reboot/cli', ROOT / 'tests/reboot/cli'):
        paths.update(p for p in directory.rglob('*') if p.is_file()
                     and p.suffix != '.pyc'
                     and not {'target', '__pycache__', '.rbt', '.git'}.intersection(p.parts))
    for p in (ROOT / 'Cargo.toml', ROOT / 'Cargo.lock', ROOT / '.cargo/config', ROOT / '.cargo/config.toml'):
        if p.is_file():
            paths.add(p)
    for directory in (ROOT / 'rbt', ROOT / 'tests/reboot/protoc'):
        paths.update(p for p in directory.rglob('*.proto') if p.is_file())
    return {str(p.resolve()): sha(p) for p in sorted(paths)}


def task_identity(path):
    """Read invariant fields from the actual retained Task protobuf.

    Compare identity/request/method/iteration, not the status/terminal fields that
    legitimately change Pending -> Completed. Preserve the full raw record too.
    """
    data = path.read_bytes()
    offset = 0
    fields = {}

    def varint():
        nonlocal offset
        value = shift = 0
        while True:
            assert offset < len(data), 'truncated protobuf varint'
            byte = data[offset]
            offset += 1
            value |= (byte & 127) << shift
            if byte < 128:
                return value
            shift += 7
            assert shift < 70, 'oversized protobuf varint'

    while offset < len(data):
        tag = varint()
        number, wire = tag >> 3, tag & 7
        assert number > 0
        if wire == 0:
            value = varint()
        elif wire == 2:
            length = varint()
            assert offset + length <= len(data)
            value = data[offset:offset + length]
            offset += length
        elif wire in (1, 5):
            length = 8 if wire == 1 else 4
            assert offset + length <= len(data)
            value = data[offset:offset + length]
            offset += length
        else:
            raise AssertionError(f'unsupported canonical Task wire type {wire}')
        assert number not in fields, f'duplicate Task field {number}'
        fields[number] = value
    assert fields.get(2) == b'Initialize' and fields.get(4, b'') == b''
    assert fields.get(7, 0) == 0
    return fields[1], fields[2], fields.get(4, b''), fields.get(7, 0)


STARTED_REASON = 'at-most-once block Started without Stored; callback will not run again'


def marker_receipt(path, hook, case, pid):
    value = json.loads(path.read_text())
    assert value['version'] == 1 and value['clock'] == 'CLOCK_MONOTONIC', value
    assert value['hook'] == hook and value['case'] == case and value['pid'] == pid, value
    assert type(value['created_ns']) is int and 0 < value['created_ns'] <= time.monotonic_ns(), value
    uuid.UUID(value['task_uuid'])
    assert not path.with_suffix('.release').exists(), 'release must remain absent'
    return value


def barrier_remaining(record):
    remaining = 8 - (time.monotonic_ns() - record['producer_marker']['created_ns']) / 1e9
    assert remaining > 0, 'producer-relative crash budget expired; do not signal'
    return remaining


def non_ephemeral_port(exclude):
    low, high = map(int, Path('/proc/sys/net/ipv4/ip_local_port_range').read_text().split())
    for port in range(20000, 30000):
        if port in exclude or low <= port <= high:
            continue
        with socket.socket() as listener:
            try:
                listener.bind(('127.0.0.1', port))
            except OSError:
                continue
            return port
    raise AssertionError('no non-ephemeral inspection candidate available')


def listener_owned(pid, start, port):
    assert start is not None and process_start(pid) == start, 'Database birth changed'
    inodes = set()
    for fd in Path(f'/proc/{pid}/fd').iterdir():
        try:
            target = os.readlink(fd)
        except FileNotFoundError:
            continue
        match = re.fullmatch(r'socket:\[(\d+)\]', target)
        if match:
            inodes.add(match[1])
    listeners = [line.split() for table in ('/proc/net/tcp', '/proc/net/tcp6')
                 for line in Path(table).read_text().splitlines()[1:]]
    owned = any(int(fields[1].split(':')[1], 16) == port and fields[3] == '0A'
                and fields[9] in inodes for fields in listeners)
    assert process_start(pid) == start, 'Database birth changed during listener observation'
    return owned


def open_pidfd(pid):
    if hasattr(os, 'pidfd_open'):
        return os.pidfd_open(pid)
    # Some Linux Python builds omit pidfd APIs; use the same kernel primitive
    # through glibc, never a numeric-PID signal fallback.
    libc = ctypes.CDLL(None, use_errno=True)
    call = libc.pidfd_open
    call.argtypes = (ctypes.c_int, ctypes.c_uint)
    call.restype = ctypes.c_int
    fd = call(pid, 0)
    if fd < 0:
        error = ctypes.get_errno()
        raise OSError(error, os.strerror(error))
    return fd


def send_pidfd(pidfd, sig):
    if hasattr(signal, 'pidfd_send_signal'):
        return signal.pidfd_send_signal(pidfd, sig)
    libc = ctypes.CDLL(None, use_errno=True)
    call = libc.pidfd_send_signal
    call.argtypes = (ctypes.c_int, ctypes.c_int, ctypes.c_void_p, ctypes.c_uint)
    call.restype = ctypes.c_int
    if call(pidfd, sig, None, 0) < 0:
        error = ctypes.get_errno()
        raise OSError(error, os.strerror(error))


def stage_manifest(app):
    return {str(p): sha(p) for p in app.parent.rglob('*') if p.is_file()
            and not {'.rbt', 'target', '__pycache__'}.intersection(p.parts)}


class Driver:
    def __init__(self):
        enable_subreaper()
        self.stage = Path(tempfile.mkdtemp(prefix='reboot-rust-legacy-crash-'))
        print('STAGE', self.stage, flush=True)
        self.result = self.stage / 'result.json'
        self.target = Path(os.environ['CARGO_TARGET_DIR']).resolve()
        self.rbt = Path(os.environ.get('RBT_CLI_BINARY', '/tmp/reboot-rust-app-dx-loop2-venv310/bin/rbt')).resolve()
        self.database = Path(os.environ['RBT_RUST_DATABASE_BINARY']).resolve()
        self.client = self.target / 'debug/client'
        self.owned = {}
        self.active = []
        self.timeout_seen = False
        self.evidence = {'passed': False, 'checks_passed': False, 'cases': [],
                         'commands': [], 'sessions': [], 'shutdown_inspections': [],
                         'scope': 'public Legacy Pending/Started/partial/all-effects/Stored crash recovery; no ACK-loss fault injection'}
        self.env = dict(os.environ)
        for name in HOOKS | {'RBT_TEST_LEGACY_PREFIX_COUNT', 'RBT_TEST_CRASH_CASE'}:
            self.env.pop(name, None)
        self.env['RBT_RUST_DATABASE_BINARY'] = str(self.database)
        overlay = self.stage / 'cli-source-overlay'
        (overlay / 'reboot').mkdir(parents=True)
        (overlay / 'reboot/__init__.py').write_text('from pkgutil import extend_path\n__path__ = extend_path(__path__, __name__)\n')
        (overlay / 'reboot/cli').symlink_to(ROOT / 'reboot/cli', target_is_directory=True)
        self.env['PYTHONPATH'] = str(overlay)
        self.env['PYTHONUNBUFFERED'] = '1'
        freeze_path = Path(os.environ['RBT_TEST_SOURCE_FREEZE'])
        freeze = json.loads(freeze_path.read_text())
        assert freeze['workers_relinquished'] is True and freeze['hold_through_run'] is True, freeze
        self.evidence['source_hashes'] = source_manifest()
        assert freeze['source_hashes'] == self.evidence['source_hashes'], 'source-worker freeze does not match resolved inputs'
        self.evidence['source_freeze'] = {'path': str(freeze_path), 'sha256': sha(freeze_path), **freeze}
        self.evidence['source_hashes'].update({str(p): sha(p) for p in (self.database, self.rbt)})
        pinned = json.loads((SOURCE / 'upstream.json').read_text())
        assert pinned['revision'] == '5c332a2910122d6035799bfaf2a314bf1de830b8'
        for entry in pinned['files']:
            assert sha(SOURCE / entry.get('reference_path', entry['upstream_path'])) == entry['sha256']

    def resolved_protoc_manifest(self, app):
        # Both SDK and consumer use protoc-bin-vendored, NOT PATH/PROTOC.
        assert os.uname().sysname == 'Linux'
        architecture = {'x86_64': 'x86_64', 'aarch64': 'aarch_64'}.get(os.uname().machine)
        assert architecture is not None, 'unsupported actual protoc host architecture'
        package_name = 'protoc-bin-vendored-linux-' + architecture
        lock = (app / 'backend/Cargo.lock').read_text()
        versions = re.findall(r'name = "' + re.escape(package_name) + r'"\nversion = "([^"]+)"', lock)
        assert len(versions) == 1, 'unresolved actual vendored protoc'
        home = Path(self.env.get('CARGO_HOME', str(Path.home() / '.cargo')))
        candidates = list((home / 'registry/src').glob('*/' + package_name + '-' + versions[0]))
        assert len(candidates) == 1, candidates
        package = candidates[0].resolve()
        compiler = package / 'bin/protoc'
        return {'package': str(package), 'lock_sha256': sha(app / 'backend/Cargo.lock'),
                'version': self.command(app, compiler, '--version').strip(),
                'input_hashes': {str(p): sha(p) for p in sorted(package.rglob('*')) if p.is_file()}}

    def tool_manifest(self):
        tools = {}
        for name in ('cargo', 'rustc'):
            executable = Path(shutil.which(name) or '')
            assert executable.is_file(), f'missing tool {name}'
            resolved = executable.resolve()
            # rustup shims are not the actual Cargo/rustc toolchain executable.
            if resolved.name == 'rustup':
                resolved = Path(self.command(self.stage, 'rustup', 'which', name).strip()).resolve()
            tools[name] = {'path': str(resolved), 'sha256': sha(resolved),
                           'version': self.command(self.stage, resolved, '--version').strip()}
        python = self.rbt.parent / 'python'
        assert self.rbt.read_text().splitlines()[0] == '#!' + str(python), 'unresolved CLI interpreter'
        probe = """import hashlib, importlib.metadata, json, sys
from pathlib import Path
import reboot.cli.main
import reboot.cli.commands.rust_dev as m
assert Path(m.__file__).resolve() == Path(ROOT) / 'reboot/cli/commands/rust_dev.py'
paths = {Path(x.__file__).resolve() for x in list(sys.modules.values()) if getattr(x, '__file__', None)}
distributions = {}
for d in importlib.metadata.distributions():
    distributions[d.metadata['Name']] = d.version
    paths.update(Path(d.locate_file(f)).resolve() for f in (d.files or []) if not str(f).endswith('.pyc'))
paths.update(Path(x.__file__).resolve() for x in list(sys.modules.values()) if getattr(x, '__file__', None))
print(json.dumps({'interpreter': str(Path(sys.executable).resolve()), 'version': sys.version,
 'imported_paths': {n: str(Path(m.__file__).resolve()) for n,m in list(sys.modules.items()) if getattr(m, '__file__', None)},
 'distributions': distributions, 'file_hashes': {str(p): hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(paths) if p.is_file() and p.suffix != '.pyc'}}, sort_keys=True))
"""
        probe = 'ROOT = ' + repr(str(ROOT)) + '\n' + probe
        tools['cli_python'] = json.loads(self.command(self.stage, python, '-c', probe))
        interpreter = Path(tools['cli_python']['interpreter'])
        tools['cli_python']['interpreter_sha256'] = sha(interpreter)
        return tools

    def save(self):
        self.result.write_text(json.dumps(self.evidence, indent=2))

    def budget(self):
        size = int(subprocess.check_output(['du', '-sb', str(self.target)]).split()[0])
        free = shutil.disk_usage(self.target).free
        ceiling = int(os.environ.get('RUST_DX_TARGET_CEILING_BYTES', '12000000000'))
        assert ceiling > 0 and size <= ceiling and free >= 8 * 1024**3, (size, free, ceiling)
        self.evidence.setdefault('budgets', []).append({'target_bytes': size, 'free_bytes': free, 'ceiling_bytes': ceiling})

    def command(self, app, *args, env=None, timeout=240):
        argv = [str(x) for x in args]
        process = subprocess.Popen(argv, cwd=app, env=env or self.env,
                                   stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        self.owned[str(process.pid)] = process_start(process.pid)
        record = {'argv': argv, 'pid': process.pid, 'process_starttime': self.owned[str(process.pid)]}
        self.evidence['commands'].append(record)
        try:
            stdout, stderr = process.communicate(timeout=timeout)
        except subprocess.TimeoutExpired:
            self.timeout_seen = True
            record['timeout'] = True
            self.save()
            raise  # Retain exact owners and caller's build flock; never kill a timeout.
        record.update(exit=process.returncode, stdout=stdout, stderr=stderr)
        self.save()
        assert process.returncode == 0, record
        return stdout

    def stage_app(self, name):
        app = self.stage / name / 'examples/hello-legacy-grpc'
        shutil.copytree(SOURCE / 'api', app.parent / 'api')
        shutil.copytree(SOURCE / 'hello-legacy-grpc', app)
        cargo = app / 'backend/Cargo.toml'
        text = cargo.read_text()
        assert 'native-test-support = ["reboot/test-support"]' in text
        assert 'default =' not in text, 'production sample features must remain default OFF'
        text = text.replace('[features]\n', '[features]\ndefault = ["native-test-support"]\n')
        assert '"../../../../../"' in text
        cargo.write_text(text.replace('"../../../../../"', json.dumps(str(SDK))))
        build = app / 'backend/build.rs'
        text = build.read_text()
        assert 'here.join("../../../../../../..")' in text
        build.write_text(text.replace('here.join("../../../../../../..")',
                                     'std::path::PathBuf::from(' + json.dumps(str(ROOT)) + ')'))
        config = app / '.rbtrc'
        original = config.read_text()
        assert 'dev run --application-name=upstream_hello_legacy_grpc' in original
        application_name = f'legacy_crash_{name}_{self.stage.name.rsplit("-", 1)[-1]}'
        config.write_text(original.replace('dev run --application-name=upstream_hello_legacy_grpc',
                                          f'dev run --application-name={application_name}'))
        return app, application_name

    def children(self, record):
        text = Path(record['log']).read_text()
        receipts = [json.loads(line.removeprefix('RUST_CHILD_LAUNCH '))
                    for line in text.splitlines(keepends=True)
                    if line.startswith('RUST_CHILD_LAUNCH ') and line.endswith('\n')]
        for label in ('Database', 'app'):
            matches = [r for r in receipts if r['label'] == label]
            if not matches:
                continue
            assert len(matches) == 1, matches
            receipt = matches[0]
            assert receipt['version'] == 1 and receipt['birth_and_argv_observed'] is True, receipt
            pid, start, args = receipt['pid'], receipt['starttime'], receipt['argv']
            assert type(pid) is int and start is not None and args, receipt
            expected = self.database if label == 'Database' else self.target / 'debug/app'
            assert Path(receipt['executable']).resolve() == expected.resolve()
            assert Path(args[0]).resolve() == expected.resolve()
            if label in record:
                assert record[label]['launch_receipt'] == receipt
                continue
            record[label] = {'pid': pid, 'starttime': start, 'launch_receipt': receipt}
            # Launch provenance survives cleanup. Signal authority requires a
            # separate live birth/argv/birth observation, never a PID-only log.
            if process_start(pid) == start:
                try:
                    live_args = [os.fsdecode(x) for x in Path(f'/proc/{pid}/cmdline').read_bytes().rstrip(b'\0').split(b'\0')]
                except FileNotFoundError:
                    live_args = []
                after = process_start(pid)
                if after == start and live_args:
                    assert live_args == args, (live_args, receipt)
                    record[label]['live_cmdline'] = live_args
                    self.owned[str(pid)] = start
            if label == 'Database':
                assert len(args) == 4, receipt
                record.update(rocksdb=args[1], server_info=args[2],
                              database_url='http://127.0.0.1:' + args[3],
                              host_log=str(Path(args[2]).parent / 'host.log'))
        discover_owned(self.owned, os.getpid())

    def host_text(self, record):
        if 'host_log' not in record:
            return ''
        data = Path(record['host_log']).read_bytes()
        assert len(data) >= record['host_log_offset'], 'host.log must remain append-only'
        text = data[record['host_log_offset']:].decode()
        record['host_log_end'] = len(data)
        record['host_log_session_sha256'] = hashlib.sha256(text.encode()).hexdigest()
        # Retain the exact session slice, including failures, not only parsed lines.
        (self.stage / (record['name'] + '.host.log')).write_bytes(data[record['host_log_offset']:])
        return text

    def start(self, app, name, hook=None, marker=None, previous=None):
        host_offset = Path(previous['host_log']).stat().st_size if previous else 0
        log_path = self.stage / (name + '.log')
        log = log_path.open('w')
        env = dict(self.env)
        if hook:
            assert marker is not None and not marker.exists() and not marker.with_suffix('.release').exists()
            env['RBT_TEST_CRASH_CASE'] = name
            env[hook] = str(marker)
            if hook == 'RBT_TEST_LEGACY_PREFIX_MARKER':
                env['RBT_TEST_LEGACY_PREFIX_COUNT'] = '3'
        process = subprocess.Popen([str(self.rbt), 'dev', 'run', '--rust-allow-insecure-database',
                                    '--port=14993'], cwd=app, env=env,
                                   stdout=log, stderr=subprocess.STDOUT)
        record = {'name': name, 'pid': process.pid, 'process_starttime': process_start(process.pid),
                  'log': str(log_path), 'host_log_offset': host_offset}
        self.owned[str(process.pid)] = record['process_starttime']
        self.evidence['sessions'].append(record)
        owner = RequestedShutdown(process, log, record,
                                  expected_exits=(0, 128 + signal.SIGTERM, -signal.SIGTERM))
        self.active.append(owner)
        deadline = time.monotonic() + 240
        while time.monotonic() < deadline:
            self.children(record)
            if process.poll() is not None:
                self.host_text(record)
                raise AssertionError(f'CLI exited before expected startup boundary: {record}')
            if hook and marker is not None and marker.exists():
                assert 'app' in record and 'Database' in record, record
                record['marker'] = str(marker)
                record['marker_sha256'] = sha(marker)
                record['producer_marker'] = marker_receipt(marker, hook, name, record['app']['pid'])
                # Independently scheduled initializer log must precede readback,
                # within the same producer-relative budget, not a fresh timeout.
                while 'LEGACY_INITIALIZE_TASK ' not in self.host_text(record):
                    barrier_remaining(record)
                    assert process.poll() is None, record
                    time.sleep(.005)
                barrier_remaining(record)
                return owner, record
            if not hook and 'SERVING (canonical gRPC health check)' in log_path.read_text():
                return owner, record
            time.sleep(.01)
        self.timeout_seen = True
        record['timeout'] = True
        self.save()
        raise TimeoutError('public CLI startup boundary timeout; owners retained')

    def absent_children(self, record):
        def absent(label):
            observed = record[label]
            current = process_start(observed['pid'])
            if observed['starttime'] is None:
                return current is None  # PID-only failure observation has no kill authority.
            return current != observed['starttime']
        record['children_absent'] = all(absent(label) for label in ('app', 'Database'))
        assert record['children_absent'], record

    def stop(self, owner, record):
        owner.close()
        self.absent_children(record)
        self.host_text(record)
        self.save()

    def exited(self, owner, record, crash=False):
        try:
            code = owner.process.wait(timeout=20)
        except subprocess.TimeoutExpired:
            self.timeout_seen = True
            record['timeout'] = True
            self.save()
            raise
        owner.log.close()
        owner.closed = True  # Observed failure is not a requested graceful shutdown.
        record.update(exit=code, expected_failure_exit=True, crash=crash)
        assert code != 0, record
        self.absent_children(record)
        text = self.host_text(record)
        self.save()
        return text

    def inspect(self, app, case, record, task, status, phase, label, stopped=False):
        path = self.stage / case / label
        assert not path.exists(), path
        env = dict(self.env, RBT_TEST_DATABASE_URL=record['database_url'],
                   RBT_TEST_DATABASE_SERVER_INFO=record['server_info'],
                   RBT_TEST_LEGACY_INSPECTION=str(path))
        if stopped:
            self.absent_children(record)
            port = non_ephemeral_port({14993, int(record['database_url'].rsplit(':', 1)[1])})
            log_path = self.stage / case / (label + '-database.log')
            log = log_path.open('w')
            argv = [str(self.database), record['rocksdb'], record['server_info'], str(port)]
            database = subprocess.Popen(argv, stdout=log, stderr=subprocess.STDOUT)
            observed = {'pid': database.pid, 'process_starttime': process_start(database.pid),
                        'rocksdb': record['rocksdb'], 'server_info': record['server_info'], 'log': str(log_path),
                        'argv': argv, 'port': port, 'allocation': 'best-effort non-ephemeral released candidate'}
            self.evidence['shutdown_inspections'].append(observed)
            self.owned[str(database.pid)] = observed['process_starttime']
            owner = RequestedShutdown(database, log, observed, expected_exits=(0, -signal.SIGTERM))
            self.active.append(owner)
            env['RBT_TEST_DATABASE_URL'] = f'http://127.0.0.1:{port}'
            try:
                deadline = time.monotonic() + 10
                while True:
                    assert database.poll() is None, log_path.read_text()
                    if listener_owned(database.pid, observed['process_starttime'], port):
                        observed['listener_ownership_verified'] = True
                        break
                    if time.monotonic() >= deadline:
                        self.timeout_seen = True
                        raise TimeoutError('no owned stopped-state Database listener')
                    time.sleep(.01)
                self.command(app, self.client, 'observe', task, status, phase, env=env, timeout=10)
                assert database.poll() is None and listener_owned(database.pid, observed['process_starttime'], port)
                observed['canonical_grpc_readiness_verified'] = True
            finally:
                if not self.timeout_seen:
                    owner.close()
                    observed['process_absent'] = process_start(database.pid) != observed['process_starttime']
                    assert observed['process_absent']
        else:
            # Hooks release/expire after ten seconds: bounded readback before killing.
            self.command(app, self.client, 'observe', task, status, phase, env=env, timeout=min(3, barrier_remaining(record)))
        summary = json.loads((path / 'summary.json').read_text())
        assert summary['task_uuid'] == task and summary['checkpoint'] == phase
        self.evidence.setdefault('inspections', []).append({'path': str(path), 'stopped': stopped, **summary})
        return path, summary

    def task_log(self, record, expected_calls, expected_callbacks, completed=False):
        text = self.host_text(record)
        ids = re.findall(r'LEGACY_INITIALIZE_TASK ([0-9a-f-]+)', text)
        assert len(ids) == 1, text
        uuid.UUID(ids[0])
        greetings = re.findall(r'LEGACY_GREETING (\d+) (.*)', text)
        assert [int(i) for i, _ in greetings] == list(range(expected_calls)), text
        assert text.count('LEGACY_CALLBACK_ENTER') == expected_callbacks, text
        assert ('LEGACY_INITIALIZE_COMPLETE' in text) == completed, text
        # Random routing stays untouched; only actual acknowledged Reboot replies count.
        count = sum(message.endswith('by the Reboot service.') for _, message in greetings)
        return ids[0], greetings, count

    def case(self, name, hook, phase, calls, fails):
        app, application_name = self.stage_app(name)
        self.command(app, 'cargo', 'generate-lockfile', '--manifest-path', app / 'backend/Cargo.toml')
        self.command(app, 'cargo', 'fetch', '--locked', '--manifest-path', app / 'backend/Cargo.toml')
        protoc_inputs = self.resolved_protoc_manifest(app)
        case = {'name': name, 'application_name': application_name, 'passed': False,
                'staged_pre_build_hashes': stage_manifest(app), 'resolved_protoc': protoc_inputs,
                'recovery_inspections': []}
        self.evidence['cases'].append(case)
        marker = self.stage / name / 'pause.marker'
        owner, first = self.start(app, name + '-initial', hook, marker)
        case['built_artifacts'] = {str(p): sha(p) for p in (self.target / 'debug/app', self.client)}
        assert stage_manifest(app) == case['staged_pre_build_hashes']
        task, greetings, count = self.task_log(first, calls, int(calls > 0))
        assert first['producer_marker']['task_uuid'] == task
        case.update(task_uuid=task, acknowledged_greetings=greetings, initial_reboot_count=count)
        live, live_summary = self.inspect(app, name, first, task, 'Pending', phase, 'parked')
        assert live_summary['num_greetings'] == count
        pid, start = first['app']['pid'], first['app']['starttime']
        assert start is not None and process_start(pid) == start, 'never signal a reused PID'
        # Pin the kernel process, not a numeric PID that may be reused between
        # /proc validation and the signal syscall. Fail closed without pidfd.
        pidfd = open_pidfd(pid)
        try:
            live_args = [os.fsdecode(x) for x in Path(f'/proc/{pid}/cmdline').read_bytes().rstrip(b'\0').split(b'\0')]
            assert process_start(pid) == start and live_args == first['app']['launch_receipt']['argv'], 'no live signal authority'
            first['crash_signal'] = signal.SIGKILL
            barrier_remaining(first)  # Immediately before the actual signal syscall.
            first['pre_kill_monotonic_ns'] = time.monotonic_ns()
            send_pidfd(pidfd, signal.SIGKILL)  # Exact app, never Database.
            first['kill_return_monotonic_ns'] = time.monotonic_ns()
        finally:
            os.close(pidfd)
        first['producer_to_kill_seconds'] = (first['kill_return_monotonic_ns'] - first['producer_marker']['created_ns']) / 1e9
        assert first['producer_to_kill_seconds'] < 8, 'signal return exceeded producer budget'
        self.exited(owner, first, crash=True)
        self.task_log(first, calls, int(calls > 0))
        before, before_summary = self.inspect(app, name, first, task, 'Pending', phase, 'crashed', stopped=True)
        assert before_summary['num_greetings'] == count
        assert (live / 'task.pb').read_bytes() == (before / 'task.pb').read_bytes()
        assert (live / 'actor.pb').read_bytes() == (before / 'actor.pb').read_bytes()
        if phase != 'Absent':
            assert (live / 'checkpoint.pb').read_bytes() == (before / 'checkpoint.pb').read_bytes()
        previous = first
        # Repeated Started recovery must reject permanently, not only on first restart.
        for iteration in range(2 if fails else 1):
            restart_name = f'{name}-restart-{iteration}'
            if fails:
                # Failure startup must be monitored for EXIT, not health readiness.
                # No runtime fault variables are set on recovery.
                restart_owner, restarted = self.launch_failure(app, restart_name, previous)
                text = self.exited(restart_owner, restarted)
                fatal_lines = [line for line in text.splitlines()
                               if STARTED_REASON in line and 'FailedPrecondition' in line]
                assert fatal_lines, text
                restarted['fatal_log_lines'] = fatal_lines
                restarted['fatal_reason'] = {'code': 'FailedPrecondition', 'message': STARTED_REASON,
                                             'task_uuid': task, 'host_log_slice': str(self.stage / (restart_name + '.host.log'))}
                # Recovery may fail before the serving initializer is admitted.
                # Its canonical task is still read back by the exact original UUID.
                ids = re.findall(r'LEGACY_INITIALIZE_TASK ([0-9a-f-]+)', text)
                assert ids in ([], [task]), text
                assert 'LEGACY_CALLBACK_ENTER' not in text, text
                assert 'LEGACY_GREETING ' not in text, text
                assert 'LEGACY_INITIALIZE_COMPLETE' not in text, text
                after, after_summary = self.inspect(app, name, restarted, task, 'Failed', 'Started',
                                                     f'recovered-{iteration}', stopped=True)
                assert after_summary['num_greetings'] == count
                assert (after / 'actor.pb').read_bytes() == (before / 'actor.pb').read_bytes()
                assert (after / 'checkpoint.pb').read_bytes() == (before / 'checkpoint.pb').read_bytes()
                if after_summary['status'] == 'Pending':
                    assert (after / 'task.pb').read_bytes() == (before / 'task.pb').read_bytes()
            else:
                restart_owner, restarted = self.start(app, restart_name, previous=previous)
                self.stop(restart_owner, restarted)
                expected_calls = 10 if phase == 'Absent' else 0
                replay_task, replay_greetings, replay_count = self.task_log(
                    restarted, expected_calls, int(phase == 'Absent'), completed=True)
                assert replay_task == task
                after, after_summary = self.inspect(app, name, restarted, task, 'Completed', 'Stored',
                                                     f'recovered-{iteration}', stopped=True)
                assert after_summary['num_greetings'] == count + replay_count
                if phase == 'Stored':
                    assert (after / 'actor.pb').read_bytes() == (before / 'actor.pb').read_bytes()
                    assert (after / 'checkpoint.pb').read_bytes() == (before / 'checkpoint.pb').read_bytes()
                case['recovered_greetings'] = replay_greetings
                case['recovered_reboot_count'] = replay_count
            assert restarted['rocksdb'] == first['rocksdb']
            assert restarted['server_info'] == first['server_info']
            assert task_identity(after / 'task.pb') == task_identity(before / 'task.pb')
            case['recovery_inspections'].append({'session': restart_name, 'path': str(after), **after_summary})
            assert stage_manifest(app) == case['staged_pre_build_hashes']
            assert all(sha(Path(p)) == h for p, h in protoc_inputs['input_hashes'].items())
            assert all(sha(Path(p)) == h for p, h in case['built_artifacts'].items())
            previous = restarted
        case['rocksdb'] = first['rocksdb']
        case['passed'] = True
        self.budget()
        self.save()

    def launch_failure(self, app, name, previous):
        # Explicitly observe exit, never wait for successful startup health.
        host_offset = Path(previous['host_log']).stat().st_size
        log_path = self.stage / (name + '.log')
        log = log_path.open('w')
        process = subprocess.Popen([str(self.rbt), 'dev', 'run', '--rust-allow-insecure-database', '--port=14993'],
                                   cwd=app, env=self.env, stdout=log, stderr=subprocess.STDOUT)
        record = {'name': name, 'pid': process.pid, 'process_starttime': process_start(process.pid),
                  'log': str(log_path), 'host_log_offset': host_offset,
                  'expect_startup_failure': True}
        self.owned[str(process.pid)] = record['process_starttime']
        self.evidence['sessions'].append(record)
        owner = RequestedShutdown(process, log, record)
        self.active.append(owner)
        deadline = time.monotonic() + 240
        while time.monotonic() < deadline:
            self.children(record)
            if process.poll() is not None:
                self.children(record)
                assert 'Database' in record and 'app' in record, log_path.read_text()
                return owner, record
            time.sleep(.005)
        self.timeout_seen = True
        record['timeout'] = True
        self.save()
        raise TimeoutError('expected recovery failure did not exit; owners retained')

    def run(self):
        try:
            self.budget()
            self.evidence['tool_identities'] = self.tool_manifest()
            self.command(self.stage, self.rbt.parent / 'python', '-c',
                         'import reboot.cli.commands.rust_dev as m; from pathlib import Path; '
                         f'assert Path(m.__file__).resolve() == Path({str(ROOT / "reboot/cli/commands/rust_dev.py")!r}); '
                         'print("CURRENT_CLI_SOURCE", m.__file__)')
            for args in CASES:
                self.case(*args)
            assert self.tool_manifest() == self.evidence['tool_identities'], 'tool or imported dependency changed'
            assert sha(Path(self.evidence['source_freeze']['path'])) == self.evidence['source_freeze']['sha256']
            assert len(self.evidence['cases']) == len(CASES)
            assert len({case['rocksdb'] for case in self.evidence['cases']}) == len(CASES)
            assert all(case['passed'] for case in self.evidence['cases'])
            assert source_manifest() == {p: h for p, h in self.evidence['source_hashes'].items()
                                         if p not in {str(self.database), str(self.rbt)}}
            assert sha(self.database) == self.evidence['source_hashes'][str(self.database)]
            assert sha(self.rbt) == self.evidence['source_hashes'][str(self.rbt)]
            self.evidence['staged_source_hashes'] = {
                str(p): sha(p) for p in self.stage.rglob('*') if p.is_file()
                and '.rbt' not in p.parts and 'examples' in p.parts}
            self.evidence['checks_passed'] = True
        except BaseException as error:
            self.evidence['failure'] = {'type': type(error).__name__, 'message': str(error)}
            raise
        finally:
            try:
                if not self.timeout_seen:
                    for owner in reversed(self.active):
                        if not owner.closed and owner.process.poll() is None:
                            owner.close()
                        elif not owner.closed:
                            owner.log.close()
            except BaseException as error:
                self.evidence['cleanup_failure'] = {'type': type(error).__name__, 'message': str(error)}
                self.evidence['checks_passed'] = False
                raise
            finally:
                def observe_final():
                    self.save()
                    discover_owned(self.owned, os.getpid())
                protected_owned_exit(self.owned, self.stage / 'retained-owners.json', observe_final,
                                     root_pid=os.getpid())
                self.evidence['live_owned_processes'] = list(discover_owned(self.owned, os.getpid()))
                self.evidence['owned_process_starttimes'] = dict(self.owned)
                self.evidence['artifact_hashes'] = {
                    str(p): sha(p) for p in self.stage.rglob('*') if p.is_file()
                    and p != self.result and 'examples' not in p.parts}
                self.evidence['passed'] = (self.evidence['checks_passed']
                                           and not self.evidence['live_owned_processes'])
                self.save()
        assert self.evidence['passed']
        print('PUBLIC_LEGACY_CRASH_WINDOWS_ACCEPTED', self.result, flush=True)


if __name__ == '__main__':
    Driver().run()
