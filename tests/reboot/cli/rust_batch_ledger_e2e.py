"""Public Cargo/rbt approval-ledger native acceptance. No fixture/private seeding.

Run with RUST_BATCH_STAGE, RUST_BATCH_TARGET, RUST_BATCH_DATABASE_BINARY and
RUST_BATCH_RBT. A caller must hold TARGET/owner.lock for the entire run.
Timeouts preserve live handles; no descendant is killed on timeout.
"""
from pathlib import Path
import hashlib
import importlib
import json
import os
import re
import signal
import subprocess
import sys
import time

import grpc
import grpc_tools
from grpc_tools import protoc

ROOT = Path(__file__).resolve().parents[3]
STAGE = Path(os.environ['RUST_BATCH_STAGE'])
STAGE.mkdir(parents=True, exist_ok=True)
canonical = STAGE / 'canonical-python'
canonical.mkdir()
assert protoc.main(['protoc', '-I' + str(ROOT), '-I' + str(Path(grpc_tools.__file__).parent / '_proto'),
                    '--python_out=' + str(canonical), '--grpc_python_out=' + str(canonical),
                    *[str(ROOT / ('rbt/v1alpha1/' + name + '.proto')) for name in ['database', 'tasks', 'application_metadata']]]) == 0
sys.path.insert(0, str(canonical))
from rbt.v1alpha1 import database_pb2 as db, database_pb2_grpc as db_grpc, tasks_pb2, tasks_pb2_grpc
APP = STAGE / 'project'
APP.mkdir()
TARGET = Path(os.environ['RUST_BATCH_TARGET'])
BINARY = Path(os.environ['RUST_BATCH_DATABASE_BINARY'])
RBT = Path(os.environ['RUST_BATCH_RBT'])
PORT = int(os.environ.get('RUST_BATCH_PORT', '12993'))
ENV = dict(os.environ, CARGO_TARGET_DIR=str(TARGET), CARGO_INCREMENTAL='0',
           CARGO_BUILD_JOBS='2', CARGO_PROFILE_DEV_DEBUG='0', CARGO_PROFILE_TEST_DEBUG='0',
           RBT_RUST_DATABASE_BINARY=str(BINARY), RBT_RUST_URL=f'http://127.0.0.1:{PORT}',
           RBT_RUST_TASK_ADMIN_TOKEN=str(__import__('uuid').uuid4()))
RESULT = STAGE / 'result.json'
evidence = {'commands': [], 'sessions': [], 'checks': [], 'live_handles': [],
            'database_sha256': hashlib.sha256(BINARY.read_bytes()).hexdigest()}
timeout_seen = False


def checkpoint():
    RESULT.write_text(json.dumps(evidence, indent=2))


def check(name, condition=True):
    assert condition, name
    evidence['checks'].append(name)
    print('PASS', name, flush=True)
    checkpoint()


def until(predicate, label, seconds=15):
    global timeout_seen
    end = time.monotonic() + seconds
    while time.monotonic() < end:
        if predicate():
            return
        time.sleep(.05)
    timeout_seen = True
    checkpoint()
    raise TimeoutError(label)


def command(args, timeout=180, ok=True):
    global timeout_seen
    n = len(evidence['commands'])
    path = STAGE / f'command-{n}.log'
    with path.open('w') as out:
        proc = subprocess.Popen([str(a) for a in args], cwd=APP, env=ENV,
                                stdout=out, stderr=subprocess.STDOUT, start_new_session=True)
        data = {'argv': [str(a) for a in args], 'pid': proc.pid, 'log': str(path)}
        evidence['commands'].append(data)
        checkpoint()
        try:
            proc.wait(timeout=timeout)
        except subprocess.TimeoutExpired:
            timeout_seen = True
            evidence['live_handles'].append(data)
            checkpoint()
            raise
    data['exit'] = proc.returncode
    checkpoint()
    text = path.read_text()
    if ok:
        assert proc.returncode == 0, text
    return text.strip(), proc.returncode


