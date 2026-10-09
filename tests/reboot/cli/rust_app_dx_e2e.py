"""Actual rbt CLI + generated Rust binaries + canonical C++ RocksDB acceptance."""
from pathlib import Path
import hashlib
import importlib
import json
import os
import re
import signal
import shutil
import subprocess
import sys
import time
import tempfile
import grpc
from grpc_tools import protoc
from rbt.v1alpha1 import database_pb2, database_pb2_grpc

REPOSITORY = Path(__file__).resolve().parents[3]
STAGE = Path(os.environ.get('RUST_DX_STAGE') or tempfile.mkdtemp(prefix='reboot-rust-app-dx-'))
STAGE.mkdir(parents=True, exist_ok=True)
SDK = Path(os.environ.get('RUST_DX_SDK', REPOSITORY / 'reboot/rust')).resolve()
PORT = int(os.environ.get('RUST_DX_PORT', '12991'))
APP = Path(tempfile.mkdtemp(prefix='generated-app-proof-', dir=STAGE))
TARGET = Path(os.environ.get('RUST_DX_TARGET', STAGE / 'target')).resolve()
BINARY = Path(os.environ.get('RUST_DX_DATABASE_BINARY') or os.environ['REBOOT_NATIVE2PC_CXX_DATABASE']).resolve()
RBT = Path(os.environ.get('RUST_DX_RBT') or shutil.which('rbt') or STAGE / 'venv/bin/rbt').resolve()
PREFIX = Path(os.environ.get('RUST_DX_LOG_PREFIX', STAGE / 'acceptance'))
LOG = Path(str(PREFIX) + '.log')
RESULT = Path(str(PREFIX) + '-result.json')
ENV = dict(os.environ, CARGO_TARGET_DIR=str(TARGET), CARGO_INCREMENTAL='0', CARGO_BUILD_JOBS='2',
           CARGO_PROFILE_DEV_DEBUG='0', CARGO_PROFILE_TEST_DEBUG='0', CARGO_NET_OFFLINE=os.environ.get('RUST_DX_CARGO_OFFLINE', 'false'),
           RBT_RUST_DATABASE_BINARY=str(BINARY), RBT_RUST_URL=f'http://127.0.0.1:{PORT}')
timeout_seen = False
evidence = {'commands': [], 'sessions': [], 'source_hashes': {},
            'database_sha256': hashlib.sha256(BINARY.read_bytes()).hexdigest()}
# Freeze the actual SDK and CLI overlay identities, not a stale staged SDK.
from reboot.cli.commands import dev, rust_dev
from reboot.cli.commands.init import init, rust_init
cli_roots = [Path(module.__file__).resolve() for module in [dev, rust_dev, init, rust_init]]
evidence['sdk_path'] = str(SDK)
evidence['cli_modules'] = [str(path) for path in cli_roots]
evidence['source_hashes'][str(RBT)] = hashlib.sha256(RBT.read_bytes()).hexdigest()
for file in cli_roots:
    evidence['source_hashes'][str(file)] = hashlib.sha256(file.read_bytes()).hexdigest()
for root in [SDK, cli_roots[-1].parent / 'templates']:
    for file in root.rglob('*'):
        if file.is_file() and not {'target', '__pycache__', '.rbt'}.intersection(file.parts) and file.suffix != '.pyc':
            evidence['source_hashes'][str(file)] = hashlib.sha256(file.read_bytes()).hexdigest()


def record(message):
    with LOG.open('a') as out:
        out.write(message + '\n')
    print(message, flush=True)


def command(args, *, timeout=30, cwd=APP, env=ENV):
    process = subprocess.Popen([str(a) for a in args], cwd=cwd, env=env, text=True,
                               stdout=subprocess.PIPE, stderr=subprocess.PIPE, start_new_session=True)
    try:
        stdout, stderr = process.communicate(timeout=timeout)
    except subprocess.TimeoutExpired:
        global timeout_seen
        timeout_seen = True
        evidence['commands'].append({'argv': [str(a) for a in args], 'pid': process.pid,
                                     'timeout': True, 'live': True})
        RESULT.write_text(json.dumps(evidence, indent=2))
        raise
    evidence['commands'].append({'argv': [str(a) for a in args], 'cwd': str(cwd), 'pid': process.pid,
                                 'exit': process.returncode, 'stdout': stdout, 'stderr': stderr})
    record(f'COMMAND {args!r}: exit={process.returncode}\n{stdout}{stderr}')
    assert process.returncode == 0, evidence['commands'][-1]
    return stdout.strip()


