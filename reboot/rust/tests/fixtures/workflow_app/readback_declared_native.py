"""Independent native Task, root-error receipt and source-journal readback."""
import hashlib,json,os,sys
from pathlib import Path
root=Path(sys.argv[1]);raw=root/'declared-raw';receipt=json.loads((raw/'receipt.json').read_text())
assert receipt['complete'] and receipt['all_original_children_waited'] and receipt['children']
sys.path[:0]=[str(raw/'python-protos'),os.environ['CANONICAL_PYTHON_RUNFILES']]
from rbt.v1alpha1 import database_pb2 as db
from google.rpc import status_pb2
from google.protobuf import any_pb2
from workflow.v1 import workflow_pb2 as app
from database_ack_proxy import fields
url=b'type.googleapis.com/workflow.v1.BelowThreshold';schema=hashlib.sha256(len(url).to_bytes(8,'big')+url).digest()
request=app.Step(amount=7).SerializeToString();fp=hashlib.sha256(b'reboot.idempotency.request-fingerprint.v1\0'+b'workflow.v1.AtomicLedgerMethods.Fail\0'+request).digest()
expected_fp=b'reboot.transaction.aborted-result.v1\0'+fp+schema
rows=[]
for case in receipt['cases']:
 final=case['final'];native=db.Task.FromString(bytes.fromhex(final['tasks'][0]));assert native.method=='Fail' and native.request==request and native.status==db.Task.COMPLETED
 assert not final['participants']
 if case['case']=='payload-reject':
  assert final['values']==[0,0] and not final['pending'];rows.append(dict(case=case['case'],cancelled=True));continue
 status=status_pb2.Status();assert native.error.Unpack(status) and status.code==10
 error=app.BelowThreshold();assert len(status.details)==1 and status.details[0].Unpack(error) and (error.required,error.observed)==(4242,7)
 assert len(final['source_checkpoints'])==1
 source=db.IdempotentMutation.FromString(bytes.fromhex(final['source_checkpoints'][0]));assert source.workflow_id==native.task_id.task_uuid and len(source.request_fingerprint)==32 and not source.HasField('workflow_iteration')
 matches=[db.IdempotentMutation.FromString(bytes.fromhex(m)) for m in final['receipts'] if db.IdempotentMutation.FromString(bytes.fromhex(m)).key==source.key];assert len(matches)==1;target=matches[0]
 assert target.state_type==source.state_type==native.task_id.state_type and target.state_ref==source.state_ref==native.task_id.state_ref
 assert target.request_fingerprint==expected_fp and not target.HasField('workflow_id') and not target.HasField('workflow_iteration') and not target.task_ids
 assert target.response==native.error.value
 envelope=any_pb2.Any.FromString(source.response);assert envelope.type_url=='type.googleapis.com/reboot.rust.workflow.AtMostOnceResultV1'
 checkpoint=fields(envelope.value);assert checkpoint[1]==[1] and checkpoint[2]==[2] and checkpoint[4]==[1]
 result=any_pb2.Any.FromString(checkpoint[3][0]);assert result.type_url=='type.googleapis.com/workflow.v1.Value' and result.value==target.response
 pending=[db.Task.FromString(bytes.fromhex(t)) for t in final['pending']];assert all(t.method=='Query' for t in pending)
 rows.append(dict(case=case['case'],code=status.code,required=error.required,observed=error.observed,values=final['values'],pending_methods=[t.method for t in pending],source_workflow=source.workflow_id.hex(),target_key=target.key.hex(),target_fp=target.request_fingerprint.hex(),status_sha256=hashlib.sha256(target.response).hexdigest()))
assert len(rows)==10,rows
out=dict(cases=rows,original_child_waits=len(receipt['children']),all_original_children_waited=True,native_ack_losses=receipt.get('native_ack_losses',[]))
(root/'native-readback.json').write_text(json.dumps(out,indent=2));print(json.dumps(out))
