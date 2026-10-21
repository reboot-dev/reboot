"""Pinned-image public-gRPC load generator; never calls a private engine API."""
import concurrent.futures
import json
import os
from pathlib import Path
import resource
import sys
import time
import uuid

root = Path('/opt/rbt.runfiles')
sys.path[:0] = [str(root / 'com_github_reboot_dev_reboot'), str(root / 'com_google_protobuf'), str(root / 'googleapis'), str(root / 'buf_deps_envoy'), '/example/hello-constructors/backend/api'] + [str(p) for p in root.glob('rbt_pypi_*/site-packages')]
import grpc
from hello_constructors.v1 import hello_pb2, hello_pb2_grpc
from reboot.aio.types import StateRef

PAYLOAD = 'x' * 64
COUNTS = {'reader': 10000, 'single_send': 1000, 'many_send': 2000, 'replay': 10000}
CONCURRENCY = 8


def main():
    endpoint, prefix, mode = sys.argv[1:4]
    base = uuid.UUID(sys.argv[4])
    channel = grpc.insecure_channel(endpoint)
    grpc.channel_ready_future(channel).result(timeout=60)
    stub = hello_pb2_grpc.HelloMethodsStub(channel)

    def key(n):
        return str(uuid.UUID(int=base.int + n))

    def call(method, actor, body=None, identity=None):
        md = [('x-reboot-state-ref', str(StateRef.from_id('hello_constructors.v1.Hello', actor)))]
        if identity is not None:
            md.append(('x-reboot-idempotency-key', key(identity)))
        return getattr(stub, method)(getattr(hello_pb2, method + 'Request')(**(body or {})), metadata=md, timeout=8)

    def actor(case, i=0, warm=False):
        return prefix + '-' + ('warm-' if warm else '') + case + '-' + str(i)

    def seed(case, warm=False):
        n = 32 if case == 'many_send' else 1
        offset = (1000000 if warm else 2000000) + list(COUNTS).index(case) * 10000
        for i in range(n):
            call('Create', actor(case, i, warm), {'initial_message': PAYLOAD}, offset + i * 100)
        if case == 'reader':
            for j in range(15):
                call('Send', actor(case, 0, warm), {'message': PAYLOAD}, offset + 1 + j)
        if case == 'replay':
            call('Send', actor(case, 0, warm), {'message': PAYLOAD}, offset + 1)

    def verify():
        # Same acknowledged Send identity/payload, including after full engine restart.
        call('Send', actor('replay'), {'message': PAYLOAD}, 2030001)
        rows = []
        for case, count in COUNTS.items():
            n = 32 if case == 'many_send' else 1
            for i in range(n):
                expected = 16 if case == 'reader' else 2 if case == 'replay' else 1 + (count // n + (i < count % n))
                response = call('Messages', actor(case, i))
                assert list(response.messages) == [PAYLOAD] * expected, (case, i, len(response.messages), expected)
                rows.append({'case': case, 'actor': i, 'messages': expected, 'protobuf_bytes': len(response.SerializeToString())})
        return rows

    if mode == 'verify':
        print(json.dumps({'verified': verify()})); return
    if mode == 'seed':
        for case in COUNTS:
            seed(case); seed(case, True)
        print(json.dumps({'seeded': True})); return
    case = mode
    warm = '--warmup' in sys.argv
    total = 100 if warm else COUNTS[case]
    method = 'Messages' if case == 'reader' else 'Send'
    n_actors = 32 if case == 'many_send' else 1
    offset = (1000000 if warm else 2000000) + list(COUNTS).index(case) * 10000
    cpu_start = resource.getrusage(resource.RUSAGE_SELF)
    started = time.perf_counter_ns()

    def one(i):
        a = actor(case, i % n_actors, warm)
        identity = offset + 1 if case == 'replay' else 4000000 + (100000 if warm else 0) + list(COUNTS).index(case) * 20000 + i
        t0 = time.perf_counter_ns()
        try:
            response = call(method, a, None if case == 'reader' else {'message': PAYLOAD}, None if case == 'reader' else identity)
            if case == 'reader':
                assert list(response.messages) == [PAYLOAD] * 16
            return [i, t0 - started, time.perf_counter_ns() - t0, None, len(response.SerializeToString())]
        except Exception as error:
            code = error.code().name if isinstance(error, grpc.RpcError) else type(error).__name__
            return [i, t0 - started, time.perf_counter_ns() - t0, code, str(error)]

    with concurrent.futures.ThreadPoolExecutor(max_workers=CONCURRENCY) as pool:
        samples = list(pool.map(one, range(total)))
    elapsed = (time.perf_counter_ns() - started) / 1e9
    cpu_end = resource.getrusage(resource.RUSAGE_SELF)
    cpu_seconds = cpu_end.ru_utime + cpu_end.ru_stime - cpu_start.ru_utime - cpu_start.ru_stime
    errors = sum(s[3] is not None for s in samples)
    latencies = sorted(s[2] / 1e6 for s in samples)
    def percentile(p):
        import math
        return latencies[max(0, math.ceil(p * len(latencies)) - 1)]
    print(json.dumps({'case': case, 'warmup': warm, 'requests': total, 'errors': errors, 'seconds': elapsed, 'successful_rps': (total-errors)/elapsed, 'p50_ms': percentile(.5), 'p95_ms': percentile(.95), 'p99_ms': percentile(.99), 'client_process_cpu_seconds': cpu_seconds, 'client_process_cpu_cores': cpu_seconds/elapsed, 'client_maxrss_kib': cpu_end.ru_maxrss, 'payload_bytes': 64, 'concurrency': CONCURRENCY, 'sample_columns': ['ordinal', 'start_offset_ns', 'latency_ns', 'error', 'response_protobuf_bytes_or_error'], 'samples': samples}))
    if errors:
        sys.exit(1)

if __name__ == '__main__':
    main()
