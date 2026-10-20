"""Canonical Python-generated Tasks wire against generated Rust hosts/native C++.

Finite original parent: every service/client child is ledgered and joined. No
mutation retries or Database seeding. Canonical application RPC admission; these
cases certify canonical Tasks interoperability, not full Python application parity.
"""
import hashlib
import json
import os
from pathlib import Path
import signal
import socket
import subprocess
import sys
import time
import uuid

import grpc
import grpc_tools
from google.rpc import status_pb2
from google.protobuf import timestamp_pb2

BIN, ROOT = Path(sys.argv[1]).resolve(), Path(sys.argv[2]).resolve()
SOURCE = Path(__file__).resolve().parents[5]
DB = Path(os.environ['REBOOT_NATIVE2PC_CXX_DATABASE']).resolve()
ROOT.mkdir(parents=True, exist_ok=False)
children, cases = [], []
receipt: dict[str, object] = dict(complete=False, parent_pid=os.getpid(), children=children, cases=cases,
               binary_sha256=hashlib.sha256(BIN.read_bytes()).hexdigest(),
               database_sha256=hashlib.sha256(DB.read_bytes()).hexdigest(),
               native_artifact_reused=True, fresh_cpp_build=False)

def save():
    value = receipt | {'children': [{k:v for k,v in c.items() if k != 'process'} for c in children]}
    tmp=ROOT/'receipt.json.tmp'; tmp.write_text(json.dumps(value, indent=2))
    with tmp.open('rb') as f: os.fsync(f.fileno())
    os.replace(tmp, ROOT/'receipt.json')
    fd=os.open(ROOT,os.O_RDONLY); os.fsync(fd); os.close(fd)

def terminate(*_): raise InterruptedError('native lifecycle parent termination')
for sig in [signal.SIGTERM,signal.SIGINT,signal.SIGHUP]: signal.signal(sig,terminate)

def port():
    with socket.socket() as sock:
        sock.bind(('127.0.0.1',0)); return sock.getsockname()[1]

def spawn(args, env=None):
    log=ROOT/f'{len(children):03d}.log'
    with log.open('wb') as out:
        p=subprocess.Popen(list(map(str,args)),env=env,stdout=out,stderr=out)
    role='database' if Path(str(args[0])).resolve()==DB else 'application' if Path(str(args[0])).resolve()==BIN and len(args)>1 and args[1] in ['serve','serve-generic'] else 'client-or-proxy'
    children.append(dict(process=p,pid=p.pid,parent_pid=os.getpid(),role=role,args=list(map(str,args)),log=str(log),waited_by_parent=False)); save()
    return p

def row(p): return next(c for c in children if c['process'] is p)
def wait(p):
    p.wait(timeout=25); row(p).update(waited_by_parent=True,wait_returncode=p.returncode); save()
def stop(p, shutdown=None):
    if p.poll() is None:
        if shutdown: row(p)['termination']='requested-graceful'; shutdown.touch()
        else: row(p)['termination']='intentional-sigkill'; p.kill()
    wait(p)
    if shutdown: assert p.returncode==0,Path(row(p)['log']).read_text()
def run(*args, target=False, good=True):
    env=os.environ.copy()
    if target: env['WORKFLOW_REFERENCE_ID']='child'
    p=spawn([BIN,*args],env); wait(p); text=Path(row(p)['log']).read_text().strip()
    if good: assert p.returncode==0,text
    return text

def until(predicate, owner=None):
    end=time.monotonic()+20
    while time.monotonic()<end:
        if predicate(): return
        if owner and owner.poll() is not None: raise AssertionError(Path(row(owner)['log']).read_text())
        time.sleep(.02)
    raise AssertionError('bounded observation timeout')
def listening(p,n):
    def probe():
        try:
            with socket.create_connection(('127.0.0.1',n),timeout=.1): return True
        except OSError: return False
    until(probe,p)
def ready(url,p,target=False):
    until(lambda:any(s in run('read',url,target=target,good=False) for s in ['"schedules"','StateNotConstructed','must be constructed','state must']),p)

