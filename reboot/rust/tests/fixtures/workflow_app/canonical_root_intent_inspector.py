"""Independent decoder of persisted root intent, never a receipt/decision."""
import uuid
from google.protobuf import descriptor_pb2, descriptor_pool, message_factory
f=descriptor_pb2.FileDescriptorProto(name='root_intent_inspection.proto',package='inspection',syntax='proto3')
member=f.message_type.add(name='Member')
for name,number in [('state_type',1),('state_ref',2),('method',3)]:
    member.field.add(name=name,number=number,type=9,label=1)
record=f.message_type.add(name='Record')
for name,number,kind,label in [('root',1,12,1),('workflow',2,12,1),('iteration',3,3,1),('members',4,11,3),('errors',5,9,3),('zero_timestamp_verified',6,8,1),('receipt_key',7,12,1),('recovery_claimed',8,8,1),('recovery_retired',9,8,1)]:
    field=record.field.add(name=name,number=number,type=kind,label=label)
    if name=='members':field.type_name='.inspection.Member'
pool=descriptor_pool.DescriptorPool();pool.Add(f)
Record=message_factory.GetMessageClass(pool.FindMessageTypeByName('inspection.Record'))
def inspect(snapshot, db, task):
    rows=[db.IdempotentMutation.FromString(bytes.fromhex(raw)) for raw in snapshot[0]['receipts']]
    rows=[m for m in rows if m.request_fingerprint.startswith(b'reboot.canonical.root-attempt.v1\0')]
    assert len(rows)==1,('expected exactly one root intent',len(rows))
    row=rows[0];record=Record.FromString(row.response)
    assert row.state_type==task.state_type and row.state_ref==task.state_ref
    assert not row.HasField('workflow_id') and not row.HasField('workflow_iteration') and not row.task_ids
    assert record.workflow==task.task_uuid
    assert len(record.root)==16 and uuid.UUID(bytes=record.root).int
    members=[dict(state_type=m.state_type,state_ref=m.state_ref,method=m.method) for m in record.members]
    assert members==sorted(members,key=lambda m:(m['state_type'],m['state_ref'],m['method']))
    assert len({tuple(m.values()) for m in members})==len(members)
    return dict(root=str(uuid.UUID(bytes=record.root)),workflow=record.workflow.hex(),members=members,errors=list(record.errors),zero_timestamp_verified=record.zero_timestamp_verified,receipt_key=record.receipt_key.hex(),recovery_claimed=record.recovery_claimed,recovery_retired=record.recovery_retired,mutation=row.SerializeToString().hex())
