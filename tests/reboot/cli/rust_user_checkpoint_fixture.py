"""Acceptance-only pause + native lifecycle, not a scaffold runtime feature."""
from pathlib import Path
import hashlib
import os
import signal
import socket
import subprocess
import time
import uuid
import grpc
from google.protobuf.any_pb2 import Any
from rbt.v1alpha1 import database_pb2, database_pb2_grpc, tasks_pb2


def instrument(app, stage, proof):
    path = app / 'backend/src/user_workflows.rs'
    original = path.read_text()
    anchor = '        let second = generated::OwnerWorkflowsMethodsWorkflowSteps::second('
    assert original.count(anchor) == 1
    path.write_text(original.replace(anchor, '''        // Acceptance-only: the awaited first named step is already durable.
        if let Some(pause) = std::env::var_os("RUST_USER_FIXTURE_PAUSE") {
            while std::path::Path::new(&pause).exists() {
                tokio::time::sleep(std::time::Duration::from_millis(10)).await;
            }
        }
''' + anchor))
    proof['instrumentation'] = {'path': str(path), 'original_sha256': hashlib.sha256(original.encode()).hexdigest(), 'instrumented_sha256': hashlib.sha256(path.read_bytes()).hexdigest()}
    pause = stage / 'checkpoint-pause'
    pause.touch()
    return pause


def inspect(session, reference, handle, completed=False):
    from user_app.v1 import user_workflows_pb2 as proto
    task_id = tasks_pb2.TaskId(state_type='user_app.v1.OwnerWorkflows', state_ref=reference, task_uuid=uuid.UUID(handle).bytes)
    with grpc.insecure_channel(f'127.0.0.1:{session.database_port}') as channel:
        stub = database_pb2_grpc.DatabaseStub(channel)
        loaded = stub.Load(database_pb2.LoadRequest(task_ids=[task_id]), timeout=3)
        assert len(loaded.tasks) == 1, loaded
        task = loaded.tasks[0]
        request = proto.WorkflowAdd(amount=7).SerializeToString()
        # Canonical Task.method is the descriptor's short method name.
        assert task.task_id == task_id and task.method == 'Run', task
        assert task.request == request and task.iteration == 0, task
        assert task.status == (2 if completed else 1), task
        assert task.WhichOneof('response_or_error') == ('response' if completed else None), task
        if completed:
            assert task.response.type_url == 'type.googleapis.com/user_app.v1.UserResult', task
            assert proto.UserResult.FromString(task.response.value) == proto.UserResult(first=7, second=7), task
        records = {}
        for batch in stub.RecoverIdempotentMutations(database_pb2.RecoverIdempotentMutationsRequest(state_type=task_id.state_type, state_ref=reference, workflow_id=task_id.task_uuid), timeout=3):
            for record in batch.idempotent_mutations:
                assert record.state_type == task_id.state_type and record.state_ref == reference, record
                assert record.workflow_id == task_id.task_uuid and not record.HasField('workflow_iteration'), record
                aliases = ['first-effect', 'second-effect'] if completed else ['first-effect']
                alias = next((a for a in aliases if record.key == uuid.uuid5(uuid.UUID(handle), a).bytes), None)
                assert alias is not None and alias not in records, record
                method = 'First' if alias == 'first-effect' else 'Second'
                identity = f'reboot.workflow.named-step.v1:{task.method}:{task.request.hex()}:{alias}:user_app.v1.OwnerWorkflowsMethods.{method}:type.googleapis.com/user_app.v1.WorkflowValue'
                fingerprint = hashlib.sha256(b'reboot.idempotency.request-fingerprint.v1\0' + identity.encode() + b'\0' + request).digest()
                assert record.request_fingerprint == fingerprint, record
                response = Any.FromString(record.response)
                assert response.type_url == 'type.googleapis.com/user_app.v1.WorkflowValue', response
                assert proto.WorkflowValue.FromString(response.value).value == 7, response
                records[alias] = record.SerializeToString().hex()
        assert set(records) == ({'first-effect', 'second-effect'} if completed else {'first-effect'}), records
        return {'task_hex': task.SerializeToString().hex(), 'records': records}


