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
def checkpoints():return json.loads(run('inspect-reader-outcome',database,handle))
def read():return json.loads(run('read',app))
work=Path(os.environ['WORKFLOW_READER_STAGE']);work.mkdir(exist_ok=True)
dp=port();ap=port();database='http://127.0.0.1:%d'%dp;app='http://127.0.0.1:%d'%ap
run('info',work/'server-info.pb')
def startdb():
 p=spawn([DB,work/'rocksdb',work/'server-info.pb',dp]);listener(p,dp);return p
def starthost(pause=False,contract=None,framework=False):
 global eventpath
 eventpath=work/('events-%d'%len(processes));shutdown=work/('shutdown-%d'%len(processes));env=os.environ.copy()
 env.update(WORKFLOW_BODY_MODE='reader-outcome',WORKFLOW_BODY_EVENTS=str(eventpath))
 if pause:env['READER_PAUSE_AFTER_ERROR']='1'
 if contract:env['READER_CONDITION_VERSION']=contract
 if framework:env['READER_RICH_FRAMEWORK_ERROR']='1'
 p=spawn([BIN,'serve',database,'127.0.0.1:%d'%ap,shutdown],env);listener(p,ap)
 def ready():
  r=subprocess.run([str(BIN),'read',app],capture_output=True,text=True,timeout=2)
  return r.returncode==0 or 'must be constructed' in r.stderr or 'state must' in r.stderr
 until(ready);return p,shutdown
try:
 db=startdb();host,shutdown=starthost(True);run('create',app,uuid.uuid4())
 handle=run('schedule',app,uuid.uuid4(),0,1)
 positive_handle=handle
 until(lambda:'reader-error-parked' in events())
 assert read()=={'first':1,'second':0,'schedules':1}
 before=checkpoints()
 assert before['status']==1 and len(before['checkpoints'])==2
 errors=[m for m in before['checkpoints'] if m['type']=='type.googleapis.com/reboot.runtime.ReaderOutcome.v1']
 assert len(errors)==1
 assert events().count('reader-threshold-invoked')==1 and events().count('reader-error-caught')==1
 assert run('signal',app,uuid.uuid4(),10)=='11'
 stop(host,shutdown);assert host.returncode==0
 stop(db);db=startdb();host,shutdown=starthost(contract='threshold-required-two.v2')
 until(lambda:'reader-framework-failed' in events())
 # Recovery must fail closed before serving on a contract identity collision.
 host.wait(timeout=15)
 assert host.returncode!=0
 assert 'workflow step checkpoint identity/provenance collision' in Path(processes[-1]['log'].name).read_text()
 assert checkpoints()==before
 assert json.loads(run('inspect-state',database))=={'first':11,'second':0,'schedules':1}
 assert 'reader-threshold-invoked' not in events() and 'reader-error-caught' not in events()
 collision=checkpoints()
 stop(db)
 db=startdb();host,shutdown=starthost()
 terminal=json.loads(run('wait',app,handle))
 assert terminal=={'first':1,'second':100},terminal
 assert read()=={'first':11,'second':100,'schedules':1}
 assert 'reader-threshold-invoked' not in events() and 'reader-threshold-predicate' not in events()
 assert events().count('reader-error-caught')==1 and events().count('reader-fallback-ack')==1
 finished=checkpoints()
 assert finished['status']==2 and len(finished['checkpoints'])==3
 assert all(m in finished['checkpoints'] for m in before['checkpoints'])
 stop(host,shutdown);assert host.returncode==0;stop(db)
 db=startdb();host,shutdown=starthost()
 assert json.loads(run('wait',app,handle))==terminal
 assert read()=={'first':11,'second':100,'schedules':1}
 assert 'body' not in events() and 'reader-threshold-invoked' not in events()
 assert checkpoints()==finished
 stop(host,shutdown);assert host.returncode==0;stop(db)
 db=startdb();host,shutdown=starthost(framework=True)
 negative_handle=run('schedule',app,uuid.uuid4(),0,1)
 handle=negative_handle
 until(lambda:'reader-rich-grpc-caught' in events())
 until(lambda:'unclean workflow attempt cannot complete successfully' in Path(processes[-1]['log'].name).read_text(errors='replace'))
 negative=checkpoints()
 assert negative['status']==1 and not negative['has_terminal'] and len(negative['checkpoints'])==1
 assert all(m['type']!='type.googleapis.com/reboot.runtime.ReaderOutcome.v1' for m in negative['checkpoints'])
 host.wait(timeout=15)
 assert host.returncode!=0
 assert json.loads(run('inspect-state',database))=={'first':12,'second':100,'schedules':2}
 assert 'reader-error-caught' not in events() and 'reader-fallback-ack' not in events()
 stop(db)
 result.update(complete=True,handle=positive_handle,negative_handle=negative_handle,terminal=terminal,before=before,finished=finished,contract_collision=collision,rich_grpc_false_catch=negative,scope='named same-actor declared reader outcome and fallback; not arbitrary exception handling')
finally:
 result['event_files']={p.name:p.read_text() for p in work.glob('events-*') if p.is_file()}
 for e in processes:
  if result['complete']:stop(e['process'])
  e['exit']=e['process'].poll();e['log'].close();e['log_text']=Path(e['log'].name).read_text(errors='replace');del e['process'];del e['log']
 result.update(commands=commands,processes=processes,all_owned_pids_absent=all(not Path('/proc/%d'%e['pid']).exists() for e in processes),binary_sha256=hashlib.sha256(BIN.read_bytes()).hexdigest(),database_sha256=hashlib.sha256(DB.read_bytes()).hexdigest())
 output=Path(os.environ['WORKFLOW_READER_EVIDENCE']);assert not output.exists();output.write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({'complete':result['complete'],'commands':len(commands),'processes':len(processes),'owned_pids_absent':result['all_owned_pids_absent']}))
