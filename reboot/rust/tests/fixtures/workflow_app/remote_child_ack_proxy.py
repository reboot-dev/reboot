"""Forward real child/control RPCs; lose one successful child terminal ACK."""
import concurrent.futures, json, os, signal, sys, threading
from pathlib import Path
import grpc
listen,target,output=sys.argv[1:4]
out=Path(output); lock=threading.Lock(); lost=False
class Proxy(grpc.GenericRpcHandler):
    def service(self, details):
        def call(request, context):
            global lost
            try:
                response,ack=grpc.insecure_channel(target).unary_unary(details.method).with_call(request,metadata=context.invocation_metadata(),timeout=15)
            except grpc.RpcError as error:
                context.set_trailing_metadata(error.trailing_metadata() or [])
                context.abort(error.code(),error.details())
            with lock:
                should_lose=details.method=='/workflow.v1.AtomicLedgerMethods/Apply' and not lost
                if should_lose:lost=True
            if should_lose:
                metadata=[(k,v.hex() if isinstance(v,bytes) else v) for k,v in context.invocation_metadata()]
                record=dict(path=details.method,request=request.hex(),response=response.hex(),request_metadata=metadata,actual_target_ack=True,proxy_pid=os.getpid())
                temp=out.with_suffix('.tmp');temp.write_text(json.dumps(record,indent=2));os.replace(temp,out)
                context.abort(grpc.StatusCode.UNAVAILABLE,'lost actual remote child terminal ACK')
            context.send_initial_metadata(ack.initial_metadata() or [])
            context.set_trailing_metadata(ack.trailing_metadata() or [])
            return response
        return grpc.unary_unary_rpc_method_handler(call,request_deserializer=lambda b:b,response_serializer=lambda b:b)
server=grpc.server(concurrent.futures.ThreadPoolExecutor(max_workers=8));server.add_generic_rpc_handlers([Proxy()]);assert server.add_insecure_port(listen);server.start()
def stop(*_):server.stop(1).wait();raise SystemExit(0)
for sig in [signal.SIGTERM,signal.SIGINT,signal.SIGHUP]:signal.signal(sig,stop)
server.wait_for_termination()
