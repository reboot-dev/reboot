"""Generated canonical Python tasks with a real remote transaction participant.

Finite original parent owns planner, two application hosts and two native C++
Database/RocksDB processes. Never retries mutations or manufactures receipts.
"""
import datetime, hashlib, json, os, signal, socket, subprocess, sys, time, uuid
from pathlib import Path
import grpc, grpc_tools
BIN, ROOT = Path(sys.argv[1]).resolve(), Path(sys.argv[2]).resolve()
SOURCE = Path(__file__).resolve().parents[5]
FIXTURE = Path(__file__).parent
DB = Path(os.environ['REBOOT_NATIVE2PC_CXX_DATABASE']).resolve()
ROOT.mkdir(parents=True, exist_ok=False)
children, cases = [], []
rec = dict(complete=False, parent_pid=os.getpid(), children=children, cases=cases,
           binary_sha256=hashlib.sha256(BIN.read_bytes()).hexdigest(),
           database_sha256=hashlib.sha256(DB.read_bytes()).hexdigest(), fresh_cpp_build=False)
def save():
    p = ROOT/'receipt.json.tmp'
    p.write_text(json.dumps(rec | dict(children=[{k:v for k,v in c.items() if k!='process'} for c in children]), indent=2))
    with p.open('rb') as f: os.fsync(f.fileno())
    os.replace(p, ROOT/'receipt.json')
    fd = os.open(ROOT, os.O_RDONLY); os.fsync(fd); os.close(fd)
def interrupted(*_): raise InterruptedError('remote proof original parent terminated')
for s in [signal.SIGTERM, signal.SIGINT, signal.SIGHUP]: signal.signal(s, interrupted)
def port():
    with socket.socket() as s: s.bind(('127.0.0.1', 0)); return s.getsockname()[1]
def spawn(args, env=None, role='client'):
    log = ROOT/f'{len(children):03d}.log'
    with log.open('wb') as f: p = subprocess.Popen(list(map(str,args)), env=env, stdout=f, stderr=f)
    children.append(dict(process=p,pid=p.pid,parent_pid=os.getpid(),args=list(map(str,args)),role=role,log=str(log),waited_by_parent=False)); save(); return p
def row(p): return next(c for c in children if c['process'] is p)
def wait(p):
    p.wait(timeout=25); row(p).update(waited_by_parent=True,wait_returncode=p.returncode); save()
def stop(p, path=None):
    if p.poll() is None:
        if path: row(p)['termination']='requested-graceful'; path.touch()
        elif row(p)['role']=='planner': row(p)['termination']='requested-sigterm'; p.terminate()
        else: row(p)['termination']='intentional-sigkill'; p.kill()
    wait(p)
    if path or row(p)['role']=='planner': assert p.returncode==0, Path(row(p)['log']).read_text()
def until(f, p=None):
    end=time.monotonic()+20
    while time.monotonic()<end:
        if f(): return
        if p and p.poll() is not None: raise AssertionError(Path(row(p)['log']).read_text())
        time.sleep(.02)
    raise AssertionError('bounded observation timeout')
def listening(p,n):
    def probe():
        try:
            with socket.create_connection(('127.0.0.1',n),timeout=.1): return True
        except OSError: return False
    until(probe,p)
