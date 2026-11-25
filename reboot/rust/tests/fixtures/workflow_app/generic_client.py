"""Actual generated Reboot Python plain reader/writer task client."""
import asyncio,datetime,json,sys,uuid
from google.protobuf.json_format import MessageToDict
from rbt.v1alpha1.tasks_pb2 import TaskId
from rbt.v1alpha1 import tasks_pb2_grpc  # generated Task awaiting imports package attribute
from reboot.aio.external import ExternalContext
from reboot.aio.caller_id import CallerID
from reboot.aio.types import ApplicationId
from workflow.v1.workflow_rbt import Remote

async def main():
    action,url,key,method,amount,schedule,out=sys.argv[1:]
    context=ExternalContext(name='generic-rust-task',url=url,bearer_token='generic-service',caller_id=CallerID(application_id=ApplicationId('a0000000001')))
    if action=='spawn':
        when=None if not schedule else datetime.datetime.fromisoformat(schedule)
        reference=Remote.ref('target').idempotently(key=uuid.UUID(key)).spawn(when=when)
        call=getattr(reference,method.lower())
        task=await (call(context) if method=='Query' else call(context,amount=int(amount)))
        result={'task_id':task.task_id.SerializeToString().hex()}
    else:
        task=getattr(Remote,method+'Task').retrieve(context,task_id=TaskId.FromString(bytes.fromhex(key)))
        try:
            response=await task
            result={'response':MessageToDict(response,preserving_proto_field_name=True)}
        except getattr(Remote,method+'Aborted') as error:
            result={'error':error.to_status().SerializeToString().hex(),'kind':type(error).__name__}
    with open(out,'w') as f:json.dump(result,f)
    print(json.dumps(result),flush=True)
asyncio.run(asyncio.wait_for(main(),15))
