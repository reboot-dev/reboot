"""Exercise real child waits around a fake Docker transport; no fabricated benchmark."""
import copy
import json
from pathlib import Path
import sys
import tempfile
from tiny_repeat_control import Owner
from tiny_repeat_owner import Benchmark
from tiny_repeat_analyze import analyze


def exercise(directory, fail_app_once=False):
    b=Benchmark.__new__(Benchmark)
    b.o=Owner(directory,30)
    b.active=[]
    b.row={'containers':[]}
    b.o.ledger['stacks'].append(b.row)
    states={}
    stopped=[]
    failure=[fail_app_once]
    def inspect(cid):return copy.deepcopy(states[cid])
    b.inspect=inspect
    def tiny(*args,**kw):
        if args[:2]==('docker','stop'):
            cid=args[-1]
            if cid=='app' and failure[0]:
                failure[0]=False
                raise RuntimeError('injected transient app stop failure')
            stopped.append(cid)
            states[cid]['State'].update(Running=False,Pid=0,ExitCode=0)
            (b.o.directory/(cid+'.stop')).touch()
            return cid
        if args[:2]==('docker','logs'):return 'genuine fake-transport test log'
        raise AssertionError(args)
    b.tiny=tiny
    try:
        for role in ['engine','app']:
            states[role]={'State':{'Running':True,'Pid':123,'ExitCode':0}}
            path=b.o.directory/(role+'.stop')
            code='import pathlib,time; p=pathlib.Path('+repr(str(path))+');\nwhile not p.exists():time.sleep(.01)\nprint(0,flush=True)'
            child=b.o.spawn(['python3','-u','-c',code],role+'-wait')
            r={'id':role,'role':role,'name':role}
            b.active.append((r,child))
            b.row['containers'].append(r)
        try:
            b.retire()
        except RuntimeError:
            assert fail_app_once and len(b.active)==2
            b.retire()
        assert not b.active
        assert all(r['retired'] and r['original_wait']['joined'] for r in b.row['containers'])
        assert stopped==['app','engine'],stopped
    finally:
        b.o.finish()
    assert b.o.ledger['all_original_unix_children_joined']
    return {'all_original_waits_joined':True,'stopped':stopped,'injected_stop_failure':fail_app_once}


if __name__=='__main__':
    root=Path(sys.argv[1]);root.mkdir()
    results=[exercise(root/'ordered'),exercise(root/'failure',True)]
    # Incomplete owner totals and missing entries must reject without manufacture.
    missing=root/'incomplete';missing.mkdir();(missing/'owner.json').write_text('{"complete":false,"failures":[]}')
    try:analyze(missing)
    except ValueError:pass
    else:raise AssertionError('incomplete owner accepted')
    print(json.dumps({'lifecycle_tests':results,'incomplete_owner_rejected':True}))
