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
    role='database' if Path(str(args[0])).resolve()==DB else 'application' if Path(str(args[0])).resolve() in [BIN,LEGACY] and len(args)>1 and args[1]=='serve' else 'client-or-proxy'
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

LEGACY=Path(os.environ['CANONICAL_LEGACY_BIN']).resolve()
receipt['legacy_binary_sha256']=hashlib.sha256(LEGACY.read_bytes()).hexdigest()
receipt['legacy_source_commit']=os.environ['CANONICAL_LEGACY_SOURCE_COMMIT']
sys.path.insert(0,os.environ['CANONICAL_PYTHON_RUNFILES'])
from rbt.v1alpha1 import tasks_pb2 as tasks,tasks_pb2_grpc
from database_ack_proxy import fields
save()
try:
    work=ROOT/'legacy-to-canonical';work.mkdir(); events=work/'events'
    policy=work/'policy';policy.write_text('allow')
    admin=work/'admin';admin.write_text('allow')
    sd,td,sa,ta,fp=[port() for _ in range(5)]
    su,tu,sdu,tdu=[f'http://127.0.0.1:{n}' for n in [sa,fp,sd,td]]
    run('info',work/'info.pb')
    def database(target=False):
        n=td if target else sd
        p=spawn([DB,work/('target-rocks' if target else 'source-rocks'),work/'info.pb',n]);listening(p,n);return p
    absolute=str(int(time.time())+3600)
    def host(target=False,legacy=False,paused=False,failure=False):
        env=os.environ.copy()|dict(WORKFLOW_BODY_MODE='spawn-target' if target else 'spawn',WORKFLOW_BODY_EVENTS=str(events),SPAWN_ENDPOINT=tu,SPAWN_AT=absolute,SPAWN_CATCH_CANCEL='1')
        if target: env.update(WORKFLOW_REFERENCE_ID='child',WORKFLOW_SCHEDULING_POLICY=str(policy),WORKFLOW_TASK_ADMIN_POLICY=str(admin))
        if paused:env['REBOOT_TEST_OUTBOUND_WRITER_AFTER_TARGET_ACK']=str(work/'after-target-ack')
        shutdown=work/f'shutdown-{len(children)}'
        p=spawn([LEGACY if legacy else BIN,'serve',tdu if target else sdu,f'127.0.0.1:{ta if target else sa}',shutdown],env)
        if not failure:listening(p,ta if target else sa);ready(f'http://127.0.0.1:{ta if target else sa}',p,target)
        return p,shutdown
    def proxy(mutate=False):
        args=[sys.executable,Path(__file__).with_name('canonical_wire_proxy.py'),f'127.0.0.1:{ta}',f'127.0.0.1:{fp}',work]
        if mutate:args.append('mutate-uuid')
        p=spawn(args);listening(p,fp);return p
    def inspect():return json.loads(run('spawn-inspect',tdu,target=True))
    def lines():return events.read_text().splitlines() if events.exists() else []
    source_db,target_db=database(),database(True)
    target,target_stop=host(True,legacy=True);wire=proxy()
    source,source_stop=host(legacy=True,paused=True)
    run('create',tu,str(uuid.uuid4()),target=True);run('create',su,str(uuid.uuid4()))
    source_id=run('schedule',su,str(uuid.uuid4()),'0','7')
    until((work/'after-target-ack').exists,source)
    before=inspect();assert len(before['tasks'])==1 and before['first']==0 and 'spawn-returned' not in lines()
    source_before=json.loads(run('inspect-reader-outcome',sdu,source_id))
    assert source_before['status']==1 and not source_before['has_terminal']
    checkpoints=source_before['checkpoints'];assert len(checkpoints)==1
    checkpoint=fields(fields(fields(bytes.fromhex(checkpoints[0]['record']))[2][0])[2][0])
    assert checkpoint[2]==[1] and 3 not in checkpoint, 'legacy source did not retain only Started'
    assert not any(l.startswith('spawn-ack:') for l in lines())
    task_id=tasks.TaskId.FromString(fields(bytes.fromhex(before['tasks'][0]['wire']))[1][0])
    stop(source);stop(wire);stop(target,target_stop);stop(source_db);stop(target_db)
    source_db,target_db=database(),database(True);assert inspect()==before
    target,target_stop=host(True);wire=proxy(mutate=True);source,source_stop=host(failure=True)
    # A real successful upstream admission with a changed UUID must not publish
    # a source Stored receipt or permit the parent to acknowledge/catch/continue.
    wait(source);assert source.returncode!=0
    assert not any(l.startswith('spawn-ack:') for l in lines()), 'changed target UUID was acknowledged by source'
    assert 'spawn-returned' not in lines() and 'second-handler' not in lines()
    assert inspect()==before
    assert json.loads(run('inspect-reader-outcome',sdu,source_id))==source_before
    stop(wire);wire=proxy();source,source_stop=host()
    until(lambda:any(l.startswith('spawn-ack:') for l in lines()),source)
    assert inspect()==before
    assert f'spawn-ack:{uuid.UUID(bytes=task_id.task_uuid)}' in lines()
    channel=grpc.insecure_channel(f'127.0.0.1:{ta}');stub=tasks_pb2_grpc.TasksStub(channel)
    assert stub.CancelTask(tasks.CancelTaskRequest(task_id=task_id),metadata=(('x-reboot-state-ref',task_id.state_ref),('authorization','Bearer task-admin')),timeout=5).status==tasks.CancelTaskResponse.OK
    assert json.loads(run('wait',su,source_id))=={'first':-999,'second':1}
    assert lines().count('second-handler')==1 and lines().count('child-cancellation-caught')==1
    final=inspect();assert len(final['tasks'])==1
    stop(source,source_stop);stop(wire);stop(target,target_stop);stop(source_db);stop(target_db);channel.close()
    wire_records=[json.loads(l) for l in (work/'application-wire.jsonl').read_text().splitlines()]
    # Select from the actual retained path, not a guessed package identity.
    legacy_calls=[r for r in wire_records if r['phase']=='response' and r['path'].endswith('WorkflowSpawner/Spawn')]
    canonical_calls=[r for r in wire_records if r['phase']=='response' and r['path']=='/workflow.v1.LedgerMethods/Child']
    assert legacy_calls and canonical_calls
    assert all([v for k,v in r['trailing_metadata'] if k=='x-reboot-task-id-uuid']==[str(uuid.UUID(bytes=task_id.task_uuid))] for r in canonical_calls)
    cases.append(dict(case='legacy-started-intent-to-canonical-application-rpc',task_id=task_id.SerializeToString().hex(),before=before,source_started_before_and_after_wrong_uuid=source_before,after=final,legacy_calls=len(legacy_calls),canonical_calls=len(canonical_calls),events=lines()));receipt['complete']=True;save()
except BaseException as failure:
    receipt['error']=repr(failure);save();raise
finally:
    for role in ['client-or-proxy','application','database']:
        for child in children:
            if child['role']!=role or child['waited_by_parent']:continue
            p=child['process']
            try:
                if p.poll() is None:child['termination']='failure-sigterm';p.terminate()
                try:wait(p)
                except subprocess.TimeoutExpired:p.kill();wait(p)
            except BaseException as failure:child['cleanup_error']=repr(failure)
        if role=='application' and any(c['role']=='application' and not c['waited_by_parent'] for c in children):break
    receipt['all_original_children_waited']=all(c['waited_by_parent'] for c in children);save()