class Session:
    def __init__(self, name):
        self.path = Path(str(PREFIX) + f'-session-{name}.log')
        self.log = self.path.open('w')
        self.process = subprocess.Popen([str(RBT), 'dev', 'run', '--rust-allow-insecure-database', f'--port={PORT}'], cwd=APP, env=ENV,
                                        stdout=self.log, stderr=subprocess.STDOUT, start_new_session=True)
        self.data = {'name': name, 'cli_pid': self.process.pid, 'log': str(self.path), 'command': [str(RBT), 'dev', 'run', '--rust-allow-insecure-database', f'--port={PORT}']}
        evidence['sessions'].append(self.data)
        self.children = []
        try:
            end = time.monotonic() + 240
            while time.monotonic() < end:
                text = self.path.read_text()
                self.children = [int(n) for n in re.findall(r'Rust (?:Database|app) PID=(\d+)', text)]
                if 'SERVING (canonical gRPC health check)' in text:
                    assert len(self.children) == 2, text
                    self.data['children'] = self.children[:]
                    self.data['database_port'] = database_port(self.children[0])
                    record(f'SESSION {name}: actual CLI={self.process.pid}, children={self.children}, ready')
                    return
                assert self.process.poll() is None, text
                time.sleep(0.1)
            global timeout_seen
            timeout_seen = True
            raise TimeoutError('CLI readiness timeout: ' + self.path.read_text())
        except BaseException:
            if not timeout_seen:
                self.close()
            raise

    def close(self, sig=signal.SIGTERM):
        if self.process.poll() is None:
            self.process.send_signal(sig)
        try:
            status = self.process.wait(timeout=10)
        except subprocess.TimeoutExpired:
            global timeout_seen
            timeout_seen = True
            self.data['live'] = True
            RESULT.write_text(json.dumps(evidence, indent=2))
            raise
        self.log.close()
        self.data['exit'] = self.process.returncode
        self.data['children_absent'] = all(not Path(f'/proc/{pid}').exists() for pid in self.children)
        record(f'SESSION {self.data["name"]}: CLI exit={status}, children absent={self.data["children_absent"]}')
        assert self.data['children_absent'], self.data
        if reader_registry_fixture:
            reader_registry_fixture.closed()
        if http_fixture:
            http_fixture.closed()
            http_fixture.audit_lifecycle(self)
        return status


def database_port(pid):
    fields = Path(f'/proc/{pid}/cmdline').read_bytes().split(b'\0')
    return int(fields[3])


command([RBT, 'init', '--backend=rust', '--frontend=none', '--application-name=rust_greetings',
         '--rust-sdk=' + str(SDK)])
rejection = subprocess.run([str(RBT), 'dev', 'run', f'--port={PORT}'], cwd=APP, env=ENV,
                           text=True, capture_output=True, timeout=15)
assert rejection.returncode == 1 and '0.0.0.0 without authentication' in rejection.stderr, rejection
assert not (APP / '.rbt').exists(), 'Security rejection created durable state'
evidence['security_fail_closed'] = {'exit': rejection.returncode, 'stderr': rejection.stderr, 'no_state': True}
record('PASS actual CLI refuses insecure Database startup without explicit opt-in; no state created')
PYTHON = APP / 'generated-python'
PYTHON.mkdir(exist_ok=True)
import grpc_tools
status = protoc.main(['protoc', '-I' + str(APP / 'api'), '-I' + str(SDK.parent.parent),
                      '-I' + str(Path(grpc_tools.__file__).parent / '_proto'),
                      '--python_out=' + str(PYTHON),
                      str(APP / 'api/rust_greetings/v1/hello_world.proto')])
assert status == 0
sys.path.insert(0, str(PYTHON))
proto = importlib.import_module('rust_greetings.v1.hello_world_pb2')


def durable_count(session):
    with grpc.insecure_channel(f'127.0.0.1:{session.data["database_port"]}') as channel:
        response = database_pb2_grpc.DatabaseStub(channel).Load(database_pb2.LoadRequest(
            actors=[database_pb2.Actor(state_type='rust_greetings.v1.HelloWorld', state_ref='hello')]), timeout=3)
    assert len(response.actors) == 1 and response.actors[0].HasField('state'), response
    state = proto.HelloWorld.FromString(response.actors[0].state)
    record(f'ACTUAL CXX DATABASE Load actor hello: greetings={state.number_of_greetings}, bytes={response.actors[0].state.hex()}')
    evidence.setdefault('durable_reads', []).append({'session': session.data['name'],
        'count': state.number_of_greetings, 'serialized_state': response.actors[0].state.hex()})
    return state.number_of_greetings