def session_class(context):
    """Separate host/Database ownership permits readback after host shutdown."""
    stage, env, target, port, proof, sessions = [context[k] for k in ['STAGE', 'ENV', 'TARGET', 'PORT', 'proof', 'sessions']]
    dbport = port + 2
    info = stage / 'checkpoint-server-info.pb'
    context['run']([target / 'debug/app', '--server-info', info])

    class Session:
        def __init__(self, name):
            self.database_port = dbport
            self.children = []
            self.data = {'mode': 'instrumented-generated-consumer', 'name': name}
            self.path = stage / (name + '.log')
            self.log = self.path.open('w')
            self.db_log = (stage / (name + '-database.log')).open('w')
            self.db = subprocess.Popen([env['REBOOT_NATIVE2PC_CXX_DATABASE'], str(stage / 'checkpoint-rocksdb'), str(info), str(dbport)], stdout=self.db_log, stderr=subprocess.STDOUT)
            self.p = None
            sessions.append(self)
            proof['sessions'].append(self.data)
            self.data['database_pid'] = self.db.pid
            self.listen(self.db, dbport)
            app_env = dict(env, RBT_RUST_DATABASE_URL=f'http://127.0.0.1:{dbport}', RBT_RUST_LISTEN_ADDR=f'127.0.0.1:{port}')
            self.p = subprocess.Popen([target / 'debug/app'], env=app_env, stdout=self.log, stderr=subprocess.STDOUT)
            self.data['pid'] = self.p.pid
            self.listen(self.p, port)
            # Public signed reader readiness checks the recovered services.
            deadline = time.monotonic() + 15
            while time.monotonic() < deadline:
                with grpc.insecure_channel(f'127.0.0.1:{port}') as channel:
                    try:
                        channel.unary_unary('/user_app.v1.OwnerWorkflowsMethods/Query')(b'', metadata=[('x-reboot-state-ref',context['workflow_ref'])], timeout=.2)
                    except grpc.RpcError as error:
                        if error.code() == grpc.StatusCode.UNAUTHENTICATED:
                            return
                time.sleep(.05)
            context['timeout_seen'] = True
            raise TimeoutError('public reader readiness')

        def listen(self, process, port):
            deadline = time.monotonic() + 15
            while time.monotonic() < deadline:
                assert process.poll() is None, self.path.read_text()
                try:
                    with socket.create_connection(('127.0.0.1', port), timeout=.1):
                        return
                except OSError:
                    time.sleep(.05)
            context['timeout_seen'] = True
            raise TimeoutError('fixture listener')

        def close(self):
            # Repeat close is permitted only after a fully validated shutdown.
            if self.data.get('closed'):
                assert self.data['app_exit'] == 0 and self.data['database_exit'] == 0
                assert not Path(f'/proc/{self.db.pid}').exists()
                assert self.p is None or not Path(f'/proc/{self.p.pid}').exists()
                return
            errors = []
            if self.p is not None:
                if not self.data.get('app_shutdown_requested'):
                    unexpected = self.p.poll()
                    if unexpected is not None:
                        errors.append(f'app exited before requested shutdown: {unexpected}')
                    else:
                        self.data['app_shutdown_requested'] = True
                        self.p.send_signal(signal.SIGTERM)
                try:
                    status = self.p.wait(timeout=15)
                except subprocess.TimeoutExpired:
                    context['timeout_seen'] = True
                    raise
                self.data['app_exit'] = status
                self.data['app_absent_before_database_readback'] = not Path(f'/proc/{self.p.pid}').exists()
                if status != 0 or not self.data['app_absent_before_database_readback']:
                    errors.append(f'app shutdown was not clean: {status}')
            else:
                errors.append('app was never started')
            if self.db.poll() is not None:
                errors.append(f'Database exited before requested shutdown: {self.db.returncode}')
            elif not errors and self.data['name'] == 'first' and 'task' in context:
                self.data['database_alive_at_readback'] = True
                try:
                    evidence = inspect(self, context['workflow_ref'], context['task'])
                    assert evidence == proof['checkpoint_before_stop'], evidence
                    context['workflow_state'](self, (7,0,1), transaction=8)
                    assert self.db.poll() is None, 'Database exited during boundary readback'
                    proof['checkpoint_after_host_exit'] = evidence
                except Exception as error:
                    errors.append(str(error))
            if self.db.poll() is None:
                self.data['database_shutdown_requested'] = True
                self.db.send_signal(signal.SIGTERM)
            try:
                status = self.db.wait(timeout=15)
            except subprocess.TimeoutExpired:
                context['timeout_seen'] = True
                raise
            self.data['database_exit'] = status
            self.data['database_absent_after_shutdown'] = not Path(f'/proc/{self.db.pid}').exists()
            if status != 0 or not self.data['database_absent_after_shutdown']:
                errors.append(f'Database shutdown was not clean: {status}')
            self.log.close()
            self.db_log.close()
            self.data['shutdown_errors'] = errors
            assert not errors, self.data
            self.data['children_absent'] = True
            self.data['closed'] = True
    return Session
