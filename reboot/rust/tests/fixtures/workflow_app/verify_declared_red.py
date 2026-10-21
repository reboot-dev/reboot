"""Read native RED independently; an arbitrary failed process is not a control."""
import hashlib,json,os,sys
from pathlib import Path
root=Path(sys.argv[1]);old=json.loads((root/'old-declared-raw/receipt.json').read_text());replay=json.loads((root/'skip-error-raw/receipt.json').read_text())
for record in [old,replay]:
 assert not record['complete'] and record['children'] and record['all_original_children_waited']
 assert all(c['waited_by_parent'] for c in record['children'])
assert any('canonical task admission is unsupported by transaction adapters' in Path(c['log']).read_text() for c in old['children'])
sys.path[:0]=[str(root/'skip-error-raw/python-protos'),os.environ['CANONICAL_PYTHON_RUNFILES']]
from rbt.v1alpha1 import database_pb2 as db
from google.rpc import status_pb2
from workflow.v1 import workflow_pb2 as app
snapshot=replay['failure_snapshot'];assert snapshot['values']==[3,3] and len(snapshot['pending'])==1
native=db.Task.FromString(bytes.fromhex(snapshot['tasks'][0]));assert native.status==db.Task.COMPLETED and native.method=='Fail'
status=status_pb2.Status();assert native.error.Unpack(status) and status.code==10
error=app.BelowThreshold();assert len(status.details)==1 and status.details[0].Unpack(error)
assert (error.required,error.observed)==(4242,10)
assert replay['failure_events'].count('transaction-declared')==2
mutations=json.loads((root/'mutants/mutations.json').read_text())
for name,row in mutations.items():
 for kind in ['original','modified']:
  assert hashlib.sha256((root/'mutants'/f'{name}.{kind}').read_bytes()).hexdigest()==row[kind+'_sha256']
result=dict(old_fence=True,replayed_wrong_durable_error=dict(code=status.code,required=error.required,observed=error.observed,values=snapshot['values']),native_original_child_waits=[len(r['children']) for r in [old,replay]],mutations=mutations)
(root/'red-readback.json').write_text(json.dumps(result,indent=2));print(json.dumps(result))
