"""Canonical Python scheduled workflow -> generated transaction root -> real C++.
This is NOT direct canonical transaction task-target admission.
Finite original parent; exact children, bounded waits, retained RocksDB and wire bytes.
"""
import hashlib,json,os,signal,socket,subprocess,sys,time,uuid
from pathlib import Path
import grpc,grpc_tools
BIN,ROOT=Path(sys.argv[1]).resolve(),Path(sys.argv[2]).resolve()
SOURCE=Path(__file__).resolve().parents[5]
DB=Path(os.environ['REBOOT_NATIVE2PC_CXX_DATABASE']).resolve()
ROOT.mkdir(parents=True,exist_ok=False)
children=[];cases=[];rec=dict(complete=False,parent_pid=os.getpid(),children=children,cases=cases,binary_sha256=hashlib.sha256(BIN.read_bytes()).hexdigest(),database_sha256=hashlib.sha256(DB.read_bytes()).hexdigest(),fresh_cpp_build=False)
def save():
 p=ROOT/'receipt.json.tmp';p.write_text(json.dumps(rec|dict(children=[{k:v for k,v in c.items() if k!='process'} for c in children]),indent=2));f=p.open('rb');os.fsync(f.fileno());f.close();os.replace(p,ROOT/'receipt.json');fd=os.open(ROOT,os.O_RDONLY);os.fsync(fd);os.close(fd)
def interrupted(*_):raise InterruptedError('transaction proof parent terminated')
for s in [signal.SIGTERM,signal.SIGINT,signal.SIGHUP]:signal.signal(s,interrupted)
def port():
 with socket.socket() as s:s.bind(('127.0.0.1',0));return s.getsockname()[1]
def spawn(args,env=None,role='client'):
 log=ROOT/f'{len(children):03d}.log'
 with log.open('wb') as f:p=subprocess.Popen(list(map(str,args)),env=env,stdout=f,stderr=f)
 children.append(dict(process=p,pid=p.pid,parent_pid=os.getpid(),args=list(map(str,args)),role=role,log=str(log),waited_by_parent=False));save();return p
def row(p):return next(c for c in children if c['process'] is p)
def wait(p):
 p.wait(timeout=25);row(p).update(waited_by_parent=True,wait_returncode=p.returncode);save()
def stop(p,path=None):
 if p.poll() is None:
  if path:row(p)['termination']='requested-graceful';path.touch()
  else:row(p)['termination']='intentional-sigkill';p.kill()
 wait(p)
 if path:assert p.returncode==0,Path(row(p)['log']).read_text()
def run(*args,env=None,good=True):
 p=spawn([BIN,*args],env);wait(p);text=Path(row(p)['log']).read_text().strip()
 if good:assert p.returncode==0,text
 return text
def until(f,p=None):
 end=time.monotonic()+20
 while time.monotonic()<end:
  if f():return
  if p and p.poll() is not None:raise AssertionError(Path(row(p)['log']).read_text())
  time.sleep(.02)
 raise AssertionError('bounded observation timeout')
def listening(p,n):
 def probe():
  try:
   with socket.create_connection(('127.0.0.1',n),timeout=.1):return True
  except OSError:return False
 until(probe,p)