http_fixture = None
reader_registry_fixture = None
if os.environ.get('RUST_DX_READER_REGISTRY_ONLY') or os.environ.get('RUST_DX_READER_COMPOSITION_ONLY') or os.environ.get('RUST_DX_UNARY_COMPOSITION_ONLY'):
    composed = bool(os.environ.get('RUST_DX_READER_COMPOSITION_ONLY') or os.environ.get('RUST_DX_UNARY_COMPOSITION_ONLY'))
    fixture_path = REPOSITORY / 'tests/reboot/cli/fixtures' / ('rust_reader_composition_fixture.py' if composed else 'rust_reader_registry_fixture.py')
    spec = importlib.util.spec_from_file_location('reader_registry_fixture', fixture_path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    for fixture in [fixture_path, Path(__file__)]:
        evidence['source_hashes'][str(fixture)] = hashlib.sha256(fixture.read_bytes()).hexdigest()
    fixture_class = module.ReaderCompositionFixture if composed else module.ReaderRegistryFixture
    reader_registry_fixture = fixture_class(APP, ENV, PORT, REPOSITORY, evidence, record, command, database_pb2, database_pb2_grpc, proto)
if os.environ.get('RUST_DX_HTTP_REQUEST_ONLY'):
    fixture_path = REPOSITORY / 'tests/reboot/cli/fixtures/rust_http_request_fixture.py'
    spec = importlib.util.spec_from_file_location('http_request_fixture', fixture_path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    def http_native_state(session):
        with grpc.insecure_channel(f'127.0.0.1:{session.data["database_port"]}') as channel:
            response = database_pb2_grpc.DatabaseStub(channel).Load(database_pb2.LoadRequest(
                actors=[database_pb2.Actor(state_type='rust_greetings.v1.HelloWorld', state_ref='http-item')]), timeout=3)
        assert len(response.actors) == 1 and response.actors[0].HasField('state'), response
        state = response.actors[0].state
        evidence.setdefault('http_native_reads', []).append({'session': session.data['name'], 'state': state.hex()})
        return state
    for fixture in [fixture_path, fixture_path.with_name('rust_http_request_host.rs'), Path(__file__)]:
        evidence['source_hashes'][str(fixture)] = hashlib.sha256(fixture.read_bytes()).hexdigest()
    http_fixture = module.HttpRequestFixture(APP, ENV, PORT, REPOSITORY, evidence, record, http_native_state)
    evidence['http_address'] = ENV['RUST_DX_HTTP_ADDR']
    command(['cargo', 'fmt', '--manifest-path', APP / 'backend/Cargo.toml'], timeout=30)

current = None
try:
    # Release-quality checks exercise the consumer's own annotated emission.
    manifest = APP / 'backend/Cargo.toml'
    command(['cargo', 'clippy', '--manifest-path', manifest, '--all-targets', '--', '-D', 'warnings'], timeout=240)
    command(['cargo', 'fmt', '--manifest-path', manifest, '--', '--check'], timeout=30)
    command(['cargo', 'test', '--manifest-path', manifest, '--all-targets'], timeout=240)
    current = Session('first')
    if reader_registry_fixture:
        reader_registry_fixture.first(current)
    if http_fixture:
        http_fixture.first(current)
    assert command([TARGET / 'debug/client', 'create']) == '0'
    assert command([TARGET / 'debug/client', 'greet', 'hello', '11111111-1111-4111-8111-111111111111']) == '1'
    assert command([TARGET / 'debug/client', 'greet', 'hello', '11111111-1111-4111-8111-111111111111']) == '1'
    assert command([TARGET / 'debug/client', 'read']) == '1'
    assert durable_count(current) == 1
    proto_path = APP / 'api/rust_greetings/v1/hello_world.proto'
    original = proto_path.read_text()
    if not reader_registry_fixture:
        # Exercise Cargo generation through the live CLI watcher (no direct cargo
        # invocation). Restore the real proto and wait for a second successful
        # regeneration before final-state restart proof.
        proto_path = APP / 'api/rust_greetings/v1/hello_world.proto'
        original = proto_path.read_text()
        old_host = current.children[1]
        prior_ready = current.path.read_text().count('SERVING (canonical gRPC health check)')
        proto_path.write_text(original + '\nmessage RegenerationProbe { string note = 1; }\n')
        for phase in ['added', 'restored']:
            end = time.monotonic() + 60
            while time.monotonic() < end:
                text = current.path.read_text()
                hosts = [int(n) for n in re.findall(r'Rust app PID=(\d+)', text)]
                if hosts[-1] != old_host and text.count('SERVING (canonical gRPC health check)') > prior_ready:
                    break
                assert current.process.poll() is None, text
                time.sleep(0.1)
            else:
                raise AssertionError('watch regeneration timeout: ' + current.path.read_text())
            assert not Path(f'/proc/{old_host}').exists()
            generated = list((TARGET / 'debug/build').glob('rust_greetings-*/out/rust_greetings.v1.rs'))
            assert generated, 'No emitted application protobuf binding'
            generated = max(generated, key=lambda path: path.stat().st_mtime_ns)
            emitted = generated.read_text()
            assert ('pub struct RegenerationProbe' in emitted) == (phase == 'added'), emitted
            current.children.append(hosts[-1])
            current.data['children'] = current.children[:]
            record(f'WATCH {phase}: new actual generated host PID={hosts[-1]}, Database PID unchanged={current.children[0]}, emitted probe={phase == "added"}')
            assert command([TARGET / 'debug/client', 'read']) == '1'
            assert durable_count(current) == 1
            if http_fixture:
                http_fixture.restored(current)
            old_host = hosts[-1]
            if phase == 'added':
                prior_ready = current.path.read_text().count('SERVING (canonical gRPC health check)')
                proto_path.write_text(original)
    if http_fixture:
        http_fixture.begin_slow_body()
    assert current.close(signal.SIGTERM) == 143
    current = None
    current = Session('restart')
    if reader_registry_fixture:
        reader_registry_fixture.restored(current)
    if http_fixture:
        http_fixture.restored(current)
    assert command([TARGET / 'debug/client', 'read']) == '1'
    assert durable_count(current) == 1
    assert command([TARGET / 'debug/client', 'greet', 'hello', '11111111-1111-4111-8111-111111111111']) == '1'
    assert durable_count(current) == 1
    assert current.close(signal.SIGINT) == 130
    current = None
    current = Session('host-exit')
    # Supervision failure is caused by the actual generated app host exiting,
    # not by a fake sidecar/process shim.
    os.kill(current.children[1], signal.SIGTERM)
    assert current.process.wait(timeout=10) == 1, current.path.read_text()
    current.close()
    current = None
    current = Session('database-exit')
    os.kill(current.children[0], signal.SIGTERM)
    assert current.process.wait(timeout=10) == 1, current.path.read_text()
    current.close()
    current = None
    smoke = command([RBT, 'dev', 'run', '--rust-allow-insecure-database', f'--port={PORT}', '--terminate-after-health-check'], timeout=90)
    smoke_children = [int(n) for n in re.findall(r'Rust (?:Database|app) PID=(\d+)', smoke)]
    assert len(smoke_children) == 2 and all(not Path(f'/proc/{pid}').exists() for pid in smoke_children)
    evidence['smoke_children_terminal'] = smoke_children
    current = Session('failed-build')
    proto_path.write_text(original + '\ninvalid proto syntax\n')
    try:
        failed_status = current.process.wait(timeout=240)
    except subprocess.TimeoutExpired:
        timeout_seen = True
        raise
    assert failed_status == 1, current.path.read_text()
    current.close()
    current = None
    record('PASS failed live rebuild exits CLI and reaps host/Database instead of serving stale code')
    evidence['passed'] = True
    record('PASS actual init + Cargo generation + typed create/write/replay/read + canonical durable Load + RocksDB restart + CLI SIGTERM/SIGINT cleanup + actual host-exit supervision')
except BaseException as error:
    if isinstance(error, (subprocess.TimeoutExpired, TimeoutError)):
        timeout_seen = True
    evidence['passed'] = False
    evidence['failure'] = repr(error)
    raise
finally:
    if current and not timeout_seen:
        current.close()
    evidence['app_directory'] = str(APP)
    evidence['frozen_sources_match_end'] = all(Path(path).is_file() and hashlib.sha256(Path(path).read_bytes()).hexdigest() == digest for path, digest in evidence['source_hashes'].items())
    if not evidence['frozen_sources_match_end']:
        evidence['passed'] = False
    for file in APP.rglob('*'):
        if file.is_file() and '.rbt' not in file.parts and 'generated-python' not in file.parts:
            evidence['source_hashes'][str(file)] = hashlib.sha256(file.read_bytes()).hexdigest()
    evidence['binary_hashes'] = {str(TARGET / 'debug' / name): hashlib.sha256((TARGET / 'debug' / name).read_bytes()).hexdigest()
                                 for name in ['app', 'client'] if (TARGET / 'debug' / name).is_file()}
    evidence['environment'] = {key: ENV[key] for key in ENV if key.startswith(('CARGO_', 'RBT_RUST_'))}
    RESULT.write_text(json.dumps(evidence, indent=2))
    assert evidence['frozen_sources_match_end'], 'SDK/CLI source changed during acceptance'
