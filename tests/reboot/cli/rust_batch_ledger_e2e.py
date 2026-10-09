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
    def __init__(self, index=False, work=False):
        self.log = STAGE / ('work-reconnecting-watch.log' if work else 'index-reconnecting-watch.log' if index else 'reconnecting-watch.log')
        self.out = self.log.open('w')
        self.proc = subprocess.Popen([str(TARGET / 'debug/client'), 'watch-work-reconnect' if work else 'watch-index-reconnect' if index else 'watch-reconnect', '600000'], cwd=APP, env=ENV,
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


def cancel_denied(code, task_uuid=None, token=None, routed_ref=None):
    import uuid as uuid_module
    task_uuid = task_uuid or str(uuid_module.uuid4())
    request = tasks_pb2.CancelTaskRequest(task_id=tasks_pb2.TaskId(
        state_type='batch_ledger.v1.Ledger', state_ref=reference,
        task_uuid=uuid_module.UUID(task_uuid).bytes))
    metadata = [('x-reboot-state-ref', routed_ref or reference)]
    if token:
        metadata.append(('authorization', 'Bearer ' + token))
    with grpc.insecure_channel(f'127.0.0.1:{PORT}') as channel:
        try:
            tasks_pb2_grpc.TasksStub(channel).CancelTask(request, metadata=metadata, timeout=3)
            raise AssertionError('cancellation unexpectedly admitted')
        except grpc.RpcError as error:
            check('CancelTask rejects ' + code.name, error.code() == code)


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


def finite_decision_value(raw):
    # Evidence decoder for the private runtime envelope, never a fabricated result.
    from google.protobuf import descriptor_pb2, descriptor_pool, message_factory
    descriptor=descriptor_pb2.FileDescriptorProto(name='finite_decision_evidence.proto',package='acceptance',syntax='proto3')
    message=descriptor.message_type.add(name='FiniteDecisionEvidence')
    for name,number,kind in [('response',1,12),('response_type',2,9),('break_loop',3,8)]:
        message.field.add(name=name,number=number,type=kind,label=1)
    pool=descriptor_pool.DescriptorPool();pool.Add(descriptor)
    klass=message_factory.MessageFactory(pool).GetPrototype(pool.FindMessageTypeByName('acceptance.FiniteDecisionEvidence'))
    value=klass.FromString(raw)
    assert value.response_type=='type.googleapis.com/batch_ledger.v1.Ledger'
    return value,proto.Ledger.FromString(value.response)


def reader_outcome_value(raw):
    from google.protobuf import descriptor_pb2, descriptor_pool, message_factory
    from google.protobuf.any_pb2 import Any
    f=descriptor_pb2.FileDescriptorProto(name='reader_outcome_evidence.proto',package='acceptance',syntax='proto3',dependency=['google/protobuf/any.proto'])
    m=f.message_type.add(name='ReaderOutcomeEvidence');m.oneof_decl.add(name='outcome')
    m.field.add(name='response_type',number=1,type=9,label=1)
    m.field.add(name='response',number=2,type=12,label=1,oneof_index=0)
    m.field.add(name='error',number=3,type=11,type_name='.google.protobuf.Any',label=1,oneof_index=0)
    pool=descriptor_pool.DescriptorPool();pool.AddSerializedFile(Any.DESCRIPTOR.file.serialized_pb);pool.Add(f)
    value=message_factory.MessageFactory(pool).GetPrototype(pool.FindMessageTypeByName('acceptance.ReaderOutcomeEvidence')).FromString(raw)
    assert value.response_type=='type.googleapis.com/batch_ledger.v1.Ledger' and value.WhichOneof('outcome') is not None
    return value


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
            if os.environ.get('RUST_BATCH_LOOP_DECISION_ONLY') or os.environ.get('RUST_BATCH_READER_OUTCOME_ONLY'):
                for response in stub.RecoverIdempotentMutations(db.RecoverIdempotentMutationsRequest(state_type='batch_ledger.v1.Ledger',state_ref=reference,workflow_id=tasks[0].task_uuid),timeout=3):
                    mutations.extend(m for m in response.idempotent_mutations if not m.HasField('workflow_iteration'))
            for mutation in mutations:
                assert mutation.workflow_id == tasks[0].task_uuid and mutation.request_fingerprint
                from google.protobuf.any_pb2 import Any
                response = Any.FromString(mutation.response)
                if os.environ.get('RUST_BATCH_LOOP_DECISION_ONLY') and response.type_url=='type.googleapis.com/reboot.runtime.FiniteLoopDecision.v1':
                    value,observed=finite_decision_value(response.value)
                    assert mutation.HasField('workflow_iteration')
                    assert observed.batch==request.batch and observed.completed==mutation.workflow_iteration+1
                    assert observed.break_after==request.break_after and value.break_loop==(observed.completed>=request.break_after)
                    import uuid
                    name=b'batch-v1';alias=b'control'
                    namespace=uuid.uuid5(uuid.UUID(task_uuid),'reboot.finite.decision.v1')
                    encoded=len(name).to_bytes(8,'big')+name+mutation.workflow_iteration.to_bytes(8,'big')+len(alias).to_bytes(8,'big')+alias
                    digest=bytearray(hashlib.sha1(namespace.bytes+encoded).digest()[:16]);digest[6]=(digest[6]&15)|80;digest[8]=(digest[8]&63)|128
                    assert mutation.key==bytes(digest)
                elif os.environ.get('RUST_BATCH_READER_OUTCOME_ONLY') and response.type_url=='type.googleapis.com/reboot.runtime.ReaderOutcome.v1':
                    value=reader_outcome_value(response.value)
                    assert not mutation.HasField('workflow_iteration')
                    import uuid
                    namespace=uuid.uuid5(uuid.uuid5(uuid.UUID(task_uuid),'reboot.reader.outcome.v1'),'reboot.named.wait.v1')
                    alias=b'audit-reader';encoded=len(alias).to_bytes(8,'big')+alias
                    digest=bytearray(hashlib.sha1(namespace.bytes+encoded).digest()[:16]);digest[6]=(digest[6]&15)|80;digest[8]=(digest[8]&63)|128
                    assert mutation.key==bytes(digest)
                    if value.WhichOneof('outcome')=='error':
                        from google.rpc.status_pb2 import Status
                        rich=Status.FromString(value.error.value)
                        assert value.error.type_url=='type.googleapis.com/google.rpc.Status' and rich.code==grpc.StatusCode.UNKNOWN.value[0] and len(rich.details)==1
                        assert rich.details[0].type_url=='type.googleapis.com/batch_ledger.v1.BatchMismatch'
                        error=proto.BatchMismatch.FromString(rich.details[0].value)
                        assert error.expected==request.audit_batch and error.actual==request.batch and error.expected!=error.actual
                    else:
                        observed=proto.Ledger.FromString(value.response)
                        assert observed.batch==request.batch==request.audit_batch and not observed.audit_mismatch
                elif response.type_url == 'type.googleapis.com/google.rpc.Status':
                    from google.rpc.status_pb2 import Status
                    rich = Status.FromString(response.value)
                    assert rich.code == grpc.StatusCode.UNKNOWN.value[0] and len(rich.details) == 1
                    assert rich.details[0].type_url == 'type.googleapis.com/batch_ledger.v1.StepRejected'
                    proto.StepRejected.FromString(rich.details[0].value)
                else:
                    assert response.type_url == 'type.googleapis.com/batch_ledger.v1.Ledger'
                    proto.Ledger.FromString(response.value)
        evidence.setdefault('durable', []).append({'session': session.name, 'state_hex': loaded.actors[0].state.hex(), 'approved': state.approved, 'completed': state.completed, 'raw_keys': list(rows.keys), 'keys': logical_keys(rows), 'task_status': task.status if task else None, 'task_hex': task.SerializeToString().hex() if task else None, 'replay_records': len(mutations), 'replay_hex': [m.SerializeToString().hex() for m in mutations]})
        checkpoint()
        return state, rows, task, mutations


def archive_rows(session):
    with grpc.insecure_channel(f'127.0.0.1:{session.database_port}') as channel:
        rows = db_grpc.DatabaseStub(channel).ColocatedRange(db.ColocatedRangeRequest(
            state_type='rbt.std.collections.v1.SortedMapEntry', parent_state_ref=archive_ref, limit=200), timeout=3)
        evidence.setdefault('archive_durable', []).append({'session': session.name,
            'rows_hex': rows.SerializeToString().hex(), 'keys': logical_keys(rows, archive_ref)})
        checkpoint()
        return rows


def logical_keys(rows, parent=None):
    from reboot.aio.types import StateRef
    keys = []
    for key in rows.keys:
        assert key.startswith((parent or map_ref) + '/'), key
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
index_watch = None
work_watch = None
watch = None
task_watch = None
try:
    command([RBT, 'init', '--backend=rust', '--frontend=none', '--application-name=batch_ledger', '--rust-sdk=' + str(ROOT / 'reboot/rust'), '--rust-example=batch-ledger'])
    if os.environ.get('RUST_BATCH_LOOP_DECISION_ONLY'):
        lib=APP/'backend/src/lib.rs'
        text=lib.read_text()
        needle='move |state| state.completed >= threshold,'
        assert text.count(needle)==1
        text=text.replace(needle,'move |state| { event("finite-decision-evaluated"); state.completed >= threshold },')
        needle='std::ops::ControlFlow::Break(_) => {\n                        break;\n                    }'
        replacement='std::ops::ControlFlow::Break(_) => {\n                        if let Some(path)=std::env::var_os("RBT_RUST_FINITE_DECISION_PROBE") {\n                            let path=std::path::PathBuf::from(path);\n                            event("finite-break-before-after-loop");\n                            std::fs::write(&path,b"saved Break accepted; after-loop writer not entered")\n                                .map_err(|e|tonic::Status::internal(e.to_string()))?;\n                            while !path.with_extension("release").exists() {\n                                tokio::time::sleep(std::time::Duration::from_millis(10)).await;\n                            }\n                        }\n                        break;\n                    }'
        assert text.count(needle)==1
        lib.write_text(text.replace(needle,replacement))
        command(['cargo','fmt','--manifest-path','backend/Cargo.toml'])
        evidence['finite_handler_sha256']=hashlib.sha256(lib.read_bytes()).hexdigest()
    if os.environ.get('RUST_BATCH_MAP_LIFETIME_ONLY'):
        # Generated-handler overlay only: poll a real map reader to its native
        # await after a real eager insert, then drop it and try returning success.
        # No runtime hook or private Database write is used.
        lib=APP/'backend/src/lib.rs'
        text=lib.read_text()
        needle='        state.approved += 1;'
        probe='''        if std::env::var_os("RBT_RUST_MAP_LIFETIME_PROBE").is_some() {
            let mut pending = Box::pin(guard.range(reboot::sorted_map_proto::RangeRequest {
                start_key: Some(format!("{}:", request.batch)),
                end_key: Some(format!("{};", request.batch)),
                limit: 1,
            }));
            std::future::poll_fn(|cx| match std::future::Future::poll(pending.as_mut(), cx) {
                std::task::Poll::Pending => std::task::Poll::Ready(()),
                std::task::Poll::Ready(_) => panic!("map reader did not reach native await"),
            })
            .await;
            drop(pending);
            event("dropped-map-reader-after-real-insert");
        }
'''
        assert text.count(needle)==1
        lib.write_text(text.replace(needle,probe+needle))
    if os.environ.get('RUST_BATCH_COOPERATIVE_STOP_ONLY'):
        lib=APP/'backend/src/lib.rs'
        text=lib.read_text()
        needle='            result = generated::LedgerWorkMethodsWorkflowSteps::checkpoint('
        pause='''            if index==0 && request.stop_enabled && let Some(path)=std::env::var_os("RBT_RUST_STOP_BOUNDARY_PROBE") {
                let path=std::path::PathBuf::from(path);
                event("stop-boundary-before-checkpoint");
                std::fs::write(&path,b"durable approval accepted; writer not admitted").map_err(|e|tonic::Status::internal(e.to_string()))?;
                while !path.with_extension("release").exists() {
                    tokio::time::sleep(std::time::Duration::from_millis(10)).await;
                }
            }
'''
        assert text.count(needle)==1
        lib.write_text(text.replace(needle,pause+needle))
        command(['cargo','fmt','--manifest-path','backend/Cargo.toml'])
        evidence['cooperative_handler_sha256']=hashlib.sha256(lib.read_bytes()).hexdigest()
    if os.environ.get('RUST_BATCH_WRITER_FRAMEWORK_ONLY'):
        lib=APP/'backend/src/lib.rs'
        text=lib.read_text()
        needle='        // The rejected handler deliberately changes its tentative local copy.'
        injected='        if std::env::var_os("RBT_RUST_WRITER_FAILURE_PROBE").is_some() {\n            state.completed += 1;\n            event("framework-writer-failure");\n            let status=reboot::declared_error_status(tonic::Code::Unknown,"StepRejected","type.googleapis.com/batch_ledger.v1.StepRejected",&proto::StepRejected {\n                batch:request.batch.clone(),index:request.index,reason:"transport carrying declared-looking details".into(),\n            });\n            return Err(generated::LedgerWorkMethodsTryCheckpointError::Grpc(status));\n        }\n'
        assert text.count(needle)==1
        text=text.replace(needle,injected+needle)
        needle='                    Err(generated::LedgerWorkMethodsTryCheckpointError::Grpc(error)) => {\n                        return Err(error.into());'
        injected='                    Err(generated::LedgerWorkMethodsTryCheckpointError::Grpc(error)) => {\n                        if std::env::var_os("RBT_RUST_WRITER_FAILURE_PROBE").is_some() {\n                            event("caught-framework-writer-failure");\n                            return Ok(proto::Ledger::default());\n                        }\n                        return Err(error.into());'
        assert text.count(needle)==1
        lib.write_text(text.replace(needle,injected))
        command(['cargo','fmt','--manifest-path','backend/Cargo.toml'])
        evidence['writer_framework_handler_sha256']=hashlib.sha256(lib.read_bytes()).hexdigest()
    if os.environ.get('RUST_BATCH_CAUGHT_READER_ONLY'):
        # A real generated application handler deliberately catches a failed
        # framework reader observation. No private state/task seeding.
        lib = APP / 'backend/src/lib.rs'
        text = lib.read_text()
        needle = '        event(&format!("body-{}", request.batch));'
        overlay = '''        if std::env::var_os("RBT_RUST_CAUGHT_READER_PROBE").is_some() {
            let failed = generated::LedgerWorkMethodsWorkflowSteps::observe_batch_until(
                context, Arc::new(self.clone()), "caught-probe", "caught-probe.v1",
                proto::Batch { batch: "other".into() }, |_| true,
            ).await;
            assert!(failed.is_err());
            event("caught-reader-failure");
            return Ok(proto::Ledger::default());
        }
'''
        assert needle in text
        lib.write_text(text.replace(needle, overlay + needle))
        command(['cargo', 'fmt', '--manifest-path', 'backend/Cargo.toml'])
        evidence['caught_handler_sha256'] = hashlib.sha256(lib.read_bytes()).hexdigest()
    check('workflow reader composition removes duplicate view schema' , 'LedgerViewMethods' not in (APP / 'api/batch_ledger/v1/batch.proto').read_text())
    command(['cargo', 'clippy', '--manifest-path', 'backend/Cargo.toml', '--all-targets', '--', '-D', 'warnings'])
    command(['cargo', 'fmt', '--manifest-path', 'backend/Cargo.toml', '--', '--check'])
    tests, _ = command(['cargo', 'test', '--manifest-path', 'backend/Cargo.toml', '--all-targets'])
    check('generated consumer strict Clippy/fmt and nonzero tests', '12 passed' in tests)
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
    archive_ref = str(StateRef.from_id('rbt.std.collections.v1.SortedMap', 'archived-approvals'))
    if os.environ.get('RUST_BATCH_MAP_REENTRY_ONLY'):
        current=Session('map-reentry-start')
        until(lambda:'actor state must be constructed' in client('work-unary','multi',ok=False)[0],'bulk archive public admission')
        client('create')
        uuid,_=client('submit','multi','3','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee')
        for index in range(3):client('approve','multi',str(index))
        check('bulk source approvals complete real workflow',client('wait',uuid,'10000')[0]=='multi 3 3 3 1')
        keys=['multi:%04d'%i for i in range(3)]
        def snap():
            data=native(current,uuid)
            return (data[0].SerializeToString(),data[1].SerializeToString(),data[2].SerializeToString(),sorted(m.SerializeToString() for m in data[3]),archive_rows(current).SerializeToString())
        before=snap()
        check('three present-empty source values exist before bulk transfer',logical_keys(native(current,uuid)[1])==keys and not logical_keys(archive_rows(current),archive_ref))
        error,_=client('archive-many',keys[0]+','+keys[0],ok=False)
        check('duplicate keys reject without touching app or either map','Unknown' in error and snap()==before)
        error,_=client('archive-many','',ok=False)
        check('empty key rejects without touching app or either map','Unknown' in error and snap()==before)
        error,_=client('archive-many',keys[0]+',multi:9999',ok=False)
        check('later missing key aborts earlier eager source and destination changes','Unknown' in error and snap()==before)
        error,_=client('archive-many-invalid',','.join(keys),ok=False)
        check('caught late map failure dooms all repeated transfers and tentative counters',('Unknown' in error or 'Aborted' in error) and snap()==before)
        check('fresh bulk root commits after both abort cleanup paths',client('archive-many',','.join(keys))[0]=='ARCHIVED_MANY 3 3')
        source=native(current,uuid);archive=archive_rows(current)
        check('bulk commit removes all source keys and persists all archive values',not logical_keys(source[1]) and logical_keys(archive,archive_ref)==keys and list(archive.values)==[b'',b'',b''] and source[0].archived==3)
        check('bulk transfer preserves original workflow terminal and checkpoint bytes',source[2].SerializeToString()==before[2] and sorted(m.SerializeToString() for m in source[3])==before[3] and client('wait',uuid,'3000')[0]=='multi 3 3 3 1')
        final=snap()
        current.close();current=None
        current=Session('map-reentry-restart')
        until(lambda:native(current,uuid)[0].archived==3,'bulk state restored after Database and host restart')
        check('restart retains exact bulk app map task and checkpoint state',snap()==final)
        check('restart does not redispatch completed workflow',not any('body' in event for event in events(current)))
        error,_=client('archive-many',','.join(keys),ok=False)
        check('repeated bulk command rejects absent source without mutation','Unknown' in error and snap()==final)
        next_uuid,_=client('submit','next','1','ffffffff-ffff-4fff-8fff-ffffffffffff')
        client('approve','next','0')
        check('new root after restart has independent approval ownership',client('wait',next_uuid,'10000')[0]=='next 1 1 1 2')
        check('new bulk root cannot reuse prior root incarnation',client('archive-many','next:0000')[0]=='ARCHIVED_MANY 1 4' and logical_keys(archive_rows(current),archive_ref)==keys+['next:0000'])
        current.close();current=None
        evidence['accepted']=True
        raise SystemExit(0)
    if os.environ.get('RUST_BATCH_READER_OUTCOME_ONLY'):
        marker=STAGE/'accepted-reader-error';ENV['RBT_RUST_READER_AUDIT_PROBE']=str(marker)
        current=Session('reader-outcome-start')
        until(lambda:'actor state must be constructed' in client('work-unary','audited',ok=False)[0],'reader outcome public admission')
        client('create');baseline=client('read')[0]
        error,_=client('audit-direct','audited','other',ok=False)
        check('public audit fallback is denied before scheduling','PermissionDenied' in error and client('read')[0]==baseline)
        uuid,_=client('submit-audited','audited','1','cccccccc-cccc-4ccc-8ccc-cccccccccccc','0','other')
        until(lambda:marker.exists(),'declared reader error acknowledged before fallback')
        def snap(data):
            return (data[0].SerializeToString(),data[1].SerializeToString(),data[2].SerializeToString(),sorted(m.SerializeToString() for m in data[3]))
        paused=native(current,uuid);original=snap(paused)
        check('declared reader error saved without app/map effects or workflow terminal',paused[2].status==db.Task.PENDING and paused[2].iteration==0 and len(paused[3])==1 and not paused[0].audit_mismatch and paused[0].approved==paused[0].completed==0 and not logical_keys(paused[1]))
        check('reader handler actually executed once',sum('reader-audit-observe' in event for event in events(current))==1)
        error,_=client('audit-direct','audited','other',ok=False)
        check('public caller cannot take private audit continuation','PermissionDenied' in error and snap(native(current,uuid))==original)
        current.close();current=None
        current=Session('reader-outcome-restart')
        until(lambda:any('reader-audit-caught' in event for event in events(current)),'restart catches saved typed reader error')
        restored=native(current,uuid)
        check('restart restores exact Pending reader outcome and app/maps',snap(restored)==original)
        check('saved reader error bypasses live handler and predicate',not any('reader-audit-observe' in event for event in events(current)))
        marker.with_suffix('.release').write_text('allow private typed fallback')
        until(lambda:native(current,uuid)[0].audit_mismatch,'fallback writer acknowledged')
        check('typed audit fallback executes once',client('audit-read')[0]=='audited other true' and sum('reader-audit-fallback' in event for event in events(current))==1)
        client('approve','audited','0')
        check('catch and fallback retain canonical Wait success',client('wait',uuid,'10000')[0]=='audited 1 1 1 1')
        finished=native(current,uuid);final=snap(finished)
        check('reader error and fallback are durable alongside real approval map',finished[2].status==db.Task.COMPLETED and len(finished[3])==4 and logical_keys(finished[1])==['audited:0000'] and finished[0].audit_mismatch)
        current.close();current=None
        current=Session('reader-outcome-terminal-restart')
        until(lambda:native(current,uuid)[2].status==db.Task.COMPLETED,'reader outcome terminal restored')
        check('terminal restart retains exact app/task/map/reader/fallback bytes',snap(native(current,uuid))==final and client('wait',uuid,'3000')[0]=='audited 1 1 1 1')
        check('terminal reader workflow never redispatches',not any(any(mark in event for mark in ['body-audited','reader-audit-observe','reader-audit-fallback']) for event in events(current)))
        ENV.pop('RBT_RUST_READER_AUDIT_PROBE',None)
        matched,_=client('submit-audited','matched','1','dddddddd-dddd-4ddd-8ddd-dddddddddddd','0','matched')
        client('approve','matched','0')
        check('matching reader outcome completes without business fallback',client('wait',matched,'10000')[0]=='matched 1 1 1 2' and client('audit-read')[0]=='matched matched false')
        success=native(current,matched)
        check('matching outcome is a typed saved success not an error',success[2].status==db.Task.COMPLETED and len(success[3])==3)
        current.close();current=None
        evidence['accepted']=True
        raise SystemExit(0)
    if os.environ.get('RUST_BATCH_LOOP_DECISION_ONLY'):
        marker=STAGE/'accepted-break'
        ENV['RBT_RUST_FINITE_DECISION_PROBE']=str(marker)
        current=Session('finite-decision-start')
        until(lambda:'actor state must be constructed' in client('work-unary','finite',ok=False)[0],'finite public admission available')
        client('create')
        baseline=client('read')[0]
        error,_=client('submit-break','bad-threshold','2','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','0','3',ok=False)
        check('finite out-of-bound threshold is rejected without app mutation','threshold' in error and client('read')[0]==baseline)
        error,_=client('decision-finish-direct','finite','2',ok=False)
        check('after-loop writer denies public direct invocation even with admin','PermissionDenied' in error and client('read')[0]==baseline)
        uuid,_=client('submit-break','finite','3','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','0','2')
        client('approve','finite','0')
        def continued():
            data=native(current,uuid)
            return data[0].completed==1 and len(data[3])==3
        until(continued,'first iteration Continue persisted before second approval')
        first=native(current,uuid)
        check('Continue leaves real task Pending and next iteration parked',first[2].status==db.Task.PENDING and first[0].break_after==2 and not first[0].decision_finished and len(first[3])==3)
        client('approve','finite','1')
        until(lambda:marker.exists(),'saved Break before after-loop writer')
        paused=native(current,uuid)
        def snapshot(data):
            return (data[0].SerializeToString(),data[1].SerializeToString(),data[2].SerializeToString(),sorted(m.SerializeToString() for m in data[3]),archive_rows(current).SerializeToString())
        original=snapshot(paused)
        check('Break is persisted while after-loop work and task completion are still Pending',paused[0].completed==2 and paused[0].approved==2 and not paused[0].decision_finished and paused[2].status==db.Task.PENDING and paused[2].iteration==0 and len(paused[3])==6)
        def decisions(data):
            from google.protobuf.any_pb2 import Any
            return sorted(m.SerializeToString() for m in data[3] if Any.FromString(m.response).type_url=='type.googleapis.com/reboot.runtime.FiniteLoopDecision.v1')
        originals=decisions(paused)
        check('exactly two native saved Continue/Break envelopes exist',len(originals)==2)
        check('callbacks evaluated once per real first/second observation',sum('finite-decision-evaluated' in event for event in events(current))==2)
        error,_=client('approve','finite','2',ok=False)
        check('break threshold blocks a third transaction before its map insert','InvalidArgument' in error and snapshot(native(current,uuid))==original)
        error,_=client('decision-finish-direct','finite','2',ok=False)
        check('public invocation cannot steal paused private continuation','PermissionDenied' in error and snapshot(native(current,uuid))==original)
        current.close();current=None
        current=Session('finite-decision-restart')
        until(lambda:any('finite-break-before-after-loop' in event for event in events(current)),'restart resumes saved Break before after-loop work')
        restored=native(current,uuid)
        check('all app/map/task/checkpoint participants restore exact paused prefix',snapshot(restored)==original)
        check('restart never recomputes either saved control callback',not any('finite-decision-evaluated' in event for event in events(current)) and decisions(restored)==originals)
        marker.with_suffix('.release').write_text('allow private after-loop continuation')
        check('canonical public Wait completes at the saved finite Break',client('wait',uuid,'10000')[0]=='finite 3 2 2 1')
        finished=native(current,uuid)
        check('after-loop work executes once and no third iteration is admitted',finished[0].decision_finished and finished[2].status==db.Task.COMPLETED and len(finished[3])==7 and logical_keys(finished[1])==['finite:0000','finite:0001'] and sum('after-loop-finite-2' in event for event in events(current))==1 and not any('checkpoint-finite-2' in event for event in events(current)))
        final=snapshot(finished)
        current.close();current=None
        current=Session('finite-decision-terminal-restart')
        until(lambda:native(current,uuid)[2].status==db.Task.COMPLETED,'terminal finite task restored')
        check('terminal restart preserves exact after-loop state and receipts',snapshot(native(current,uuid))==final and client('wait',uuid,'3000')[0]=='finite 3 2 2 1')
        check('terminal restart does not reenter body/decision/finalizer',not any(any(marker in event for marker in ('body-finite','finite-decision-evaluated','after-loop-finite')) for event in events(current)))
        current.close();current=None
        evidence['accepted']=True
        raise SystemExit(0)
    if os.environ.get('RUST_BATCH_MAP_LIFETIME_ONLY'):
        current=Session('map-lifetime-baseline')
        until(lambda:'actor state must be constructed' in client('work-unary','lifetime',ok=False)[0],'map lifetime public admission')
        client('create')
        uuid,_=client('submit','lifetime','2','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
        before=native(current,uuid)
        baseline=(before[0].SerializeToString(),before[1].SerializeToString(),before[2].SerializeToString(),sorted(m.SerializeToString() for m in before[3]),archive_rows(current).SerializeToString())
        check('map lifetime baseline is real parked pending task',before[2].status==db.Task.PENDING and before[0].approved==0 and before[0].completed==0 and not logical_keys(before[1]) and not before[3])
        current.close();current=None
        ENV['RBT_RUST_MAP_LIFETIME_PROBE']='1'
        current=Session('map-lifetime-drop')
        error,_=client('approve','lifetime','0',ok=False)
        until(lambda:any('dropped-map-reader-after-real-insert' in event for event in events(current)),'real insert plus polled map read dropped')
        check('caught dropped map future cannot return a successful transaction','builtin' in error or 'uncertain' in error or 'closed' in error)
        # The inserted participant is known and its Store was acknowledged.
        # Registered abandonment may Abort that exact root, not fail the host.
        # This is a dropped read, NOT an unknown Store/lost-ACK test.
        until(lambda:client('read')[0]=='lifetime 2 0 0 1','registered known-root Abort releases app admission')
        rolled_back=native(current,uuid)
        check('dropped reader root abort preserves exact committed app/map/task/checkpoints',(rolled_back[0].SerializeToString(),rolled_back[1].SerializeToString(),rolled_back[2].SerializeToString(),sorted(m.SerializeToString() for m in rolled_back[3]),archive_rows(current).SerializeToString())==baseline)
        current.close();current=None
        ENV.pop('RBT_RUST_MAP_LIFETIME_PROBE')
        current=Session('map-lifetime-restored')
        until(lambda:client('read')[0]=='lifetime 2 0 0 1','all participants and parked task restored')
        after=native(current,uuid)
        check('restart recovers dropped-map root without partial app/map/task mutation',(after[0].SerializeToString(),after[1].SerializeToString(),after[2].SerializeToString(),sorted(m.SerializeToString() for m in after[3]),archive_rows(current).SerializeToString())==baseline)
        client('approve','lifetime','0')
        until(lambda:native(current,uuid)[0].completed==1,'fresh actual approval after fenced-root recovery')
        client('approve','lifetime','1')
        check('original task progresses through public approval and canonical Wait',client('wait',uuid,'5000')[0]=='lifetime 2 2 2 1' and logical_keys(native(current,uuid)[1])==['lifetime:0000','lifetime:0001'])
        current.close();current=None
        evidence['accepted']=True
        raise SystemExit(0)
    if os.environ.get('RUST_BATCH_COOPERATIVE_STOP_ONLY'):
        def ordinary_records(session):
            stub=db_grpc.DatabaseStub(grpc.insecure_channel(f"127.0.0.1:{session.database_port}"))
            rows=stub.RecoverIdempotentMutations(db.RecoverIdempotentMutationsRequest(state_type='batch_ledger.v1.Ledger',state_ref=reference),timeout=3)
            return sorted(m.SerializeToString() for batch in rows for m in batch.idempotent_mutations if not m.HasField('workflow_id'))
        def snapshot(data):
            return (data[0].SerializeToString(),data[1].SerializeToString(),data[2].SerializeToString(),sorted(m.SerializeToString() for m in data[3]),archive_rows(current).SerializeToString(),ordinary_records(current))
        current=Session('cooperative-start')
        until(lambda:'actor state must be constructed' in client('work-unary','cooperative',ok=False)[0],'stop feature public admission published')
        client('create')
        uuid,_=client('submit-stoppable-step-reject','cooperative','3','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
        client('approve','cooperative','0')
        until(lambda:native(current,uuid)[0].completed==1,'real first effect followed by parked cooperative observation')
        initial=native(current,uuid)
        check('opt-in batch has partial effect and saved writer business decision',initial[0].workflow_id==__import__("uuid").UUID(uuid).bytes and initial[0].stop_enabled and not initial[0].stop_requested and not initial[0].stopped and initial[2].status==db.Task.PENDING and len(initial[3])==3 and logical_keys(initial[1])==['cooperative:0000'])
        original_error=[m.SerializeToString() for m in initial[3] if __import__('google.protobuf.any_pb2',fromlist=['Any']).Any.FromString(m.response).type_url=='type.googleapis.com/google.rpc.Status']
        check('cooperative feature composes with real saved writer error',len(original_error)==1)
        initial_snapshot=snapshot(initial)
        current.close();current=None
        admin=ENV.pop('RBT_RUST_TASK_ADMIN_TOKEN')
        current=Session('cooperative-disabled')
        until(lambda:native(current,uuid)[0].completed==1,'parked prefix restored before stop')
        check('restart preserves full parked task and prefix checkpoints',snapshot(native(current,uuid))==initial_snapshot)
        error,_=client('stop','cooperative',uuid,'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',ok=False)
        check('stop defaults deny without configured admin','PermissionDenied' in error and snapshot(native(current,uuid))==initial_snapshot)
        check('stop restore does not redispatch rejected or completed writer',not any('try-checkpoint-' in event or 'checkpoint-cooperative-0' in event for event in events(current)))
        current.close();current=None
        ENV['RBT_RUST_TASK_ADMIN_TOKEN']=admin
        current=Session('cooperative-controlled')
        until(lambda:native(current,uuid)[0].completed==1,'configured stopped workflow serving')
        baseline=snapshot(native(current,uuid))
        ENV.pop('RBT_RUST_TASK_ADMIN_TOKEN')
        try:error,_=client('stop','cooperative',uuid,'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',ok=False)
        finally:ENV['RBT_RUST_TASK_ADMIN_TOKEN']=admin
        check('stop denies anonymous even configured','Unauthenticated' in error and snapshot(native(current,uuid))==baseline)
        error,_=client('stop','other',uuid,'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',ok=False)
        check('typed stop denial for wrong batch leaves records intact','StopDenied' in error and snapshot(native(current,uuid))==baseline)
        error,_=client('stop-finish-direct','cooperative','1',ok=False)
        check('ordinary stop checkpoint cannot forge workflow completion','PermissionDenied' in error and snapshot(native(current,uuid))==baseline)
        for method in ['StopBatch','FinishStopped']:
            check('stop writers are not reactive readers',client('reader-target-error',method)[0]=='NONREADER_DENIED')
        receipt,_=client('stop','cooperative',uuid,'cccccccc-cccc-4ccc-8ccc-cccccccccccc')
        check('public admin stop receipt preserves partial counters',receipt=='cooperative 3 1 1 1\ncontrol true true false')
        terminal,_=client('wait',uuid,'5000')
        check('canonical success explicitly returns stopped partial work',terminal=='cooperative 3 1 1 1\ncontrol true true true')
        stopped=native(current,uuid)
        check('stop preserves prefix map and saves observed stop plus private outcome',stopped[0].stopped and stopped[0].completed==1 and stopped[0].approved==1 and logical_keys(stopped[1])==['cooperative:0000'] and len(stopped[3])==5 and stopped[2].status==db.Task.COMPLETED and stopped[2].WhichOneof('response_or_error')=='response')
        check('old saved error remains byte identical',all(value in [m.SerializeToString() for m in stopped[3]] for value in original_error))
        after_stop=snapshot(stopped)
        check('same stop key replays original receipt not live state',client('stop','cooperative',uuid,'cccccccc-cccc-4ccc-8ccc-cccccccccccc')[0]==receipt and snapshot(native(current,uuid))==after_stop)
        error,_=client('approve','cooperative','1',ok=False)
        check('stopped approvals reject without app or map mutation','InvalidArgument' in error and snapshot(native(current,uuid))==after_stop)
        current.close();current=None
        ENV.pop('RBT_RUST_TASK_ADMIN_TOKEN')
        current=Session('cooperative-receipt-revoked')
        until(lambda:client('read')[0]==terminal,'stopped actor restored with admin disabled')
        error,_=client('stop','cooperative',uuid,'cccccccc-cccc-4ccc-8ccc-cccccccccccc',ok=False)
        check('cached stop receipt requires fresh authorizer after admin revocation','PermissionDenied' in error and snapshot(native(current,uuid))==after_stop)
        current.close();current=None
        ENV['RBT_RUST_TASK_ADMIN_TOKEN']=admin
        current=Session('cooperative-terminal-restored')
        check('stopped result replays after RocksDB restart',client('wait',uuid,'5000')[0]==terminal and snapshot(native(current,uuid))==after_stop)
        check('stopped completed workflow does not reexecute',not any('finish-stopped-' in event or 'checkpoint-cooperative-' in event for event in events(current)))
        next_uuid,_=client('submit','after-stop','1','dddddddd-dddd-4ddd-8ddd-dddddddddddd')
        new_batch=native(current,next_uuid)
        check('new batch resets control flags',not new_batch[0].workflow_id and not new_batch[0].stop_enabled and not new_batch[0].stop_requested and not new_batch[0].stopped)
        new_snapshot=snapshot(new_batch)
        check('old stop receipt cannot mutate successor batch',client('stop','cooperative',uuid,'cccccccc-cccc-4ccc-8ccc-cccccccccccc')[0]==receipt and snapshot(native(current,next_uuid))==new_snapshot)
        error,_=client('stop','after-stop',next_uuid,'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',ok=False)
        check('non-opt-in batch typed stop rejection','StopDenied' in error and snapshot(native(current,next_uuid))==new_snapshot)
        client('approve','after-stop','0')
        check('normal successor workflow still completes',client('wait',next_uuid,'5000')[0]=='after-stop 1 1 1 2')
        check('original stopped task remains exact immutable terminal',native(current,uuid)[2].SerializeToString()==stopped[2].SerializeToString())
        current.close();current=None
        marker=STAGE/'before-approved-checkpoint'
        ENV['RBT_RUST_STOP_BOUNDARY_PROBE']=str(marker)
        current=Session('cooperative-approved-boundary')
        until(lambda:client('read')[0]=='after-stop 1 1 1 2','boundary test host ready')
        boundary_uuid,_=client('submit-stoppable','cooperative','2','ffffffff-ffff-4fff-8fff-ffffffffffff')
        client('approve','cooperative','0')
        until(marker.exists,'real saved approval before writer admission')
        ready=native(current,boundary_uuid)
        check('boundary race has genuine saved decision but no writer effect',ready[0].approved==1 and ready[0].completed==0 and len(ready[3])==1)
        ready_snapshot=snapshot(ready)
        error,_=client('stop','cooperative',uuid,'88888888-8888-4888-8888-888888888888',ok=False)
        check('old workflow UUID cannot stop same-name replacement','StopDenied' in error and snapshot(native(current,boundary_uuid))==ready_snapshot)
        error,_=client('stop','cooperative',boundary_uuid,'cccccccc-cccc-4ccc-8ccc-cccccccccccc',ok=False)
        check('same stop key different workflow request fails without remutation',snapshot(native(current,boundary_uuid))==ready_snapshot)
        receipt,_=client('stop','cooperative',boundary_uuid,'99999999-9999-4999-8999-999999999999')
        check('stop intent commits before already observed writer',receipt=='cooperative 2 1 0 3\ncontrol true true false' and native(current,boundary_uuid)[0].completed==0)
        marker.with_suffix('.release').write_text('release')
        check('already observed unit may finish then next boundary stops',client('wait',boundary_uuid,'5000')[0]=='cooperative 2 1 1 3\ncontrol true true true')
        boundary=native(current,boundary_uuid)
        check('boundary stop retains one real effect and exact original decision',boundary[0].stopped and boundary[0].completed==1 and len(boundary[3])==4 and ready[3][0].SerializeToString() in [m.SerializeToString() for m in boundary[3]])
        current.close();current=None
        ENV.pop('RBT_RUST_STOP_BOUNDARY_PROBE')
        evidence['accepted']=True
        raise SystemExit(0)
    if os.environ.get('RUST_BATCH_WRITER_FRAMEWORK_ONLY'):
        ENV['RBT_RUST_WRITER_FAILURE_PROBE']='1'
        current=Session('writer-framework-failure')
        until(lambda: 'actor state must be constructed' in client('work-unary','step-framework',ok=False)[0],'framework writer admission published')
        client('create')
        uuid,_=client('submit-step-reject','step-framework','2','cccccccc-cccc-4ccc-8ccc-cccccccccccc')
        client('approve','step-framework','0',ok=False)
        until(lambda: any('caught-framework-writer-failure' in event for event in events(current)),'body catches actual framework writer failure')
        end=time.monotonic()+15
        while current.process.poll() is None and time.monotonic()<end:
            time.sleep(.05)
        if current.process.poll() is None:
            timeout_seen=True
            raise TimeoutError('caught writer framework outcome unknown; preserve exact session handles')
        check('declared-looking Grpc remains fatal despite catch-to-success',current.process.returncode!=0 and 'unclean workflow attempt cannot complete successfully' in current.host_text())
        current.close();current=None
        ENV.pop('RBT_RUST_WRITER_FAILURE_PROBE')
        current=Session('writer-framework-restored')
        until(lambda: native(current,uuid)[0].completed==1,'restored handler executes genuine declared outcome then checkpoint')
        first=native(current,uuid)
        from google.protobuf.any_pb2 import Any
        from google.rpc.status_pb2 import Status
        errors=[r for r in first[3] if Any.FromString(r.response).type_url=='type.googleapis.com/google.rpc.Status']
        check('framework failure did not become terminal or saved business replay', first[2].status==db.Task.PENDING and first[2].WhichOneof('response_or_error') is None and len(errors)==1 and len(first[3])==3 and not first[0].rejected and first[0].approved==1 and logical_keys(first[1])==['step-framework:0000'])
        error=proto.StepRejected.FromString(Status.FromString(Any.FromString(errors[0].response).value).details[0].value)
        check('restore executes writer not forged framework checkpoint',error.reason=='writer declined tentative checkpoint' and sum('try-checkpoint-step-framework-0' in event for event in events(current))==1)
        client('approve','step-framework','1')
        check('restored framework failure progresses through public approval and Wait',client('wait',uuid,'5000')[0]=='step-framework 2 2 2 1' and native(current,uuid)[2].status==db.Task.COMPLETED)
        current.close();current=None
        evidence['accepted']=True
        raise SystemExit(0)
    if os.environ.get('RUST_BATCH_WRITER_ERROR_ONLY'):
        current = Session('writer-declared-error')
        until(lambda: 'actor state must be constructed' in client('work-unary','step-reject',ok=False)[0], 'writer decision admission published')
        client('create')
        uuid, _ = client('submit-step-reject','step-reject','2','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')
        client('approve','step-reject','0')
        until(lambda: native(current,uuid)[0].completed == 1,'caught writer rejection followed by actual successful checkpoint')
        first = native(current,uuid)
        from google.protobuf.any_pb2 import Any
        from google.rpc.status_pb2 import Status
        errors = [r for r in first[3] if Any.FromString(r.response).type_url == 'type.googleapis.com/google.rpc.Status']
        check('declared writer decision is one scoped canonical error checkpoint',len(errors)==1 and errors[0].workflow_iteration==0 and len(first[3])==3)
        rich = Status.FromString(Any.FromString(errors[0].response).value)
        rejection = proto.StepRejected.FromString(rich.details[0].value)
        check('saved writer rejection retains exact method-declared payload',rich.code==2 and rejection.batch=='step-reject' and rejection.index==0 and rejection.reason=='writer declined tentative checkpoint')
        check('declared writer rolls back tentative state and keeps workflow pending',first[0].completed==1 and first[0].approved==1 and not first[0].rejected and first[2].status==db.Task.PENDING and first[2].WhichOneof('response_or_error') is None and logical_keys(first[1])==['step-reject:0000'])
        check('actual writer handler executed once before restart',sum('try-checkpoint-step-reject-0' in event for event in events(current))==1)
        saved_error = errors[0].SerializeToString()
        saved_task = first[2].SerializeToString()
        saved_state = evidence['durable'][-1]['state_hex']
        saved_rows = first[1].SerializeToString()
        saved_progress = sorted(r.SerializeToString() for r in first[3])
        current.close(); current=None
        current=Session('writer-declared-error-restored')
        until(lambda: any('caught-step-step-reject-0' in event for event in events(current)),'restored body catches durable saved rejection')
        restored=native(current,uuid)
        check('restored caught decision never redispatches rejected writer',not any('try-checkpoint-' in event for event in events(current)))
        check('restart retains raw actor maps pending task and exact saved decisions', evidence['durable'][-1]['state_hex']==saved_state and restored[1].SerializeToString()==saved_rows and restored[2].SerializeToString()==saved_task and sorted(r.SerializeToString() for r in restored[3])==saved_progress)
        client('approve','step-reject','1')
        result=client('wait',uuid,'5000')[0]
        final=native(current,uuid)
        check('caught saved writer decision allows real completion',result=='step-reject 2 2 2 1' and final[2].status==db.Task.COMPLETED and not final[0].rejected and len(final[3])==5)
        check('later effects retain exact original error checkpoint',saved_error in [r.SerializeToString() for r in final[3]])
        terminal=final[2].SerializeToString()
        current.close();current=None
        current=Session('writer-declared-terminal-restored')
        check('typed Wait and terminal replay after full restart',client('wait',uuid,'5000')[0]==result and native(current,uuid)[2].SerializeToString()==terminal and not events(current))
        current.close();current=None
        evidence['accepted']=True
        raise SystemExit(0)
    if os.environ.get('RUST_BATCH_CAUGHT_READER_ONLY'):
        ENV['RBT_RUST_CAUGHT_READER_PROBE'] = '1'
        current = Session('caught-reader-failure')
        until(lambda: 'actor state must be constructed' in client('work-unary', 'caught-probe', ok=False)[0], 'read-only ordinary RPC observes published admission before create')
        client('create')
        submitted, code = client('submit', 'caught-probe', '1', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', ok=False)
        # The commit may precede failed-readiness revocation of the submit RPC;
        # never retry the mutation or invent an observed handle on a lost reply.
        until(lambda: 'caught-reader-failure' in '\n'.join(events(current)), 'actual generated handler caught failed observation')
        end = time.monotonic() + 15
        observed_completed = False
        while current.process.poll() is None and time.monotonic() < end:
            time.sleep(.05)
            try:
                with grpc.insecure_channel(f'127.0.0.1:{current.data["database_port"]}') as channel:
                    records = db_grpc.DatabaseStub(channel).Recover(db.RecoverRequest(shard_ids=['s000000000'],skip_idempotent_mutations=True),timeout=1)
                    # Pending-only Recover cannot prove success. Use observed handle
                    # when submit delivered it; a Completed lookup exposes original RED.
                    list(records)
                if submitted and code == 0:
                    _,_,record,_ = native(current, submitted)
                    if record.status == db.Task.COMPLETED:
                        observed_completed = True
                        break
            except grpc.RpcError:
                pass
        failed = current.process.poll() is not None and current.process.returncode != 0
        if not failed:
            if not observed_completed:
                timeout_seen = True
                raise TimeoutError("caught reader probe outcome unknown; preserve exact session handles")
            current.close(); current = None
            raise AssertionError('caught framework reader failure became successful workflow terminal / serving host')
        current.close(); current = None
        check('caught reader failure fails actual supervised host before successful terminal')
        ENV.pop('RBT_RUST_CAUGHT_READER_PROBE')
        current = Session('caught-reader-restored')
        until(lambda: client('work-unary', 'caught-probe', ok=False)[1] == 0, 'restored reader owner is published')
        with grpc.insecure_channel(f'127.0.0.1:{current.data["database_port"]}') as channel:
            stub = db_grpc.DatabaseStub(channel)
            pending = [task for batch in stub.Recover(db.RecoverRequest(shard_ids=['s000000000'],skip_idempotent_mutations=True),timeout=3) for task in batch.pending_tasks]
        check('caught-reader canonical pending survives RocksDB restart', len(pending)==1 and pending[0].status==db.Task.PENDING and pending[0].WhichOneof('response_or_error') is None)
        probe_uuid = str(__import__('uuid').UUID(bytes=pending[0].task_id.task_uuid))
        ledger, entries, record, checkpoints = native(current, probe_uuid)
        check('caught reader no fake success or saved decision', ledger.batch=='caught-probe' and ledger.approved==ledger.completed==0 and not entries.keys and not archive_rows(current).keys and not checkpoints and record.status==db.Task.PENDING)
        client('approve','caught-probe','0')
        client('wait',probe_uuid,'5000')
        final = native(current,probe_uuid)
        check('restored workflow completes through actual approval checkpoint',final[2].status==db.Task.COMPLETED and final[0].approved==final[0].completed==1)
        current.close(); current=None
        evidence['accepted']=True
        raise SystemExit(0)
    current = Session('admin-disabled', admin=False)
    list_denied(grpc.StatusCode.PERMISSION_DENIED, token=ENV['RBT_RUST_TASK_ADMIN_TOKEN'])
    cancel_denied(grpc.StatusCode.PERMISSION_DENIED, token=ENV['RBT_RUST_TASK_ADMIN_TOKEN'])
    current.close(); current = None
    current = Session('first')
    list_denied(grpc.StatusCode.UNAUTHENTICATED)
    list_denied(grpc.StatusCode.UNAUTHENTICATED, token='invalid')
    cancel_denied(grpc.StatusCode.UNAUTHENTICATED)
    cancel_denied(grpc.StatusCode.UNAUTHENTICATED, token='invalid')
    list_denied(grpc.StatusCode.UNIMPLEMENTED, token=ENV['RBT_RUST_TASK_ADMIN_TOKEN'], server=None)
    list_denied(grpc.StatusCode.UNAVAILABLE, token=ENV['RBT_RUST_TASK_ADMIN_TOKEN'], server='wrong-server')
    check('authenticated generated task listing starts empty', client('tasks')[0] == '')
    check('empty stream snapshot', not stream_deadline().tasks)
    task_watch = TaskWatch('initial')
    client('create')
    uuid, _ = client('submit', 'batch-001', '3', '11111111-1111-4111-8111-111111111111')
    replay, _ = client('submit', 'batch-001', '3', '11111111-1111-4111-8111-111111111111')
    check('submit same key same task UUID', replay == uuid)
    listed(uuid, 'STARTED')
    cancel_before = [item.SerializeToString() if hasattr(item, 'SerializeToString') else [entry.SerializeToString() for entry in item] for item in native(current, uuid)]
    cancel_denied(grpc.StatusCode.FAILED_PRECONDITION, uuid, token=ENV['RBT_RUST_TASK_ADMIN_TOKEN'])
    cancel_after = [item.SerializeToString() if hasattr(item, 'SerializeToString') else [entry.SerializeToString() for entry in item] for item in native(current, uuid)]
    check('running workflow cancellation has no canonical effects', cancel_before == cancel_after)
    cancel_denied(grpc.StatusCode.INVALID_ARGUMENT, uuid, token=ENV['RBT_RUST_TASK_ADMIN_TOKEN'], routed_ref='wrong')
    check('unknown task cancellation is NOT_FOUND', client('cancel', str(__import__('uuid').uuid4()))[0] == 'NOT_FOUND')
    changed, status = client('submit', 'changed', '3', '11111111-1111-4111-8111-111111111111', ok=False)
    check('submit fingerprint collision rejected', status != 0)
    watch = Watch('initial')
    reconnecting = ReconnectingWatch()
    index_watch = ReconnectingWatch(index=True)
    work_watch = ReconnectingWatch(work=True)
    check('transaction reader initial snapshot', client('index-read', 'batch-001')[0] == 'batch-001 3 0 0 1')
    check('transaction reader typed declared mismatch', client('index-mismatch', 'other')[0] == 'MISMATCH other batch-001')
    work_before = native(current, uuid)
    work_bytes = (evidence['durable'][-1]['state_hex'], [item.SerializeToString() if hasattr(item, 'SerializeToString') else [entry.SerializeToString() for entry in item] for item in work_before[1:]], archive_rows(current).SerializeToString())
    check('workflow reader unary success', client('work-unary', 'batch-001')[0] == 'batch-001 3 0 0 1')
    check('workflow reader unary declared rich mismatch', client('work-unary', 'other')[0] == 'MISMATCH other batch-001')
    check('workflow reader typed subscription success', client('work-read', 'batch-001')[0] == 'batch-001 3 0 0 1')
    for _ in range(3):
        check('workflow reader typed subscription declared mismatch', client('work-mismatch', 'other')[0] == 'MISMATCH other batch-001')
    work_after = native(current, uuid)
    check('workflow reader errors preserve raw actor maps task replay', work_bytes == (evidence['durable'][-1]['state_hex'], [item.SerializeToString() if hasattr(item, 'SerializeToString') else [entry.SerializeToString() for entry in item] for item in work_after[1:]], archive_rows(current).SerializeToString()))
    check('index zero not implicitly approved', read()[2:4] == ['0', '0'])
    pending, status = client('wait', uuid, '150', ok=False)
    check('typed pending Wait preserves deadline', status != 0 and ('DeadlineExceeded' in pending or 'Cancelled' in pending))
    state, rows, task, _ = native(current, uuid)
    check('canonical task is Pending with no approvals', task.status == db.Task.PENDING and state.completed == 0 and not rows.keys)
    before_reader = state.SerializeToString()
    before_reader_task = task.SerializeToString()
    for method in ['Create', 'SubmitBatch', 'Checkpoint', 'TryCheckpoint', 'RunBatch']:
        check('workflow companion rejects nonreader ' + method, client('reader-target-error', method)[0] == 'NONREADER_DENIED')
    after_reader, after_rows, after_task, after_replay = native(current, uuid)
    check('nonreader subscription attempts preserve canonical task/ledger/map/replay', after_reader.SerializeToString() == before_reader and after_task.SerializeToString() == before_reader_task and not after_rows.keys and not after_replay)
    for method in ('Approve', 'History', 'ArchiveEntry', 'ArchiveHistory'):
        check('transaction companion rejects transaction ' + method, client('index-target-error', method)[0] == 'NONREADER_DENIED')
    after_index, rows_index, task_index, replay_index = native(current, uuid)
    check('transaction subscription errors/negatives preserve canonical state/task/map/replay',
          after_index.SerializeToString() == before_reader and task_index.SerializeToString() == before_reader_task and not rows_index.keys and not replay_index)
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
    for _ in range(4):
        observed = index_watch.send('next', 'batch-001')
        if 'batch-001 3 1 1 1' in observed: break
    else: raise AssertionError('transaction companion missed acknowledged app/map commit')
    check('transaction companion observes actual committed approval')
    for _ in range(4):
        observed = work_watch.send('next', 'batch-001')
        if 'batch-001 3 1 1 1' in observed: break
    else: raise AssertionError('workflow typed-error reader missed committed checkpoint')
    check('workflow typed-error companion observes acknowledged checkpoint')
    reconnecting.send('reconnect', 'batch-001 3 1 1 1')
    index_watch.send('reconnect', 'batch-001 3 1 1 1')
    work_watch.send('reconnect', 'batch-001 3 1 1 1')
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
    index_watch.send('reconnect', 'batch-001 3 1 1 1')
    work_watch.send('reconnect', 'batch-001 3 1 1 1')
    reconnecting.send('disconnect', 'DISCONNECTED')
    index_watch.send('disconnect', 'DISCONNECTED')
    work_watch.send('disconnect', 'DISCONNECTED')
    reader_zero(current)
    rebuild(current, original)
    wait_state(1, 1)
    check('watch preserves pending workflow checkpoint', native(current, uuid)[0].completed == 1)
    reconnecting.send('reconnect', 'batch-001 3 1 1 1')
    index_watch.send('reconnect', 'batch-001 3 1 1 1')
    work_watch.send('reconnect', 'batch-001 3 1 1 1')
    current.close(); current = None
    reconnecting.send('reconnect', 'DISCONNECTED Unavailable')
    index_watch.send('reconnect', 'DISCONNECTED Unavailable')
    work_watch.send('reconnect', 'DISCONNECTED Unavailable')
    current = Session('parked-restart')
    reconnecting.send('reconnect', 'batch-001 3 1 1 1')
    index_watch.send('reconnect', 'batch-001 3 1 1 1')
    work_watch.send('reconnect', 'batch-001 3 1 1 1')
    reconnecting.close(); reconnecting = None
    index_watch.close(); index_watch = None
    work_watch.close(); work_watch = None
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
    before_archive = native(current, uuid)
    empty_archive = archive_rows(current)
    check('second canonical map starts empty', not empty_archive.keys and not before_archive[0].archived)
    snapshot_archive = (evidence['durable'][-1]['state_hex'], before_archive[1].SerializeToString(),
        empty_archive.SerializeToString(), before_archive[2].SerializeToString(),
        [r.SerializeToString() for r in before_archive[3]])
    # Both native map overlays and tentative app counter have changed before this
    # caught declared range failure. The whole three-participant root must abort.
    check('two-map caught failure preserves actual Unknown InvalidRange cause', client('archive-invalid', 'batch-001:0000')[0] == 'DOOMED_MAP_RANGE Unknown')
    after_invalid = native(current, uuid)
    check('three-participant rollback preserves exact canonical app/maps/task/replay',
        snapshot_archive == (evidence['durable'][-1]['state_hex'], after_invalid[1].SerializeToString(),
            archive_rows(current).SerializeToString(), after_invalid[2].SerializeToString(),
            [r.SerializeToString() for r in after_invalid[3]]))
    check('typed absent source transfer rejection', client('archive', 'batch-001:0099')[0] ==
        'REJECTED batch-001:0099 source entry is absent')
    check('actual atomic two-map transfer preserves present empty value',
        client('archive', 'batch-001:0000')[0] == 'ARCHIVED batch-001:0000 0 1')
    moved = native(current, uuid); archived_rows = archive_rows(current)
    check('committed app counter/source removal/destination insertion', moved[0].archived == 1
        and logical_keys(moved[1]) == ['batch-001:0001', 'batch-001:0002']
        and logical_keys(archived_rows, archive_ref) == ['batch-001:0000']
        and len(archived_rows.values) == 1 and archived_rows.values[0] == b'')
    check('transfer never changes canonical workflow terminal or saved checkpoints',
        moved[2].SerializeToString().hex() == saved and
        [r.SerializeToString() for r in moved[3]] == snapshot_archive[4])
    check('public typed archive history', client('archive-history', 'batch-001')[0] == 'batch-001:0000')
    check('duplicate transfer is declared rejection not duplicate effect', client('archive', 'batch-001:0000')[0] ==
        'REJECTED batch-001:0000 source entry is absent')
    # Reuse a valid batch name via public submission/approval to make the same
    # source key live again, while its archive copy already exists.
    refill, _ = client('submit', 'batch-001', '1', '99999999-9999-4999-8999-999999999999')
    client('approve', 'batch-001', '0')
    client('wait', refill, '5000')
    occupied = native(current, refill)
    occupied_bytes = (evidence['durable'][-1]['state_hex'], occupied[1].SerializeToString(),
        archive_rows(current).SerializeToString(), occupied[2].SerializeToString(),
        [r.SerializeToString() for r in occupied[3]])
    check('present-empty destination is occupied not an overwrite permission',
        client('archive', 'batch-001:0000')[0] == 'REJECTED batch-001:0000 archive entry already exists')
    occupied_after = native(current, refill)
    check('destination collision preserves exact app/maps/task/replay', occupied_bytes ==
        (evidence['durable'][-1]['state_hex'], occupied_after[1].SerializeToString(),
         archive_rows(current).SerializeToString(), occupied_after[2].SerializeToString(),
         [r.SerializeToString() for r in occupied_after[3]]))
    moved = native(current, uuid)
    committed_archive = (evidence['durable'][-1]['state_hex'], moved[1].SerializeToString(), archived_rows.SerializeToString())
    current.close(signal.SIGINT); current = None
    current = Session('two-map-transfer-restart')
    restored_archive = native(current, uuid)
    check('two-map transfer and counter identical after full RocksDB restart', committed_archive ==
        (evidence['durable'][-1]['state_hex'], restored_archive[1].SerializeToString(), archive_rows(current).SerializeToString()))
    check('restart retains original canonical completed workflow terminal', client('wait', uuid, '5000')[0] == completed
        and restored_archive[2].SerializeToString().hex() == saved
        and [r.SerializeToString() for r in restored_archive[3]] == snapshot_archive[4] and not events(current))
    check('fresh transfer after restored participant ownership', client('archive', 'batch-001:0001')[0] ==
        'ARCHIVED batch-001:0001 0 2')
    after_second = native(current, uuid)
    check('two restored map participants remain usable', after_second[0].archived == 2
        and logical_keys(after_second[1]) == ['batch-001:0000', 'batch-001:0002']
        and logical_keys(archive_rows(current), archive_ref) == ['batch-001:0000', 'batch-001:0001']
        and after_second[2].SerializeToString().hex() == saved
        and [r.SerializeToString() for r in after_second[3]] == snapshot_archive[4])
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
    # Release the retained parked task through its ordinary public approval.
    client('approve', 'batch-003', '0')
    client('wait', parked, '5000')
    future = int(time.time()) + 45
    cancelled_key = '55555555-5555-4555-8555-555555555555'
    cancelled, _ = client('submit', 'batch-cancelled', '1', cancelled_key, str(future))
    listed(cancelled, 'SCHEDULED', future)
    state, rows, pending_cancel, cancel_replay = native(current, cancelled)
    before_cancel = (state.SerializeToString(), rows.SerializeToString(), [entry.SerializeToString() for entry in cancel_replay])
    pending_bytes = pending_cancel.SerializeToString()
    # Two real public admin calls: one durable winner, then no live task to cancel.
    calls = []
    for index in range(2):
        path = STAGE / f'cancel-concurrent-{index}.log'
        output = path.open('w')
        argv = [str(TARGET / 'debug/client'), 'cancel', cancelled]
        process = subprocess.Popen(argv, cwd=APP, env=ENV, stdout=output,
                                   stderr=subprocess.STDOUT, start_new_session=True)
        data = {'argv': argv, 'pid': process.pid, 'log': str(path)}
        evidence['commands'].append(data); calls.append((process, output, data))
        checkpoint()
    outcomes = []
    for process, output, data in calls:
        try:
            process.wait(timeout=10)
        except subprocess.TimeoutExpired:
            timeout_seen = True
            evidence['live_handles'].extend(item[2] for item in calls)
            checkpoint()
            raise
        output.close(); data['exit'] = process.returncode; checkpoint()
        assert process.returncode == 0, Path(data['log']).read_text()
        outcomes.append(Path(data['log']).read_text().strip())
    check('concurrent cancellation one winner and one NOT_FOUND', sorted(outcomes) == ['NOT_FOUND', 'OK'])
    check('generated typed Wait exposes system cancellation', client('wait', cancelled, '5000')[0] == 'CANCELLED')
    state, rows, cancelled_task, cancel_replay = native(current, cancelled)
    rich = status_pb2.Status.FromString(cancelled_task.error.value)
    check('canonical durable system cancellation', cancelled_task.status == db.Task.COMPLETED
          and cancelled_task.error.type_url == 'type.googleapis.com/google.rpc.Status'
          and rich.code == 1 and len(rich.details) == 1
          and rich.details[0].type_url == 'type.googleapis.com/rbt.v1alpha1.Cancelled'
          and rich.details[0].value == b'')
    canonical_pending = db.Task.FromString(cancelled_task.SerializeToString())
    canonical_pending.status = db.Task.PENDING; canonical_pending.ClearField('error')
    check('cancellation preserves immutable pending identity/payload/schedule', canonical_pending.SerializeToString() == pending_bytes)
    check('cancellation is not submission state/map/replay rollback', before_cancel ==
          (state.SerializeToString(), rows.SerializeToString(), [entry.SerializeToString() for entry in cancel_replay]))
    terminal_bytes = cancelled_task.SerializeToString()
    check('cancelled scheduling replay does not reopen terminal', client('submit', 'batch-cancelled', '1', cancelled_key, str(future))[0] == cancelled)
    until(lambda: client('tasks')[0] == '', 'cancelled task pruned from local listing')
    current.close(); current = None
    current = Session('cancelled-restart')
    check('cancelled typed Wait and terminal identical after RocksDB restart', client('wait', cancelled, '5000')[0] == 'CANCELLED'
          and native(current, cancelled)[2].SerializeToString() == terminal_bytes)
    until(lambda: time.time() >= future + 1, 'cancelled schedule passed', 50)
    time.sleep(.3)  # permit several canonical rescan periods after the original due time
    check('cancelled body never starts after due/restart', not events(current)
          and native(current, cancelled)[2].SerializeToString() == terminal_bytes and client('tasks')[0] == '')
    current.close(); current = None
    check('acceptance complete')
    evidence['accepted'] = True
finally:
    if not timeout_seen:
        if reconnecting is not None:
            reconnecting.close(expect_success=False)
        if index_watch is not None:
            index_watch.close(expect_success=False)
        if work_watch is not None:
            work_watch.close(expect_success=False)
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
