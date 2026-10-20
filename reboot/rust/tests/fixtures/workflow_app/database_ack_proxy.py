"""Transparent raw-wire Database proxy: drop only an observed real mutation ACK.
No generated database substitute, state seeding, mutation retry, or fake response.
Requires grpcio in the invoking Python environment. Fixture-only wire inspection
uses the canonical StoreRequest/IdempotentMutation/Any/checkpoint field numbers.
"""
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
import os
from pathlib import Path
import signal
import sys
import threading

import grpc


def fields(data):
    """Decode protobuf wire fields without changing forwarded request bytes."""
    def varint(pos):
        value = 0
        for shift in range(0, 70, 7):
            byte = data[pos]
            pos += 1
            value |= (byte & 127) << shift
            if byte < 128:
                return value, pos
        raise ValueError('invalid varint')
    pos, result = 0, {}
    while pos < len(data):
        key, pos = varint(pos)
        tag, wire = key >> 3, key & 7
        if wire == 0:
            value, pos = varint(pos)
        elif wire == 2:
            size, pos = varint(pos)
            value, pos = data[pos:pos + size], pos + size
            assert pos <= len(data)
        elif wire in (1, 5):
            size = 8 if wire == 1 else 4
            value, pos = data[pos:pos + size], pos + size
        else:
            raise ValueError('unsupported fixture wire field')
        result.setdefault(tag, []).append(value)
    return result


def boundary(body):
    store = fields(body)
    if 4 not in store:
        return None
    mutation = fields(store[4][0])
    if os.environ.get('GENERIC_TASK_FAULT') == '1' and mutation.get(4) == [b'workflow.v1.Remote']:
        if store.get(2):
            return 'generic-spawn'
        if store.get(1) and mutation.get(2, [b''])[0]:
            return 'generic-writer'
    if (mutation.get(4) == [b'workflow.v1.Remote'] and
            mutation.get(8, [b''])[0].startswith(b'reboot.ordinary-writer.declared-error.v1\0')):
        assert not store.get(1) and not store.get(2), 'declared error must discard actor/task effects'
        return 'declared-target'
    if (mutation.get(4) == [b'workflow.v1.AtomicLedger'] and
            mutation.get(8, [b''])[0].startswith(b'reboot.transaction.aborted-result.v1\0')):
        assert not store.get(1) and not store.get(2) and not store.get(5), 'aborted root receipt cannot commit actors/tasks/transaction'
        return 'transaction-error-target'
    if mutation.get(4) == [b'workflow.v1.AtomicLedger']:
        envelope = fields(mutation[2][0])
        if envelope.get(1) == [b'type.googleapis.com/reboot.rust.workflow.AtMostOnceResultV1']:
            checkpoint = fields(envelope.get(2, [b''])[0])
            return {1:'transaction-source-started',2:'transaction-source-stored'}.get(checkpoint.get(2,[0])[0])
    if mutation.get(4) == [b'workflow.v1.Remote'] and store.get(1):
        return 'target'
    if mutation.get(4) == [b'workflow.v1.Ledger']:
        envelope = fields(mutation[2][0])
        if store.get(2) and envelope.get(2) == [b'Child'] and envelope.get(3) == [1]:
            return 'spawn'
        if store.get(1) and envelope.get(1) == [7]:
            # Taskless store_type retains the raw Value response, not Any.
            return 'taskless'
        if envelope.get(1) == [b'type.googleapis.com/reboot.rust.workflow.AtMostOnceResultV1']:
            checkpoint = fields(envelope.get(2, [b''])[0])
            return {1: 'started', 2: 'stored'}.get(checkpoint.get(2, [0])[0])
    return None


