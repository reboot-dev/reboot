"""Actual frozen-image boundary faults. No RPC, benchmark, capacity or builds.
Run from an isolated copy under systemd; results never overwrite prior evidence.
"""
import copy
import json
from pathlib import Path
import sys
import time
import traceback
from tiny_repeat_owner import Benchmark, IMAGES, ROOT, PY
from tiny_repeat_analyze import validate_resource, read_jsonl


def fault(mode):
    config=json.loads((ROOT/'config.json').read_text())
    config.update(results_name='fault-'+mode, owner_seconds=180)
    b=Benchmark(config);b.ready=lambda label:None
    original_inspect=b.inspect;original_spawn=b.o.spawn
    fired=False
    def inspect(cid):
        nonlocal fired
        if mode=='inspect' and not fired and any(r['id']==cid and r['role']=='app' for r in b.row['containers']):
            fired=True
            raise RuntimeError('injected first app inspect')
        return original_inspect(cid)
    def spawn(argv,name,*args,**kwargs):
        nonlocal fired
        if mode=='spawn' and not fired and 'wait' in argv[-1] and any(r['id'] in argv[-1] and r['role']=='app' for r in b.row['containers']):
            fired=True
            raise OSError('injected original wait spawn failure')
        return original_spawn(argv,name,*args,**kwargs)
    b.inspect=inspect;b.o.spawn=spawn
    try:
        try:b.stack('rust',ROOT.name+'-'+mode)
        except (RuntimeError,OSError):
            assert fired
        else:raise AssertionError('fault not injected')
        app=next(r for r in b.row['containers'] if r['role']=='app')
        assert any(r is app for r,c in b.active),'RED: started app escaped custody'
        # Fault the first cleanup inspect too. Every engine must remain live.
        def cleanup_inspect(cid):
            if cid==app['id']:raise RuntimeError('injected cleanup inspect unavailable')
            return original_inspect(cid)
        b.inspect=cleanup_inspect
        try:b.retire()
        except RuntimeError:pass
        else:raise AssertionError('unresolved cleanup accepted')
        engine=next(r for r in b.row['containers'] if r['role']=='engine')
        assert original_inspect(engine['id'])['State']['Running'],'RED: engine stopped before unresolved app'
        b.inspect=original_inspect
        b.retire()
        assert app['stopped_confirmed'] and not app['original_wait_qualified']
        assert 'original_wait' not in app,'invented original wait'
        assert not original_inspect(app['id'])['State']['Running']
        assert not b.active
        b.o.ledger['fault_test_pass']=True
    finally:
        b.inspect=original_inspect;b.o.spawn=original_spawn
        if hasattr(b.o,'begin_cleanup'):b.o.begin_cleanup()
        # Old candidate may have lost custody: recover exact recorded IDs for
        # safety only; never call this an original-wait or passing test receipt.
        if any(not any(a is r for a,c in b.active) and not r.get('retired') for r in b.row['containers']):
            for role in ['app','engine','config']:
                for r in b.row['containers']:
                    if r['role']==role and original_inspect(r['id'])['State']['Running']:
                        b.tiny('docker','stop','-t','30',r['id'],timeout=90)
        b.stop_stack();b.o.finish()
    assert b.o.ledger['all_original_unix_children_joined']
    print(json.dumps({'actual_boundary_fault':mode,'pass':True,'unqualified_original_wait':True}),flush=True)


def deadline():
    config=json.loads((ROOT/'config.json').read_text())
    config.update(results_name='fault-deadline',owner_seconds=120)
    b=Benchmark(config);b.ready=lambda label:None
    # Real timer, not a manually expired field or command-only timeout.
    b.o.timer.cancel()
    import threading
    b.o.deadline=time.monotonic()+15
    b.o.timer=threading.Timer(15,b.o.expire);b.o.timer.daemon=True;b.o.timer.start()
    start=b.start
    def stubborn(role,image,extra,command=()):
        if role=='app':
            extra=list(extra)+['--entrypoint',PY]
            command=['-c','import signal,time;signal.signal(signal.SIGTERM,signal.SIG_IGN);print("READY",flush=True);time.sleep(600)']
        return start(role,image,extra,command)
    b.start=stubborn
    triggered=False
    try:
        b.stack('python',ROOT.name+'-deadline')
        while True:time.sleep(.1)
    except TimeoutError:
        triggered=True
        b.o.ledger['actual_workload_deadline_triggered']=True
    finally:
        if hasattr(b.o,'begin_cleanup'):b.o.begin_cleanup()
        lo=time.monotonic()
        cleanup_error=None
        try:
            b.stop_stack()
        except BaseException as error:
            cleanup_error=error
            # Explicit test-only recovery for the old RED implementation.
            # Keep its original children alive; do not qualify failed cleanup.
            b.o.ledger['test_only_recovery_after_failure']=repr(error)
            b.o.deadline=time.monotonic()+90
            b.stop_stack()
        elapsed=time.monotonic()-lo
        b.o.ledger['deadline_cleanup_elapsed']=elapsed
        b.o.finish()
        if cleanup_error:raise AssertionError('RED: deadline cleanup failed') from cleanup_error
    assert triggered and elapsed>=29,'actual stop -t30 not exercised'
    assert all(r['retired'] and r['original_wait']['joined'] for r in b.row['containers'])
    assert b.o.ledger['all_original_unix_children_joined']
    print(json.dumps({'actual_deadline_stop_t30':True,'cleanup_elapsed':elapsed,'original_waits_joined':True}),flush=True)


def mutations(evidence):
    rows=read_jsonl(Path(evidence))
    valid=next(r for r in rows if r['containers'] and not r['errors'])
    validate_resource(valid)
    bad=[]
    for k in ['stack','system_services','host_stat','host_vmstat','host_swaps','host_memory_psi','host_cpu_psi']:
        r=copy.deepcopy(valid);del r[k];bad.append((k,r))
    cid=next(iter(valid['containers']))
    for k in ['memory.stat','processes','cgroup.procs','cpu.stat','memory.events','memory.swap.max']:
        r=copy.deepcopy(valid);del r['containers'][cid][k];bad.append((k,r))
    for scope in ['stack','container']:
        for field in ['cpu.stat','memory.events','memory.stat']:
            r=copy.deepcopy(valid);v=r['stack'] if scope=='stack' else r['containers'][cid]
            v[field]='usage_usec 0\n' if field=='cpu.stat' else 'oom_kill 0\n'
            bad.append((scope+'-'+field,r))
    for name,r in bad:
        try:validate_resource(r)
        except (ValueError,TypeError,KeyError):pass
        else:raise AssertionError('RED: smoke mutation accepted '+name)
    print(json.dumps({'actual_smoke_mutations_rejected':len(bad)}),flush=True)

if __name__=='__main__':
    if sys.argv[1] in ['inspect','spawn']:fault(sys.argv[1])
    elif sys.argv[1]=='deadline':deadline()
    else:mutations(sys.argv[1])
