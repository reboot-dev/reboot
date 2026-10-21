"""Genuine child ACK loss -> original live owner's native Abort -> startup ACK
retirement. A native Abort is NOT a typed result or source Task terminal.
Included only by the original finite two-application/native-Database custodian.
"""
until(child_ack.exists, t); wait(t); assert t.returncode != 0
before = snapshot(task); intent = inspect_root_intent(before, db, task)
metadata = dict(json.loads(child_ack.read_text())['request_metadata'])
assert intent['root'] == json.loads(metadata['x-reboot-transaction-ids'])[0]
assert len(intent['members']) == 1 and intent['members'][0]['state_ref'] == leaf
assert [x['value'] for x in before] == [0, 0]
assert lines().count('transaction-apply') == lines().count('transaction-child') == 1
assert lines().count('transaction-child-caught-error') == 1

def native_authority():
    response = dg.DatabaseStub(grpc.insecure_channel(f'127.0.0.1:{dp}')).TransactionCoordinatorDecisionGet(
        db.TransactionCoordinatorDecisionGetRequest(root_transaction_id=uuid.UUID(intent['root']).bytes,
            coordinator_state_ref=ref), timeout=5)
    return response

# The live owner, not this test or the startup owner, published the immutable
# native Abort. Record it BEFORE restarting. No DecisionPut is issued here.
authority = native_authority()
rec.setdefault('startup_child_ack', []).append(dict(phase='original-live-owner', intent=intent,
    native=before, authority=authority.SerializeToString().hex(), request_metadata=metadata)); save()
assert authority.HasField('decision') and authority.decision.outcome == db.TransactionCoordinatorDecision.ABORT
assert authority.decision.coordinator_state_ref == ref and not authority.decision.HasField('participants')
stop(t); stop(c); stop(d); stop(ld)
restarts = []
for restart in range(2):
    d, ld = database(), database(True); c, cs = host(True)
    owned, retired, pre = [work/f'{name}-{restart}' for name in ['owned','retired','before-source']]
    t, ts = host(False, dict(REBOOT_TEST_CANONICAL_STARTUP_OWNED=str(owned),
        REBOOT_TEST_CANONICAL_STARTUP_RETIRED=str(retired),
        REBOOT_TEST_OUTBOUND_WRITER_BEFORE_DISPATCH=str(pre)), wait_ready=False)
    listening(t, tp)
    if restart == 0: until(retired.exists, t)
    until(pre.exists, t)
    current = snapshot(task); recovered = inspect_root_intent(current, db, task)
    readback = native_authority()
    observation = dict(restart=restart, intent=recovered, native=current, authority=readback.SerializeToString().hex(), events=lines())
    restarts.append(observation);rec.setdefault('startup_child_ack', []).append(observation);save()
    assert recovered['root'] == intent['root'] and recovered['receipt_key'] == intent['receipt_key']
    assert recovered['members'] == intent['members'] and recovered['zero_timestamp_verified']
    assert recovered['recovery_claimed'] and recovered['recovery_retired'], 'startup did not persist original child-ACK retirement'
    assert readback == authority, 'startup changed original native authority'
    assert [x['value'] for x in current] == [0, 0]
    assert not any(x['participants'] for x in current) and not current[1]['pending']
    assert len(current[0]['pending']) == 1, 'native Abort leaked staged successors'
    source = db.Task.FromString(bytes.fromhex(current[0]['tasks'][0]))
    assert source.status == db.Task.PENDING and not source.HasField('response') and not source.HasField('error')
    assert lines().count('transaction-apply') == lines().count('transaction-child') == 1
    if restart == 0:
        assert owned.read_text() == retired.read_text() == intent['root']
    else:
        # The durable ACK retirement survives a second fresh process; it does
        # not acquire a replacement UUID/owner or repeat member delivery.
        assert not owned.exists() and not retired.exists()
    stop(t);stop(c,cs);stop(d);stop(ld)
child_proxy.terminate();wait(child_proxy);assert child_proxy.returncode == 0
stop(planner)
cases.append(dict(case=requested_case, original_root_transaction_id=intent['root'], before=before,
    native_original_authority=authority.SerializeToString().hex(), restarts=restarts,
    expected='native-original-Abort-members-ACK-retired-source-Task-Pending', events=lines(),
    plan=plan.SerializeToString().hex()))
save()