save()
try:
    overlay=ROOT/'python-protos'; overlay.mkdir()
    runfiles=Path(os.environ['CANONICAL_PYTHON_RUNFILES']).resolve(); plugin=Path(os.environ['CANONICAL_PYTHON_PLUGIN']).resolve()
    p=spawn([sys.executable,'-m','grpc_tools.protoc',f'-I{SOURCE}',f'-I{FIXTURE / "pure" if os.environ.get("PURE_TRANSACTION_FIXTURE") else FIXTURE}',f'-I{Path(grpc_tools.__file__).parent/"_proto"}',f'--python_out={overlay}',f'--grpc_python_out={overlay}',f'--plugin=protoc-gen-reboot_python={plugin}',f'--reboot_python_out={overlay}','workflow/v1/workflow.proto'],os.environ.copy()|dict(RUNFILES_DIR=str(runfiles.parent)))
    wait(p); assert p.returncode==0,Path(row(p)['log']).read_text()
    sys.path[:0]=[str(overlay),str(runfiles)]
    from workflow.v1 import workflow_pb2 as app, workflow_pb2_grpc as ag
    from rbt.v1alpha1 import database_pb2 as db,database_pb2_grpc as dg,tasks_pb2 as tasks,placement_planner_pb2 as pp
    from reboot.aio.types import StateRef
    ref=StateRef.from_id('workflow.v1.AtomicLedger','atomic').to_str(); leaf=StateRef.from_id('workflow.v1.AtomicLedger','leaf').to_str()
    env=os.environ.copy()|dict(PYTHONPATH=str(overlay)+':'+str(runfiles))
    for case in os.environ.get('REMOTE_TRANSACTION_CASES','success,terminal,ack-restart,error-ack-restart,authorization-reject,payload-reject,target-ack-loss,error-target-ack-loss,crossactor').split(','):
        work=ROOT/case;work.mkdir(); events=work/'events'; deny=work/'deny'
        dp,lp,tp,cp,pp_port=[port() for _ in range(5)]
        addresses=[f'http://127.0.0.1:{n}' for n in [dp,lp,tp,cp,pp_port]]
        du,lu,tu,cu,pu=addresses
        p=spawn([BIN,'info',work/'info.pb']);wait(p);assert p.returncode==0
        # SHA-1 predecessor routing uses the raw first StateRef component.
        keyed=sorted([(hashlib.sha1(r.split('/')[0].encode()).digest(),sid,n) for r,sid,n in [(ref,'root',tp),(leaf,'child',cp)]])
        assert keyed[0][0]!=keyed[1][0]
        plan=pp.ListenForPlanResponse(plan=pp.Plan(version=1,applications=[pp.Plan.Application(id='workflow-app',services=[pp.Plan.Application.Service(full_name=s,state_type_full_name='workflow.v1.AtomicLedger') for s in ['workflow.v1.AtomicLedgerMethods','workflow.v1.AtomicLedgerInitMethods','rbt.v1alpha1.Tasks']],shards=[pp.Plan.Application.Shard(id=f's{i:09d}',range=pp.Plan.Application.Shard.KeyRange(first_key=b'' if i==0 else key),server_id=sid,replica_index=0) for i,(key,sid,n) in enumerate(keyed)])]),servers=[pp.Server(id=sid,application_id='workflow-app',address=pp.Server.Address(host='127.0.0.1',port=n)) for key,sid,n in keyed])
        (work/'plan.pb').write_bytes(plan.SerializeToString())
        planner=spawn([sys.executable,FIXTURE/'remote_transaction_planner.py',f'127.0.0.1:{pp_port}',work/'plan.pb'],env,role='planner');listening(planner,pp_port)
        def database(child=False):
            p=spawn([DB,work/('child-rocksdb' if child else 'root-rocksdb'),work/'info.pb',lp if child else dp],role='database');listening(p,lp if child else dp);return p
        def txn(method,body,key=None,child=False):
            metadata=[('x-reboot-state-ref',leaf if child else ref)]
            if key:metadata.append(('x-reboot-idempotency-key',str(key)))
            stub=ag.AtomicLedgerInitMethodsStub if method in ['Open','Probe'] else ag.AtomicLedgerMethodsStub
            return getattr(stub(grpc.insecure_channel(f'127.0.0.1:{cp if child else tp}')),method)(body,metadata=metadata,timeout=5)
        def ready(child=False):
            try:txn('Probe' if os.environ.get('PURE_TRANSACTION_FIXTURE') else 'Query',app.Empty(),child=child);return True
            except grpc.RpcError as error:
                from google.rpc import status_pb2
                rich=next((status_pb2.Status.FromString(v) for k,v in (error.trailing_metadata() or []) if k=='grpc-status-details-bin'),None)
                return error.code()==grpc.StatusCode.ABORTED and rich is not None and any(d.type_url=='type.googleapis.com/rbt.v1alpha1.StateNotConstructed' for d in rich.details)
        target_du=du
        def host(child=False,extra=None,wait_ready=True):
            shutdown=work/f'stop-{len(children)}'
            e=env|dict(REMOTE_TRANSACTION_PLANNER=pu,REMOTE_TRANSACTION_SERVER='child' if child else 'root',PURE_TRANSACTION_ACTOR='leaf' if child else 'atomic',DIRECT_TRANSACTION_TASKS='1',WORKFLOW_BODY_EVENTS=str(events),TRANSACTION_DENY_FILE=str(deny))|(extra or {})
            p=spawn([BIN,'serve-transaction',lu if child else target_du,f'127.0.0.1:{cp if child else tp}',shutdown],e,role='application')
            if wait_ready:listening(p,cp if child else tp);until(lambda:ready(child),p)
            return p,shutdown
        def lines():return events.read_text().splitlines() if events.exists() else []
        def snapshot(task=None):
            result=[]
            for n,r in [(dp,ref),(lp,leaf)]:
                c=dg.DatabaseStub(grpc.insecure_channel(f'127.0.0.1:{n}'))
                loaded=c.Load(db.LoadRequest(actors=[db.Actor(state_type='workflow.v1.AtomicLedger',state_ref=r)],task_ids=[] if task is None or r==leaf else [task]),timeout=5)
                recovered=list(c.Recover(db.RecoverRequest(shard_ids=['s000000000'],state_tags_by_state_type={'workflow.v1.AtomicLedger':'AtomicLedger'},skip_idempotent_mutations=True),timeout=5))
                receipts=[m.SerializeToString().hex() for page in c.RecoverIdempotentMutations(db.RecoverIdempotentMutationsRequest(state_type='workflow.v1.AtomicLedger',state_ref=r),timeout=5) for m in page.idempotent_mutations]
                result.append(dict(value=app.AtomicLedger.FromString(loaded.actors[0].state).value,receipts=receipts,pending=[t.SerializeToString().hex() for page in recovered for t in page.pending_tasks],participants=[t.SerializeToString().hex() for page in recovered for t in page.participant_transactions],tasks=[t.SerializeToString().hex() for t in loaded.tasks]))
            return result
        database_faults=['receipt-ack-loss','abort-ack-loss','source-ack-loss','terminal-ack-loss']
        declared=case in ['terminal','error-ack-restart','error-target-ack-loss',*database_faults]
        def canonical(action,key,amount=7,schedule='',good=True):
            out=work/f'python-{len(children)}.json'
            p=spawn([sys.executable,FIXTURE/('declared_transaction_client.py' if declared else 'direct_transaction_client.py'),action,tu,key,str(amount),schedule,out],env);wait(p)
            if good:assert p.returncode==0,Path(row(p)['log']).read_text()
            return json.loads(out.read_text()) if p.returncode==0 else dict(exit=p.returncode,log=Path(row(p)['log']).read_text())
        d,ld=database(),database(True)
        if os.environ.get('PURE_TRANSACTION_FIXTURE'):
            for child in [True,False]:
                b,bs=host(child,dict(PURE_TRANSACTION_BOOTSTRAP='1'))
                assert txn('Create',app.Step(amount=0),uuid.uuid4(),child).value==0;stop(b,bs)
        dbproxy=None;dbfault=work/'database-fault'
        if case in database_faults:
            dbfault.mkdir();pn=port()
            selected={'receipt-ack-loss':'transaction-error-target','abort-ack-loss':'transaction-abort','source-ack-loss':'transaction-source-stored','terminal-ack-loss':'cancel'}[case]
            dbproxy=spawn([sys.executable,FIXTURE/'database_ack_proxy.py',f'127.0.0.1:{dp}',f'127.0.0.1:{pn}',selected,dbfault],role='proxy');listening(dbproxy,pn);target_du=f'http://127.0.0.1:{pn}'
        c,cs=host(True)
        barrier=work/'after-target'; extra=dict(REBOOT_TEST_OUTBOUND_WRITER_AFTER_TARGET_ACK=str(barrier)) if case in ['ack-restart','error-ack-restart','authorization-reject','payload-reject'] else {}
        proxy=None;ack=work/'lost-ack.json'
        if case in ['target-ack-loss','error-target-ack-loss']:
            pn=port();proxy=spawn([sys.executable,FIXTURE/('declared_transaction_ack_proxy.py' if declared else 'transaction_ack_proxy.py'),f'127.0.0.1:{pn}',f'127.0.0.1:{tp}',ack],role='proxy');listening(proxy,pn);extra['TRANSACTION_TASK_ENDPOINT']=f'http://127.0.0.1:{pn}'
        t,ts=host(False,extra)
        if not os.environ.get('PURE_TRANSACTION_FIXTURE'):
            assert txn('Open',app.Step(amount=0),uuid.uuid4()).value==0
            assert txn('Open',app.Step(amount=0),uuid.uuid4(),True).value==0
        if os.environ.get('REMOTE_TRANSACTION_FAULT')=='error':raise RuntimeError('requested remote parent error drill')
        if os.environ.get('REMOTE_TRANSACTION_FAULT')=='signal':os.kill(os.getpid(),signal.SIGTERM)
        key=str(uuid.uuid4());admitted=canonical('spawn',key);task=tasks.TaskId.FromString(bytes.fromhex(admitted['task_id']));before=None
        if case in database_faults:
            until((dbfault/'ack-observed.json').exists,t)
            observed=snapshot(task)
            assert [x['value'] for x in observed]==[0,0] and not any(x['participants'] for x in observed),observed
            if case=='receipt-ack-loss':
                try:txn('Apply',app.Step(amount=1),uuid.uuid4());raise AssertionError('writer bypassed retained root error receipt admission')
                except grpc.RpcError as error:assert error.code()==grpc.StatusCode.DEADLINE_EXCEEDED,error
            if case=='abort-ack-loss':assert not any(db.IdempotentMutation.FromString(bytes.fromhex(raw)).request_fingerprint.startswith(b'reboot.transaction.aborted-result.v1\0') for raw in observed[0]['receipts'])
            (dbfault/'release').touch();wait(t);assert t.returncode!=0
            rec.setdefault('native_ack_losses',[]).append(json.loads((dbfault/'ack-observed.json').read_text()));save()
            target_du=du
            stop(c);stop(d);stop(ld);d,ld=database(),database(True);c,cs=host(True);t,ts=host()
        if extra:
            if case in ['target-ack-loss','error-target-ack-loss']:until(ack.exists,t);wait(t);assert t.returncode!=0
            else:until(barrier.exists,t)
            before=snapshot(task);assert [x['value'] for x in before]==([0,0] if declared else [7,7]),before
            stop(t);stop(c);stop(d);stop(ld);d,ld=database(),database(True)
            c,cs=host(True)
            pre=work/'before-dispatch';t,ts=host(False,dict(REBOOT_TEST_OUTBOUND_WRITER_BEFORE_DISPATCH=str(pre)));until(pre.exists,t)
            assert txn('Apply',app.Step(amount=3),uuid.uuid4()).value==(3 if declared else 10)
            intervening=snapshot(task)
            if case=='authorization-reject':
                deny.touch();stop(t);t,ts=host(False,wait_ready=False);wait(t);assert t.returncode!=0;assert snapshot(task)==intervening;deny.unlink()
            else:stop(t)
            t,ts=host()
        result=canonical('wait',admitted['task_id'])
        if declared:assert result.get('declared') and result['observed']==7 and result['required']==4242,result
        else:assert result=={'response':{'value':'7'}},result
        final=snapshot(task)
        assert [x['value'] for x in final]==([3,3] if before and declared else [0,0] if declared else [10,10] if before else [7,7]),final
        assert not any(x['participants'] for x in final)
        assert lines().count('transaction-declared' if declared else 'transaction-apply')==(2 if case=='abort-ack-loss' else 1 if declared or before is None else 2),lines()
        assert db.Task.FromString(bytes.fromhex(final[0]['tasks'][0])).status==db.Task.COMPLETED
        # The remote participant never receives the root receipt identity.
        cdb=dg.DatabaseStub(grpc.insecure_channel(f'127.0.0.1:{dp}'))
        scoped=[m for page in cdb.RecoverIdempotentMutations(db.RecoverIdempotentMutationsRequest(state_type=task.state_type,state_ref=ref,workflow_id=task.task_uuid),timeout=5) for m in page.idempotent_mutations]
        assert len(scoped)==1
        bound=[db.IdempotentMutation.FromString(bytes.fromhex(raw)) for raw in final[0]['receipts'] if db.IdempotentMutation.FromString(bytes.fromhex(raw)).key==scoped[0].key]
        assert len(bound)==1 and bound[0].state_ref==ref and not bound[0].HasField('workflow_id')
        assert not any(db.IdempotentMutation.FromString(bytes.fromhex(raw)).key==scoped[0].key for raw in final[1]['receipts'])
        if declared:assert bound[0].request_fingerprint.startswith(b'reboot.transaction.aborted-result.v1\0') and bound[0].response.hex()==result['error'] and not final[1]['pending']
        else:assert len(bound[0].request_fingerprint)==32 and app.Value.FromString(bound[0].response).value==7
        checkpoint=[m.SerializeToString().hex() for m in scoped]
        if case=='crossactor':
            original_key=uuid.UUID(bytes=scoped[0].key)
            assert txn('Apply',app.Step(amount=2),original_key,True).value==9
            assert txn('Apply',app.Step(amount=7),original_key).value==7
            for method,amount in [('Apply',8),('Fail',7)]:
                try:txn(method,app.Step(amount=amount),original_key);raise AssertionError('root receipt accepted changed RPC/payload')
                except grpc.RpcError as error:assert error.code()==grpc.StatusCode.FAILED_PRECONDITION,error
            final=snapshot(task)
            assert [x['value'] for x in final]==[7,9]
        assert canonical('spawn',key)==admitted
        assert canonical('spawn',key,8,good=False).get('exit')!=0
        changed_schedule=(datetime.datetime.now(datetime.timezone.utc)+datetime.timedelta(hours=1)).isoformat()
        assert canonical('spawn',key,7,changed_schedule,good=False).get('exit')!=0
        assert snapshot(task)==final
        # Retained completed storage must not duplicate root or child execution.
        counts=lines();stop(t,ts);stop(c,cs);stop(d);stop(ld);d,ld=database(),database(True);c,cs=host(True);t,ts=host()
        assert canonical('wait',admitted['task_id'])==result and snapshot(task)==final and lines()==counts
        stop(t,ts);stop(c,cs)
        if proxy:proxy.terminate();wait(proxy);assert proxy.returncode==0
        if dbproxy:dbproxy.terminate();wait(dbproxy);assert dbproxy.returncode==0
        stop(d);stop(ld);stop(planner)
        cases.append(dict(case=case,admission=admitted,before=before,final=final,result=result,source_checkpoints=checkpoint,events=lines(),plan=plan.SerializeToString().hex()));save()
    rec['complete']=True
except BaseException as error:
    rec['error']=repr(error)
    try:rec['failure_snapshot']=snapshot(task);rec['failure_events']=lines()
    except Exception as inspection:rec['failure_inspection_error']=repr(inspection)
    raise
finally:
    for child in sorted(children,key=lambda c:c['role']=='database'):
        if not child['waited_by_parent']:stop(child['process'])
    rec['all_original_children_waited']=bool(children) and all(c['waited_by_parent'] for c in children);save()
print(json.dumps(dict(complete=rec['complete'],cases=len(cases),children=len(children))))
