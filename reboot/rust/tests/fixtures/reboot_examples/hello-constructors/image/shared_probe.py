"""One unmodified public gRPC transcript for both original Python and Rust."""
import sys,os,json,uuid,time,concurrent.futures
from pathlib import Path
root=Path('/opt/rbt.runfiles')
sys.path[:0]=[str(root/'com_github_reboot_dev_reboot'),str(root/'com_google_protobuf'),str(root/'googleapis'),str(root/'buf_deps_envoy'),'/example/hello-constructors/backend/api']+[str(p) for p in root.glob('rbt_pypi_*/site-packages')]
import grpc
from google.protobuf import json_format
from google.rpc import status_pb2
from hello_constructors.v1 import hello_pb2,hello_pb2_grpc
from reboot.aio.types import StateRef
report={'endpoint':sys.argv[1],'cases':{},'complete':False}
channel=grpc.insecure_channel(sys.argv[1]);client=hello_pb2_grpc.HelloMethodsStub(channel)
base=uuid.UUID(int=(((time.time_ns()//1000000)+3600000)<<80)|(7<<76)|(2<<62))
run=sys.argv[2] if len(sys.argv)>2 else 'shared-001'
def key(n):return str(uuid.UUID(int=base.int+n))
keys={n:key(n) for n in range(1,100)}
# Reuse identical keys on the two implementations, including restart invocations.
base=uuid.UUID(sys.argv[3]) if len(sys.argv)>3 else base
keys={n:key(n) for n in range(1,100)}
def call(method,actor,body=None,k=None,token=None):
 request=getattr(hello_pb2,method+'Request')(**(body or {}));metadata=[('x-reboot-state-ref',str(StateRef.from_id('hello_constructors.v1.Hello',actor)))]
 if k is not None:metadata.append(('x-reboot-idempotency-key',keys[k]))
 if token is not None:metadata.append(('authorization','Bearer '+token))
 try:
  response=getattr(client,method)(request,metadata=metadata,timeout=8)
  return {'ok':True,'response':json_format.MessageToDict(response,preserving_proto_field_name=True)}
 except grpc.RpcError as ex:
  rich=[]; rich_code=None; rich_message=None
  for k,v in ex.trailing_metadata() or []:
   if k=='grpc-status-details-bin':
    s=status_pb2.Status.FromString(v); rich_code=s.code; rich_message=s.message
    rich=[{'type_url':d.type_url,'value_hex':d.value.hex()} for d in s.details]
  return {'ok':False,'code':ex.code().name,'message':ex.details(),'details':rich,'rich_code':rich_code,'rich_message':rich_message}
def record(name,v): report['cases'][name]=v;print(json.dumps({name:v}),flush=True);return v
def messages(actor):return call('Messages',actor)
expected=['first message','second message','','duplicate','duplicate','雪 🦀','  whitespace\n']
if '--boot' in sys.argv:
 record('startup',messages('reboot-hello'))
 assert report['cases']['startup']=={'ok':True,'response':{'messages':['Welcome! This message was sent by a constructor.','This message was sent after construction!']}}
 report['complete']=True
 print('TRANSCRIPT='+json.dumps(report,ensure_ascii=False),flush=True)
 sys.exit(0)
if '--restart' in sys.argv:
 record('startup',messages('reboot-hello'))
 record('messages',messages(run+'-feature'))
 record('create-replay',call('Create',run+'-feature',{'initial_message':'first message'},2))
 record('send-replay',call('Send',run+'-feature',{'message':'second message'},4))
 record('after-replays',messages(run+'-feature'))
 assert report['cases']['messages']=={'ok':True,'response':{'messages':expected}}
 assert report['cases']['after-replays']==report['cases']['messages']
 assert report['cases']['create-replay']==report['cases']['send-replay']=={'ok':True,'response':{}}
 assert report['cases']['startup']['response']['messages']==['Welcome! This message was sent by a constructor.','This message was sent after construction!']
 report['complete']=True
 print('TRANSCRIPT='+json.dumps(report,ensure_ascii=False),flush=True)
 sys.exit(0)
try:
 record('startup',messages('reboot-hello'))
 actor=run+'-feature'
 record('missing-reader',messages(actor))
 record('missing-send',call('Send',actor,{'message':'absent'},1))
 record('create',call('Create',actor,{'initial_message':'first message'},2))
 record('create-replay',call('Create',actor,{'initial_message':'first message'},2))
 record('duplicate-constructor',call('Create',actor,{'initial_message':'not appended'},3))
 record('send',call('Send',actor,{'message':'second message'},4))
 record('send-replay',call('Send',actor,{'message':'second message'},4))
 record('changed-payload',call('Send',actor,{'message':'DIFFERENT'},4))
 record('wrong-method',call('Send',actor,{'message':'first message'},2))
 for i,m in enumerate(['','duplicate','duplicate','雪 🦀','  whitespace\n']):record('fidelity-'+str(i),call('Send',actor,{'message':m},10+i))
 record('messages',messages(actor));record('reader-repeat',messages(actor))
 record('supplied-token',call('Messages',actor,token='qualification-noncredential'))
 other=run+'-isolation'
 record('other-create',call('Create',other,{'initial_message':''},20))
 with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
  results=list(pool.map(lambda i:call('Send',other,{'message':'concurrent-'+str(i)},30+i),range(8)))
 record('concurrent-responses',results)
 v=messages(other)
 if v.get('ok'):v['response']['messages']=sorted(v['response'].get('messages',[]))
 record('isolation',v)
 record('final-original',messages(actor))
 c=report['cases']
 assert c['startup']=={'ok':True,'response':{'messages':['Welcome! This message was sent by a constructor.','This message was sent after construction!']}}
 assert c['messages']==c['reader-repeat']==c['final-original']==c['supplied-token']=={'ok':True,'response':{'messages':expected}}
 assert c['isolation']=={'ok':True,'response':{'messages':['']+['concurrent-'+str(i) for i in range(8)]}}
 for name in ['create','create-replay','send','send-replay','other-create']+['fidelity-'+str(i) for i in range(5)]:assert c[name]=={'ok':True,'response':{}},(name,c[name])
 assert c['concurrent-responses']==[{'ok':True,'response':{}}]*8
 for name,code,kind,value,message in [
  ('missing-reader',grpc.StatusCode.ABORTED,'StateNotConstructed','',''),
  ('missing-send',grpc.StatusCode.ABORTED,'StateNotConstructed','0801',''),
  ('duplicate-constructor',grpc.StatusCode.ABORTED,'StateAlreadyConstructed','',''),
  ('changed-payload',grpc.StatusCode.FAILED_PRECONDITION,'FailedPrecondition','','Idempotency key was reused with a different request'),
  ('wrong-method',grpc.StatusCode.FAILED_PRECONDITION,'FailedPrecondition','','Idempotency key was reused with a different request')]:
  assert c[name]=={'ok':False,'code':code.name,'message':message,'details':[{'type_url':'type.googleapis.com/rbt.v1alpha1.'+kind,'value_hex':value}],'rich_code':code.value[0],'rich_message':message},(name,c[name])
 report['complete']=True
finally:
 print('TRANSCRIPT='+json.dumps(report,ensure_ascii=False),flush=True)