class Session:
    def __init__(self, name, admin=True):
        self.name = name
        self.host_log_offset = self.host_log.stat().st_size if self.host_log.exists() else 0
        self.log = STAGE / f'session-{name}.log'
        self.out = self.log.open('w')
        host_env = dict(ENV)
        if not admin:
            host_env.pop('RBT_RUST_TASK_ADMIN_TOKEN')
        self.process = subprocess.Popen([str(RBT), 'dev', 'run', '--rust-allow-insecure-database', f'--port={PORT}'], cwd=APP, env=host_env, stdout=self.out, stderr=subprocess.STDOUT, start_new_session=True)
        self.data = {'name': name, 'cli_pid': self.process.pid, 'log': str(self.log)}
        evidence['sessions'].append(self.data)
        checkpoint()
        def ready():
            text = self.log.read_text()
            assert self.process.poll() is None, text
            return 'SERVING (canonical gRPC health check)' in text
        until(ready, 'CLI recovery readiness', 240)
        self.children = self.pids()
        assert len(self.children) == 2, self.log.read_text()
        self.data['children'] = self.children[:]
        fields = Path(f'/proc/{self.children[0]}/cmdline').read_bytes().split(b'\0')
        self.database_port = int(fields[3])
        self.data['database_port'] = self.database_port
        checkpoint()

    def pids(self):
        return [int(n) for n in re.findall(r'Rust (?:Database|app) PID=(\d+)', self.log.read_text())]

    @property
    def host_log(self):
        return APP / '.rbt/dev/batch_ledger/rust/host.log'

    def host_text(self):
        return self.host_log.read_bytes()[self.host_log_offset:].decode()

    def close(self, sig=signal.SIGTERM):
        if self.process.poll() is None:
            self.process.send_signal(sig)
        try:
            self.process.wait(timeout=15)
        except subprocess.TimeoutExpired:
            global timeout_seen
            timeout_seen = True
            evidence['live_handles'].append(self.data)
            checkpoint()
            raise
        self.out.close()
        self.data['exit'] = self.process.returncode
        self.data['all_children'] = self.pids()
        check(self.name + ' process groups reaped', all(not Path(f'/proc/{pid}').exists() for pid in self.data['all_children']))
        return self.process.returncode


def client(*args, ok=True):
    return command([TARGET / 'debug/client', *args], timeout=15, ok=ok)


def read():
    text, _ = client('read')
    return text.split()


def wait_state(approved, completed):
    until(lambda: read()[2:4] == [str(approved), str(completed)], 'workflow checkpoint')


class Watch:
    def __init__(self, name):
        self.log = STAGE / ('watch-' + name + '.log')
        self.out = self.log.open('w')
        self.proc = subprocess.Popen([str(TARGET / 'debug/client'), 'watch'], cwd=APP, env=ENV, stdout=self.out, stderr=subprocess.STDOUT, start_new_session=True)
        evidence['live_handles'].append({'kind': 'watch', 'pid': self.proc.pid, 'log': str(self.log)})
        checkpoint()
        until(lambda: bool(self.log.read_text()), 'watch baseline')

    def close(self):
        if self.proc.poll() is None:
            self.proc.send_signal(signal.SIGTERM)
        self.proc.wait(timeout=5)
        self.out.close()


class ReconnectingWatch:
    def __init__(self):
        self.log = STAGE / 'reconnecting-watch.log'
        self.out = self.log.open('w')
        self.proc = subprocess.Popen([str(TARGET / 'debug/client'), 'watch-reconnect', '600000'], cwd=APP, env=ENV,
            stdin=subprocess.PIPE, stdout=self.out, stderr=subprocess.STDOUT, text=True, start_new_session=True)
        evidence['live_handles'].append({'kind': 'reconnecting-watch', 'pid': self.proc.pid, 'log': str(self.log)})
        checkpoint()
        until(lambda: 'batch-001 3 0 0 1' in self.log.read_text(), 'persistent typed subscription baseline')

    def send(self, command, expected):
        offset = self.log.stat().st_size
        self.proc.stdin.write(command + '\n'); self.proc.stdin.flush()
        def observed():
            assert self.proc.poll() is None, self.log.read_text()
            return expected in self.log.read_bytes()[offset:].decode()
        until(observed, 'explicit reactive ' + command, 20)
        check('persistent reactive ' + command + ' ' + expected)
        return self.log.read_bytes()[offset:].decode()

    def close(self, expect_success=True):
        if self.proc.poll() is None:
            self.proc.stdin.write('quit\n'); self.proc.stdin.flush()
        self.proc.wait(timeout=5)
        self.proc.stdin.close(); self.out.close()
        check('persistent reconnect client reaped', (not expect_success or self.proc.returncode == 0) and not Path(f'/proc/{self.proc.pid}').exists())


