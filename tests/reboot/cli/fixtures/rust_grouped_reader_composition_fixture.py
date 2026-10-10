"""Exact method-routed same-actor group with original per-service policies."""
from pathlib import Path
import importlib.util
import json
import grpc


def prepare(g):
    spec=importlib.util.spec_from_file_location('mixed_view_base',Path(__file__).with_name('rust_transaction_reader_composition_fixture.py'))
    assert spec is not None and spec.loader is not None
    base=importlib.util.module_from_spec(spec);spec.loader.exec_module(base)
    base.prepare(g)
    lib=g['APP']/'backend/src/lib.rs'
    text=lib.read_text()
    start=text.index('    async fn observe_view_with_reader_context(')
    end=text.index('    async fn approval_snapshot(',start)
    hook=text[start:end].replace('observe_view_with_reader_context','observe_with_reader_context')
    marker='    async fn submit_batch('
    assert text.count(marker)==1
    lib.write_text(text.replace(marker,hook+marker,1))
    host=g['APP']/'backend/src/host.rs'
    text=host.read_text()
    old='    registry.register(index_binding)?;'
    assert text.count(old)==1
    text=text.replace(old,'''    let (_,work_binding)=work.local_readers(&reference)?;
    let mut group=reboot::reactive::LocalReaderGroup::new(index_binding)?;
    group.add(work_binding)?;
    registry.register(group.into_service()?)?;''',1)
    marker='    let index = index.with_reader_registry(registry.clone())?;'
    assert text.count(marker)==1
    text=text.replace(marker,marker+'\n    let work=work.with_reader_registry(registry.clone())?;',1)
    old='let denied = cookie == Some("deny-root") && !leaf || cookie == Some("deny-source") && leaf;'
    # rustfmt may wrap this boolean expression; replace its statement boundary.
    start=text.index('            let denied =')
    end=text.index(';',start)+1
    text=text[:start]+'''            let denied = cookie == Some("deny-root") && !leaf || cookie == Some("deny-source") && leaf
        || !leaf && cookie == Some("deny-work") && context.method.ends_with(".Observe")
        || !leaf && cookie == Some("deny-index") && context.method.ends_with(".ObserveView");'''+text[end:]
    host.write_text(text)
    g['command'](['cargo','fmt','--manifest-path','backend/Cargo.toml'])


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
    work_stream = None
    call = channel.unary_unary('/batch_ledger.v1.LedgerIndexMethods/ObserveView', request_serializer=proto.Empty.SerializeToString, response_deserializer=proto.Ledger.FromString)

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
        session = g['Session']('group-composition-first')
        check('public root constructor', client('create')[0] == 'created')
        check('public distinct source constructor', client('source-create')[0] == 'created')
        check('public source writer', client('source-set', '7')[0] == '7')
        task = client('submit', 'composed-batch', '2', 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1')[0]
        g['wait_state'](0, 0)
        check('grouped index ordinary client composes distinct actor', client('view')[0] == '0 7')
        work = channel.unary_unary('/batch_ledger.v1.LedgerWorkMethods/Observe', request_serializer=proto.Empty.SerializeToString, response_deserializer=proto.Ledger.FromString)
        def work_rpc(cookie='observe-envelope'):
            return work(proto.Empty(), metadata=(('x-reboot-state-ref',root),('cookie',cookie)),timeout=3)
        check('grouped workflow ordinary reader composes distinct source', work_rpc().archived == 7)
        for label, invoke in [('workflow method policy denies only work',lambda: work_rpc('deny-work')),('index method policy denies only index',lambda: rpc([('cookie','deny-index')]))]:
            try:
                invoke(); raise AssertionError('group policy bypass')
            except grpc.RpcError as error:
                check(label,error.code()==grpc.StatusCode.PERMISSION_DENIED)
        check('workflow denial does not leak to index policy',rpc([('cookie','deny-work')]).archived==7)
        check('index denial does not leak to workflow policy',work_rpc('deny-index').archived==7)
        before = durable(task)
        offset = trace.stat().st_size
        check('composed root and source return observed value', rpc([('cookie', 'observe-envelope'), ('x-reboot-application-id', 'forged')]).archived == 7)
        rows = [json.loads(line) for line in trace.read_bytes()[offset:].decode().splitlines()]
        check('root and source authorization preserve original credentials and trusted identity', [r['reference'] for r in rows] == [root, source] and all(r['application'] == 'batch_ledger' and r['cookie'] == 'observe-envelope' and not r['internal'] and r['request'] == [] for r in rows) and [r['count'] for r in rows] == [0, 7])
        denied('root authorization denies before composition', grpc.StatusCode.PERMISSION_DENIED, [('cookie', 'deny-root')])
        denied('source authorization denies without ordinary fallback', grpc.StatusCode.PERMISSION_DENIED, [('cookie', 'deny-source')])
        check('configured declared reader keeps rich declared error', client('index-mismatch', 'other')[0] == 'MISMATCH other composed-batch')
        for key in ['x-reboot-workflow-id', 'x-reboot-transaction-coordinator-state-type', 'x-reboot-task-method']:
            offset = trace.stat().st_size
            denied('mixed-service external reader rejects ' + key, grpc.StatusCode.FAILED_PRECONDITION, [(key, '')])
            check('forbidden authority precedes auth ' + key, trace.stat().st_size == offset)
        denied('mixed-service duplicate root identity rejects', grpc.StatusCode.INVALID_ARGUMENT, [('x-reboot-state-ref', source)])
        target.write_text(root)
        denied('self dependency fails without fallback', grpc.StatusCode.FAILED_PRECONDITION)
        target.write_text(str(StateRef.from_id('batch_ledger.v1.ViewSource', 'unregistered')))
        denied('unregistered dependency fails without fallback', grpc.StatusCode.FAILED_PRECONDITION)
        target.write_text(source)
        denied('absolute deadline cancels source authorization', grpc.StatusCode.DEADLINE_EXCEEDED, [('cookie', 'slow-source')], .05)
        check('normal read succeeds after deadline cleanup', client('view')[0] == '0 7')
        check('external reads and denials preserve actor task map and checkpoint bytes', durable(task) == before)
        stream = subscribe(reactive.Query(method='batch_ledger.v1.LedgerIndexMethods.ObserveView', request=proto.Empty().SerializeToString()), metadata=(('x-reboot-state-ref', root),), timeout=10)
        check('mixed-service reserved subscription uses contextual hook', proto.Ledger.FromString(next(stream).response).archived == 7)
        work_stream=subscribe(reactive.Query(method='batch_ledger.v1.LedgerWorkMethods.Observe',request=proto.Empty().SerializeToString()),metadata=(('x-reboot-state-ref',root),),timeout=10)
        check('grouped workflow subscription routes exact contextual handler',proto.Ledger.FromString(next(work_stream).response).archived==7)
        client('source-set', '8')
        check('mixed-service subscription reevaluates source commit', proto.Ledger.FromString(next(stream).response).archived == 8)
        check('same source commit invalidates both grouped service streams',proto.Ledger.FromString(next(work_stream).response).archived==8)
        work_stream.cancel();work_stream=None
        stream.cancel(); stream = None
        check('ordinary unary succeeds after subscription cancellation', rpc().archived == 8)
        check('public source change updates composed view', client('source-set', '9')[0] == '9' and client('view')[0] == '0 9')
        client('approve', 'composed-batch', '0')
        g['wait_state'](1, 1)
        check('genuine workflow checkpoint progresses independently of composed view', client('view')[0] == '1 9' and g['native'](session, task)[0].archived == 0)
        frozen = durable(task)
        session.close(); session = None
        session = g['Session']('group-composition-restart')
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
        session = g['Session']('group-composition-terminal-restart')
        check('canonical Wait replays unchanged after second restart', client('wait', task, '5000')[0] == 'composed-batch 2 2 2 1' and g['native'](session, task)[2].SerializeToString() == terminal)
        check('completed workflow does not redispatch after restart', 'batch-ledger-handler body-composed-batch' not in session.host_text())
        check('restored composed reader remains fresh', client('view')[0] == '2 11')
        check('both grouped method routes restore after RocksDB restart',work_rpc().archived==11)
        session.close(); session = None
        g['evidence']['accepted'] = True
        g['checkpoint']()
    finally:
        if work_stream is not None:
            work_stream.cancel()
        if stream is not None:
            stream.cancel()
        channel.close()
        if session is not None and not g['timeout_seen']:
            session.close()
