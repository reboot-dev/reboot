"""Parent-run native proof. Requires parent exact-child custody integration (not supplied).
No synthetic Database/Store, no task injection, no destination dedupe key.
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
work=Path(os.environ['CURSOR_STAGE']);work.mkdir(exist_ok=False)
evidence=Path(os.environ['CURSOR_EVIDENCE'])
scenarios=[]
def startdb():
 p=spawn([DB,work/'rocksdb',work/'server-info.pb',dp]);listener(p,dp);return p
def starthost(pause='',iteration=0,fail=False,expected_failure=False):
 global eventpath
 eventpath=work/('events-%d'%len(processes));shutdown=work/('shutdown-%d'%len(processes));env=os.environ.copy()
 env.update(CURSOR_EVENTS=str(eventpath),CURSOR_PAUSE=pause,CURSOR_PAUSE_ITERATION=str(iteration),CURSOR_FAIL_AFTER_B='1' if fail else '0')
 p=spawn([BIN,'serve',database,'127.0.0.1:%d'%ap,shutdown],env)
 if not expected_failure:listener(p,ap)
 return p,shutdown
def parked(name,i):until(lambda:'park:%s:%d'%(name,i) in events())
def snapshot(i):return json.loads(run('inspect',database,handle,i))
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
 run('create',app,uuid.uuid4(),uuid.uuid4());handle=run('start-run',app,uuid.uuid4(),1030)
 parked('stored',0);assert run('concurrent',app,uuid.uuid4())=='1'
 before=snapshot(0);assert before['iteration']==0 and len(stored(before))==1
 assert stored(before)[0]['reply']=={'iteration':0,'ordinal':1,'proof':'committed:0:1'}
 disk=canonical_restart(0);assert disk==before
 host,shutdown=starthost('entry',1025);parked('entry',1025)
 no_callback(0);assert 'iteration:0' in events() # replay current, NOT preceding iterations after cursor recovery.
 replayed_effect=snapshot(0)
 assert stored(replayed_effect)==stored(before) and not started(replayed_effect)
 # Only selected effect records are equal: actors/task cursor legitimately advanced.
 s=snapshot(1025);assert s['iteration']==1025 and s['b_commits']==1025
 assert json.loads(run('read-state',app))=={'consumed':1025,'concurrent':1,'after':0,'commits':1025}
 disk=canonical_restart(1025);assert disk==s
 host,shutdown=starthost('break',1029);parked('break',1029)
 assert 'iteration:1024' not in events() and 'iteration:1025' in events()
 assert events().count('break-evaluate:1029')==1
 assert run('concurrent',app,uuid.uuid4())=='2'
 broken=canonical_restart(1029);assert broken['iteration']==1029 and broken['b_commits']==1030
 assert len(breaks(broken))==1
 assert breaks(broken)[0]['reply']=={'cursor':1029,'ordinal':1030,'proof':'committed:1029:1030'}
 host,shutdown=starthost()
 terminal=json.loads(run('wait',app,handle));assert terminal=={'cursor':1029,'ordinal':1030,'proof':'committed:1029:1030'}
 assert not any(e.startswith('break-evaluate:') or e.startswith('callback-constructed:') for e in events())
 assert json.loads(run('read-state',app))=={'consumed':1030,'concurrent':2,'after':1,'commits':1030}
 completed=snapshot(1029);assert completed['terminal'] and completed['iteration']==1029
 assert breaks(completed)==breaks(broken)
 stop(host,shutdown);assert host.returncode==0;stop(db);db=startdb();host,shutdown=starthost()
 assert json.loads(run('wait',app,handle))==terminal
 assert not events();assert snapshot(1029)==completed
 scenarios.append({'name':'stored-cursor-break-terminal','stored_before':before,'stored_after_replay':replayed_effect,'pending_cursor':disk,'pending_break':broken,'terminal':terminal,'completed':completed})
 # New workflow, same real B, no reset/seed. Kill after B commit before typed Store.
 stop(host,shutdown);assert host.returncode==0
 host,shutdown=starthost('b-committed',0)
 handle=run('start-run',app,uuid.uuid4(),1);parked('b-committed',0)
 assert run('concurrent',app,uuid.uuid4())=='3'
 uncertain=snapshot(0);assert len(started(uncertain))==1 and not stored(uncertain) and uncertain['b_commits']==1031
 disk=canonical_restart(0);assert disk==uncertain
 host,shutdown=starthost(expected_failure=True)
 failure=expected_host_failure(host, 'at-most-once block Started without Stored; callback will not run again')
 no_callback(0);assert snapshot(0)==uncertain
 assert {k:uncertain[k] for k in ('consumed','concurrent','after','b_commits')}=={'consumed':1030,'concurrent':3,'after':1,'b_commits':1031}
 scenarios.append({'name':'started-after-actual-b-commit','pending':uncertain,'host_failure':failure})
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
