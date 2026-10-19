"""Native proof body. Launch via the checked-in run_native_gate.py supervisor.
No synthetic Database/Store or task injection; no stable destination dedupe key.
Evidence is attempted only after valid setup/preflight reaches the body try/finally.
Parent must retain a preflight receipt for earlier failures and evidence delivery
failures (missing env/arguments, ports, optimization, exclusive target open/write);
no target artifact is guaranteed. See HANDOFF.md for the receipt contract.
"""
from pathlib import Path
import sys
if not __debug__:
 raise RuntimeError("proof requires Python assertions; optimization is forbidden")
# Reviewed adaptation; no dynamic exec of the obsolete reference test body.
from supervision_reference import *
from gc_assertions import roots, assert_gc
work=Path(os.environ['CURSOR_STAGE']);work.mkdir(exist_ok=False)
evidence=Path(os.environ['CURSOR_EVIDENCE'])
ITERATIONS=int(os.environ.get('CURSOR_ITERATIONS','1030'))
assert ITERATIONS>=6,"restart milestones require at least six iterations"
PENULTIMATE=ITERATIONS-1
scenarios=[]
def startdb():
 p=spawn([DB,work/'rocksdb',work/'server-info.pb',dp]);listener(p,dp);return p
def starthost(pause='',iteration=0,fail=False,expected_failure=False):
 global eventpath
 eventpath=work/('events-%d'%len(processes));shutdown=work/('shutdown-%d'%len(processes));env=os.environ.copy()
 env.update(CURSOR_EVENTS=str(eventpath),CURSOR_PAUSE=pause,CURSOR_PAUSE_ITERATION=str(iteration),CURSOR_FAIL_AFTER_B='1' if fail else '0')
 p=spawn([BIN,'serve',database,'127.0.0.1:%d'%ap,shutdown],env)
 p.shutdown=shutdown
 if not expected_failure:listener(p,ap)
 return p,shutdown
