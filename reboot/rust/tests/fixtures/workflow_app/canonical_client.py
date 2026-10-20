"""Actual generated Reboot Python task creation and typed Task awaiting client."""
import asyncio
import datetime
import json
import sys
import uuid
from google.protobuf.json_format import MessageToDict
from rbt.v1alpha1.tasks_pb2 import TaskId
# The canonical template references the package attribute at await time. Import
# its real generated Tasks service explicitly (as a hosted Python app also does).
from rbt.v1alpha1 import tasks_pb2_grpc  # noqa: F401
from reboot.aio.external import ExternalContext
from reboot.aio.caller_id import CallerID
from reboot.aio.types import ApplicationId
from workflow.v1.workflow_rbt import Ledger

async def main():
    action,url,key,amount,schedule,out=sys.argv[1:7]
    method=sys.argv[7] if len(sys.argv)>7 else 'Child'
    context=ExternalContext(name='canonical-rust-admission',url=url,bearer_token='spawn-service',caller_id=CallerID(application_id=ApplicationId('a0000000001')))
    if action=='spawn':
        when=None if not schedule else datetime.datetime.fromisoformat(schedule)
        reference=Ledger.ref('child').idempotently(key=uuid.UUID(key)).spawn(when=when)
        task=await getattr(reference,{'Child':'child','First':'first','ScheduleWork':'schedule_work','Run':'run'}[method])(context,amount=int(amount))
        result={'task_id':task.task_id.SerializeToString().hex()}
    else:
        task=getattr(Ledger,method+'Task').retrieve(context,task_id=TaskId.FromString(bytes.fromhex(key)))
        try:
            response=await task
            result={'response':MessageToDict(response,preserving_proto_field_name=True)}
        except getattr(Ledger,method+'Aborted') as error:
            result={'error':error.to_status().SerializeToString().hex(),'kind':type(error).__name__}
    with open(out,'w') as f: json.dump(result,f)
    print(json.dumps(result),flush=True)

asyncio.run(asyncio.wait_for(main(),15))
