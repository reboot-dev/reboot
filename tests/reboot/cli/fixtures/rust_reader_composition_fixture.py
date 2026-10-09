"""Public native selected-source composition; trace is observation-only."""
from pathlib import Path
import importlib.util
import subprocess
import time
import grpc


class ReaderCompositionFixture:
    def __init__(self, app, env, port, repository, evidence, record, command, database_pb2, database_pb2_grpc, app_proto):
        spec = importlib.util.spec_from_file_location('registry_base', repository / 'tests/reboot/cli/fixtures/rust_reader_registry_fixture.py')
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        self.base = module.ReaderRegistryFixture(app, env, port, repository, evidence, record, command, database_pb2, database_pb2_grpc, app_proto)
        self.app, self.env, self.port, self.evidence, self.record, self.command = app, env, port, evidence, record, command
        self.client = self.base.client
        env['RBT_RUST_REACTIVE_ACTORS'] += ',rust_greetings.v1.HelloWorld:selector'
        env['RBT_RUST_REACTIVE_COMPOSITION'] = '1'
        self.trace = app.parent / 'reader-composition-evaluations.txt'
        env['RUST_DX_COMPOSITION_TRACE'] = str(self.trace)
        # Observe real handler entry, never replace its logic or seed Database.
        source = app / 'backend/src/lib.rs'
        text = source.read_text()
        anchor = '        if state.selected_source.is_empty() {\n'
        assert text.count(anchor) == 1
        text = text.replace(anchor, '''        if let Ok(path) = std::env::var("RUST_DX_COMPOSITION_TRACE") {
            use std::io::Write;
            writeln!(
                std::fs::OpenOptions::new()
                    .create(true)
                    .append(true)
                    .open(path)
                    .map_err(|_| tonic::Status::internal("trace open"))?,
                "{}",
                state.selected_source
            )
            .map_err(|_| tonic::Status::internal("trace write"))?;
        }
''' + anchor, 1)
        source.write_text(text)
        self.checks = []
        self.streams = []
        self.watchers = []

    def check(self, name, condition):
        assert condition, name
        self.checks.append(name)
        self.evidence['reader_composition_checks'] = self.checks
        self.record('PASS reader-composition ' + name)

    def state(self, session, ref):
        with grpc.insecure_channel(f'127.0.0.1:{session.data["database_port"]}') as channel:
            result = self.base.db_grpc.DatabaseStub(channel).Load(self.base.db.LoadRequest(actors=[self.base.db.Actor(state_type='rust_greetings.v1.HelloWorld', state_ref=ref)]), timeout=3)
        assert len(result.actors) == 1 and result.actors[0].HasField('state')
        value = self.base.app_proto.HelloWorld.FromString(result.actors[0].state)
        self.evidence.setdefault('reader_composition_native_states', []).append({'session': session.data['name'], 'ref': ref, 'state': result.actors[0].state.hex()})
        return value

    def select(self, source, key):
        return self.command([self.client, 'select-source', self.selector, source, key])

    def wait_lines(self, log, expected, process):
        end = time.monotonic() + 10
        while log.read_text().splitlines() != expected and time.monotonic() < end:
            assert process.poll() is None, log.read_text()
            time.sleep(.03)
        assert log.read_text().splitlines() == expected, log.read_text()

    def first(self, session):
        a, b, self.selector, self.outside = [self.command([self.client, 'state-ref', name]) for name in ['alpha','beta','selector','outside']]
        self.a, self.b = a, b
        for ref in [a,b,self.selector,self.outside]:
            self.check('public constructor ' + ref, self.command([self.client,'create',ref]) == '0')
        self.check('persisted alpha selection', self.select(a, '44444444-4444-4444-8444-444444444441') == '0')
        self.base.channel = grpc.insecure_channel(f'127.0.0.1:{self.port}')
        log = self.app / 'selector-typed-watch.log'
        handle = log.open('w')
        process = subprocess.Popen([str(self.client),'watch',self.selector,'4'],cwd=self.app,env=self.env,stdout=handle,stderr=subprocess.STDOUT)
        item = {'pid':process.pid,'argv':[str(self.client),'watch',self.selector,'4'],'log':str(log)}
        self.evidence.setdefault('reader_composition_watchers',[]).append(item)
        self.watchers.append((process,handle,item))
        self.wait_lines(log,['0'],process)
        self.check('generated typed composed baseline', True)
        self.command([self.client,'greet',a,'55555555-5555-4555-8555-555555555551'])
        self.wait_lines(log,['0','1'],process)
        self.check('selected alpha commit updates root view',True)
        self.command([self.client,'greet',b,'55555555-5555-4555-8555-555555555552'])
        time.sleep(.2)
        before = len(self.trace.read_text().splitlines())
        self.select(b,'44444444-4444-4444-8444-444444444442')
        end=time.monotonic()+5
        while len(self.trace.read_text().splitlines()) <= before and time.monotonic()<end: time.sleep(.03)
        self.check('equal-value switch reevaluates with beta dependency',len(self.trace.read_text().splitlines())>before and self.trace.read_text().splitlines()[-1]==b and log.read_text().splitlines()==['0','1'])
        before = self.trace.read_text()
        self.command([self.client,'greet',a,'55555555-5555-4555-8555-555555555553'])
        time.sleep(.25)
        self.check('retired alpha does not rerun composed handler',self.trace.read_text()==before and log.read_text().splitlines()==['0','1'])
        self.command([self.client,'greet',b,'55555555-5555-4555-8555-555555555554'])
        self.wait_lines(log,['0','1','2'],process)
        self.check('selected beta commit updates root view',True)
        self.select('-','44444444-4444-4444-8444-444444444443')
        item['exit']=process.wait(timeout=10);handle.close()
        self.check('cleared selector returns local value and typed watcher exits',item['exit']==0 and log.read_text().splitlines()==['0','1','2','0'])
        self.watchers=[]
        self.select(b,'44444444-4444-4444-8444-444444444444')
        self.check('canonical selector and sources match public mutations',self.state(session,self.selector).selected_source==b and [self.state(session,ref).number_of_greetings for ref in [a,b,self.selector,self.outside]]==[2,2,0,0])
        for label, source in [('unknown',self.outside),('self',self.selector)]:
            self.select(source, '44444444-4444-4444-8444-44444444444'+('5' if label=='unknown' else '6'))
            denied=self.base.subscribe(self.selector)
            try: next(denied); raise AssertionError('invalid composed dependency published')
            except grpc.RpcError as error: self.check(label+' dependency fails closed',error.code()==grpc.StatusCode.FAILED_PRECONDITION)
        self.command([self.client,'select-source',a,b,'44444444-4444-4444-8444-444444444447'])
        self.select(a,'44444444-4444-4444-8444-444444444448')
        denied=self.base.subscribe(self.selector)
        try: next(denied); raise AssertionError('nested composed dependency published')
        except grpc.RpcError as error: self.check('nested source view rejects instead of recursively composing',error.code()==grpc.StatusCode.FAILED_PRECONDITION)
        self.command([self.client,'select-source',a,'-','44444444-4444-4444-8444-444444444449'])
        self.select(b,'44444444-4444-4444-8444-444444444450')
        self.open_baseline()

    def open_baseline(self):
        self.streams=[self.base.subscribe(self.selector)]
        self.check('fresh selected beta baseline',self.base.snapshot(self.streams[0])==2)

    def restored(self,session):
        self.check('RocksDB restart preserves selector and sources',self.state(session,self.selector).selected_source==self.b and [self.state(session,ref).number_of_greetings for ref in [self.a,self.b]]==[2,2])
        self.check('selection replay does not restore stale alpha dependency',self.select(self.a,'44444444-4444-4444-8444-444444444441')=='0' and self.state(session,self.selector).selected_source==self.b)
        self.base.channel=grpc.insecure_channel(f'127.0.0.1:{self.port}')
        self.open_baseline()

    def closed(self):
        for stream in self.streams:
            try: next(stream);raise AssertionError('composed stream survived shutdown')
            except (grpc.RpcError,StopIteration):pass
        if self.streams:self.check('shutdown terminates composed stream',True)
        self.streams=[]
        if self.base.channel:self.base.channel.close();self.base.channel=None
        for process,handle,item in self.watchers:
            item['exit']=process.wait(timeout=5);handle.close()
        self.watchers=[]