def main():
    upstream, listen, selected, directory = sys.argv[1:]
    root = Path(directory)
    channel = grpc.insecure_channel(upstream)
    stopping, claimed = threading.Event(), threading.Event()
    lock = threading.Lock()
    streams = {'Preload', 'Recover', 'RecoverIdempotentMutations', 'ExportStreamed'}

    class Proxy(grpc.GenericRpcHandler):
        def service(self, handler_call_details):
            path = handler_call_details.method
            if not path.startswith('/rbt.v1alpha1.Database/'):
                return None
            method = path.rsplit('/', 1)[1]
            if method in streams:
                call = channel.unary_stream(path)
                def stream(body, context):
                    try:
                        yield from call(body)
                    except grpc.RpcError as error:
                        context.set_trailing_metadata(error.trailing_metadata() or [])
                        context.abort(error.code(), error.details())
                return grpc.unary_stream_rpc_method_handler(stream)
            call = channel.unary_unary(path)
            def unary(body, context):
                try:
                    if method == 'Store':
                        with lock:
                            with (root / 'store-attempts.jsonl').open('a') as output:
                                output.write(json.dumps({'request_sha256': hashlib.sha256(body).hexdigest(),
                                                         'boundary': boundary(body)}) + '\n')
                    # Fault is strictly AFTER the upstream real RPC succeeded.
                    response = call(body)
                    with lock:
                        drop = not claimed.is_set() and (
                            (method == 'Store' and boundary(body) == selected) or
                            (method == 'CompleteTask' and selected in ['cancel', 'cancel-hold', 'cancel-hold-then-loss']) or
                            (method == 'TransactionParticipantAbort' and selected == 'transaction-abort'))
                        second = (method == 'CompleteTask' and selected == 'cancel-hold-then-loss'
                                  and claimed.is_set() and not (root / 'second-ack-observed.json').exists())
                        if drop:
                            claimed.set()
                    if drop or second:
                        if method in ['Store','CompleteTask']:assert fields(body).get(2 if method == 'CompleteTask' else 7) == [1], 'fault requires synchronous mutation'
                        prefix=('second-' if second else '')+('complete-task' if method == 'CompleteTask' else 'store')
                        if method == 'CompleteTask': assert fields(response).get(1)==[1], 'native completion CAS must have won'
                        (root / f'{prefix}-request.pb').write_bytes(body)
                        (root / f'{prefix}-response.pb').write_bytes(response)
                        stem='second-' if second else ''
                        marker=root / f'{stem}ack-observed.json.tmp'
                        marker.write_text(json.dumps({
                            'boundary': selected, 'real_store_ack_observed': method == 'Store',
                            'method': method, 'real_native_ack_observed': True,
                            'request_sha256': hashlib.sha256(body).hexdigest(),
                            'response_sha256': hashlib.sha256(response).hexdigest(),
                            'downstream_success_delivered': False,
                        }, indent=2))
                        with marker.open('rb') as f: os.fsync(f.fileno())
                        os.replace(marker,root / f'{stem}ack-observed.json')
                        while not (root / f'{stem}release').exists() and not stopping.wait(.01) and context.is_active():
                            pass
                        if selected in ['cancel-hold', 'cancel-hold-then-loss'] and not second:
                            (root / 'ack-delivered').write_text('original native response released unchanged')
                            return response
                        context.abort(grpc.StatusCode.UNAVAILABLE, 'injected lost real native ACK')
                    return response
                except grpc.RpcError as error:
                    context.set_trailing_metadata(error.trailing_metadata() or [])
                    context.abort(error.code(), error.details())
            return grpc.unary_unary_rpc_method_handler(unary)

    with ThreadPoolExecutor(max_workers=16) as pool:
        server = grpc.server(pool)
        server.add_generic_rpc_handlers([Proxy()])
        assert server.add_insecure_port(listen)
        server.start()
        signal.signal(signal.SIGTERM, lambda *_: stopping.set())
        signal.signal(signal.SIGINT, lambda *_: stopping.set())
        stopping.wait()
        server.stop(0).wait()
        channel.close()


if __name__ == '__main__':
    main()
