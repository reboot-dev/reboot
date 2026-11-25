"""Native multi-actor reader routing through the unmodified generated scaffold."""
from pathlib import Path
import importlib
import subprocess
import sys
import time
import grpc
from grpc_tools import protoc


class ReaderRegistryFixture:
    def __init__(self, app, env, port, repository, evidence, record, command, database_pb2, database_pb2_grpc, app_proto):
        self.app, self.env, self.port = app, env, port
        self.evidence, self.record, self.command = evidence, record, command
        self.db, self.db_grpc, self.app_proto = database_pb2, database_pb2_grpc, app_proto
        self.client = Path(env['CARGO_TARGET_DIR']) / 'debug/client'
        self.streams = []
        self.channel = None
        self.checks = []
        env['RBT_RUST_REACTIVE_ACTORS'] = 'rust_greetings.v1.HelloWorld:alpha,rust_greetings.v1.HelloWorld:beta'
        python = app / 'generated-python'
        source = repository / 'reboot/rust/reactive.proto'
        assert protoc.main(['protoc', '-I' + str(source.parent), '--python_out=' + str(python), '--grpc_python_out=' + str(python), str(source)]) == 0
        sys.path.insert(0, str(python))
        self.wire = importlib.import_module('reactive_pb2')
        self.wire_grpc = importlib.import_module('reactive_pb2_grpc')

    def check(self, name, condition):
        assert condition, name
        self.checks.append(name)
        self.evidence['reader_registry_checks'] = self.checks
        self.record('PASS reader-registry ' + name)

    def subscribe(self, ref, method='rust_greetings.v1.HelloWorldMethods.NumGreetings'):
        query = self.wire.Query(method=method, request=self.app_proto.NumGreetingsRequest().SerializeToString())
        return self.wire_grpc.LocalReadersStub(self.channel).Subscribe(query, metadata=(('x-reboot-state-ref', ref),), timeout=15)

    def snapshot(self, stream):
        return self.app_proto.NumGreetingsResponse.FromString(next(stream).response).number_of_greetings

    def load(self, session, ref):
        with grpc.insecure_channel(f'127.0.0.1:{session.data["database_port"]}') as channel:
            result = self.db_grpc.DatabaseStub(channel).Load(self.db.LoadRequest(actors=[self.db.Actor(state_type='rust_greetings.v1.HelloWorld', state_ref=ref)]), timeout=3)
        assert len(result.actors) == 1 and result.actors[0].HasField('state'), result
        self.evidence.setdefault('reader_registry_native_reads', []).append({'session': session.data['name'], 'state_ref': ref, 'state': result.actors[0].state.hex()})
        return self.app_proto.HelloWorld.FromString(result.actors[0].state).number_of_greetings

    def first(self, session):
        self.refs = [self.command([self.client, 'state-ref', name]) for name in ['alpha', 'beta', 'outside']]
        a, b, outside = self.refs
        for ref in self.refs:
            self.check('public create ' + ref, self.command([self.client, 'create', ref]) == '0')
        for label, configuration, diagnostic in [
            ('empty', '', 'EmptyReference'),
            ('duplicate', 'rust_greetings.v1.HelloWorld:alpha,rust_greetings.v1.HelloWorld:alpha', 'AlreadyExists'),
            ('malformed', 'not-a-reference', 'InvalidComponent'),
            ('non-unicode', '\udcff', 'NotUnicode'),
            ('over-capacity', ','.join('rust_greetings.v1.HelloWorld:actor' + str(index) for index in range(65)), 'ResourceExhausted'),
        ]:
            environment = dict(self.env, RBT_RUST_REACTIVE_ACTORS=configuration,
                               RBT_RUST_DATABASE_URL=f'http://127.0.0.1:{session.data["database_port"]}',
                               RBT_RUST_LISTEN_ADDR=f'127.0.0.1:{self.port}', RBT_NAME='rust_greetings')
            rejected = subprocess.Popen([str(self.client.with_name('app'))], cwd=self.app, env=environment, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
            item = {'case': label, 'pid': rejected.pid, 'argv': [str(self.client.with_name('app'))]}
            self.evidence.setdefault('reader_registry_configuration_rejections', []).append(item)
            stdout, stderr = rejected.communicate(timeout=5)
            item.update(exit=rejected.returncode, stdout=stdout, stderr=stderr)
            self.check('invalid startup configuration ' + label, rejected.returncode == 1 and diagnostic in stderr)
        self.check('startup rejections leave both actors unchanged', self.load(session, a) == 0 and self.load(session, b) == 0)
        self.channel = grpc.insecure_channel(f'127.0.0.1:{self.port}')
        denied = self.subscribe(outside)
        try:
            next(denied)
            raise AssertionError('unknown reactive actor admitted')
        except grpc.RpcError as error:
            self.check('constructed but unregistered actor denied', error.code() == grpc.StatusCode.FAILED_PRECONDITION)
        self.check('denied actor state unchanged', self.load(session, outside) == 0)
        wrong = self.subscribe(a, 'rust_greetings.v1.HelloWorldMethods.Greet')
        try:
            next(wrong)
            raise AssertionError('writer method subscribed')
        except grpc.RpcError as error:
            self.check('writer query rejected without mutation', error.code() == grpc.StatusCode.UNIMPLEMENTED and self.load(session, a) == 0)
        watchers = []
        for name, ref in [('alpha', a), ('beta', b)]:
            log = self.app / (name + '-typed-watch.log')
            handle = log.open('w')
            process = subprocess.Popen([str(self.client), 'watch', ref, '2'], cwd=self.app, env=self.env, stdout=handle, stderr=subprocess.STDOUT)
            item = {'pid': process.pid, 'argv': [str(self.client), 'watch', ref, '2'], 'log': str(log)}
            self.evidence.setdefault('reader_registry_watchers', []).append(item)
            watchers.append((process, handle, log, item))
        end = time.monotonic() + 10
        while time.monotonic() < end and any(log.read_text().strip() != '0' for _, _, log, _ in watchers):
            assert all(process.poll() is None for process, _, _, _ in watchers)
            time.sleep(.05)
        self.check('both generated typed clients receive isolated baselines', all(log.read_text().strip() == '0' for _, _, log, _ in watchers))
        key_b = '33333333-3333-4333-8333-333333333333'
        key_a = '22222222-2222-4222-8222-222222222222'
        self.check('public beta writer', self.command([self.client, 'greet', b, key_b]) == '1')
        process, handle, log, item = watchers[1]
        item['exit'] = process.wait(timeout=10)
        handle.close()
        self.check('beta subscription changed', item['exit'] == 0 and log.read_text().splitlines() == ['0', '1'])
        time.sleep(.2)
        self.check('beta commit does not invalidate alpha subscription', watchers[0][0].poll() is None and watchers[0][2].read_text().splitlines() == ['0'])
        self.check('public alpha writer', self.command([self.client, 'greet', a, key_a]) == '1')
        process, handle, log, item = watchers[0]
        item['exit'] = process.wait(timeout=10)
        handle.close()
        self.check('alpha subscription changed', item['exit'] == 0 and log.read_text().splitlines() == ['0', '1'])
        self.check('canonical state isolation', self.load(session, a) == 1 and self.load(session, b) == 1 and self.load(session, outside) == 0)
        # Shared host admission applies across actors, not 64 per routing entry.
        held = [self.subscribe(a if index % 2 else b) for index in range(64)]
        self.check('64 cross-actor subscriptions admitted', all(self.snapshot(stream) == 1 for stream in held))
        extra = self.subscribe(a)
        try:
            next(extra)
            raise AssertionError('65th host stream admitted')
        except grpc.RpcError as error:
            self.check('host-wide capacity rejects 65th stream', error.code() == grpc.StatusCode.RESOURCE_EXHAUSTED)
        for stream in held:
            stream.cancel()
        # Cancellation is remote, so wait for server observation before fresh admission.
        end = time.monotonic() + 5
        while True:
            fresh = self.subscribe(a)
            try:
                value = self.snapshot(fresh)
                self.check('dropped streams release host admission', value == 1)
                fresh.cancel()
                break
            except grpc.RpcError as error:
                assert error.code() == grpc.StatusCode.RESOURCE_EXHAUSTED and time.monotonic() < end
                time.sleep(.05)
        self.open_baselines()

    def open_baselines(self):
        self.streams = [self.subscribe(ref) for ref in self.refs[:2]]
        self.check('fresh baselines for both actors', [self.snapshot(stream) for stream in self.streams] == [1, 1])

    def closed(self):
        if not self.streams:
            return
        for stream in self.streams:
            try:
                next(stream)
                raise AssertionError('subscription survived stopped host')
            except (grpc.RpcError, StopIteration):
                pass
        self.check('host shutdown terminates both actor streams', True)
        self.streams = []
        if self.channel:
            self.channel.close()
            self.channel = None

    def restored(self, session):
        a, b, outside = self.refs
        self.check('RocksDB restart preserves all exact actor states', [self.load(session, ref) for ref in self.refs] == [1, 1, 0])
        self.check('alpha writer replay after restart', self.command([self.client, 'greet', a, '22222222-2222-4222-8222-222222222222']) == '1')
        self.check('beta writer replay after restart', self.command([self.client, 'greet', b, '33333333-3333-4333-8333-333333333333']) == '1')
        self.channel = grpc.insecure_channel(f'127.0.0.1:{self.port}')
        self.open_baselines()
