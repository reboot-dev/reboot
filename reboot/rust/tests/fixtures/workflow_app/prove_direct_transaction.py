"""Direct canonical Python spawn(transaction), generated root and real C++ RocksDB.
Original finite parent retains every launched child and first mutation outcome.
"""
import datetime,hashlib,json,os,signal,socket,subprocess,sys,time,uuid
from pathlib import Path
import grpc,grpc_tools
BIN,ROOT=Path(sys.argv[1]).resolve(),Path(sys.argv[2]).resolve()
SOURCE=Path(__file__).resolve().parents[5]
DB=Path(os.environ['REBOOT_NATIVE2PC_CXX_DATABASE']).resolve()
ROOT.mkdir(parents=True,exist_ok=False)
children=[];cases=[];rec=dict(complete=False,parent_pid=os.getpid(),children=children,cases=cases,binary_sha256=hashlib.sha256(BIN.read_bytes()).hexdigest(),database_sha256=hashlib.sha256(DB.read_bytes()).hexdigest(),fresh_cpp_build=False)
def save():
 p=ROOT/'receipt.json.tmp';p.write_text(json.dumps(rec|dict(children=[{k:v for k,v in c.items() if k!='process'} for c in children]),indent=2));f=p.open('rb');os.fsync(f.fileno());f.close();os.replace(p,ROOT/'receipt.json');fd=os.open(ROOT,os.O_RDONLY);os.fsync(fd);os.close(fd)
