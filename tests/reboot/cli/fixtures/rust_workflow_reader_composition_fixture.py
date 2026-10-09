"""Generated workflow-bearing external composition over public native state.

The overlay is application code/policy, not a replacement SDK or Database seed.
"""
from pathlib import Path
import json
import grpc


def replace(path, old, new):
    text = path.read_text()
    assert text.count(old) == 1, (path, old)
    path.write_text(text.replace(old, new, 1))


def prepare(g):
    app, env, stage = g['APP'], g['ENV'], g['STAGE']
    schema = app / 'api/batch_ledger/v1/batch.proto'
    schema.write_text(schema.read_text() + '''
message ViewSource {
 option (rbt.v1alpha1.state) = { implements: ["batch_ledger.v1.ViewSourceMethods"] };
 uint64 count = 1;
}
service ViewSourceMethods {
 option (rbt.v1alpha1.service) = { state: "batch_ledger.v1.ViewSource" };
 rpc Create(Empty) returns (Empty) { option (rbt.v1alpha1.method).writer = { constructor: {} }; }
 rpc UpdateValue(ViewSource) returns (ViewSource) { option (rbt.v1alpha1.method).writer = {}; }
 rpc Value(Empty) returns (ViewSource) { option (rbt.v1alpha1.method).reader = {}; }
}
''')
    env['RBT_RUST_WORKFLOW_VIEW_TRACE'] = str(stage / 'view-authorizations.jsonl')
    wire = stage / 'reactive-wire'; wire.mkdir()
    g['command']([g['sys'].executable, '-m', 'grpc_tools.protoc', '-I' + str(g['ROOT']), '--python_out=' + str(wire), str(g['ROOT'] / 'reboot/rust/reactive.proto')])
    env['RBT_RUST_WORKFLOW_VIEW_TARGET'] = str(stage / 'reader-target')
    lib = app / 'backend/src/lib.rs'
    replace(lib, '    async fn submit_batch(\n', '''    async fn observe_with_reader_context(
        &self, state: &proto::Ledger, request: proto::Empty,
        context: reboot::reactive::LocalReaderContext,
    ) -> Result<proto::Ledger, tonic::Status> {
        let path = std::env::var("RBT_RUST_WORKFLOW_VIEW_TARGET")
            .map_err(|_| tonic::Status::failed_precondition("missing view target"))?;
        let target = std::fs::read_to_string(path)
            .map_err(|_| tonic::Status::failed_precondition("missing view target"))?;
        let source = generated::ViewSourceMethodsReactiveClient::value_read_local(
            &context, &target, request,
        ).await?;
        let mut view = state.clone();
        view.archived = source.count; // Return a view; never persist into Ledger.
        Ok(view)
    }
    async fn submit_batch(
''')
    lib.write_text(lib.read_text() + '''
#[derive(Clone)]
pub struct ViewSource;
#[tonic::async_trait]
impl generated::ViewSourceMethodsDatabaseHandler for ViewSource {
    async fn create(&self, _: &mut proto::ViewSource, _: proto::Empty)
        -> Result<proto::Empty, tonic::Status> { Ok(proto::Empty {}) }
    async fn update_value(&self, state: &mut proto::ViewSource, request: proto::ViewSource)
        -> Result<proto::ViewSource, tonic::Status> { *state = request; Ok(*state) }
    async fn value(&self, state: &proto::ViewSource, _: proto::Empty)
        -> Result<proto::ViewSource, tonic::Status> { Ok(*state) }
}
''')
    with lib.open('a') as out:
        out.write(r'''
#[cfg(test)]
mod workflow_composition_configuration_tests {
    use super::*;
    use reboot::runtime::DatabaseActorStore;
    fn reference() -> String {
        reboot::state_ref::StateRef::from_id(STATE_TYPE, "configuration-only").unwrap().to_string()
    }
    fn registered(adapter: &generated::LedgerWorkMethodsDatabaseAdapter<Ledger>) -> reboot::reactive::LocalReaderRegistry {
        let root = reference();
        let (_, binding) = adapter.local_readers(&root).unwrap();
        let mut registry = reboot::reactive::LocalReaderRegistry::new().with_reader_composition();
        registry.register(binding).unwrap();
        registry
    }
    #[tokio::test]
    async fn clones_preserve_binding_but_authorization_reconfiguration_does_not() {
        let store = DatabaseActorStore::connect_lazy("http://127.0.0.1:1").unwrap();
        let adapter = generated::LedgerWorkMethodsDatabaseAdapter::new(store, Ledger);
        let registry = registered(&adapter);
        assert!(adapter.clone().with_reader_registry(registry.clone()).is_ok());
        let changed = adapter.with_authorization(reboot::auth::AuthorizationPolicy::default());
        assert_eq!(changed.with_reader_registry(registry).err().unwrap().code(), tonic::Code::FailedPrecondition);
    }
    #[tokio::test]
    async fn workflow_owner_reconfiguration_detaches_stale_reader_binding() {
        let store = DatabaseActorStore::connect_lazy("http://127.0.0.1:1").unwrap();
        let adapter = generated::LedgerWorkMethodsDatabaseAdapter::new(store, Ledger);
        let registry = registered(&adapter);
        let attached = adapter.with_reader_registry(registry.clone()).unwrap();
        let (changed, _) = attached.with_workflows(&reference()).unwrap();
        assert_eq!(changed.clone().with_reader_registry(registry).err().unwrap().code(), tonic::Code::FailedPrecondition);
        assert!(changed.clone().with_reader_registry(registered(&changed)).is_ok());
    }
}
''')
    host = app / 'backend/src/host.rs'
    replace(host, '                    "rbt.v1alpha1.Tasks",', '                    "rbt.v1alpha1.Tasks",\n                    "batch_ledger.v1.ViewSourceMethods",')
    replace(host, '                    state_type_full_name: STATE_TYPE.into(),', '                    state_type_full_name: if name.ends_with("ViewSourceMethods") { "batch_ledger.v1.ViewSource".into() } else { STATE_TYPE.into() },')
    text = host.read_text()
    start = text.index('impl reboot::auth::Authorizer for StopAccess')
    end = text.index('// Opt-in revocable', start)
    block = text[start:end]
    block = block.replace('        _: &\'a [u8],', '        request: &\'a [u8],', 1)
    block = block.replace('        Box::pin(async move {', '''        if context.method.ends_with(".Observe") || context.method.ends_with(".ObserveBatch") {
            return reboot::auth::Authorizer::authorize(&ViewReaderPolicy, context, auth, state, request);
        }
        Box::pin(async move {''', 1)
    host.write_text(text[:start] + block + text[end:])
    replace(host, '''    let (readers, _) = index.local_readers(&reference)?;
    let companion = reboot::reactive::LocalReaderService::new(
        CombinedReaders {
            work: work.clone(),
            index: index.clone(),
        },
        readers.clone(),
    )?;''', '''    let source_ref = reboot::state_ref::StateRef::from_id("batch_ledger.v1.ViewSource", "source")?.to_string();
    let source = generated::ViewSourceMethodsDatabaseAdapter::new(store.clone(), crate::ViewSource)
        .with_authorization(reboot::auth::AuthorizationPolicy::new(None, Some(Arc::new(ViewReaderPolicy))));
    let (readers, work_binding) = work.local_readers(&reference)?;
    let (_, source_binding) = source.local_readers(&source_ref)?;
    let mut registry = reboot::reactive::LocalReaderRegistry::new().with_reader_composition();
    registry.register(work_binding)?;
    registry.register(source_binding)?;
    let work = work.with_reader_registry(registry.clone())?;''')
    # No duplicate owner startup; installation owns both reader recovery entries.
    replace(host, '        .with_host_recovery(readers)\n', '')
    replace(host, '        .try_add_local_readers(companion)?', '''        .add_public_service(proto::view_source_methods_server::ViewSourceMethodsServer::new(source))
        .try_add_local_reader_registry(registry)?''')
    # Remove baseline-only multi-service wrapper from the overlay. The production
    # scaffold retains it; same-actor identity multiplexing is not this proof.
    text = host.read_text()
    a, b = text.index('struct CombinedReaders'), text.index('struct ReaderTelemetry')
    host.write_text(text[:a] + text[b:] + '''
struct ViewReaderPolicy;
impl reboot::auth::Authorizer for ViewReaderPolicy {
    fn authorize<'a>(&'a self, context: &'a reboot::auth::AuthorizationContext,
        _auth: Option<&'a reboot::auth::Auth>, state: Option<&'a [u8]>, request: &'a [u8])
        -> reboot::auth::AuthorizeFuture<'a> {
        Box::pin(async move {
            use prost::Message;
            let leaf = context.state_type == "batch_ledger.v1.ViewSource";
            let cookie = context.headers.cookie.as_deref();
            let denied = cookie == Some("deny-root") && !leaf || cookie == Some("deny-source") && leaf;
            let row = serde_json::json!({"reference":context.headers.state_ref,
                "application":context.headers.application_id,"cookie":cookie,
                "internal":context.headers.internal_call,"method":context.method,
                "request":request,"denied":denied,"leaf":leaf,
                "count":state.and_then(|bytes| if leaf { proto::ViewSource::decode(bytes).ok().map(|s|s.count) }
                    else { proto::Ledger::decode(bytes).ok().map(|s|s.archived) })});
            let logged = std::env::var("RBT_RUST_WORKFLOW_VIEW_TRACE").ok().and_then(|path| {
                use std::io::Write;
                std::fs::OpenOptions::new().create(true).append(true).open(path)
                    .and_then(|mut file|writeln!(file,"{row}")).ok()
            });
            if cookie == Some("slow-source") && leaf { tokio::time::sleep(std::time::Duration::from_millis(500)).await; }
            if denied || logged.is_none() || context.headers.application_id.as_deref()!=Some("batch_ledger") {
                return reboot::auth::AuthorizationDecision::PermissionDenied { message:"view reader denied".into() };
            }
            reboot::auth::AuthorizationDecision::Allow
        })
    }
}
''')
    client = app / 'backend/src/bin/client.rs'
    replace(client, '        "create" => {', '''        "view" => {
            let mut client = proto::ledger_work_methods_client::LedgerWorkMethodsClient::new(channel);
            let value = client.observe(context.reader(proto::Empty {})?).await?.into_inner();
            println!("{} {}", value.completed, value.archived);
        }
        "source-create" | "source-set" => {
            let reference = reboot::state_ref::StateRef::from_id("batch_ledger.v1.ViewSource", "source")?.to_string();
            let context = reboot::ExternalContext::new(reference);
            let mut client = proto::view_source_methods_client::ViewSourceMethodsClient::new(channel);
            if command=="source-create" { client.create(context.writer(proto::Empty {})?).await?; println!("created"); }
            else { let value=client.update_value(context.writer(proto::ViewSource { count:arg(1)?.parse()? })?).await?.into_inner(); println!("{}",value.count); }
        }
        "create" => {''')
    g['command'](['cargo', 'fmt', '--manifest-path', 'backend/Cargo.toml'])


