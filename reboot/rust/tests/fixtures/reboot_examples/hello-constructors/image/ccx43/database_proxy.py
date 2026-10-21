"""Transparent native Database transport fault, never an engine substitute.
Park only the first real CreateActor ACK after it is durably acknowledged by C++.
"""
import sys,threading,signal,json
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
root=Path('/opt/rbt.runfiles')
sys.path[:0]=[str(root/'com_github_reboot_dev_reboot'),str(root/'com_google_protobuf'),str(root/'googleapis')]+[str(p) for p in root.glob('rbt_pypi_*/site-packages')]
import grpc
from google.protobuf.message_factory import GetMessageClass
from rbt.v1alpha1 import database_pb2
channel=grpc.insecure_channel('hello-image-interrupt3-database:20000');stop=threading.Event();parked=threading.Event()
def handler(method):
 request=GetMessageClass(method.input_type);response=GetMessageClass(method.output_type);path='/'+method.containing_service.full_name+'/'+method.name
 if method.server_streaming:
  upstream=channel.unary_stream(path,request_serializer=request.SerializeToString,response_deserializer=response.FromString)
  def stream(body,context):
   try:yield from upstream(body,timeout=8)
   except grpc.RpcError as ex:context.set_trailing_metadata(ex.trailing_metadata() or []);context.abort(ex.code(),ex.details())
  return grpc.unary_stream_rpc_method_handler(stream,request_deserializer=request.FromString,response_serializer=response.SerializeToString)
 upstream=channel.unary_unary(path,request_serializer=request.SerializeToString,response_deserializer=response.FromString)
 def unary(body,context):
  try:
   result=upstream(body,timeout=8)
   if method.name=='CreateActor' and not parked.is_set():
    parked.set();Path('/proof/after-create').write_text('actual C++ CreateActor ACK before delivering to release app')
    print('DURABLE_CREATE_ACK_PARKED',flush=True)
    while not stop.wait(.05) and context.is_active():pass
   return result
  except grpc.RpcError as ex:context.set_trailing_metadata(ex.trailing_metadata() or []);context.abort(ex.code(),ex.details())
 return grpc.unary_unary_rpc_method_handler(unary,request_deserializer=request.FromString,response_serializer=response.SerializeToString)
service=database_pb2.DESCRIPTOR.services_by_name['Database']
with ThreadPoolExecutor(max_workers=8) as pool:
 server=grpc.server(pool);server.add_generic_rpc_handlers([grpc.method_handlers_generic_handler(service.full_name,{m.name:handler(m) for m in service.methods})]);server.add_insecure_port('0.0.0.0:20001');server.start()
 def signal_stop(sig,frame):stop.set()
 signal.signal(signal.SIGTERM,signal_stop);signal.signal(signal.SIGINT,signal_stop)
 while not stop.wait(.2):pass
 server.stop(3).wait();channel.close()
