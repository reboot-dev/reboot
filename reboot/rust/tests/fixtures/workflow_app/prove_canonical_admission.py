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
    runfiles=Path(os.environ['CANONICAL_PYTHON_RUNFILES']).resolve()
    plugin=Path(os.environ['CANONICAL_PYTHON_PLUGIN']).resolve()
    receipt['python_plugin_sha256']=hashlib.sha256(plugin.read_bytes()).hexdigest()
    generator_env=os.environ.copy()|{'RUNFILES_DIR':str(runfiles.parent)}
    generator=spawn([sys.executable,'-m','grpc_tools.protoc',f'-I{SOURCE}',f'-I{Path(__file__).parent}',f'-I{Path(grpc_tools.__file__).parent/"_proto"}',f'--python_out={overlay}',f'--grpc_python_out={overlay}',f'--plugin=protoc-gen-reboot_python={plugin}',f'--reboot_python_out={overlay}','workflow/v1/workflow.proto'],generator_env)
    wait(generator); assert generator.returncode==0,Path(row(generator)['log']).read_text()
    receipt['generated_python']={str(p.relative_to(overlay)):hashlib.sha256(p.read_bytes()).hexdigest() for p in overlay.rglob('*.py')}
    client_env=os.environ.copy()|{'PYTHONPATH':str(overlay)+':'+str(runfiles)}
    sys.path[:0]=[str(overlay),str(runfiles)]
    from workflow.v1 import workflow_pb2 as app, workflow_pb2_grpc as app_grpc
    from rbt.v1alpha1 import tasks_pb2 as tasks, tasks_pb2_grpc
    from database_ack_proxy import fields
    import datetime
    selected=os.environ.get('CANONICAL_NATIVE_CASES','success,declared-error,concurrent,future-cancel,admission-auth,admission-ack-loss').split(',')
    for case in selected:
        work=ROOT/case; work.mkdir(); events=work/'events'
        policy=work/'policy'; policy.write_text('allow')
        admin=work/'admin'; admin.write_text('allow')
        wait_policy=work/'wait-policy'; wait_policy.write_text('allow')
        dp,ap,fp=port(),port(),port(); du=f'http://127.0.0.1:{dp}'; au=f'http://127.0.0.1:{fp}'
        run('info',work/'info.pb')
        def database():
            p=spawn([DB,work/'rocks',work/'info.pb',dp]); listening(p,dp); return p
        target_endpoint=du
        def host():
            shutdown=work/f'shutdown-{len(children)}'
            env=os.environ.copy()|dict(WORKFLOW_REFERENCE_ID='child',WORKFLOW_BODY_MODE='spawn-target',WORKFLOW_BODY_EVENTS=str(events),WORKFLOW_SCHEDULING_POLICY=str(policy),WORKFLOW_TASK_ADMIN_POLICY=str(admin),WORKFLOW_WAIT_POLICY=str(wait_policy))
            p=spawn([BIN,'serve',target_endpoint,f'127.0.0.1:{ap}',shutdown],env); listening(p,ap); ready(f'http://127.0.0.1:{ap}',p,True); return p,shutdown
        def inspect(): return json.loads(run('spawn-inspect',du,target=True))
        def lines(): return events.read_text().splitlines() if events.exists() else []
        def client(action,key,amount=7,schedule='',good=True,launch=False):
            out=work/f'client-{len(children)}.json'
            p=spawn([sys.executable,Path(__file__).with_name('canonical_client.py'),action,au,key,amount,schedule,out],client_env)
            if launch: return p,out
            wait(p)
            if good: assert p.returncode==0,Path(row(p)['log']).read_text()
            return json.loads(out.read_text()) if out.exists() else None
        database_process=database(); proxy=None
        if case=='admission-ack-loss':
            pp=port(); proxy=spawn([sys.executable,Path(__file__).with_name('database_ack_proxy.py'),f'127.0.0.1:{dp}',f'127.0.0.1:{pp}','spawn',work]); listening(proxy,pp); target_endpoint=f'http://127.0.0.1:{pp}'
        application,shutdown=host()
        wire_proxy=spawn([sys.executable,Path(__file__).with_name('canonical_wire_proxy.py'),f'127.0.0.1:{ap}',f'127.0.0.1:{fp}',work]); listening(wire_proxy,fp)
        run('create',au,str(uuid.uuid4()),target=True)
        fault=os.environ.get('CANONICAL_NATIVE_FAULT_AFTER_START')
        if fault=='signal': os.kill(os.getpid(),signal.SIGTERM)
        if fault=='error': raise RuntimeError('injected canonical parent failure after real hosts started')
        if case=='admission-ack-loss':
            # This fault uses the actual generated raw application gRPC stub:
            # its single call has no ExternalContext transport retry policy.
            # The normal cases below use the actual generated Reboot TasksStub.
            key=str(uuid.uuid4())
            channel=grpc.insecure_channel(f'127.0.0.1:{ap}'); stub=app_grpc.LedgerMethodsStub(channel)
            schedule=(datetime.datetime.now(datetime.timezone.utc)+datetime.timedelta(seconds=3600)).isoformat()
            # Derive the canonical actor identity using the public typed reference
            # response from Create's regular actor and its query metadata.
            # StateRef itself is the public SDK encoding (not a seeded task).
            from reboot.aio.types import StateRef
            state_ref=StateRef.from_id('workflow.v1.Ledger','child').to_str()
            metadata=(('x-reboot-state-ref',state_ref),('x-reboot-idempotency-key',key),('x-reboot-task-schedule',schedule),('authorization','Bearer spawn-service'),('x-reboot-caller-id','application_id=a0000000001'))
            future=stub.Child.future(app.Step(amount=7),metadata=metadata,timeout=8)
            until((work/'ack-observed.json').exists,application)
            assert not future.done()
            snapshot=inspect(); assert len(snapshot['tasks'])==1 and snapshot['first']==0 and 'child-body' not in lines()
            (work/'release').touch()
            error(grpc.StatusCode.UNAVAILABLE,lambda:future.result(timeout=10))
            # Sticky uncertain owner must not return a successful task identity.
            error(grpc.StatusCode.UNAVAILABLE,lambda:stub.Child(app.Step(amount=7),metadata=metadata,timeout=3))
            wait(application); assert application.returncode!=0
            stop(proxy); stop(database_process); database_process=database(); assert inspect()==snapshot
            target_endpoint=du; application,shutdown=host()
            # Retire the channel that observed real host disappearance. Waiting
            # for a fresh transport is readiness, not retrying a mutation.
            channel.close(); channel=grpc.insecure_channel(f'127.0.0.1:{ap}')
            grpc.channel_ready_future(channel).result(timeout=5)
            stub=app_grpc.LedgerMethodsStub(channel)
            response,call=stub.Child.with_call(app.Step(amount=7),metadata=metadata,timeout=5)
            task_headers=[v for k,v in call.trailing_metadata() if k=='x-reboot-task-id-uuid']
            assert len(task_headers)==1 and not any(k=='x-reboot-task-id-uuid' for k,v in call.initial_metadata())
            assert inspect()==snapshot
            rpc_records=[dict(request=app.Step(amount=7).SerializeToString().hex(),response=response.SerializeToString().hex(),trailing_metadata=list(call.trailing_metadata()))]
            task_id=tasks.TaskId(state_type='workflow.v1.Ledger',state_ref=state_ref,task_uuid=uuid.UUID(task_headers[0]).bytes)
            task_stub=tasks_pb2_grpc.TasksStub(channel)
            assert task_stub.CancelTask(tasks.CancelTaskRequest(task_id=task_id),metadata=(('x-reboot-state-ref',state_ref),('authorization','Bearer task-admin')),timeout=5).status==tasks.CancelTaskResponse.OK
            snapshot=inspect(); channel.close()
        else:
            amount=-1 if case=='declared-error' else 7
            schedule=(datetime.datetime.now(datetime.timezone.utc)+datetime.timedelta(seconds=3600)).isoformat() if case=='future-cancel' else ''
            key=str(uuid.uuid4())
            if case=='concurrent':
                pairs=[client('spawn',key,amount,schedule,launch=True) for _ in range(4)]
                results=[]
                for p,out in pairs:
                    wait(p); assert p.returncode==0,Path(row(p)['log']).read_text(); results.append(json.loads(out.read_text()))
                assert all(value==results[0] for value in results); result=results[0]
            else: result=client('spawn',key,amount,schedule)
            task_id=tasks.TaskId.FromString(bytes.fromhex(result['task_id']))
            assert task_id.state_type=='workflow.v1.Ledger' and uuid.UUID(bytes=task_id.task_uuid).version==4
            if case=='future-cancel':
                snapshot=inspect(); assert snapshot['first']==0 and 'child-body' not in lines(), 'explicit absolute schedule was not preserved'
                saved_timestamp=fields(bytes.fromhex(snapshot['tasks'][0]['wire']))[5][0]
                from google.protobuf.timestamp_pb2 import Timestamp
                stamp=Timestamp.FromString(saved_timestamp)
                expected=datetime.datetime.fromisoformat(schedule)
                assert stamp.seconds==int(expected.timestamp()) and stamp.nanos==expected.microsecond*1000
                assert client('spawn',key,amount,schedule)==result
                channel=grpc.insecure_channel(f'127.0.0.1:{ap}'); stub=tasks_pb2_grpc.TasksStub(channel)
                assert stub.CancelTask(tasks.CancelTaskRequest(task_id=task_id),metadata=(('x-reboot-state-ref',task_id.state_ref),('authorization','Bearer task-admin')),timeout=5).status==tasks.CancelTaskResponse.OK
                channel.close()
            waited=client('wait',result['task_id'])
            if case=='declared-error':
                from google.rpc.status_pb2 import Status
                rich=Status.FromString(bytes.fromhex(waited['error'])); assert rich.details[0].type_url=='type.googleapis.com/workflow.v1.BelowThreshold'
            elif case=='future-cancel':
                from google.rpc.status_pb2 import Status
                rich=Status.FromString(bytes.fromhex(waited['error'])); assert rich.details[0].type_url=='type.googleapis.com/rbt.v1alpha1.Cancelled'
            else: assert waited['response']=={'value':'7'}
            snapshot=inspect(); assert len(snapshot['tasks'])==1 and snapshot['first']==(7 if amount>=0 and case!='future-cancel' else 0)
            # Recover the exact persisted mutation key, not an assumed Python key
            # derivation, then probe changed intent and current authorization.
            records=[fields(bytes.fromhex(value)) for value in snapshot['receipts']]
            admission=next(record for record in records if 3 in record)
            raw_key=str(uuid.UUID(bytes=admission[1][0]))
            channel=grpc.insecure_channel(f'127.0.0.1:{ap}'); stub=app_grpc.LedgerMethodsStub(channel)
            metadata=(('x-reboot-state-ref',task_id.state_ref),('x-reboot-idempotency-key',raw_key),('x-reboot-task-schedule',schedule),('authorization','Bearer spawn-service'),('x-reboot-caller-id','application_id=a0000000001'))
            response,call=stub.Child.with_call(app.Step(amount=amount),metadata=metadata,timeout=5)
            assert [v for k,v in call.trailing_metadata() if k=='x-reboot-task-id-uuid']==[str(uuid.UUID(bytes=task_id.task_uuid))]
            assert not any(k=='x-reboot-task-id-uuid' for k,v in call.initial_metadata())
            rpc_records=[dict(request=app.Step(amount=amount).SerializeToString().hex(),response=response.SerializeToString().hex(),trailing_metadata=list(call.trailing_metadata()))]
            error(grpc.StatusCode.FAILED_PRECONDITION,lambda:stub.Child(app.Step(amount=amount+1),metadata=metadata,timeout=3))
            changed_schedule=tuple((k,'2030-01-01T00:00:00+00:00' if k=='x-reboot-task-schedule' else v) for k,v in metadata)
            error(grpc.StatusCode.FAILED_PRECONDITION,lambda:stub.Child(app.Step(amount=amount),metadata=changed_schedule,timeout=3))
            missing=tuple((k,v) for k,v in metadata if k!='x-reboot-task-schedule')
            error(grpc.StatusCode.PERMISSION_DENIED,lambda:stub.Child(app.Step(amount=amount),metadata=missing,timeout=3))
            # Unsupported Python callable targets must not run synchronously while
            # pretending to create a task; state and receipts remain unchanged.
            error(grpc.StatusCode.FAILED_PRECONDITION,lambda:stub.First(app.Step(amount=100),metadata=metadata,timeout=3))
            error(grpc.StatusCode.FAILED_PRECONDITION,lambda:stub.Query(app.Empty(),metadata=metadata,timeout=3))
            error(grpc.StatusCode.FAILED_PRECONDITION,lambda:stub.Create(app.Empty(),metadata=metadata,timeout=3))
            if case=='admission-auth':
                policy.write_text('deny')
                error(grpc.StatusCode.PERMISSION_DENIED,lambda:stub.Child(app.Step(amount=amount),metadata=metadata,timeout=3))
                policy.write_text('allow')
            assert inspect()==snapshot
            channel.close()
            stop(application,shutdown); stop(database_process)
            database_process=database(); assert inspect()==snapshot
            application,shutdown=host()
            assert client('spawn',key,amount,schedule)==result
            assert client('wait',result['task_id'])==waited
            assert inspect()==snapshot
        stop(wire_proxy); stop(application,shutdown); stop(database_process)
        cases.append(dict(case=case,task_id=task_id.SerializeToString().hex(),snapshot=snapshot,rpc_records=rpc_records,events=lines())); save()
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