def run(g):
    from reboot.aio.types import StateRef
    stage, env = g['STAGE'], g['ENV']
    root = g['reference']
    source = str(StateRef.from_id('batch_ledger.v1.ViewSource', 'source'))
    target = Path(env['RBT_RUST_WORKFLOW_VIEW_TARGET'])
    target.write_text(source)
    trace = Path(env['RBT_RUST_WORKFLOW_VIEW_TRACE'])
    client, check = g['client'], g['check']
    session = None
    channel = grpc.insecure_channel(f'127.0.0.1:{g["PORT"]}')
    proto = g['proto']
    import importlib.util
    spec = importlib.util.spec_from_file_location('workflow_public_reactive_wire', stage / 'reactive-wire/reboot/rust/reactive_pb2.py')
    reactive = importlib.util.module_from_spec(spec); spec.loader.exec_module(reactive)
    subscribe = channel.unary_stream('/reboot.rust.reactive.v1.LocalReaders/Subscribe', request_serializer=reactive.Query.SerializeToString, response_deserializer=reactive.Snapshot.FromString)
    stream = None
    call = channel.unary_unary('/batch_ledger.v1.LedgerWorkMethods/Observe', request_serializer=proto.Empty.SerializeToString, response_deserializer=proto.Ledger.FromString)

    def rpc(metadata=(), timeout=3):
        return call(proto.Empty(), metadata=[('x-reboot-state-ref', root), *metadata], timeout=timeout)

    def denied(label, code, metadata=(), timeout=3):
        try:
            rpc(metadata, timeout)
            raise AssertionError('composed reader unexpectedly returned fallback: ' + label)
        except grpc.RpcError as error:
            check(label, error.code() == code)

    def durable(task):
        observed = g['native'](session, task)
        with grpc.insecure_channel(f'127.0.0.1:{session.database_port}') as db_channel:
            source_state = g['db_grpc'].DatabaseStub(db_channel).Load(g['db'].LoadRequest(actors=[g['db'].Actor(state_type='batch_ledger.v1.ViewSource', state_ref=source)]), timeout=3)
        assert len(source_state.actors) == 1 and source_state.actors[0].HasField('state')
        return [x.SerializeToString() if hasattr(x, 'SerializeToString') else [m.SerializeToString() for m in x] for x in observed] + [source_state.actors[0].state]

    try:
        session = g['Session']('workflow-composition-first')
        check('public root constructor', client('create')[0] == 'created')
        check('public distinct source constructor', client('source-create')[0] == 'created')
        check('public source writer', client('source-set', '7')[0] == '7')
        task = client('submit', 'composed-batch', '2', 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1')[0]
        g['wait_state'](0, 0)
        check('ordinary generated workflow-service client composes distinct actor', client('view')[0] == '0 7')
        before = durable(task)
        offset = trace.stat().st_size
        check('composed root and source return observed value', rpc([('cookie', 'observe-envelope'), ('x-reboot-application-id', 'forged')]).archived == 7)
        rows = [json.loads(line) for line in trace.read_bytes()[offset:].decode().splitlines()]
        check('root and source authorization preserve original credentials and trusted identity', [r['reference'] for r in rows] == [root, source] and all(r['application'] == 'batch_ledger' and r['cookie'] == 'observe-envelope' and not r['internal'] and r['request'] == [] for r in rows) and [r['count'] for r in rows] == [0, 7])
        denied('root authorization denies before composition', grpc.StatusCode.PERMISSION_DENIED, [('cookie', 'deny-root')])
        denied('source authorization denies without ordinary fallback', grpc.StatusCode.PERMISSION_DENIED, [('cookie', 'deny-source')])
        check('configured declared reader keeps rich declared error', client('work-unary', 'other')[0] == 'MISMATCH other composed-batch')
        for key in ['x-reboot-workflow-id', 'x-reboot-transaction-coordinator-state-type', 'x-reboot-task-method']:
            offset = trace.stat().st_size
            denied('workflow-service external reader rejects ' + key, grpc.StatusCode.FAILED_PRECONDITION, [(key, '')])
            check('forbidden authority precedes auth ' + key, trace.stat().st_size == offset)
        denied('workflow-service duplicate root identity rejects', grpc.StatusCode.INVALID_ARGUMENT, [('x-reboot-state-ref', source)])
        target.write_text(root)
        denied('self dependency fails without fallback', grpc.StatusCode.FAILED_PRECONDITION)
        target.write_text(str(StateRef.from_id('batch_ledger.v1.ViewSource', 'unregistered')))
        denied('unregistered dependency fails without fallback', grpc.StatusCode.FAILED_PRECONDITION)
        target.write_text(source)
        denied('absolute deadline cancels source authorization', grpc.StatusCode.DEADLINE_EXCEEDED, [('cookie', 'slow-source')], .05)
        check('normal read succeeds after deadline cleanup', client('view')[0] == '0 7')
        check('external reads and denials preserve actor task map and checkpoint bytes', durable(task) == before)
        stream = subscribe(reactive.Query(method='batch_ledger.v1.LedgerWorkMethods.Observe', request=proto.Empty().SerializeToString()), metadata=(('x-reboot-state-ref', root),), timeout=10)
        check('workflow-service reserved subscription uses contextual hook', proto.Ledger.FromString(next(stream).response).archived == 7)
        client('source-set', '8')
        check('workflow-service subscription reevaluates source commit', proto.Ledger.FromString(next(stream).response).archived == 8)
        stream.cancel(); stream = None
        check('ordinary unary succeeds after subscription cancellation', rpc().archived == 8)
        check('public source change updates composed view', client('source-set', '9')[0] == '9' and client('view')[0] == '0 9')
        client('approve', 'composed-batch', '0')
        g['wait_state'](1, 1)
        check('genuine workflow checkpoint progresses independently of composed view', client('view')[0] == '1 9' and g['native'](session, task)[0].archived == 0)
        frozen = durable(task)
        session.close(); session = None
        session = g['Session']('workflow-composition-restart')
        check('RocksDB restores source root task map and saved checkpoint exactly', durable(task) == frozen)
        check('ordinary composed read survives RocksDB restart', client('view')[0] == '1 9')
        client('approve', 'composed-batch', '1')
        g['wait_state'](2, 2)
        check('generated canonical workflow Wait completes', client('wait', task, '5000')[0] == 'composed-batch 2 2 2 1')
        state, _, record, checkpoints = g['native'](session, task)
        check('durable terminal is real workflow state not external composed view', record.status == g['db'].Task.COMPLETED and proto.Ledger.FromString(record.response.value).archived == state.archived == 0 and checkpoints)
        terminal = record.SerializeToString()
        offset = len(session.host_text())
        check('new source commit changes view not completed workflow', client('source-set', '11')[0] == '11' and client('view')[0] == '2 11' and g['native'](session, task)[2].SerializeToString() == terminal)
        session.close(); session = None
        session = g['Session']('workflow-composition-terminal-restart')
        check('canonical Wait replays unchanged after second restart', client('wait', task, '5000')[0] == 'composed-batch 2 2 2 1' and g['native'](session, task)[2].SerializeToString() == terminal)
        check('completed workflow does not redispatch after restart', 'batch-ledger-handler body-composed-batch' not in session.host_text())
        check('restored composed reader remains fresh', client('view')[0] == '2 11')
        session.close(); session = None
        g['evidence']['accepted'] = True
        g['checkpoint']()
    finally:
        if stream is not None:
            stream.cancel()
        channel.close()
        if session is not None and not g['timeout_seen']:
            session.close()