def list_denied(code, token=None, server='local-rust'):
    with grpc.insecure_channel(f'127.0.0.1:{PORT}') as channel:
        request = tasks_pb2.ListTasksRequest()
        if server is not None:
            request.only_server_id = server
        stub = tasks_pb2_grpc.TasksStub(channel)
        for name in ['ListTasks', 'ListTasksStream']:
            try:
                reply = getattr(stub, name)(request, timeout=3,
                    metadata=[('authorization', 'Bearer ' + token)] if token else [])
                if name.endswith('Stream'):
                    next(reply)
                raise AssertionError('listing unexpectedly authorized')
            except grpc.RpcError as error:
                check(name + ' rejects ' + code.name, error.code() == code)


def stream_deadline():
    with grpc.insecure_channel(f'127.0.0.1:{PORT}') as channel:
        stream = tasks_pb2_grpc.TasksStub(channel).ListTasksStream(
            tasks_pb2.ListTasksRequest(only_server_id='local-rust'), timeout=.7,
            metadata=[('authorization', 'Bearer ' + ENV['RBT_RUST_TASK_ADMIN_TOKEN'])])
        initial = next(stream)
        try:
            next(stream)
            raise AssertionError('unchanged stream emitted duplicate snapshot')
        except grpc.RpcError as error:
            check('canonical stream initial/no duplicates/deadline', error.code() == grpc.StatusCode.DEADLINE_EXCEEDED)
        return initial


class TaskWatch:
    def __init__(self, name):
        self.log = STAGE / ('task-watch-' + name + '.log')
        self.out = self.log.open('w')
        self.proc = subprocess.Popen([str(TARGET / 'debug/client'), 'tasks-watch'], cwd=APP,
            env=ENV, stdout=self.out, stderr=subprocess.STDOUT, start_new_session=True)
        evidence['live_handles'].append({'kind': 'task-watch', 'pid': self.proc.pid, 'log': str(self.log)})
        checkpoint()
        until(lambda: 'TASKS ' in self.log.read_text(), 'generated task stream baseline')

    def observed(self, uuid=None, phase=None):
        until(lambda: (uuid + ' ' + phase in self.log.read_text()) if uuid else
            self.log.read_text().rstrip().endswith('TASKS 0'), 'generated task stream change')
        check('generated task stream ' + (phase or 'empty'))

    def close(self):
        if self.proc.poll() is None:
            self.proc.send_signal(signal.SIGTERM)
        self.proc.wait(timeout=5)
        self.out.close()
        check('task stream client reaped', not Path(f'/proc/{self.proc.pid}').exists())


def listed(task_uuid, phase, due=None):
    def observed():
        lines = client('tasks')[0].splitlines()
        return len(lines) == 1 and lines[0].split()[:2] == [task_uuid, phase]
    until(observed, 'actual listed dispatcher phase ' + phase)
    fields = client('tasks')[0].split()
    check('generated admin listing actual ' + phase,
          fields[0:3] == [task_uuid, phase, 'RunBatch'] and float(fields[3]) > 0
          and fields[4] == (str(due) + '.000000000' if due else '-')
          and fields[5:] == ['0', '0'])


