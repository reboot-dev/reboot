"""Drop one real declared root-error ACK after recording exact server bytes."""
import concurrent.futures,json,os,signal,sys,threading
from pathlib import Path
import grpc
listen,target,output=sys.argv[1:4];out=Path(output);lock=threading.Lock();lost=False
class Proxy(grpc.GenericRpcHandler):
 def service(self,details):
  if details.method!='/workflow.v1.AtomicLedgerMethods/Fail':return None
  def call(request,context):
   global lost
   try:
    return grpc.insecure_channel(target).unary_unary(details.method)(request,metadata=context.invocation_metadata(),timeout=15)
   except grpc.RpcError as error:
    with lock:should_lose=not lost;lost=True
    if should_lose:
     trailers=list(error.trailing_metadata() or [])
     assert any(k=='x-reboot-durable-declared-transaction' and v=='v1' for k,v in trailers),trailers
     p=out.with_suffix('.tmp');p.write_text(json.dumps(dict(path=details.method,request=request.hex(),code=error.code().name,details=error.details(),trailers=[(k,v.hex() if isinstance(v,bytes) else v) for k,v in trailers],actual_target_ack=True,proxy_pid=os.getpid()),indent=2));os.replace(p,out)
     context.abort(grpc.StatusCode.UNAVAILABLE,'lost actual declared transaction root ACK')
    context.set_trailing_metadata(error.trailing_metadata() or [])
    context.abort(error.code(),error.details())
  return grpc.unary_unary_rpc_method_handler(call,request_deserializer=lambda b:b,response_serializer=lambda b:b)
server=grpc.server(concurrent.futures.ThreadPoolExecutor(max_workers=8));server.add_generic_rpc_handlers([Proxy()]);server.add_insecure_port(listen);server.start()
def stop(*_):server.stop(1).wait();raise SystemExit(0)
signal.signal(signal.SIGTERM,stop);signal.signal(signal.SIGINT,stop)
server.wait_for_termination()