def parked(name,i,timeout=10):until(lambda:'park:%s:%d'%(name,i) in events(),timeout=timeout)
def snapshot(i):
 # all is root + explicit 0..current RPCs (32 concurrent streams); allow the
 # bounded 10k scan its own budget, never turn a timeout into acceptance.
 return json.loads(run('inspect',database,handle,i,timeout=max(30,ITERATIONS//50) if i=='all' else 15))
def canonical_restart(i):
 global db,host,shutdown
 stop(host,shutdown);assert host.returncode==0
 stop(db);db=startdb()
 # Database-only read before recovery is the canonical Pending witness.
 s=snapshot(i);assert s['status']==1 and not s['terminal'];return s
def stored(s):return [r for r in s['records'] if r['phase']==2 and r['result_type']=='type.googleapis.com/cursor.v1.EffectReply']
def started(s):return [r for r in s['records'] if r['phase']==1 and r['type']=='type.googleapis.com/reboot.rust.workflow.AtMostOnceResultV1']
def breaks(s):return [r for r in s['records'] if r['phase']==2 and r['result_type']=='type.googleapis.com/cursor.v1.Result']
def no_callback(i):assert 'callback-constructed:%d'%i not in events() and 'b-dispatch:%d'%i not in events()
dp=port();ap=port();database='http://127.0.0.1:%d'%dp;app='http://127.0.0.1:%d'%ap
try:
 run('info',work/'server-info.pb')
 db=startdb();host,shutdown=starthost('stored',0)
 run('create',app,uuid.uuid4(),uuid.uuid4());handle=run('start-run',app,uuid.uuid4(),ITERATIONS)
 parked('stored',0);assert run('concurrent',app,uuid.uuid4())=='1'
 before=snapshot(0);assert before['iteration']==0 and len(stored(before))==1
 assert stored(before)[0]['reply']=={'iteration':0,'ordinal':1,'proof':'committed:0:1'}
 initial_all=snapshot('all');initial_roots=roots(initial_all);assert_gc(initial_all,initial_roots,0)
 disk=canonical_restart(0);assert disk==before
 assert snapshot('all')==initial_all
 # Observed native480 advanced through iteration99 in the default ten seconds.
 # Budget this finite workload, not an unbounded retry or timeout success.
 host,shutdown=starthost('entry',PENULTIMATE-4);parked('entry',PENULTIMATE-4,timeout=max(180,ITERATIONS//10))
 no_callback(0);assert 'iteration:0' in events() # replay current, NOT preceding iterations after cursor recovery.
 replayed_effect=snapshot(0)
 assert not replayed_effect['records'], 'iteration zero must be reclaimed after Continue'
 # The original Stored bytes survived the restart above, not subsequent GC.
 s=snapshot(PENULTIMATE-4);assert s['iteration']==PENULTIMATE-4 and s['b_commits']==PENULTIMATE-4
 assert json.loads(run('read-state',app))=={'consumed':PENULTIMATE-4,'concurrent':1,'after':0,'commits':PENULTIMATE-4}
 advanced_all=snapshot('all');assert_gc(advanced_all,initial_roots,PENULTIMATE-4)
 disk=canonical_restart(PENULTIMATE-4);assert disk==s
 assert snapshot('all')==advanced_all
 host,shutdown=starthost('break',PENULTIMATE);parked('break',PENULTIMATE)
 assert f'iteration:{PENULTIMATE-5}' not in events() and f'iteration:{PENULTIMATE-4}' in events()
 assert events().count(f'break-evaluate:{PENULTIMATE}')==1
 assert run('concurrent',app,uuid.uuid4())=='2'
 broken=canonical_restart(PENULTIMATE);assert broken['iteration']==PENULTIMATE and broken['b_commits']==ITERATIONS
 break_all=snapshot('all');assert_gc(break_all,initial_roots,PENULTIMATE)
 assert len(breaks(broken))==1
 assert breaks(broken)[0]['reply']=={'cursor':PENULTIMATE,'ordinal':ITERATIONS,'proof':f'committed:{PENULTIMATE}:{ITERATIONS}'}
 host,shutdown=starthost()
 terminal=json.loads(run('wait',app,handle));assert terminal=={'cursor':PENULTIMATE,'ordinal':ITERATIONS,'proof':f'committed:{PENULTIMATE}:{ITERATIONS}'}
 assert not any(e.startswith('break-evaluate:') or e.startswith('callback-constructed:') for e in events())
 assert json.loads(run('read-state',app))=={'consumed':ITERATIONS,'concurrent':2,'after':1,'commits':ITERATIONS}
 completed=snapshot(PENULTIMATE);assert completed['terminal'] and completed['iteration']==PENULTIMATE
 assert breaks(completed)==breaks(broken)
 completed_all=snapshot('all');assert_gc(completed_all,initial_roots,PENULTIMATE)
 stop(host,shutdown);assert host.returncode==0;stop(db);db=startdb();host,shutdown=starthost()
 assert json.loads(run('wait',app,handle))==terminal
 assert not events();assert snapshot(PENULTIMATE)==completed
 assert snapshot('all')==completed_all
 scenarios.append({'name':'stored-cursor-break-terminal','iterations':ITERATIONS,'stored_before':before,'reclaimed_iteration_zero':replayed_effect,'initial_all':initial_all,'advanced_all':advanced_all,'break_all':break_all,'completed_all':completed_all,'pending_cursor':disk,'pending_break':broken,'terminal':terminal,'completed':completed})
 # New workflow, same real B, no reset/seed. Kill after B commit before typed Store.
 stop(host,shutdown);assert host.returncode==0
 host,shutdown=starthost('b-committed',0)
 handle=run('start-run',app,uuid.uuid4(),1);parked('b-committed',0)
 assert run('concurrent',app,uuid.uuid4())=='3'
 uncertain=snapshot(0);assert len(started(uncertain))==1 and not stored(uncertain) and uncertain['b_commits']==ITERATIONS+1
 disk=canonical_restart(0);assert disk==uncertain
 host,shutdown=starthost(expected_failure=True)
 failure=expected_host_failure(host, 'at-most-once block Started without Stored; callback will not run again')
 no_callback(0);assert snapshot(0)==uncertain
 assert {k:uncertain[k] for k in ('consumed','concurrent','after','b_commits')}=={'consumed':ITERATIONS,'concurrent':3,'after':1,'b_commits':ITERATIONS+1}
 scenarios.append({'name':'started-after-actual-b-commit','iterations':ITERATIONS,'pending':uncertain,'host_failure':failure})
 result.update(scenarios=scenarios,scope='native generated two-service feature proof; not public CLI or example parity')
 result['body_passed']=True
except BaseException as error:
 result['failure']=repr(error)
 raise
finally:
 cleanup_errors=[]
 try:cleanup_errors.extend(cleanup_sdk_reservations())
 except BaseException as error:cleanup_errors.append(repr(error))
 # Database stop itself checks the global real SDK join barrier, including
 # reservations absent from processes. A failed SDK attempt never opens it.
 for e in sorted(processes,key=lambda e:e['command'][0]==str(DB)):
  try:
   stop(e['process'])
   assert e['process'].joined_exact
   e['exit']=e['process'].returncode
  except BaseException as error:
   cleanup_errors.append(repr(error))
  finally:
   e['joined_exact']=e['process'].joined_exact
   try:
    e['log'].close()
    e['log_text']=Path(e['log'].name).read_text(errors='replace')
   except BaseException as error:cleanup_errors.append(repr(error))
 # Unknown ownership is retained by the adapter, never converted into success.
 result.update(commands=commands,processes=[{k:v for k,v in e.items() if k not in ('process','log')} for e in processes],cleanup_errors=cleanup_errors)
 try:
  result['event_files']={p.name:p.read_text() for p in work.glob('events-*') if p.is_file()}
  result['binary_sha256']=hashlib.sha256(BIN.read_bytes()).hexdigest()
  result['database_sha256']=hashlib.sha256(DB.read_bytes()).hexdigest()
 except BaseException as error:cleanup_errors.append(repr(error))
 result['all_owned_children_joined']=all(e['joined_exact'] for e in processes)
 result['complete']=bool(result.get('body_passed') and not cleanup_errors and result['all_owned_children_joined'])
 with evidence.open('x') as output:output.write(json.dumps(result,indent=2)+'\n')
 if not result['complete']:raise RuntimeError('proof incomplete; see exclusive evidence and retained custody')
print(json.dumps({'complete':result['complete'],'scenarios':len(scenarios),'all_owned_children_joined':result['all_owned_children_joined']}))