def native(session, task_uuid=None):
    with grpc.insecure_channel(f'127.0.0.1:{session.database_port}') as channel:
        stub = db_grpc.DatabaseStub(channel)
        tasks = [tasks_pb2.TaskId(state_type='batch_ledger.v1.Ledger', state_ref=reference, task_uuid=__import__('uuid').UUID(task_uuid).bytes)] if task_uuid else []
        loaded = stub.Load(db.LoadRequest(actors=[db.Actor(state_type='batch_ledger.v1.Ledger', state_ref=reference)], task_ids=tasks), timeout=3)
        state = proto.Ledger.FromString(loaded.actors[0].state)
        rows = stub.ColocatedRange(db.ColocatedRangeRequest(state_type='rbt.std.collections.v1.SortedMapEntry', parent_state_ref=map_ref, limit=200), timeout=3)
        task = loaded.tasks[0] if tasks else None
        mutations = []
        if tasks:
            request = proto.Submit.FromString(task.request)
            for iteration in range(request.count):
                for response in stub.RecoverIdempotentMutations(db.RecoverIdempotentMutationsRequest(state_type='batch_ledger.v1.Ledger', state_ref=reference, workflow_id=tasks[0].task_uuid, workflow_iteration=iteration), timeout=3):
                    mutations.extend(response.idempotent_mutations)
            for mutation in mutations:
                assert mutation.workflow_id == tasks[0].task_uuid and mutation.request_fingerprint
                from google.protobuf.any_pb2 import Any
                response = Any.FromString(mutation.response)
                assert response.type_url == 'type.googleapis.com/batch_ledger.v1.Ledger'
                proto.Ledger.FromString(response.value)
        evidence.setdefault('durable', []).append({'session': session.name, 'state_hex': loaded.actors[0].state.hex(), 'approved': state.approved, 'completed': state.completed, 'raw_keys': list(rows.keys), 'keys': logical_keys(rows), 'task_status': task.status if task else None, 'task_hex': task.SerializeToString().hex() if task else None, 'replay_records': len(mutations), 'replay_hex': [m.SerializeToString().hex() for m in mutations]})
        checkpoint()
        return state, rows, task, mutations


def logical_keys(rows):
    from reboot.aio.types import StateRef
    keys = []
    for key in rows.keys:
        assert key.startswith(map_ref + '/'), key
        keys.append(str(StateRef.from_maybe_readable(key).id))
    return keys


def events(session):
    return [line for line in session.host_text().splitlines() if 'batch-ledger-handler' in line]


def reader_zero(session):
    until(lambda: 'batch-ledger-active-readers 0' in session.host_text() and session.host_text().rfind('batch-ledger-active-readers 0') > session.host_text().rfind('batch-ledger-active-readers 1'), 'subscriber owner reclaimed')


def rebuild(session, text):
    path = APP / 'api/batch_ledger/v1/batch.proto'
    old = session.pids()[-1]
    prior = session.log.read_text().count('SERVING (canonical gRPC health check)')
    path.write_text(text)
    until(lambda: session.log.read_text().count('SERVING (canonical gRPC health check)') > prior, 'live proto rebuild', 240)
    check('watch rebuild retained Database/reaped old host', session.pids()[0] == session.children[0] and session.pids()[-1] != old and not Path(f'/proc/{old}').exists())
    return old