def interrupted(*_):raise InterruptedError('direct transaction original parent terminated')
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
def run(*args):
 p=spawn([BIN,*args]);wait(p);assert p.returncode==0,Path(row(p)['log']).read_text();return Path(row(p)['log']).read_text()
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
 p=spawn([sys.executable,'-m','grpc_tools.protoc',f'-I{SOURCE}',f'-I{Path(__file__).parent / "pure" if os.environ.get("PURE_TRANSACTION_FIXTURE") else Path(__file__).parent}',f'-I{Path(grpc_tools.__file__).parent/"_proto"}',f'--python_out={overlay}',f'--grpc_python_out={overlay}',f'--plugin=protoc-gen-reboot_python={plugin}',f'--reboot_python_out={overlay}','workflow/v1/workflow.proto'],os.environ.copy()|dict(RUNFILES_DIR=str(runfiles.parent)))
 wait(p);assert p.returncode==0,Path(row(p)['log']).read_text()
 sys.path[:0]=[str(overlay),str(runfiles)]
 from workflow.v1 import workflow_pb2 as app,workflow_pb2_grpc as ag
 from rbt.v1alpha1 import database_pb2 as db,database_pb2_grpc as dg,tasks_pb2 as tasks,tasks_pb2_grpc as tg
 from reboot.aio.types import StateRef
 ref=StateRef.from_id('workflow.v1.AtomicLedger','atomic').to_str();leaf=StateRef.from_id('workflow.v1.AtomicLedger','leaf').to_str()
 clientenv=os.environ.copy()|dict(PYTHONPATH=str(overlay)+':'+str(runfiles))
 for case in os.environ.get('DIRECT_TRANSACTION_CASES','success,scheduled,cancel,replay,ack-restart,target-ack-loss,authorization-reject,running-cancel,rollback').split(','):
  work=ROOT/case;work.mkdir();events=work/'events';deny=work/'deny';dp,tp=port(),port();du,tu=f'http://127.0.0.1:{dp}',f'http://127.0.0.1:{tp}'
  run('info',work/'info.pb')
  def database():
   p=spawn([DB,work/'rocksdb',work/'info.pb',dp],role='database');listening(p,dp);return p
  def target(extra=None,wait_ready=True):
   shutdown=work/f'stop-{len(children)}';env=os.environ.copy()|dict(DIRECT_TRANSACTION_TASKS='1',WORKFLOW_BODY_EVENTS=str(events),TRANSACTION_DENY_FILE=str(deny))|(extra or {})
   p=spawn([BIN,'serve-transaction',du,f'127.0.0.1:{tp}',shutdown],env,role='application')
   if wait_ready:listening(p,tp);until(ready,p)
   return p,shutdown
  def txn(method,body,key=None,reference=ref):
   metadata=[('x-reboot-state-ref',reference)]
   if key:metadata.append(('x-reboot-idempotency-key',str(key)))
   stub=ag.AtomicLedgerInitMethodsStub if method in ['Open','Probe'] else ag.AtomicLedgerMethodsStub
   return getattr(stub(grpc.insecure_channel(f'127.0.0.1:{tp}')),method)(body,metadata=metadata,timeout=5)
  def ready():
   try:txn('Probe' if os.environ.get('PURE_TRANSACTION_FIXTURE') else 'Query',app.Empty());return True
   except grpc.RpcError as e:
    from google.rpc import status_pb2
    rich=next((status_pb2.Status.FromString(v) for k,v in (e.trailing_metadata() or []) if k=='grpc-status-details-bin'),None)
    return e.code()==grpc.StatusCode.ABORTED and rich is not None and any(d.type_url=='type.googleapis.com/rbt.v1alpha1.StateNotConstructed' for d in rich.details)
  def lines():return events.read_text().splitlines() if events.exists() else []
  def snapshot(task=None):
   c=dg.DatabaseStub(grpc.insecure_channel(f'127.0.0.1:{dp}'));loaded=c.Load(db.LoadRequest(actors=[db.Actor(state_type='workflow.v1.AtomicLedger',state_ref=r) for r in [ref,leaf]],task_ids=[] if task is None else [task]),timeout=5)
   records=[m.SerializeToString().hex() for page in c.RecoverIdempotentMutations(db.RecoverIdempotentMutationsRequest(state_type='workflow.v1.AtomicLedger',state_ref=ref),timeout=5) for m in page.idempotent_mutations]
   pending=[t.SerializeToString().hex() for page in c.Recover(db.RecoverRequest(state_tags_by_state_type={'workflow.v1.AtomicLedger':'AtomicLedger'},shard_ids=['s000000000'],skip_idempotent_mutations=True),timeout=5) for t in page.pending_tasks]
   return dict(values=[app.AtomicLedger.FromString(a.state).value for a in loaded.actors],receipts=records,pending=pending,tasks=[t.SerializeToString().hex() for t in loaded.tasks])
  def canonical(action,key,amount=7,schedule='',good=True):
   out=work/f'python-{len(children)}.json';p=spawn([sys.executable,str(Path(__file__).parent/'direct_transaction_client.py'),action,tu,key,str(amount),schedule,out],clientenv);wait(p)
   if good:assert p.returncode==0,Path(row(p)['log']).read_text()
   return json.loads(out.read_text()) if p.returncode==0 else dict(exit=p.returncode,log=Path(row(p)['log']).read_text())
  def cancel(task):
   return tg.TasksStub(grpc.insecure_channel(f'127.0.0.1:{tp}')).CancelTask(tasks.CancelTaskRequest(task_id=task),metadata=[('x-reboot-state-ref',ref),('authorization','Bearer task-admin')],timeout=5)
  d=database();barrier=work/'after-target';extra=dict(REBOOT_TEST_OUTBOUND_WRITER_AFTER_TARGET_ACK=str(barrier)) if case in ['ack-restart','authorization-reject','running-cancel'] else {}
  proxy=None;ack=work/'lost-ack.json'
  if case=='target-ack-loss':
   pp=port();proxy=spawn([sys.executable,str(Path(__file__).parent/'transaction_ack_proxy.py'),f'127.0.0.1:{pp}',f'127.0.0.1:{tp}',ack],role='proxy');listening(proxy,pp);extra['TRANSACTION_TASK_ENDPOINT']=f'http://127.0.0.1:{pp}'
  if os.environ.get('PURE_TRANSACTION_FIXTURE'):
   for identity,reference in [('atomic',ref),('leaf',leaf)]:
    bootstrap,bs=target(dict(PURE_TRANSACTION_BOOTSTRAP='1',PURE_TRANSACTION_ACTOR=identity))
    assert txn('Create',app.Step(amount=0),uuid.uuid4(),reference).value==0
    stop(bootstrap,bs)
  t,ts=target(extra)
  if not os.environ.get('PURE_TRANSACTION_FIXTURE'):
   assert txn('Open',app.Step(amount=0),uuid.uuid4()).value==0
   assert txn('Open',app.Step(amount=0),uuid.uuid4(),leaf).value==0
  fault=os.environ.get('DIRECT_TRANSACTION_FAULT')
  if fault=='error':raise RuntimeError('requested original parent error drill')
  if fault=='signal':os.kill(os.getpid(),signal.SIGTERM)
  key=str(uuid.uuid4());schedule=(datetime.datetime.now(datetime.timezone.utc)+datetime.timedelta(seconds=3 if case=='scheduled' else 3600)).isoformat() if case in ['scheduled','cancel','replay'] else ''
  admitted=canonical('spawn',key,-1 if case=='rollback' else 7,schedule);task=tasks.TaskId.FromString(bytes.fromhex(admitted['task_id']));before=None
  if case=='replay':
   assert canonical('spawn',key,7,schedule)==admitted
   rejected=canonical('spawn',key,8,schedule,good=False);assert rejected.get('exit')!=0
   assert snapshot(task)['values']==[0,0] and 'transaction-apply' not in lines()
   assert cancel(task).status==tasks.CancelTaskResponse.OK
  elif case=='cancel':
   assert snapshot(task)['values']==[0,0] and 'transaction-apply' not in lines()
   assert cancel(task).status==tasks.CancelTaskResponse.OK
   assert 'error' in canonical('wait',admitted['task_id'])
   assert snapshot(task)['values']==[0,0]
  elif case=='rollback':
   wait(t);assert t.returncode!=0;assert snapshot(task)['values']==[0,0]
  else:
   if case in ['ack-restart','target-ack-loss','authorization-reject','running-cancel']:
    if case=='target-ack-loss':
     until(ack.exists,t);wait(t);assert t.returncode!=0;rec['actual_target_ack_loss']=json.loads(ack.read_text());save()
    else:until(barrier.exists,t)
    before=snapshot(task);assert before['values']==[7,7]
    if case=='running-cancel':
     try:cancel(task);raise AssertionError('running transaction cancel unexpectedly acknowledged')
     except grpc.RpcError as e:assert e.code()==grpc.StatusCode.FAILED_PRECONDITION
     assert snapshot(task)==before and t.poll() is None
    stop(t);stop(d);d=database()
    # Re-admit the same task only after participant/coordinator recovery; park
    # its outbound call before dispatch while the intervening root commits.
    pre=work/'before-dispatch';t,ts=target(dict(REBOOT_TEST_OUTBOUND_WRITER_BEFORE_DISPATCH=str(pre)));until(pre.exists,t)
    assert txn('Apply',app.Step(amount=3),uuid.uuid4()).value==10
    after=snapshot(task);assert after['values']==[10,10]
    if case=='authorization-reject':
     deny.touch();stop(t);t,ts=target(wait_ready=False);wait(t);assert t.returncode!=0
     assert snapshot(task)==after;deny.unlink()
    else:stop(t)
    t,ts=target()
   response=canonical('wait',admitted['task_id']);assert response=={'response':{'value':'7'}},response
   assert snapshot(task)['values']==([10,10] if before else [7,7])
  final=snapshot(task)
  scoped=[m for page in dg.DatabaseStub(grpc.insecure_channel(f'127.0.0.1:{dp}')).RecoverIdempotentMutations(db.RecoverIdempotentMutationsRequest(state_type=task.state_type,state_ref=task.state_ref,workflow_id=task.task_uuid),timeout=5) for m in page.idempotent_mutations]
  if case not in ['cancel','replay']:
   assert len(scoped)==1 and scoped[0].workflow_id==task.task_uuid and len(scoped[0].request_fingerprint)==32
   matching=[db.IdempotentMutation.FromString(bytes.fromhex(raw)) for raw in final['receipts'] if db.IdempotentMutation.FromString(bytes.fromhex(raw)).key==scoped[0].key]
   assert len(matching)==(0 if case=='rollback' else 1)
   if matching:
    assert matching[0].state_type==task.state_type and matching[0].state_ref==ref and len(matching[0].request_fingerprint)==32
    assert not matching[0].HasField('workflow_id') and app.Value.FromString(matching[0].response).value==7
  final['source_checkpoints']=[m.SerializeToString().hex() for m in scoped]
  if case not in ['cancel','replay','rollback']:
   assert lines().count('transaction-apply')==(2 if before else 1)
   assert len(final['pending'])==(2 if before else 1)
  if t.poll() is None:stop(t,ts)
  if proxy:
   proxy.terminate();wait(proxy);assert proxy.returncode==0
  stop(d);cases.append(dict(case=case,admission=admitted,before=before,final=final,events=lines()));save()
 rec['complete']=True
except BaseException as e:
 rec['error']=repr(e)
 try:rec['failure_snapshot']=snapshot(task);rec['failure_events']=lines()
 except Exception as inspection:rec['failure_inspection_error']=repr(inspection)
 raise
finally:
 for c in sorted(children,key=lambda c:c['role']=='database'):
  if not c['waited_by_parent']:stop(c['process'])
 rec['all_original_children_waited']=bool(children) and all(c['waited_by_parent'] for c in children);save()
print(json.dumps(dict(complete=rec['complete'],cases=len(cases),children=len(children))))
