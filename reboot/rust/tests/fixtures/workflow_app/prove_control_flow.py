"""Generated public Rust workflow + real CXX/RocksDB; no seeded tasks/state."""
import hashlib,json,os,socket,subprocess,sys,tempfile,time,uuid
from pathlib import Path
BIN=Path(sys.argv[1]);DB=Path(os.environ['REBOOT_NATIVE2PC_CXX_DATABASE'])
commands=[];processes=[];used=set();result:dict={'complete':False}
def port():
 for n in range(21000,28000):
  with socket.socket() as s:
   try:s.bind(('127.0.0.1',n))
   except OSError:continue
   if n not in used:used.add(n);return n
 raise AssertionError('no ports')
def run(*args):
 c=[str(BIN),*map(str,args)];r=subprocess.run(c,capture_output=True,text=True,timeout=15)
 commands.append({'command':c,'exit':r.returncode,'stdout':r.stdout,'stderr':r.stderr})
 assert r.returncode==0,commands[-1]
 return r.stdout.strip()
def reject(*args):
 c=[str(BIN),*map(str,args)];r=subprocess.run(c,capture_output=True,text=True,timeout=15)
 commands.append({'command':c,'exit':r.returncode,'stdout':r.stdout,'stderr':r.stderr})
 assert r.returncode!=0 and 'live delivery budget' in r.stderr,commands[-1]
 return r.stderr
def spawn(c,env=None):
 log=open(work/('process-%d.log'%len(processes)),'wb');p=subprocess.Popen(list(map(str,c)),stdout=log,stderr=log,env=env)
 processes.append({'pid':p.pid,'command':list(map(str,c)),'process':p,'log':log});return p
def stop(p,shutdown=None):
 if p.poll() is None:
  if shutdown:shutdown.touch()
  else:p.kill()
  p.wait(timeout=15)
def until(f):
 deadline=time.monotonic()+10
 while time.monotonic()<deadline:
  if f():return
  time.sleep(.02)
 raise AssertionError('bounded wait timed out')
def listener(p,n):
 def ready():
  assert p.poll() is None,(p.pid,p.returncode)
  try:
   with socket.create_connection(('127.0.0.1',n),timeout=.1):return True
  except OSError:return False
 until(ready)
