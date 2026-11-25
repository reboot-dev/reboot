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
    overlay=ROOT/'python-protos';overlay.mkdir()
    runfiles=Path(os.environ['CANONICAL_PYTHON_RUNFILES']).resolve();plugin=Path(os.environ['CANONICAL_PYTHON_PLUGIN']).resolve()
    generator=spawn([sys.executable,'-m','grpc_tools.protoc',f'-I{SOURCE}',f'-I{Path(__file__).parent}',f'-I{Path(grpc_tools.__file__).parent/"_proto"}',f'--python_out={overlay}',f'--grpc_python_out={overlay}',f'--plugin=protoc-gen-reboot_python={plugin}',f'--reboot_python_out={overlay}','workflow/v1/workflow.proto'],os.environ.copy()|{'RUNFILES_DIR':str(runfiles.parent)})
    wait(generator);assert generator.returncode==0,Path(row(generator)['log']).read_text()
    receipt['generated_python']={str(p.relative_to(overlay)):hashlib.sha256(p.read_bytes()).hexdigest() for p in overlay.rglob('*.py')}
    sys.path[:0]=[str(overlay),str(runfiles)]
    from rbt.v1alpha1 import database_pb2 as db
    import base64
    client_env=os.environ.copy()|{'PYTHONPATH':str(overlay)+':'+str(runfiles)}
    for method in ['First','ScheduleWork']:
        work=ROOT/method;work.mkdir();events=work/'events'
        dp,ap,fp=port(),port(),port();du=f'http://127.0.0.1:{dp}';au=f'http://127.0.0.1:{fp}'
        run('info',work/'info.pb')
        def database():
            p=spawn([DB,work/'rocks',work/'info.pb',dp]);listening(p,dp);return p
        def host():
            shutdown=work/f'shutdown-{len(children)}'
            env=os.environ.copy()|dict(WORKFLOW_REFERENCE_ID='child',WORKFLOW_BODY_MODE='writer-task',WORKFLOW_BODY_EVENTS=str(events))
            p=spawn([BIN,'serve',du,f'127.0.0.1:{ap}',shutdown],env);listening(p,ap);ready(f'http://127.0.0.1:{ap}',p,True);return p,shutdown
        def inspect():return json.loads(run('spawn-inspect',du,target=True))
        def state():return json.loads(run('inspect-state',du,target=True))
        def lines():return events.read_text().splitlines() if events.exists() else []
        def client(action,key):
            out=work/f'client-{len(children)}.json';p=spawn([sys.executable,Path(__file__).with_name('canonical_client.py'),action,au,key,7,'',out,method],client_env)
            wait(p);assert p.returncode==0,Path(row(p)['log']).read_text();return json.loads(out.read_text())
        database_process=database();application,shutdown=host();wire_proxy=spawn([sys.executable,Path(__file__).with_name('canonical_wire_proxy.py'),f'127.0.0.1:{ap}',f'127.0.0.1:{fp}',work]);listening(wire_proxy,fp)
        run('create',au,str(uuid.uuid4()),target=True)
        key=str(uuid.uuid4());result=client('spawn',key);waited=client('wait',result['task_id'])
        expected={'first':7,'second':0,'schedules':0} if method=='First' else {'first':7,'second':7,'schedules':1}
        until(lambda:state()==expected,application)
        until(lambda:all(t['status']==2 for t in inspect()['tasks']),application)
        snapshot=inspect();assert len(snapshot['tasks'])==(1 if method=='First' else 2)
        if method=='First':assert waited=={'response':{'value':'7'}}
        else:
            child_id=base64.b64decode(waited['response']['id'])
            assert any(db.Task.FromString(bytes.fromhex(t['wire'])).method=='Run' and db.Task.FromString(bytes.fromhex(t['wire'])).task_id.task_uuid==child_id for t in snapshot['tasks'])
        assert lines().count('first-handler')==1 and lines().count('second-handler')==(0 if method=='First' else 1)
        assert client('spawn',key)==result and client('wait',result['task_id'])==waited and inspect()==snapshot
        stop(application,shutdown);stop(database_process);database_process=database();assert inspect()==snapshot and state()==expected
        application,shutdown=host();assert client('spawn',key)==result and client('wait',result['task_id'])==waited
        assert inspect()==snapshot and state()==expected and lines().count('first-handler')==1 and lines().count('second-handler')==(0 if method=='First' else 1)
        stop(wire_proxy);stop(application,shutdown);stop(database_process)
        cases.append(dict(case=method,task_id=result['task_id'],snapshot=snapshot,state=expected,events=lines()));save()
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
