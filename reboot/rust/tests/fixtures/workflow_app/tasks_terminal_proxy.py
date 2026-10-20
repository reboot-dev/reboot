"""Fault-only transparent proxy, mutating retained *real* canonical Wait bytes.

No task/state creation and no invented successful responses. Every mutant and
its exact upstream bytes are retained before release to the actual Rust client.
"""
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
from pathlib import Path
import signal
import sys
import threading

import grpc
from google.rpc import status_pb2
from rbt.v1alpha1 import tasks_pb2

upstream,listen,mode,directory=sys.argv[1:]
root=Path(directory); stopping=threading.Event(); lock=threading.Lock(); sequence=0
channel=grpc.insecure_channel(upstream)
class Proxy(grpc.GenericRpcHandler):
    def service(self, handler_call_details):
        path=handler_call_details.method
        call=channel.unary_unary(path)
        def unary(body,context):
            global sequence
            try:
                response,upstream_call=call.with_call(body,metadata=context.invocation_metadata(),timeout=15)
            except grpc.RpcError as failure:
                context.set_trailing_metadata(failure.trailing_metadata() or [])
                context.abort(failure.code(),failure.details())
                raise AssertionError('unreachable after gRPC abort')
            # Admission now uses application RPC trailers too. Preserve the real
            # upstream metadata on every pass-through path; mutate only Wait.
            context.send_initial_metadata(upstream_call.initial_metadata() or [])
            context.set_trailing_metadata(upstream_call.trailing_metadata() or [])
            if path!='/rbt.v1alpha1.Tasks/Wait': return response
            terminal=tasks_pb2.WaitResponse.FromString(response)
            rich=status_pb2.Status()
            assert terminal.response_or_error.error.Unpack(rich)
            assert rich.code==1 and rich.details[0].TypeName()=='rbt.v1alpha1.Cancelled'
            if mode=='wrong-code': rich.code=2
            elif mode=='malformed-detail': rich.details[0].value=b'\xff'
            elif mode!='rpc-cancelled': raise ValueError(mode)
            terminal.response_or_error.error.Pack(rich)
            mutant=terminal.SerializeToString()
            with lock:
                n=sequence; sequence+=1
                (root/f'wait-original-{n}.pb').write_bytes(response)
                (root/f'wait-mutant-{n}.pb').write_bytes(mutant)
                record=dict(path=path,mode=mode,original_sha256=hashlib.sha256(response).hexdigest(),mutant_sha256=hashlib.sha256(mutant).hexdigest(),upstream_real_response=True)
                (root/f'wait-mutation-{n}.json').write_text(json.dumps(record,indent=2))
            if mode=='rpc-cancelled':
                context.set_trailing_metadata((('grpc-status-details-bin',rich.SerializeToString()),))
                context.abort(grpc.StatusCode.CANCELLED,'real terminal used only as transport failure details')
            return mutant
        return grpc.unary_unary_rpc_method_handler(unary)
with ThreadPoolExecutor(max_workers=16) as pool:
    server=grpc.server(pool); server.add_generic_rpc_handlers([Proxy()]); assert server.add_insecure_port(listen)
    server.start()
    for sig in [signal.SIGTERM,signal.SIGINT]: signal.signal(sig,lambda *_:stopping.set())
    stopping.wait(); server.stop(0).wait(); channel.close()
