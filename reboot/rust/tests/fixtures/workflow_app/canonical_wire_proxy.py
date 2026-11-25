"""Transparent real application/Tasks gRPC wire recorder; no synthesized success."""
from concurrent.futures import ThreadPoolExecutor
import json
import os
from pathlib import Path
import signal
import sys
import threading
import uuid
import grpc

upstream,listen,directory=sys.argv[1:4]
mutate_uuid=len(sys.argv)>4 and sys.argv[4]=='mutate-uuid'
root=Path(directory); lock=threading.Lock(); stopping=threading.Event(); sequence=0
channel=grpc.insecure_channel(upstream)
def metadata(values):
    return [(k,{'hex':v.hex()} if isinstance(v,bytes) else v) for k,v in (values or [])]
def save(record):
    with lock:
        with (root/'application-wire.jsonl').open('a') as f:
            f.write(json.dumps(record)+'\n'); f.flush(); os.fsync(f.fileno())
class Proxy(grpc.GenericRpcHandler):
    def service(self, details):
        path=details.method
        def unary(body,context):
            global sequence
            with lock: n=sequence; sequence+=1
            record=dict(sequence=n,path=path,request=body.hex(),request_metadata=metadata(context.invocation_metadata()),upstream_real_response=False)
            save(record|{'phase':'request'})
            try:
                response,call=channel.unary_unary(path).with_call(body,metadata=context.invocation_metadata(),timeout=20)
            except grpc.RpcError as failure:
                save(record|{'phase':'error','code':failure.code().name,'details':failure.details(),'trailing_metadata':metadata(failure.trailing_metadata())})
                context.set_trailing_metadata(failure.trailing_metadata() or [])
                context.abort(failure.code(),failure.details())
                raise AssertionError('unreachable after gRPC abort')
            save(record|{'phase':'response','upstream_real_response':True,'response':response.hex(),'initial_metadata':metadata(call.initial_metadata()),'trailing_metadata':metadata(call.trailing_metadata())})
            context.send_initial_metadata(call.initial_metadata() or [])
            trailers=list(call.trailing_metadata() or [])
            if mutate_uuid and path=='/workflow.v1.LedgerMethods/Child':
                mutated=[]
                for k,v in trailers:
                    if k=='x-reboot-task-id-uuid':
                        original=uuid.UUID(v); changed=bytearray(original.bytes); changed[0]^=1
                        v=str(uuid.UUID(bytes=bytes(changed)))
                    mutated.append((k,v))
                save(record|{'phase':'mutated-trailers','original_trailing_metadata':metadata(trailers),'mutated_trailing_metadata':metadata(mutated),'upstream_real_response':True})
                trailers=mutated
            context.set_trailing_metadata(trailers)
            return response
        return grpc.unary_unary_rpc_method_handler(unary)
with ThreadPoolExecutor(max_workers=16) as pool:
    server=grpc.server(pool); server.add_generic_rpc_handlers([Proxy()]); assert server.add_insecure_port(listen)
    server.start()
    for sig in [signal.SIGTERM,signal.SIGINT]: signal.signal(sig,lambda *_:stopping.set())
    stopping.wait(); server.stop(0).wait(); channel.close()
