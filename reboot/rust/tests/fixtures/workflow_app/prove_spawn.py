"""Two generated hosts and two actual native Database/RocksDB processes.
All children remain original children of this finite parent, atomically ledgered
before observation, and explicitly waited. No mutation retries or state seeding.
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

BIN, ROOT = Path(sys.argv[1]).resolve(), Path(sys.argv[2]).resolve()
DB = Path(os.environ['REBOOT_NATIVE2PC_CXX_DATABASE']).resolve()
ROOT.mkdir(parents=True, exist_ok=False)
children, cases = [], []
receipt = dict(complete=False, parent_pid=os.getpid(), children=children, cases=cases,
               binary_sha256=hashlib.sha256(BIN.read_bytes()).hexdigest(),
               database_sha256=hashlib.sha256(DB.read_bytes()).hexdigest())

def save():
    record = receipt | {'children': [{k:v for k,v in c.items() if k != 'process'} for c in children]}
    path = ROOT/'receipt.json.tmp'
    path.write_text(json.dumps(record, indent=2))
    with path.open('rb') as f: os.fsync(f.fileno())
    os.replace(path, ROOT/'receipt.json')
    fd = os.open(ROOT, os.O_RDONLY); os.fsync(fd); os.close(fd)

def terminate(*_):
    raise InterruptedError('native parent termination requested')
for sig in [signal.SIGTERM, signal.SIGINT, signal.SIGHUP]: signal.signal(sig, terminate)

def port():
    with socket.socket() as sock:
        sock.bind(('127.0.0.1',0)); return sock.getsockname()[1]

def spawn(args, env=None):
    log=ROOT/f'{len(children):03d}.log'
    with log.open('wb') as out:
        p=subprocess.Popen(list(map(str,args)),env=env,stdout=out,stderr=out)
    children.append(dict(process=p,pid=p.pid,parent_pid=os.getpid(),args=list(map(str,args)),log=str(log),waited_by_parent=False)); save()
    return p

def row(p): return next(c for c in children if c['process'] is p)
def wait(p):
    p.wait(timeout=25); row(p).update(waited_by_parent=True,wait_returncode=p.returncode); save()
def stop(p, shutdown=None):
    if p.poll() is None:
        if shutdown:
            row(p)['termination']='requested-graceful'; shutdown.touch()
        else:
            row(p)['termination']='intentional-sigkill'; p.kill()
    wait(p)
    if shutdown: assert p.returncode==0, Path(row(p)['log']).read_text()
def run(*args, target=False, good=True):
    env=os.environ.copy()
    if target: env['WORKFLOW_REFERENCE_ID']='child'
    p=spawn([BIN,*args],env); wait(p)
    text=Path(row(p)['log']).read_text().strip()
    if good: assert p.returncode==0,text
    return text

def until(predicate,owner=None):
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
    # READ-ONLY readiness, including the canonical typed absent-state result.
    until(lambda:any(s in run('read',url,target=target,good=False) for s in ['"schedules"','StateNotConstructed','must be constructed','state must']),p)

save()
try:
    selected=os.environ.get('SPAWN_NATIVE_CASES','target-contract,basic,direct-call,concurrent,declared-error,ack-crash,payload-reject,destination-reject,schedule-reject,authorization-reject,wait-authorization-reject,cancel,future-schedule,unknown-spawn,unknown-started,unknown-stored').split(',')
    for case in selected:
        work=ROOT/case; work.mkdir(); events=work/'events'; policy=work/'policy'; policy.write_text('allow')
        wait_policy=work/'wait-policy'; wait_policy.write_text('allow')
        sd,td,sa,ta=[port() for _ in range(4)]
        su,tu,sdu,tdu=[f'http://127.0.0.1:{n}' for n in [sa,ta,sd,td]]
        source_endpoint,target_endpoint=sdu,tdu
        boundary=None
        run('info',work/'info.pb')
        def database(target=False):
            n=td if target else sd
            p=spawn([DB,work/('target-rocks' if target else 'source-rocks'),work/'info.pb',n]); listening(p,n); return p
        def host(target=False,extra=None,failure=False):
            env=os.environ.copy()|dict(WORKFLOW_BODY_MODE='spawn-target' if target else 'spawn',WORKFLOW_BODY_EVENTS=str(events),SPAWN_ENDPOINT=tu)
            if target: env.update(WORKFLOW_REFERENCE_ID='child',WORKFLOW_SCHEDULING_POLICY=str(policy),WORKFLOW_WAIT_POLICY=str(wait_policy))
            env.update(extra or {})
            shutdown=work/f'shutdown-{len(children)}'
            p=spawn([BIN,'serve',target_endpoint if target else source_endpoint,f'127.0.0.1:{ta if target else sa}',shutdown],env)
            if not failure: listening(p,ta if target else sa)
            return p,shutdown
        def lines(): return events.read_text().splitlines() if events.exists() else []
        def inspect(): return json.loads(run('spawn-inspect',tdu,target=True))
        source_db=database(); target_db=database(True)
        target,target_stop=host(True); ready(tu,target,True)
        proxy=None
        if case.startswith('unknown-'):
            stop(target,target_stop)
            boundary=case.removeprefix('unknown-'); pp=port()
            proxy=spawn([sys.executable,Path(__file__).with_name('database_ack_proxy.py'),f'127.0.0.1:{td if boundary=="spawn" else sd}',f'127.0.0.1:{pp}',boundary,work])
            listening(proxy,pp)
            if boundary=='spawn': target_endpoint=f'http://127.0.0.1:{pp}'
            else: source_endpoint=f'http://127.0.0.1:{pp}'
            target,target_stop=host(True); ready(tu,target,True)
        run('create',tu,str(uuid.uuid4()),target=True)
        if case=='target-contract':
            initial=inspect(); key=str(uuid.uuid4())
            for probe in ['constructor','writer','wrong-schema','bad-request','bad-schedule']:
                output=run('spawn-probe',tu,probe,key,target=True,good=False)
                assert 'Error' in output and inspect()==initial
            child_id=run('spawn-probe',tu,'valid',key,target=True)
            admitted=inspect()
            assert len(admitted['tasks'])==1 and admitted['tasks'][0]['status']==1 and admitted['first']==0
            assert run('spawn-probe',tu,'valid',key,target=True)==child_id
            for probe in ['changed-payload','changed-schedule']:
                output=run('spawn-probe',tu,probe,key,target=True,good=False)
                assert 'changed task/payload/schedule/schema contract' in output and inspect()==admitted
            stop(target,target_stop); stop(target_db)
            target_db=database(True)
            assert inspect()==admitted
            target,target_stop=host(True); ready(tu,target,True)
            assert run('spawn-probe',tu,'valid',key,target=True)==child_id
            policy.write_text('deny')
            output=run('spawn-probe',tu,'valid',key,target=True,good=False)
            assert 'workflow scheduling revoked' in output and inspect()==admitted
            stop(target,target_stop); stop(source_db); stop(target_db)
            cases.append(dict(case=case,child_id=child_id,target_after_restart=admitted,events=lines())); save()
            continue
        barrier=work/'after-target-ack'
        extra={}
        if case in ['ack-crash','payload-reject','destination-reject','schedule-reject','authorization-reject']:
            extra['REBOOT_TEST_OUTBOUND_WRITER_AFTER_TARGET_ACK']=str(barrier)
        if case=='concurrent': extra['SPAWN_CONCURRENT']='1'
        if case=='direct-call': extra['SPAWN_COMPOSED']='1'
        if case=='wait-authorization-reject': extra['SPAWN_BEFORE_WAIT']=str(work/'before-wait')
        if case=='future-schedule': extra['SPAWN_AT']=str(int(time.time())+3)
        source,source_stop=host(extra=extra); ready(su,source)
        run('create',su,str(uuid.uuid4()))
        amount=-1 if case in ['declared-error','unknown-stored'] else 999 if case=='cancel' else 7
        task=run('schedule',su,str(uuid.uuid4()),'0',str(amount))
        retained=None
        if case.startswith('unknown-'):
            until((work/'ack-observed.json').exists,source)
            observed=json.loads((work/'ack-observed.json').read_text())
            assert observed['real_store_ack_observed'] and not observed['downstream_success_delivered']
            pending=json.loads(run('inspect-reader-outcome',sdu,task))
            assert pending['status']==1 and not pending['has_terminal'] and len(pending['checkpoints'])==1
            assert 'spawn-returned' not in lines() and 'child-error-caught' not in lines()
            lost_snapshot=inspect()
            if boundary=='started': assert not lost_snapshot['tasks'] and lost_snapshot['first']==0
            elif boundary=='spawn': assert len(lost_snapshot['tasks'])==1 and lost_snapshot['tasks'][0]['status']==1 and lost_snapshot['first']==0
            else: until(lambda:inspect()['tasks'][0]['status']==2,target)
            (work/'release').touch()
            wait(source); assert source.returncode!=0
            assert 'spawn-returned' not in lines() and 'child-error-caught' not in lines()
            if boundary=='spawn': wait(target); assert target.returncode!=0
            stop(target); stop(proxy); stop(source_db); stop(target_db)
            source_endpoint,target_endpoint=sdu,tdu
            source_db=database(); target_db=database(True)
            target,target_stop=host(True); ready(tu,target,True)
            source,source_stop=host(); ready(su,source)
        elif case=='wait-authorization-reject':
            until((work/'before-wait').exists,source)
            until(lambda:inspect()['tasks'][0]['status']==2,target)
            retained=inspect()
            wait_policy.write_text('deny')
            (work/'before-wait.release').touch()
            wait(source); assert source.returncode!=0 and 'spawn-returned' not in lines()
            assert inspect()==retained
            wait_policy.write_text('allow')
            source,source_stop=host(); ready(su,source)
        elif case=='cancel':
            until(lambda:'child-parked' in lines(),source)
            stop(source,source_stop)
            assert 'spawn-returned' not in lines()
        elif barrier.exists() or 'REBOOT_TEST_OUTBOUND_WRITER_AFTER_TARGET_ACK' in extra:
            until(barrier.exists,source)
            until(lambda:inspect()['tasks'][0]['status']==2,target)
            retained=inspect()
            assert len(retained['tasks'])==1 and retained['first']==7
            assert not any(s.startswith('spawn-ack:') for s in lines())
            stop(source); stop(target); stop(source_db); stop(target_db)
            source_db=database(); target_db=database(True)
            assert inspect()==retained
            target,target_stop=host(True); ready(tu,target,True)
            if case!='ack-crash':
                changed={'SPAWN_AMOUNT':'8'} if case=='payload-reject' else {'SPAWN_TARGET_ID':'other'} if case=='destination-reject' else {'SPAWN_AT':'1'} if case=='schedule-reject' else {}
                if case=='authorization-reject': policy.write_text('deny')
                bad,bad_stop=host(extra=changed,failure=True); wait(bad)
                assert bad.returncode!=0 and 'spawn-returned' not in lines()
                assert inspect()==retained
                policy.write_text('allow')
            source,source_stop=host(); ready(su,source)
        elif case=='future-schedule':
            until(lambda:any(s.startswith('spawn-ack:') for s in lines()),source)
            pending=inspect(); assert pending['tasks'][0]['status']==1 and pending['first']==0
        if case!='cancel':
            assert json.loads(run('wait',su,task))==dict(first=amount,second=1)
            assert lines().count('child-body')==1 and lines().count('spawn-returned')==1
            final=inspect(); assert final['first']==(0 if amount<0 else 7) and len(final['tasks'])==1 and final['tasks'][0]['status']==2
            if retained: assert final==retained
            stop(source,source_stop)
        stop(target,target_stop); stop(source_db); stop(target_db)
        source_db=database(); target_db=database(True)
        final=inspect()
        source_state=json.loads(run('inspect-reader-outcome',sdu,task))
        assert source_state['status']==(1 if case=='cancel' else 2)
        assert len(final['tasks'])==1
        stop(source_db); stop(target_db)
        cases.append(dict(case=case,source_task=task,events=lines(),target_after_restart=final,source_after_restart=source_state)); save()
    receipt['complete']=True
finally:
    if not receipt['complete']:
        try: receipt['failure_target_snapshot']=inspect()
        except Exception as error: receipt['failure_target_snapshot_error']=str(error)
    for child in children:
        if not child['waited_by_parent']: stop(child['process'])
    for child in children: child['log_sha256']=hashlib.sha256(Path(child['log']).read_bytes()).hexdigest()
    save()
print(json.dumps(dict(complete=receipt['complete'],cases=len(cases),children=len(children))))
