"""One actual public transaction response ACK loss; no fabricated responses."""
import concurrent.futures,json,os,signal,sys,threading
from pathlib import Path
import grpc
listen,target,output=sys.argv[1:4];out=Path(output);lock=threading.Lock();lost=False
class Proxy(grpc.GenericRpcHandler):
 def service(self,details):
  if details.method!='/workflow.v1.AtomicLedgerMethods/Apply':return None
  def call(request,context):
   global lost
   response,ack=grpc.insecure_channel(target).unary_unary(details.method).with_call(request,metadata=context.invocation_metadata(),timeout=15)
   with lock:
    should_lose=not lost;lost=True
   if should_lose:
    p=out.with_suffix('.tmp');p.write_text(json.dumps(dict(path=details.method,request=request.hex(),response=response.hex(),actual_target_ack=True,proxy_pid=os.getpid()),indent=2));os.replace(p,out)
    context.abort(grpc.StatusCode.UNAVAILABLE,'lost actual transaction root response ACK')
   return response
  return grpc.unary_unary_rpc_method_handler(call,request_deserializer=lambda b:b,response_serializer=lambda b:b)
server=grpc.server(concurrent.futures.ThreadPoolExecutor(max_workers=8));server.add_generic_rpc_handlers([Proxy()]);server.add_insecure_port(listen);server.start()
def stop(*_):server.stop(1).wait();raise SystemExit(0)
signal.signal(signal.SIGTERM,stop);signal.signal(signal.SIGINT,stop)
server.wait_for_termination()