def events():return eventpath.read_text().splitlines() if eventpath.exists() else []
def checkpoint(index):return json.loads(run('inspect-control',database,handle,index))
def read():return json.loads(run('read',app))
with tempfile.TemporaryDirectory(prefix='rust-control-flow-cxx-') as d:
 work=Path(d);dp=port();ap=port();database='http://127.0.0.1:%d'%dp;app='http://127.0.0.1:%d'%ap
 run('info',work/'server-info.pb')
 def startdb():
  p=spawn([DB,work/'rocksdb',work/'server-info.pb',dp]);listener(p,dp);return p
 def starthost(pause=None,capacity=None,barrier=None):
  global eventpath
  eventpath=work/('events-%d'%len(processes));shutdown=work/('shutdown-%d'%len(processes));env=os.environ.copy()
  env.update(WORKFLOW_BODY_MODE='control',WORKFLOW_BODY_EVENTS=str(eventpath))
  if pause is not None:env['CONTROL_PAUSE_AFTER_WAIT']=str(pause)
  if capacity is not None:env['CONTROL_MAX_LIVE']=str(capacity)
  if barrier is not None:env[barrier[0]]=str(barrier[1])
  p=spawn([BIN,'serve',database,'127.0.0.1:%d'%ap,shutdown],env);listener(p,ap)
  def ready():
   r=subprocess.run([str(BIN),'read',app],capture_output=True,text=True,timeout=2)
   return r.returncode==0 or 'must be constructed' in r.stderr or 'state must' in r.stderr
  until(ready);return p,shutdown
 try:
  db=startdb();host,shutdown=starthost();run('create',app,uuid.uuid4())
  handle=run('schedule',app,uuid.uuid4(),0,3)
  until(lambda:'waiting-0' in events())
  assert read()=={'first':0,'second':0,'schedules':1}
  assert checkpoint(0)['checkpoints']==[]
  # A parked workflow does not strand another durable ready workflow or reader RPC.
  ready=run('schedule',app,uuid.uuid4(),0,0)
  assert json.loads(run('wait',app,ready))=={'first':0,'second':0}
  assert read()=={'first':0,'second':0,'schedules':2}
  stop(host);stop(db);db=startdb();host,shutdown=starthost(0)
  until(lambda:'waiting-0' in events());assert checkpoint(0)['checkpoints']==[]
  # Real ordinary writer releases admission and wakes the installed revision cursor.
  assert run('signal',app,uuid.uuid4(),1)=='1'
  until(lambda:'control-parked' in events())
  observed=checkpoint(0);assert len(observed['checkpoints'])==1
  assert observed['checkpoints'][0]['type']=='type.googleapis.com/workflow.v1.Ledger'
  # Flap the actual actor predicate false AFTER acknowledged matched decision.
  assert run('signal',app,uuid.uuid4(),-1)=='0';assert read()['second']==0
  stop(host,shutdown);assert host.returncode==0
  stop(db);db=startdb();host,shutdown=starthost()
  until(lambda:'waiting-1' in events())
  assert read()=={'first':0,'second':1,'schedules':2},'matched wait must replay despite false actor state'
  progress=checkpoint(0);assert len(progress['checkpoints'])==2
  assert observed['checkpoints'][0] in progress['checkpoints']
  assert checkpoint(1)['checkpoints']==[]
  # Owner shutdown while awaiting actual state must join parked children cleanly.
  stop(host,shutdown);assert host.returncode==0;stop(db)
  db=startdb();host,shutdown=starthost();until(lambda:'waiting-1' in events())
  assert read()['second']==1;assert checkpoint(0)==progress
  assert run('signal',app,uuid.uuid4(),2)=='2'
  until(lambda:'waiting-2' in events());assert read()['second']==2
  assert run('signal',app,uuid.uuid4(),1)=='3'
  assert json.loads(run('wait',app,handle))=={'first':3,'second':3}
  finished=[checkpoint(i) for i in range(3)]
  assert all(c['status']==2 and len(c['checkpoints'])==2 for c in finished)
  assert sorted(c['iteration'] for f in finished for c in f['checkpoints'])==[0,0,1,1,2,2]
  keys=[c['key'] for f in finished for c in f['checkpoints']];assert len(set(keys))==6
  stop(host,shutdown);assert host.returncode==0;stop(db)
  db=startdb();host,shutdown=starthost()
  assert json.loads(run('wait',app,handle))=={'first':3,'second':3}
  assert read()=={'first':3,'second':3,'schedules':2}
  assert [checkpoint(i) for i in range(3)]==finished
  assert 'body' not in events(),'completed workflow must not redispatch'
  stop(host,shutdown);assert host.returncode==0
  host,shutdown=starthost(capacity=2)
  assert run('signal',app,uuid.uuid4(),-3)=='0'
  a=run('schedule',app,uuid.uuid4(),0,1);b=run('schedule',app,uuid.uuid4(),0,1)
  until(lambda:events().count('waiting-0')==2)
  denied=reject('schedule',app,uuid.uuid4(),0,0)
  time.sleep(.25) # at least two bounded durable scans while both slots parked
  assert events().count('body')==2,'no extra live child at configured capacity'
  assert read()=={'first':0,'second':3,'schedules':4},'rejected scheduling writer must roll back'
  assert run('signal',app,uuid.uuid4(),1)=='1','ordinary writer remains responsive at capacity'
  assert json.loads(run('wait',app,a))['second'] in (4,5)
  assert json.loads(run('wait',app,b))['second'] in (4,5)
  queued=run('schedule',app,uuid.uuid4(),0,0)
  assert json.loads(run('wait',app,queued))=={'first':0,'second':0},'capacity is reclaimed after completion'
  assert events().count('body')==3
  assert read()=={'first':1,'second':5,'schedules':5}
  stop(host,shutdown);assert host.returncode==0
  races=[]
  for boundary in ('REBOOT_TEST_WORKFLOW_WAIT_BEFORE_READ','REBOOT_TEST_WORKFLOW_WAIT_AFTER_FALSE'):
   marker=work/boundary
   host,shutdown=starthost(barrier=(boundary,marker))
   assert run('signal',app,uuid.uuid4(),-1)=='0'
   racing=run('schedule',app,uuid.uuid4(),0,1)
   until(marker.exists)
   assert marker.read_text()==boundary
   assert run('signal',app,uuid.uuid4(),1)=='1'
   marker.with_suffix('.release').touch()
   terminal=json.loads(run('wait',app,racing))
   assert terminal['first']==1
   races.append({'boundary':boundary,'sole_update_observed':True,'result':terminal})
   stop(host,shutdown);assert host.returncode==0
  # Regression: the former default 64 stranded accepted ready workflow 65.
  host,shutdown=starthost()
  assert run('signal',app,uuid.uuid4(),-1)=='0'
  before=read();parked=[run('schedule',app,uuid.uuid4(),0,1) for _ in range(64)]
  until(lambda:events().count('waiting-0')==64)
  ready65=run('schedule',app,uuid.uuid4(),0,0)
  assert json.loads(run('wait',app,ready65))=={'first':0,'second':0}
  assert read()=={'first':0,'second':before['second'],'schedules':before['schedules']+65}
  assert events().count('body')==65 and events().count('waiting-0')==64
  stop(host,shutdown);assert host.returncode==0
  # Lowering the budget below persisted Pending must fail recovery, not hang.
  env=os.environ.copy();env.update(CONTROL_MAX_LIVE='2',WORKFLOW_BODY_MODE='control')
  undersized=spawn([BIN,'serve',database,'127.0.0.1:%d'%ap,work/'undersized-shutdown'],env)
  until(lambda:undersized.poll() is not None)
  assert undersized.returncode!=0
  processes[-1]['log'].flush()
  assert 'recovered pending tasks exceed live delivery budget' in Path(processes[-1]['log'].name).read_text()
  host,shutdown=starthost();until(lambda:events().count('waiting-0')==64)
  recovered_ready=run('schedule',app,uuid.uuid4(),0,0)
  assert json.loads(run('wait',app,recovered_ready))=={'first':0,'second':0}
  assert run('signal',app,uuid.uuid4(),1)=='1'
  for task in parked:assert json.loads(run('wait',app,task))['first']==1
  assert read()['second']==before['second']+64
  stop(host,shutdown);assert host.returncode==0
  stop(db)
  result['subscription_races']=races
  result['capacity']={'live_limit':2,'parked':2,'excess_rejected':True,'rejection':denied,'body_count_after_drain':3,'rpc_responsive_at_capacity':True}
  result['default_capacity']={'parked':64,'ready65':ready65,'ready65_completed_while_predicate_false':True,'recovered_ready':recovered_ready,'recovery_progress_while_predicate_false':True,'all_parked_completed_after_signal':True}
  result.update(complete=True,handle=handle,ready_handle=ready,matched_wait=observed,committed_progress=progress,finished=finished,scope='finite typed replay iterations, acknowledged reactive decisions, one trusted Rust host',external_effects_exactly_once=False)
 finally:
  result['event_files']={p.name:p.read_text() for p in work.glob('events-*') if p.is_file()}
  for e in processes:
   stop(e['process']);e['exit']=e['process'].returncode;e['log'].close();e['log_text']=Path(e['log'].name).read_text(errors='replace');del e['process'];del e['log']
  result.update(commands=commands,processes=processes,all_owned_pids_absent=all(not Path('/proc/%d'%e['pid']).exists() for e in processes),binary_sha256=hashlib.sha256(BIN.read_bytes()).hexdigest(),database_sha256=hashlib.sha256(DB.read_bytes()).hexdigest())
  output=Path(os.environ['WORKFLOW_CONTROL_EVIDENCE']);assert not output.exists();output.write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({'complete':result['complete'],'commands':len(commands),'processes':len(processes),'owned_pids_absent':result['all_owned_pids_absent']}))
