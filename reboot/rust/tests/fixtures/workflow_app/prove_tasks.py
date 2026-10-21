"""Canonical Python-generated Tasks wire against generated Rust hosts/native C++.

Finite original parent: every service/client child is ledgered and joined. No
mutation retries or Database seeding. Spawn admission is still Rust-only; these
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
    role='database' if Path(str(args[0])).resolve()==DB else 'application' if Path(str(args[0])).resolve()==BIN and len(args)>1 and args[1]=='serve' else 'client-or-proxy'
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
    grpc_tools_file=grpc_tools.__file__; assert grpc_tools_file is not None
    generator=spawn([sys.executable,'-m','grpc_tools.protoc',f'-I{SOURCE}',f'-I{Path(grpc_tools_file).parent/"_proto"}',f'--python_out={overlay}',f'--grpc_python_out={overlay}','rbt/v1alpha1/tasks.proto','rbt/v1alpha1/errors.proto'])
    wait(generator); assert generator.returncode==0,Path(row(generator)['log']).read_text()
    sys.path.insert(0,str(overlay))
    from rbt.v1alpha1 import tasks_pb2 as tasks, tasks_pb2_grpc, errors_pb2
    receipt['python_generated_sources']={str(p.relative_to(overlay)):hashlib.sha256(p.read_bytes()).hexdigest() for p in overlay.rglob('*.py')}; save()
    selected=os.environ.get('TASK_NATIVE_CASES','success,declared-error,running-cancel,scheduled-cancel,rust-handle-cancel,cancel-revocation,wait-revocation,cancel-ack-loss,cancel-catch-replay,cancel-retains-effects,cancel-race,terminal-wrong-code,terminal-malformed-detail,terminal-rpc-cancelled,relative-schedule,relative-concurrent,relative-replay,relative-ack-loss,relative-cancel').split(',')
    for case in selected:
        work=ROOT/case; work.mkdir(); events=work/'events'
        policy=work/'policy'; admin=work/'admin'; wait_policy=work/'wait-policy'
        for p in [policy,admin,wait_policy]: p.write_text('allow')
        sd,td,sa,ta=[port() for _ in range(4)]
        su,tu,sdu,tdu=[f'http://127.0.0.1:{n}' for n in [sa,ta,sd,td]]
        target_endpoint=tdu
        spawn_endpoint=tu
        run('info',work/'info.pb')
        def database(target=False):
            n=td if target else sd
            p=spawn([DB,work/('target-rocks' if target else 'source-rocks'),work/'info.pb',n]); listening(p,n); return p
        def host(target=False,extra=None,failure=False):
            env=os.environ.copy()|dict(WORKFLOW_BODY_MODE='spawn-target' if target else 'spawn',WORKFLOW_BODY_EVENTS=str(events),SPAWN_ENDPOINT=spawn_endpoint,SPAWN_CATCH_CANCEL='1')
            if case=='scheduled-cancel': env['SPAWN_AT']=str(int(time.time())+3600)
            if case.startswith('relative-'):
                env['SPAWN_AFTER_MILLIS']='60000' if case=='relative-cancel' else '8000' if case=='relative-replay' else '5000' if case=='relative-ack-loss' else '2000'
            if case=='relative-concurrent' and not target: env['SPAWN_CONCURRENT']='1'
            if target: env.update(WORKFLOW_REFERENCE_ID='child',WORKFLOW_SCHEDULING_POLICY=str(policy),WORKFLOW_WAIT_POLICY=str(wait_policy),WORKFLOW_TASK_ADMIN_POLICY=str(admin))
            if case=='cancel-ack-loss' and target: env['REBOOT_TEST_TASK_WAIT_CANCEL_PENDING']=str(work/'wait-pending')
            if case=='cancel-race' and target: env['CHILD_PARK_RELEASE']=str(work/'body-release')
            if (case in ['cancel-ack-loss','wait-revocation'] or case.startswith('terminal-')) and not target: env['SPAWN_BEFORE_WAIT']=str(work/'before-wait')
            if case=='cancel-catch-replay' and not target: env['SPAWN_AFTER_CANCEL_CATCH']=str(work/'after-catch')
            env.update(extra or {})
            shutdown=work/f'shutdown-{len(children)}'
            p=spawn([BIN,'serve',target_endpoint if target else sdu,f'127.0.0.1:{ta if target else sa}',shutdown],env)
            if not failure: listening(p,ta if target else sa)
            return p,shutdown
        def lines(): return events.read_text().splitlines() if events.exists() else []
        def inspect(): return json.loads(run('spawn-inspect',tdu,target=True))
        source_db=database(); target_db=database(True)
        proxy=None
        if case in ['cancel-ack-loss','relative-ack-loss']:
            pp=port(); proxy=spawn([sys.executable,Path(__file__).with_name('database_ack_proxy.py'),f'127.0.0.1:{td}',f'127.0.0.1:{pp}','cancel' if case=='cancel-ack-loss' else 'spawn',work]); listening(proxy,pp)
            target_endpoint=f'http://127.0.0.1:{pp}'
        target,target_stop=host(True); ready(tu,target,True)
        if case.startswith('terminal-'):
            pp=port()
            proxy=spawn([sys.executable,Path(__file__).with_name('tasks_terminal_proxy.py'),f'127.0.0.1:{ta}',f'127.0.0.1:{pp}',case.removeprefix('terminal-'),work],os.environ.copy()|{'PYTHONPATH':str(overlay)})
            listening(proxy,pp); spawn_endpoint=f'http://127.0.0.1:{pp}'
        source,source_stop=host(extra={'REBOOT_TEST_OUTBOUND_WRITER_AFTER_TARGET_ACK':str(work/'after-admission')} if case=='relative-replay' else None); ready(su,source)
        run('create',tu,str(uuid.uuid4()),target=True); run('create',su,str(uuid.uuid4()))
        fault=os.environ.get('TASK_NATIVE_FAULT_AFTER_START')
        if fault=='signal': os.kill(os.getpid(),signal.SIGTERM)
        if fault=='error': raise RuntimeError('injected lifecycle parent failure after real hosts started')
        successful=case in ['success','relative-schedule','relative-concurrent','relative-replay','relative-ack-loss']
        amount=7 if successful else -1 if case=='declared-error' else 998 if case=='cancel-retains-effects' else 999
        scheduled_after=time.time()
        source_id=run('schedule',su,str(uuid.uuid4()),'0',str(amount))
        until(lambda:len(inspect()['tasks'])==1,source)
        snapshot=inspect()
        scheduled=None
        # Canonical actor reference comes from the actual durable Task wire, not
        # an invented readable-ID encoding. Task.task_id is field 1.
        from database_ack_proxy import fields
        task_id=tasks.TaskId.FromString(fields(bytes.fromhex(snapshot['tasks'][0]['wire']))[1][0])
        child_uuid=str(uuid.UUID(bytes=task_id.task_uuid))
        if case.startswith('relative-'):
            scheduled=timestamp_pb2.Timestamp.FromString(fields(bytes.fromhex(snapshot['tasks'][0]['wire']))[5][0])
            delay=60 if case=='relative-cancel' else 8 if case=='relative-replay' else 5 if case=='relative-ack-loss' else 2
            assert scheduled_after+delay <= scheduled.seconds+scheduled.nanos/1e9 <= time.time()+delay
            assert snapshot['tasks'][0]['status']==1 and snapshot['first']==0 and 'child-body' not in lines()
            if case=='relative-replay':
                until((work/'after-admission').exists,source)
                assert not any(line.startswith('spawn-ack:') for line in lines())
                stop(source); stop(target,target_stop); stop(source_db); stop(target_db)
                source_db=database(); target_db=database(True); assert inspect()==snapshot
                target,target_stop=host(True); ready(tu,target,True)
                bad,bad_stop=host(extra={'SPAWN_AFTER_MILLIS':'8001'},failure=True); wait(bad); assert bad.returncode!=0
                assert inspect()==snapshot and 'spawn-returned' not in lines()
                source,source_stop=host(); ready(su,source)
            elif case=='relative-ack-loss':
                until((work/'ack-observed.json').exists,target)
                assert json.loads((work/'ack-observed.json').read_text())['real_native_ack_observed']
                assert 'spawn-returned' not in lines() and not any(line.startswith('spawn-ack:') for line in lines())
                (work/'release').touch(); wait(source); wait(target)
                assert source.returncode!=0 and target.returncode!=0
                stop(proxy); stop(source_db); stop(target_db)
                source_db=database(); target_db=database(True); assert inspect()==snapshot
                target_endpoint=tdu; target,target_stop=host(True); ready(tu,target,True)
                source,source_stop=host(); ready(su,source)
        with grpc.insecure_channel(f'127.0.0.1:{ta}') as channel:
            stub=tasks_pb2_grpc.TasksStub(channel)
            metadata=(('x-reboot-state-ref',task_id.state_ref),)
            auth=metadata+(('authorization','Bearer task-admin'),)
            req=tasks.CancelTaskRequest(task_id=task_id)
            wait_req=tasks.WaitRequest(task_id=task_id)
            rpc_records=[]
            status=None
            def cancel():
                response=stub.CancelTask(req,metadata=auth,timeout=10)
                rpc_records.append(dict(method='CancelTask',request=req.SerializeToString().hex(),response=response.SerializeToString().hex()))
                return response.status
            def terminal():
                response=stub.Wait(wait_req,metadata=metadata,timeout=10)
                rpc_records.append(dict(method='Wait',request=wait_req.SerializeToString().hex(),response=response.SerializeToString().hex()))
                return response
            if not successful and case!='declared-error':
                if case not in ['scheduled-cancel','relative-cancel']: until(lambda:'child-parked' in lines(),target)
                initial=inspect()
                error(grpc.StatusCode.UNAUTHENTICATED,lambda:stub.CancelTask(req,metadata=metadata,timeout=3))
                wrong=tasks.CancelTaskRequest(task_id=task_id); wrong.task_id.task_uuid=uuid.uuid4().bytes
                error(grpc.StatusCode.UNAUTHENTICATED,lambda:stub.CancelTask(wrong,metadata=metadata,timeout=3))
                error(grpc.StatusCode.INVALID_ARGUMENT,lambda:stub.CancelTask(req,metadata=(('x-reboot-state-ref','other'),('authorization','Bearer task-admin')),timeout=3))
                assert inspect()==initial
                if case=='cancel-revocation':
                    admin.write_text('deny'); error(grpc.StatusCode.PERMISSION_DENIED,cancel); assert inspect()==initial; admin.write_text('allow')
                if case=='cancel-ack-loss':
                    until((work/'before-wait').exists,source)
                    # Request runs as an original client child so the parent can
                    # inspect the upstream-ACK barrier without losing custody.
                    client=spawn([BIN,'task-cancel',tu,child_uuid])
                    until((work/'ack-observed.json').exists,target)
                    observed=json.loads((work/'ack-observed.json').read_text())
                    assert observed['method']=='CompleteTask' and observed['real_native_ack_observed'] and not observed['downstream_success_delivered']
                    cancelled=inspect(); assert cancelled['tasks'][0]['status']==2
                    pending_wait=stub.Wait.future(wait_req,metadata=metadata,timeout=10)
                    until(lambda:(work/'wait-pending').exists() or pending_wait.done(),target)
                    if pending_wait.done():
                        premature=pending_wait.result()
                        (work/'premature-wait.pb').write_bytes(premature.SerializeToString())
                        raise AssertionError('canonical Wait disclosed before cancellation ACK')
                    assert (work/'wait-pending').exists()
                    assert 'child-cancellation-caught' not in lines() and 'spawn-returned' not in lines()
                    assert 'child-body-retired' not in lines()
                    (work/'release').touch(); wait(client); assert client.returncode!=0
                    error(grpc.StatusCode.UNAVAILABLE,lambda:pending_wait.result(timeout=10))
                    wait(target); assert target.returncode!=0
                    stop(source,source_stop); stop(proxy); stop(source_db); stop(target_db)
                    source_db=database(); target_db=database(True); assert inspect()==cancelled
                    target_endpoint=tdu; target,target_stop=host(True); ready(tu,target,True)
                    (work/'before-wait.release').touch(); source,source_stop=host(); ready(su,source)
                elif case=='rust-handle-cancel':
                    assert run('task-cancel',tu,child_uuid)=='Ok'
                elif case=='cancel-race':
                    future=stub.CancelTask.future(req,metadata=auth,timeout=10)
                    (work/'body-release').touch()
                    race_response=future.result(); status=race_response.status
                    rpc_records.append(dict(method='CancelTask',request=req.SerializeToString().hex(),response=race_response.SerializeToString().hex()))
                    assert status in [tasks.CancelTaskResponse.OK,tasks.CancelTaskResponse.NOT_FOUND]
                else:
                    assert cancel()==tasks.CancelTaskResponse.OK
                if case=='wait-revocation':
                    until((work/'before-wait').exists,source)
                    wait_policy.write_text('deny'); error(grpc.StatusCode.PERMISSION_DENIED,terminal)
                    assert 'child-cancellation-caught' not in lines() and 'spawn-returned' not in lines()
                    wait_policy.write_text('allow'); (work/'before-wait.release').touch()
                if case.startswith('terminal-'):
                    until((work/'before-wait').exists,source)
                    (work/'before-wait.release').touch()
                    wait(source); assert source.returncode!=0
                    assert list(work.glob('wait-mutation-*.json'))
                    assert 'spawn-returned' not in lines()
                    assert json.loads(run('inspect-state',sdu))['second']==0
                    pending=json.loads(run('inspect-reader-outcome',sdu,source_id))
                    assert pending['status']==1 and not pending['has_terminal']
                    stop(proxy); stop(source_db); source_db=database(); spawn_endpoint=tu
                    source,source_stop=host(); ready(su,source)
                terminal_value=terminal()
                if case=='cancel-race':
                    assert status is not None
                    assert terminal_value.response_or_error.WhichOneof('response_or_error')==('error' if status==tasks.CancelTaskResponse.OK else 'response')
                if terminal_value.response_or_error.WhichOneof('response_or_error')=='error':
                    rich=status_pb2.Status(); assert terminal_value.response_or_error.error.Unpack(rich)
                    assert rich.code==1 and len(rich.details)==1 and rich.details[0].Is(errors_pb2.Cancelled.DESCRIPTOR)
                    detail=errors_pb2.Cancelled(); assert rich.details[0].Unpack(detail)
                    until(lambda:'child-cancellation-caught' in lines(),source)
                else:
                    assert case=='cancel-race' and terminal_value.response_or_error.response.TypeName()=='workflow.v1.Value'
                assert cancel()==tasks.CancelTaskResponse.NOT_FOUND
                if case not in ['scheduled-cancel','relative-cancel','cancel-race']:
                    until(lambda:'child-body-retired' in lines(),target)
                    assert inspect()['first']==(5 if case=='cancel-retains-effects' else 0)
                if case=='cancel-catch-replay':
                    until((work/'after-catch').exists,source)
                    assert json.loads(run('read',su))['second']==0
                    saved=inspect()
                    stop(source); stop(source_db); source_db=database()
                    assert inspect()==saved
                    (work/'after-catch.release').touch()
                    source,source_stop=host(); ready(su,source)
            else:
                terminal_value=terminal()
                if successful: assert terminal_value.response_or_error.response.TypeName()=='workflow.v1.Value'
                else:
                    rich=status_pb2.Status(); assert terminal_value.response_or_error.error.Unpack(rich)
                    assert rich.details[0].TypeName()=='workflow.v1.BelowThreshold'
                assert cancel()==tasks.CancelTaskResponse.NOT_FOUND
            terminal_observed_at=time.time()
            if successful and case.startswith('relative-'):
                assert scheduled is not None
                assert terminal_observed_at >= scheduled.seconds+scheduled.nanos/1e9
            until(lambda:'spawn-returned' in lines(),source)
            parent_result=json.loads(run('wait',su,source_id))
            expected_first=-1 if case=='declared-error' else 7 if successful else 999 if case=='cancel-race' and terminal_value.response_or_error.WhichOneof('response_or_error')=='response' else -999
            assert parent_result=={'first':expected_first,'second':1}
            state=json.loads(run('read',su)); assert state['second']==1
            retained=inspect(); wire=terminal_value.SerializeToString()
            assert len(retained['tasks'])==1
            if case=='cancel-race': assert retained['first'] in [0,999]
            else: assert retained['first']==(7 if successful else 5 if case=='cancel-retains-effects' else 0)
            external_handle_result=run('task-handle-wait',tu,child_uuid)
            assert external_handle_result==('below:-1' if case=='declared-error' else 'success:7' if successful else 'success:999' if case=='cancel-race' and terminal_value.response_or_error.WhichOneof('response_or_error')=='response' else 'cancelled')
            before_bodies=lines().count('child-body'); before_handlers=lines().count('first-handler')
            stop(source,source_stop); stop(target,target_stop); stop(source_db); stop(target_db)
            source_db=database(); target_db=database(True); assert inspect()==retained
            target,target_stop=host(True); ready(tu,target,True)
            source,source_stop=host(); ready(su,source)
            assert terminal().SerializeToString()==wire
            assert run('task-handle-wait',tu,child_uuid)==external_handle_result
            assert cancel()==tasks.CancelTaskResponse.NOT_FOUND
            assert json.loads(run('wait',su,source_id))==parent_result
            assert inspect()==retained and lines().count('child-body')==before_bodies and lines().count('first-handler')==before_handlers
            assert json.loads(run('read',su))['second']==1
            stop(source,source_stop); stop(target,target_stop); stop(source_db); stop(target_db)
            cases.append(dict(case=case,task_id=task_id.SerializeToString().hex(),parent_result=parent_result,retained=retained,rpcs=rpc_records,events=lines(),terminal_observed_at=terminal_observed_at,
                              relative_timestamp=scheduled.SerializeToString().hex() if scheduled is not None else None)); save()
    receipt['complete']=True
except BaseException as failure:
    receipt['failure']=repr(failure)
    raise
finally:
    for c in sorted(reversed(children), key=lambda item:item['role']=='database'):
        p=c['process']
        if not c['waited_by_parent']:
            if c['role']=='database' and any(item['role']=='application' and not item['waited_by_parent'] for item in children):
                c['cleanup_error']='database stop blocked by unresolved application custody'
                continue
            try: stop(p)
            except BaseException as failure: c['cleanup_error']=repr(failure)
    receipt['all_original_children_waited']=all(c['waited_by_parent'] for c in children)
    if not receipt['all_original_children_waited']: receipt['complete']=False
    save()
    if not receipt['all_original_children_waited']: raise RuntimeError('unresolved original child custody')
