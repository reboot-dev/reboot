"""Actual generated Python spawn(Fail) and its declared typed task terminal."""
import asyncio,datetime,json,sys,uuid
from google.protobuf.json_format import MessageToDict
from rbt.v1alpha1.tasks_pb2 import TaskId
from rbt.v1alpha1 import tasks_pb2_grpc
from reboot.aio.external import ExternalContext
from reboot.aio.caller_id import CallerID
from reboot.aio.types import ApplicationId
from workflow.v1.workflow_rbt import AtomicLedger
from workflow.v1 import workflow_pb2 as app
async def main():
 action,url,key,amount,schedule,out=sys.argv[1:7]
 context=ExternalContext(name='declared-transaction-task',url=url,bearer_token='spawn-service',caller_id=CallerID(application_id=ApplicationId('a0000000001')))
 if action=='spawn':
  when=datetime.datetime.fromisoformat(schedule) if schedule else None
  task=await AtomicLedger.ref('atomic').idempotently(key=uuid.UUID(key)).spawn(when=when).fail(context,amount=int(amount))
  result={'task_id':task.task_id.SerializeToString().hex()}
 else:
  task=AtomicLedger.FailTask.retrieve(context,task_id=TaskId.FromString(bytes.fromhex(key)))
  try:result={'response':MessageToDict(await task,preserving_proto_field_name=True)}
  except AtomicLedger.FailAborted as error:
   status=error.to_status(); detail=app.BelowThreshold()
   typed=len(status.details)==1 and status.details[0].Unpack(detail)
   result={'error':status.SerializeToString().hex(),'kind':type(error).__name__,'declared':typed}
   if typed:result.update(required=detail.required,observed=detail.observed)
 with open(out,'w') as f:json.dump(result,f)
 print(json.dumps(result),flush=True)
asyncio.run(asyncio.wait_for(main(),15))