def error(code, call):
    try: call()
    except grpc.RpcError as failure: assert failure.code()==code, (failure.code(),failure.details())
    else: raise AssertionError('RPC unexpectedly succeeded')

save()
try:
    overlay=ROOT/'python-protos'; overlay.mkdir()
    runfiles=Path(os.environ['CANONICAL_PYTHON_RUNFILES']).resolve()
    plugin=Path(os.environ['CANONICAL_PYTHON_PLUGIN']).resolve()
    generator=spawn([sys.executable,'-m','grpc_tools.protoc',f'-I{SOURCE}',f'-I{Path(__file__).parent}',f'-I{Path(grpc_tools.__file__).parent/"_proto"}',f'--python_out={overlay}',f'--grpc_python_out={overlay}',f'--plugin=protoc-gen-reboot_python={plugin}',f'--reboot_python_out={overlay}','workflow/v1/workflow.proto'],os.environ.copy()|{'RUNFILES_DIR':str(runfiles.parent)})
    wait(generator); assert generator.returncode==0,Path(row(generator)['log']).read_text()
    receipt['generated_python']={str(p.relative_to(overlay)):hashlib.sha256(p.read_bytes()).hexdigest() for p in overlay.rglob('*.py')}
    sys.path[:0]=[str(overlay),str(runfiles)]
    client_env=os.environ.copy()|{'PYTHONPATH':str(overlay)+':'+str(runfiles)}
    from workflow.v1 import workflow_pb2 as app,workflow_pb2_grpc as app_grpc
    from rbt.v1alpha1 import tasks_pb2 as tasks,tasks_pb2_grpc,database_pb2 as database_pb
    from reboot.aio.types import StateRef
    import datetime
    state_ref=StateRef.from_id('workflow.v1.Remote','target').to_str()
    selected=os.environ.get('GENERIC_NATIVE_CASES','success,concurrent,declared-error,framework-error,future-cancel,auth,admission-ack-loss,writer-ack-loss,completion-ack-loss,checkpoint-restart,chain-checkpoint-restart,reader').split(',')
    for case in selected:
        running=case.startswith('running-');running_reader=case in ['running-reader','running-readers-two'];after_store=case=='running-after-store';cancel_drop=case=='running-cancel-drop';cancel_fault=case in ['running-cancel-drop','running-cancel-ack-loss']
        base_value=7 if after_store else 0
        chain=case=='chain-checkpoint-restart';checkpoint=case.endswith('checkpoint-restart')
        expected_value=12 if chain else 10 if checkpoint else 7
        expected_calls=3 if chain else 2 if checkpoint else 1
        amount=-1 if case=='framework-error' else 7
        work=ROOT/case; work.mkdir(); events=work/'events'; policy=work/'policy'; policy.write_text('allow')
        dp,ap,fp=port(),port(),port(); du=f'http://127.0.0.1:{dp}'; au=f'http://127.0.0.1:{fp}'
        run('info',work/'info.pb')
        def database():
            p=spawn([DB,work/'rocks',work/'info.pb',dp]);listening(p,dp);return p
        def inspect():return json.loads(run('generic-inspect',du))
        def lines():return events.read_text().splitlines() if events.exists() else []
        target=du;extra={}
        def host():
            shutdown=work/f'shutdown-{len(children)}'
            env=os.environ.copy()|dict(GENERIC_POLICY=str(policy),WORKFLOW_BODY_EVENTS=str(events),GENERIC_TYPED_ERROR='1',GENERIC_TASK_CHAIN='1' if chain else '0')|extra
            p=spawn([BIN,'serve-generic',target,f'127.0.0.1:{ap}',shutdown],env);listening(p,ap)
            channel=grpc.insecure_channel(f'127.0.0.1:{ap}');stub=app_grpc.RemoteMethodsStub(channel)
            def healthy():
                try:stub.Query(app.Empty(),metadata=(('x-reboot-state-ref',state_ref),),timeout=1);return True
                except grpc.RpcError as failure:
                    if failure.code()==grpc.StatusCode.FAILED_PRECONDITION:return True
                    if failure.code()==grpc.StatusCode.ABORTED:
                        raw=next((v for k,v in failure.trailing_metadata() if k=='grpc-status-details-bin'),b'')
                        rich=status_pb2.Status.FromString(raw)
                        if rich.details and rich.details[0].type_url.endswith('/rbt.v1alpha1.StateNotConstructed'):return True
                    if failure.code()==grpc.StatusCode.UNAVAILABLE:return False
                    raise
            until(healthy,p);channel.close();return p,shutdown
        def client(action,key,method='Apply',amount=7,schedule='',launch=False):
            out=work/f'client-{len(children)}.json'
            p=spawn([sys.executable,Path(__file__).with_name('generic_client.py'),action,au,key,method,amount,schedule,out],client_env)
            if launch:return p,out
            wait(p);assert p.returncode==0,Path(row(p)['log']).read_text()
            return json.loads(out.read_text())
        def fresh_channel():
            channel=grpc.insecure_channel(f'127.0.0.1:{ap}');grpc.channel_ready_future(channel).result(timeout=5)
            return channel,app_grpc.RemoteMethodsStub(channel),tasks_pb2_grpc.TasksStub(channel)
        def metadata(key,schedule=None):
            result=(('x-reboot-state-ref',state_ref),('x-reboot-idempotency-key',key),('authorization','Bearer generic-service'))
            return result if schedule is None else result+(('x-reboot-task-schedule',schedule),)
        def decoded(snapshot):return [database_pb.Task.FromString(bytes.fromhex(t)) for t in snapshot['tasks']]
        def completed():
            data=inspect();return bool(data['tasks']) and all(t.status==database_pb.Task.COMPLETED for t in decoded(data))
        database_process=database();proxy=None
        if case in ['admission-ack-loss','writer-ack-loss','completion-ack-loss','running-cancel-ack-loss','running-cancel-drop']:
            pp=port();selected_fault={'admission-ack-loss':'generic-spawn','writer-ack-loss':'generic-writer','completion-ack-loss':'cancel','running-cancel-ack-loss':'cancel','running-cancel-drop':'cancel'}[case]
            proxy=spawn([sys.executable,Path(__file__).with_name('database_ack_proxy.py'),f'127.0.0.1:{dp}',f'127.0.0.1:{pp}',selected_fault,work],os.environ.copy()|{'GENERIC_TASK_FAULT':'1'});listening(proxy,pp);target=f'http://127.0.0.1:{pp}'
        if checkpoint:extra={'REBOOT_TEST_WRITER_AFTER_STORE':str(work/'stored')}
        application,shutdown=host();wire_proxy=spawn([sys.executable,Path(__file__).with_name('canonical_wire_proxy.py'),f'127.0.0.1:{ap}',f'127.0.0.1:{fp}',work]);listening(wire_proxy,fp)
        channel,stub,task_stub=fresh_channel();stub.Create(app.Empty(),metadata=metadata(str(uuid.uuid4())),timeout=5)
        if running:
            stop(application,shutdown);extra={'REBOOT_TEST_WRITER_AFTER_STORE' if after_store else 'GENERIC_RUNNING_READER' if running_reader else 'GENERIC_RUNNING_WRITER':str(work/'body')}
            application,shutdown=host();channel.close();channel,stub,task_stub=fresh_channel()
        fault=os.environ.get('GENERIC_NATIVE_FAULT_AFTER_START')
        if fault=='signal':os.kill(os.getpid(),signal.SIGTERM)
        if fault=='error':raise RuntimeError('injected generic parent failure after native hosts started')
        if running_reader:(work/'body.arm').touch()
        key=str(uuid.uuid4());schedule='2030-01-01T00:00:00+00:00' if case in ['future-cancel','admission-ack-loss'] else ''
        if case=='running-readers-two':schedule=(datetime.datetime.now(datetime.timezone.utc)+datetime.timedelta(seconds=4)).isoformat()
        method='Reject' if case=='declared-error' else 'Query' if case=='reader' or running_reader else 'Apply'
        if case=='admission-ack-loss':
            pending=stub.Apply.future(app.Step(amount=7),metadata=metadata(key,schedule),timeout=12)
            until((work/'ack-observed.json').exists,application)
            before=inspect();assert len(before['tasks'])==1 and before['value']==0 and 'remote-handler' not in lines()
            (work/'release').touch();error(grpc.StatusCode.UNAVAILABLE,lambda:pending.result(timeout=10))
            error(grpc.StatusCode.UNAVAILABLE,lambda:stub.Apply(app.Step(amount=7),metadata=metadata(key,schedule),timeout=3))
            wait(application);assert application.returncode!=0
            stop(proxy);proxy=None;stop(database_process);database_process=database();assert inspect()==before
            target=du;application,shutdown=host();channel.close();channel,stub,task_stub=fresh_channel()
            _,call=stub.Apply.with_call(app.Step(amount=7),metadata=metadata(key,schedule),timeout=5)
            ids=[v for k,v in call.trailing_metadata() if k=='x-reboot-task-id-uuid'];assert len(ids)==1
            task_id=tasks.TaskId(state_type='workflow.v1.Remote',state_ref=state_ref,task_uuid=uuid.UUID(ids[0]).bytes)
            result={'task_id':task_id.SerializeToString().hex()}
        elif case=='concurrent':
            pending=[client('spawn',key,launch=True) for _ in range(8)]
            results=[]
            for p,out in pending:
                wait(p);assert p.returncode==0,Path(row(p)['log']).read_text();results.append(json.loads(out.read_text()))
            assert all(r==results[0] for r in results);result=results[0]
            task_id=tasks.TaskId.FromString(bytes.fromhex(result['task_id']))
        else:
            result=client('spawn',key,method,amount=amount,schedule=schedule)
            task_id=tasks.TaskId.FromString(bytes.fromhex(result['task_id']))
        if case=='running-readers-two':
            second=client('spawn',str(uuid.uuid4()),'Query',schedule=schedule)
            second_id=tasks.TaskId.FromString(bytes.fromhex(second['task_id']))
        if running:
            until((work/'body').exists,application)
            before=inspect();assert before['value']==base_value and decoded(before)[0].status==database_pb.Task.PENDING
            error(grpc.StatusCode.UNAUTHENTICATED,lambda:task_stub.CancelTask(tasks.CancelTaskRequest(task_id=task_id),metadata=(('x-reboot-state-ref',state_ref),),timeout=1))
            if case=='running-readers-two':
                until(lambda:lines().count('ordinary-reader-entered')==2,application)
            pending=task_stub.CancelTask.future(tasks.CancelTaskRequest(task_id=task_id),metadata=(('x-reboot-state-ref',state_ref),('authorization','Bearer task-admin')),timeout=8)
            if case=='running-readers-two':
                second_cancel=task_stub.CancelTask.future(tasks.CancelTaskRequest(task_id=second_id),metadata=(('x-reboot-state-ref',state_ref),('authorization','Bearer task-admin')),timeout=8)
                assert second_cancel.result(timeout=4).status==tasks.CancelTaskResponse.OK
                second_wait=client('wait',second['task_id'],'Query')
                assert status_pb2.Status.FromString(bytes.fromhex(second_wait['error'])).code==1
            if after_store:
                assert not pending.done() # Cancellation cannot drop a started Store/ACK envelope.
                (work/'body.release').touch()
            if cancel_fault:
                until((work/'ack-observed.json').exists,application)
                assert inspect()['value']==0 and decoded(inspect())[0].status==database_pb.Task.COMPLETED
                error(grpc.StatusCode.DEADLINE_EXCEEDED,lambda:task_stub.Wait(tasks.WaitRequest(task_id=task_id),metadata=(('x-reboot-state-ref',state_ref),('authorization','Bearer task-admin')),timeout=2))
                blocked_writer=stub.Apply.future(app.Step(amount=3),metadata=metadata(str(uuid.uuid4())),timeout=5)
                if cancel_drop:
                    assert pending.cancel()
                    (work/'release').touch()
                else:
                    (work/'release').touch();error(grpc.StatusCode.UNAVAILABLE,lambda:pending.result(timeout=5))
                error(grpc.StatusCode.UNAVAILABLE,lambda:blocked_writer.result(timeout=5))
                wait(application);assert application.returncode!=0
                stop(proxy);proxy=None;stop(database_process);database_process=database();target=du;extra={}
                application,shutdown=host();channel.close();channel,stub,task_stub=fresh_channel()
            else:
                assert pending.result(timeout=4).status==tasks.CancelTaskResponse.OK
            if not after_store:assert ('ordinary-reader-retired' if running_reader else 'ordinary-writer-retired') in lines()
            (work/'body.release').touch();time.sleep(.1)
            assert 'ordinary-body-escaped' not in lines() and inspect()['value']==base_value
            # A new ordinary writer must serialize after the winning Cancel ACK.
            assert stub.Apply(app.Step(amount=3),metadata=metadata(str(uuid.uuid4())),timeout=5).value==base_value+3
            expected_calls=1 if running_reader else 2
        if case in ['writer-ack-loss','completion-ack-loss']:
            until((work/'ack-observed.json').exists,application)
            before=inspect();assert before['value']==7 and len(before['tasks'])==1 and lines().count('remote-handler')==1
            assert decoded(before)[0].status==(database_pb.Task.PENDING if case=='writer-ack-loss' else database_pb.Task.COMPLETED)
            (work/'release').touch();wait(application);assert application.returncode!=0
            stop(proxy);proxy=None;stop(database_process);database_process=database();assert inspect()==before
            target=du;application,shutdown=host();channel.close();channel,stub,task_stub=fresh_channel()
        if checkpoint:
            until((work/'stored').exists,application)
            before=inspect();assert before['value']==7 and decoded(before)[0].status==database_pb.Task.PENDING and lines().count('remote-handler')==1
            if chain:assert len(before['tasks'])==2 and all(t.status==database_pb.Task.PENDING for t in decoded(before))
            # Original host dies after state+writer receipt Store ACK, before completion.
            stop(application);stop(database_process);database_process=database();assert inspect()==before
            # Keep task deferred while an intervening ordinary unary writer commits.
            extra={'REBOOT_TEST_TASK_DEFER_METHOD':'Apply','REBOOT_TEST_TASK_DEFER_MARKER':str(work/'deferred')}
            application,shutdown=host();until((work/'deferred').exists,application);channel.close();channel,stub,task_stub=fresh_channel()
            assert stub.Apply(app.Step(amount=3),metadata=metadata(str(uuid.uuid4())),timeout=5).value==10
            stop(application,shutdown);stop(database_process);database_process=database();extra={};application,shutdown=host();channel.close();channel,stub,task_stub=fresh_channel()
        if case=='framework-error':
            wait(application);assert application.returncode!=0
            before=inspect();assert before['value']==base_value and decoded(before)[0].status==database_pb.Task.PENDING and not decoded(before)[0].HasField('error') and lines().count('remote-handler')==1
            stop(database_process);database_process=database();assert inspect()==before
            extra={'REBOOT_TEST_TASK_DEFER_METHOD':'Apply','REBOOT_TEST_TASK_DEFER_MARKER':str(work/'deferred')}
            application,shutdown=host();until((work/'deferred').exists,application);channel.close();channel,stub,task_stub=fresh_channel()
        if running:
            waited=client('wait',result['task_id'],method)
            rich=status_pb2.Status.FromString(bytes.fromhex(waited['error']));assert rich.code==1 and rich.details[0].type_url=='type.googleapis.com/rbt.v1alpha1.Cancelled'
            assert inspect()['value']==base_value+3 and 'ordinary-body-escaped' not in lines()
        elif case in ['future-cancel','admission-ack-loss','framework-error']:
            before=inspect();assert before['value']==0 and lines().count('remote-handler')==(1 if case=='framework-error' else 0)
            if case=='future-cancel':
                assert decoded(before)[0].timestamp.seconds==1893456000
                error(grpc.StatusCode.UNAUTHENTICATED,lambda:task_stub.CancelTask(tasks.CancelTaskRequest(task_id=task_id),metadata=(('x-reboot-state-ref',state_ref),),timeout=3))
            cancel=task_stub.CancelTask(tasks.CancelTaskRequest(task_id=task_id),metadata=(('x-reboot-state-ref',state_ref),('authorization','Bearer task-admin')),timeout=5)
            assert cancel.status==tasks.CancelTaskResponse.OK
            waited=client('wait',result['task_id'],method)
            rich=status_pb2.Status.FromString(bytes.fromhex(waited['error']));assert rich.code==1 and rich.details[0].type_url=='type.googleapis.com/rbt.v1alpha1.Cancelled'
            assert inspect()['value']==0 and lines().count('remote-handler')==(1 if case=='framework-error' else 0)
        else:
            until(completed,application)
            waited=client('wait',result['task_id'],method)
            if case=='declared-error':
                rich=status_pb2.Status.FromString(bytes.fromhex(waited['error']));detail=app.BelowThreshold();assert rich.details[0].Unpack(detail) and detail.required==7 and detail.observed==0
                assert inspect()['value']==0 and lines().count('remote-declared-handler')==1
            elif case=='reader':assert waited=={'response':{}}
            else:assert waited=={'response':{'value':'7'}}
            if case not in ['declared-error','reader']:assert inspect()['value']==expected_value and lines().count('remote-handler')==expected_calls
        snapshot=inspect()
        # Current admission auth must precede replay disclosure; changed intent cannot remutate.
        if case=='auth':
            policy.write_text('deny');error(grpc.StatusCode.PERMISSION_DENIED,lambda:stub.Apply(app.Step(amount=7),metadata=metadata(key,schedule),timeout=3));policy.write_text('allow')
        if method=='Apply':error(grpc.StatusCode.FAILED_PRECONDITION,lambda:stub.Apply(app.Step(amount=8),metadata=metadata(key,schedule),timeout=3))
        error(grpc.StatusCode.FAILED_PRECONDITION,lambda:stub.Create(app.Empty(),metadata=metadata(str(uuid.uuid4()),''),timeout=3))
        assert inspect()==snapshot
        channel.close();stop(application,shutdown);stop(database_process);database_process=database();assert inspect()==snapshot
        extra={};target=du;application,shutdown=host()
        assert client('spawn',key,method,amount=amount,schedule=schedule)==result
        assert client('wait',result['task_id'],method)==waited
        assert inspect()==snapshot
        if not running and case not in ['future-cancel','admission-ack-loss','declared-error','reader']:assert lines().count('remote-handler')==expected_calls
        stop(wire_proxy);stop(application,shutdown);stop(database_process)
        records=[json.loads(line) for line in (work/'application-wire.jsonl').read_text().splitlines()]
        admissions=[r for r in records if r['phase']=='response' and any(k=='x-reboot-task-schedule' for k,v in r['request_metadata'])]
        assert admissions and all(len([v for k,v in r['trailing_metadata'] if k=='x-reboot-task-id-uuid'])==1 and not any(k=='x-reboot-task-id-uuid' for k,v in r['initial_metadata']) for r in admissions)
        cases.append(dict(case=case,task_id=result['task_id'],snapshot=snapshot,events=lines(),wire_records=len(records)));save()
    receipt['complete']=True
except BaseException as failure:
    receipt['error']=repr(failure); save(); raise
finally:
    # The same original finite parent owns failure and SIGTERM cleanup. Native
    # stores may retire only after every application owner has been joined.
    for role in ['client-or-proxy','application','database']:
        for child in children:
            if child['role']!=role or child['waited_by_parent']: continue
            p=child['process']
            try:
                if p.poll() is None: child['termination']='failure-sigterm'; p.terminate()
                try: wait(p)
                except subprocess.TimeoutExpired: p.kill(); wait(p)
            except BaseException as failure: child['cleanup_error']=repr(failure)
        if role=='application' and any(c['role']=='application' and not c['waited_by_parent'] for c in children): break
    receipt['all_original_children_waited']=all(c['waited_by_parent'] for c in children)
    save()