current = None
reconnecting = None
watch = None
task_watch = None
try:
    command([RBT, 'init', '--backend=rust', '--frontend=none', '--application-name=batch_ledger', '--rust-sdk=' + str(ROOT / 'reboot/rust'), '--rust-example=batch-ledger'])
    command(['cargo', 'clippy', '--manifest-path', 'backend/Cargo.toml', '--all-targets', '--', '-D', 'warnings'])
    command(['cargo', 'fmt', '--manifest-path', 'backend/Cargo.toml', '--', '--check'])
    tests, _ = command(['cargo', 'test', '--manifest-path', 'backend/Cargo.toml', '--all-targets'])
    check('generated consumer strict Clippy/fmt and nonzero tests', '4 passed' in tests)
    command(['cargo', 'build', '--manifest-path', 'backend/Cargo.toml', '--bins'])
    py = STAGE / 'generated-python'
    py.mkdir()
    status = protoc.main(['protoc', '-I' + str(APP / 'api'), '-I' + str(ROOT), '-I' + str(Path(grpc_tools.__file__).parent / '_proto'), '--python_out=' + str(py), str(APP / 'api/batch_ledger/v1/batch.proto')])
    assert status == 0
    sys.path.insert(0, str(py))
    proto = importlib.import_module('batch_ledger.v1.batch_pb2')
    # State refs come from canonical SDK's typed public client metadata, decoded
    # from normal serving application startup below; no state record is seeded.
    # Canonical algorithm is the same public StateRef wire encoding as SDK.
    from reboot.aio.types import StateRef
    reference = str(StateRef.from_id('batch_ledger.v1.Ledger', 'ledger'))
    map_ref = str(StateRef.from_id('rbt.std.collections.v1.SortedMap', 'approvals'))
    current = Session('admin-disabled', admin=False)
    list_denied(grpc.StatusCode.PERMISSION_DENIED, token=ENV['RBT_RUST_TASK_ADMIN_TOKEN'])
    current.close(); current = None
    current = Session('first')
    list_denied(grpc.StatusCode.UNAUTHENTICATED)
    list_denied(grpc.StatusCode.UNAUTHENTICATED, token='invalid')
    list_denied(grpc.StatusCode.UNIMPLEMENTED, token=ENV['RBT_RUST_TASK_ADMIN_TOKEN'], server=None)
    list_denied(grpc.StatusCode.UNAVAILABLE, token=ENV['RBT_RUST_TASK_ADMIN_TOKEN'], server='wrong-server')
    check('authenticated generated task listing starts empty', client('tasks')[0] == '')
    check('empty stream snapshot', not stream_deadline().tasks)
    task_watch = TaskWatch('initial')
    client('create')
    uuid, _ = client('submit', 'batch-001', '3', '11111111-1111-4111-8111-111111111111')
    replay, _ = client('submit', 'batch-001', '3', '11111111-1111-4111-8111-111111111111')
    check('submit same key same task UUID', replay == uuid)
    changed, status = client('submit', 'changed', '3', '11111111-1111-4111-8111-111111111111', ok=False)
    check('submit fingerprint collision rejected', status != 0)
    watch = Watch('initial')
    reconnecting = ReconnectingWatch()
    check('index zero not implicitly approved', read()[2:4] == ['0', '0'])
    pending, status = client('wait', uuid, '150', ok=False)
    check('typed pending Wait preserves deadline', status != 0 and ('DeadlineExceeded' in pending or 'Cancelled' in pending))
    state, rows, task, _ = native(current, uuid)
    check('canonical task is Pending with no approvals', task.status == db.Task.PENDING and state.completed == 0 and not rows.keys)
    before_direct = task.SerializeToString().hex()
    for rejection in ['false', 'true']:
        denied, status = client('checkpoint-direct', 'batch-001', '0', rejection, ok=False)
        check('public checkpoint cannot forge progress/rejection ' + rejection,
              status != 0 and 'PermissionDenied' in denied)
    unchanged, unchanged_rows, unchanged_task, unchanged_replay = native(current, uuid)
    check('public checkpoint denial preserves canonical actor/task/map/replay',
          unchanged.SerializeToString() == state.SerializeToString() and not unchanged_rows.keys
          and unchanged_task.SerializeToString().hex() == before_direct and not unchanged_replay)
    listed(uuid, 'STARTED')
    task_watch.observed(uuid, 'STARTED')
    task_watch.close(); task_watch = None
    for args in [('approve', 'other', '0'), ('approve', 'batch-001', '2'), ('approve', 'batch-001', '3'), ('approve-invalid', 'batch-001', '0')]:
        _, status = client(*args, ok=False)
        check('invalid approval rejected ' + ' '.join(args), status != 0)
    state, rows, _, _ = native(current, uuid)
    check('caught map range doom leaves BOTH unchanged', state.approved == 0 and state.completed == 0 and not rows.keys)
    client('approve', 'batch-001', '0')
    wait_state(1, 1)
    state, rows, _, mutations = native(current, uuid)
    check('atomic approval persisted map/app and saved step', state.approved == 1 and state.completed == 1 and logical_keys(rows) == ['batch-001:0000'] and mutations)
    for _ in range(4):
        observed = reconnecting.send('next', 'batch-001')
        if 'batch-001 3 1 1 1' in observed:
            break
    else:
        raise AssertionError('live typed subscriber missed acknowledged checkpoint')
    check('persistent subscription live committed change')
    reconnecting.send('reconnect', 'batch-001 3 1 1 1')
    before = events(current)
    check('one checkpoint before restart', sum('checkpoint-batch-001-0' in line for line in before) == 1)
    path = APP / 'api/batch_ledger/v1/batch.proto'
    original = path.read_text()
    rebuild(current, original + '\nmessage WatchRegenerationProbe {}\n')
    until(lambda: watch.proc.poll() is not None, 'old typed stream closes on rebuild')
    watch.close()
    generated = list(TARGET.glob('debug/build/batch_ledger-*/out/batch_ledger.v1.rs'))
    check('watch generated actual binding', any('WatchRegenerationProbe' in p.read_text() for p in generated))
    watch = Watch('after-rebuild')
    check('new stream persisted baseline', 'batch-001 3 1 1 1' in watch.log.read_text())
    watch.close(); watch = None
    reconnecting.send('reconnect', 'batch-001 3 1 1 1')
    reconnecting.send('disconnect', 'DISCONNECTED')
    reader_zero(current)
    rebuild(current, original)
    wait_state(1, 1)
    check('watch preserves pending workflow checkpoint', native(current, uuid)[0].completed == 1)
    reconnecting.send('reconnect', 'batch-001 3 1 1 1')
    current.close(); current = None
    reconnecting.send('reconnect', 'DISCONNECTED Unavailable')
    current = Session('parked-restart')
    reconnecting.send('reconnect', 'batch-001 3 1 1 1')
    reconnecting.close(); reconnecting = None
    reader_zero(current)
    wait_state(1, 1)
    check('same pending UUID survives full RocksDB restart', native(current, uuid)[2].status == db.Task.PENDING)
    listed(uuid, 'STARTED')
    check('saved first step not remutated after restart', not any('checkpoint-batch-001-0' in line for line in events(current)))
    task_watch = TaskWatch('completion')
    task_watch.observed(uuid, 'STARTED')
    for i in range(3):
        w = Watch('drop-' + str(i)); w.close(); reader_zero(current)
    client('approve', 'batch-001', '1'); client('approve', 'batch-001', '2')
    completed, _ = client('wait', uuid, '5000')
    state, rows, task, _ = native(current, uuid)
    check('canonical Completed task and three sorted approvals', task.status == db.Task.COMPLETED and state.completed == 3 and logical_keys(rows) == ['batch-001:0000', 'batch-001:0001', 'batch-001:0002'])
    until(lambda: client('tasks')[0] == '', 'completed task pruned from live listing')
    check('completed task absent from pending-only listing')
    task_watch.observed(); task_watch.close(); task_watch = None
    check('no stream replay of completed task', not stream_deadline().tasks)
    saved = task.SerializeToString().hex()
    check('typed public transactional history', client('history', 'batch-001')[0].splitlines() == logical_keys(rows))
    current.close(signal.SIGINT); current = None
    current = Session('completed-restart')
    check('typed completion identical after second restart', client('wait', uuid, '5000')[0] == completed)
    check('no completed body or step redispatch', not events(current))
    check('completed history not synthesized on restart listing', client('tasks')[0] == '')
    check('canonical terminal byte identity', native(current, uuid)[2].SerializeToString().hex() == saved)
    rejected, _ = client('submit-rejecting', 'batch-rejected', '2', '44444444-4444-4444-8444-444444444444', '0', '1')
    client('approve', 'batch-rejected', '0')
    rejected_wait, _ = client('wait', rejected, '5000')
    check('typed workflow declared rejection', rejected_wait == 'REJECTED batch-rejected 1 rejected after acknowledged checkpoint')
    state, rows, rejected_task, rejected_replay = native(current, rejected)
    from google.rpc import status_pb2
    rich = status_pb2.Status.FromString(rejected_task.error.value)
    check('canonical declared workflow terminal', rejected_task.status == db.Task.COMPLETED
          and rejected_task.WhichOneof('response_or_error') == 'error'
          and rejected_task.error.type_url == 'type.googleapis.com/google.rpc.Status'
          and rich.code == grpc.StatusCode.UNKNOWN.value[0] and len(rich.details) == 1
          and rich.details[0].type_url == 'type.googleapis.com/batch_ledger.v1.BatchRejected'
          and proto.BatchRejected.FromString(rich.details[0].value).batch == 'batch-rejected'
          and proto.BatchRejected.FromString(rich.details[0].value).completed == 1)
    check('declared rejection preserves acknowledged app/map/checkpoint', state.rejected
          and state.approved == state.completed == 1 and state.count == 2
          and 'batch-rejected:0000' in logical_keys(rows) and rejected_replay)
    _, status = client('approve', 'batch-rejected', '1', ok=False)
    check('rejected batch cannot accept further approvals', status != 0)
    until(lambda: client('tasks')[0] == '', 'declared terminal pruned from pending listing')
    saved_error = rejected_task.SerializeToString().hex()
    saved_state = state.SerializeToString().hex()
    saved_replay = [m.SerializeToString().hex() for m in rejected_replay]
    current.close(); current = None
    current = Session('declared-error-restart')
    check('typed declared Wait identical after RocksDB restart', client('wait', rejected, '5000')[0] == rejected_wait)
    state, rows, rejected_task, rejected_replay = native(current, rejected)
    check('declared terminal checkpoint and app bytes stable across restart',
          rejected_task.SerializeToString().hex() == saved_error and state.SerializeToString().hex() == saved_state
          and [m.SerializeToString().hex() for m in rejected_replay] == saved_replay)
    check('declared terminal never retries or redispatches after restart', not events(current) and client('tasks')[0] == '')
    future = int(time.time()) + 120
    delayed, _ = client('submit', 'batch-002', '1', '22222222-2222-4222-8222-222222222222', str(future))
    client('approve', 'batch-002', '0')
    check('future task not started', read()[3] == '0')
    listed(delayed, 'SCHEDULED', future)
    current.close(); current = None
    current = Session('future-restart')
    check('future timestamp persisted before due', time.time() < future and native(current, delayed)[2].timestamp.seconds == future and not events(current))
    listed(delayed, 'SCHEDULED', future)
    until(lambda: time.time() >= future, 'future due', 125)
    client('wait', delayed, '5000')
    check('delayed task completed after due', native(current, delayed)[2].status == db.Task.COMPLETED)
    # Shutdown with a real parked workflow and subscription, then lock reuse.
    parked, _ = client('submit', 'batch-003', '1', '33333333-3333-4333-8333-333333333333')
    watch = Watch('shutdown-parked')
    task_watch = TaskWatch('shutdown-parked')
    task_watch.observed(parked, 'STARTED')
    current.close(); current = None
    until(lambda: task_watch.proc.poll() is not None, 'task stream closes on host shutdown')
    task_watch.close(); task_watch = None
    until(lambda: watch.proc.poll() is not None, 'parked host subscription drained')
    watch.close(); watch = None
    current = Session('lock-reuse')
    check('durable lock reusable and pending task retained', native(current, parked)[2].status == db.Task.PENDING)
    task_watch = TaskWatch('restart')
    task_watch.observed(parked, 'STARTED')
    task_watch.close(); task_watch = None
    current.close(); current = None
    check('acceptance complete')
    evidence['accepted'] = True
finally:
    if not timeout_seen:
        if reconnecting is not None:
            reconnecting.close(expect_success=False)
        if task_watch is not None:
            task_watch.close()
        if watch is not None:
            watch.close()
        if current is not None:
            current.close()
    else:
        if current is not None:
            evidence['live_handles'].append(current.data)
    checkpoint()