save()
try:
 overlay=ROOT/'python-protos';overlay.mkdir();runfiles=Path(os.environ['CANONICAL_PYTHON_RUNFILES']).resolve();plugin=Path(os.environ['CANONICAL_PYTHON_PLUGIN']).resolve()
 p=spawn([sys.executable,'-m','grpc_tools.protoc',f'-I{SOURCE}',f'-I{Path(__file__).parent}',f'-I{Path(grpc_tools.__file__).parent/"_proto"}',f'--python_out={overlay}',f'--grpc_python_out={overlay}',f'--plugin=protoc-gen-reboot_python={plugin}',f'--reboot_python_out={overlay}','workflow/v1/workflow.proto'],os.environ.copy()|dict(RUNFILES_DIR=str(runfiles.parent)))
 wait(p);assert p.returncode==0,Path(row(p)['log']).read_text()
 sys.path[:0]=[str(overlay),str(runfiles)]
 from workflow.v1 import workflow_pb2 as app,workflow_pb2_grpc as ag
 from rbt.v1alpha1 import database_pb2 as db,database_pb2_grpc as dg
 from rbt.v1alpha1.tasks_pb2 import TaskId
 from reboot.aio.types import StateRef
 clientenv=os.environ.copy()|dict(PYTHONPATH=str(overlay)+':'+str(runfiles),WORKFLOW_REFERENCE_ID='child')
 ref=StateRef.from_id('workflow.v1.AtomicLedger','atomic').to_str()
 for case in os.environ.get('TRANSACTION_CASES','success,concurrent-root,ack-restart,target-ack-loss,payload-reject,authorization-reject,rollback').split(','):
  work=ROOT/case;work.mkdir();events=work/'events';deny=work/'deny';dp,sp,tp,tdp=port(),port(),port(),port();du,su,tu,tdu=[f'http://127.0.0.1:{x}' for x in [dp,sp,tp,tdp]]
  run('info',work/'info.pb')
  def database(target=False):
   n=tdp if target else dp;p=spawn([DB,work/('target-rocksdb' if target else 'rocksdb'),work/'info.pb',n],role='database');listening(p,n);return p
  def target():
   shutdown=work/f'target-stop-{len(children)}';p=spawn([BIN,'serve-transaction',tdu,f'127.0.0.1:{tp}',shutdown],os.environ.copy()|dict(WORKFLOW_BODY_EVENTS=str(events),TRANSACTION_DENY_FILE=str(deny)),role='application');listening(p,tp);return p,shutdown
  def source(extra=None,ready=True):
   shutdown=work/f'source-stop-{len(children)}';env=clientenv|dict(WORKFLOW_BODY_MODE='transaction',WORKFLOW_BODY_EVENTS=str(events),TRANSACTION_ENDPOINT=route)|(extra or {})
   p=spawn([BIN,'serve',du,f'127.0.0.1:{sp}',shutdown],env,role='application')
   if ready:listening(p,sp)
   if ready:until(lambda:any(s in run('read',su,env=clientenv,good=False) for s in ['"schedules"','StateNotConstructed','must be constructed','state must']),p)
   return p,shutdown
  def lines():return events.read_text().splitlines() if events.exists() else []
  def txn(method,body,key=None,reference=ref):
   metadata=[('x-reboot-state-ref',reference)]
   if key:metadata.append(('x-reboot-idempotency-key',str(key)))
   stub=ag.AtomicLedgerInitMethodsStub if method=='Open' else ag.AtomicLedgerMethodsStub
   return getattr(stub(grpc.insecure_channel(tu.removeprefix('http://'))),method)(body,metadata=metadata,timeout=5)
  def target_ready():
   try:txn('Query',app.Empty());return True
   except grpc.RpcError as e:
    rec.setdefault('readiness',[]).append(dict(code=str(e.code()),message=e.details()));save()
    from google.rpc import status_pb2
    rich=next((status_pb2.Status.FromString(v) for k,v in (e.trailing_metadata() or []) if k=='grpc-status-details-bin'),None)
    return e.code()==grpc.StatusCode.ABORTED and rich is not None and any(d.type_url=='type.googleapis.com/rbt.v1alpha1.StateNotConstructed' for d in rich.details)
  def snapshot():
   leaf=StateRef.from_id('workflow.v1.AtomicLedger','leaf').to_str();c=dg.DatabaseStub(grpc.insecure_channel(tdu.removeprefix('http://')));state=c.Load(db.LoadRequest(actors=[db.Actor(state_type='workflow.v1.AtomicLedger',state_ref=r) for r in [ref,leaf]]),timeout=5)
   records=[m.SerializeToString().hex() for page in c.RecoverIdempotentMutations(db.RecoverIdempotentMutationsRequest(state_type='workflow.v1.AtomicLedger',state_ref=ref),timeout=5) for m in page.idempotent_mutations]
   values={a.state_ref:app.AtomicLedger.FromString(a.state).value for a in state.actors}
   pending=[t.SerializeToString().hex() for page in c.Recover(db.RecoverRequest(state_tags_by_state_type={'workflow.v1.AtomicLedger':'AtomicLedger'},shard_ids=['s000000000'],skip_idempotent_mutations=True),timeout=5) for t in page.pending_tasks]
   rec.setdefault('wire_loads',[]).append(state.SerializeToString().hex());save()
   return dict(state=[a.SerializeToString().hex() for a in state.actors],value=values[ref],leaf=values[leaf],receipts=records,pending=pending)
  def canonical(action,key,amount=7):
   out=work/f'python-{len(children)}.json';p=spawn([sys.executable,str(Path(__file__).parent/'canonical_client.py'),action,su,key,str(amount),'',str(out),'Run'],clientenv);wait(p);assert p.returncode==0,Path(row(p)['log']).read_text();return json.loads(out.read_text())
  database_process=database();target_database=database(True);t,ts=target();until(target_ready,t)
  assert txn('Open',app.Step(amount=0),uuid.uuid4()).value==0
  assert txn('Open',app.Step(amount=0),uuid.uuid4(),StateRef.from_id('workflow.v1.AtomicLedger','leaf').to_str()).value==0
  if case=='concurrent-root':
   import concurrent.futures,threading
   key=uuid.uuid4();bar=threading.Barrier(2)
   def duplicate():bar.wait(timeout=5);return txn('Apply',app.Step(amount=3),key).value
   with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
    futures=[pool.submit(duplicate) for _ in range(2)];values=[f.result(timeout=15) for f in futures]
   assert values==[3,3];assert snapshot()['value']==3 and snapshot()['leaf']==3 and len(snapshot()['pending'])==1
   assert lines().count('transaction-apply')==1 and lines().count('transaction-child')==1
   rec['concurrent_root']=dict(key=str(key),responses=values,snapshot=snapshot());save()
  route=tu;proxy=None;ack=work/'lost-ack.json'
  if case=='target-ack-loss':
   pp=port();proxy=spawn([sys.executable,str(Path(__file__).parent/'transaction_ack_proxy.py'),f'127.0.0.1:{pp}',f'127.0.0.1:{tp}',ack],role='proxy');listening(proxy,pp);route=f'http://127.0.0.1:{pp}'
  barrier=work/'after-target';extra={} if case in ['success','concurrent-root','rollback','target-ack-loss'] else dict(REBOOT_TEST_OUTBOUND_WRITER_AFTER_TARGET_ACK=str(barrier))
  s,ss=source(extra);run('create',su,str(uuid.uuid4()),env=clientenv)
  fault=os.environ.get('TRANSACTION_NATIVE_FAULT')
  if fault=='error':raise RuntimeError('requested native original-parent error drill')
  if fault=='signal':os.kill(os.getpid(),signal.SIGTERM)
  task=canonical('spawn',str(uuid.uuid4()),-1 if case=='rollback' else 7)['task_id']
  taskid=TaskId.FromString(bytes.fromhex(task));taskuuid=str(uuid.UUID(bytes=taskid.task_uuid))
  before=None
  if case=='rollback':
   wait(s);assert s.returncode!=0;assert snapshot()['value']==0;assert lines().count('transaction-apply')==1;assert 'transaction-returned' not in lines()
  elif case=='concurrent-root':
   assert canonical('wait',task)['response']=={'first':'10','second':'10'};assert snapshot()['value']==10
  elif case=='success':
   assert canonical('wait',task)['response']=={'first':'7','second':'7'};assert snapshot()['value']==7
  else:
   if case=='target-ack-loss':
    until(ack.exists,s);wait(s);assert s.returncode!=0;rec['actual_target_ack_loss']=json.loads(ack.read_text());save()
   else:until(barrier.exists,s)
   before=snapshot();assert before['value']==7 and lines().count('transaction-apply')==1 and 'transaction-returned' not in lines()
   stop(s);stop(t);stop(database_process);stop(target_database);database_process=database();target_database=database(True);t,ts=target();until(target_ready,t)
   # Intervening real transaction must not change the replayed original response.
   assert txn('Apply',app.Step(amount=3),uuid.uuid4()).value==10
   after_intervening=snapshot();assert after_intervening['value']==10
   if case in ['payload-reject','authorization-reject']:
    if case=='authorization-reject':deny.touch()
    s,ss=source(dict(TRANSACTION_AMOUNT='8') if case=='payload-reject' else {},ready=False);wait(s);assert s.returncode!=0;assert lines().count('transaction-apply')==2
    assert snapshot()==after_intervening
    if deny.exists():deny.unlink()
   s,ss=source();assert canonical('wait',task)['response']=={'first':'7','second':'7'};assert snapshot()==after_intervening;assert lines().count('transaction-apply')==2
  final=snapshot();assert final['leaf']==final['value'];assert len(final['pending'])==(0 if case=='rollback' else 1 if case=='success' else 2)
  assert len(final['receipts'])==(1 if case=='rollback' else 2 if case=='success' else 3)
  source_record=json.loads(run('inspect-reader-outcome',du,taskuuid,env=clientenv));assert source_record['status']==(1 if case=='rollback' else 2)
  assert len(source_record['checkpoints'])==1
  key=uuid.UUID(source_record['checkpoints'][0]['key']).bytes
  matching=[db.IdempotentMutation.FromString(bytes.fromhex(raw)) for raw in final['receipts'] if db.IdempotentMutation.FromString(bytes.fromhex(raw)).key==key]
  assert len(matching)==(0 if case=='rollback' else 1)
  if matching:
   assert matching[0].state_type=='workflow.v1.AtomicLedger' and matching[0].state_ref==ref and len(matching[0].request_fingerprint)==32
   assert app.Value.FromString(matching[0].response).value==(10 if case=='concurrent-root' else 7)
  if s.poll() is None:stop(s,ss)
  stop(t,ts)
  if proxy:
   row(proxy)['termination']='requested-sigterm';proxy.terminate();wait(proxy);assert proxy.returncode==0
  stop(database_process);stop(target_database)
  cases.append(dict(case=case,task_id=task,events=lines(),before=before,final=final,source=source_record));save()
 rec['complete']=True
except BaseException as e:
 rec['error']=repr(e)
 try:rec['failure_snapshot']=snapshot();rec['failure_events']=lines()
 except Exception as inspection:rec['failure_inspection_error']=repr(inspection)
 raise
finally:
 for c in sorted(children,key=lambda c:c['role']=='database'):
  if not c['waited_by_parent']:stop(c['process'])
 rec['all_original_children_waited']=bool(children) and all(c['waited_by_parent'] for c in children);save()
print(json.dumps(dict(complete=rec['complete'],cases=len(cases),children=len(children))))
