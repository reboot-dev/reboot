"""Included by the original finite native two-host custodian.
Unknown authority remains Pending, but now has an actual startup admission owner.
No native decision, receipt, error or source Task terminal is fabricated here.
"""
if case == 'remote-intent-restart':
    until((work/'remote-intent').exists, t)
else:
    until(child_ack.exists, t)
    wait(t); assert t.returncode != 0
before = snapshot(task)
intent = inspect_root_intent(before, db, task)
assert intent['zero_timestamp_verified'] and len(bytes.fromhex(intent['receipt_key'])) == 16
assert not intent['recovery_claimed'] and not intent['recovery_retired']
assert len(intent['members']) == 1 and intent['members'][0]['state_ref'] == leaf
assert [x['value'] for x in before] == [0, 0]
expected_child_entries = 0 if case == 'remote-intent-restart' else 1
assert lines().count('transaction-apply') == 1
assert lines().count('transaction-child') == expected_child_entries
stop(t); stop(c); stop(d); stop(ld)
observations = []
for restart in range(2):
    d, ld = database(), database(True)
    c, cs = host(True)
    owned = work/f'owned-{restart}'
    pre = work/f'before-source-dispatch-{restart}'
    t, ts = host(False, dict(REBOOT_TEST_CANONICAL_STARTUP_OWNED=str(owned),
        REBOOT_TEST_OUTBOUND_WRITER_BEFORE_DISPATCH=str(pre)), wait_ready=False)
    listening(t, tp); until(owned.exists, t); until(pre.exists, t)
    recovered = snapshot(task)
    current = inspect_root_intent(recovered, db, task)
    assert owned.read_text() == intent['root'] == current['root'], 'startup replaced original root UUID'
    assert current['receipt_key'] == intent['receipt_key']
    assert current['members'] == intent['members']
    assert current['zero_timestamp_verified'] and current['recovery_claimed'] and not current['recovery_retired']
    # A new public writer must queue on the actual original actor lease. A
    # mutation oracle inspects the real durable result regardless of RPC status.
    writer_status = 'returned'
    try:
        txn('Apply', app.Step(amount=1), uuid.uuid4())
    except grpc.RpcError as error:
        writer_status = error.code().name
        assert error.code() == grpc.StatusCode.DEADLINE_EXCEEDED, error
    durable = snapshot(task)
    observation = dict(restart=restart, intent=current, writer_status=writer_status, durable=durable,
                       events=lines())
    observations.append(observation)
    rec.setdefault('startup_ownership', []).append(observation); save()
    assert [x['value'] for x in durable] == [0, 0], 'startup ownership let normal writer escape'
    assert writer_status == 'DEADLINE_EXCEEDED'
    assert not any(x['participants'] for x in durable)
    pending = db.Task.FromString(bytes.fromhex(durable[0]['tasks'][0]))
    assert pending.status == db.Task.PENDING and not pending.HasField('response') and not pending.HasField('error')
    native = dg.DatabaseStub(grpc.insecure_channel(f'127.0.0.1:{dp}')).TransactionCoordinatorDecisionGet(
        db.TransactionCoordinatorDecisionGetRequest(root_transaction_id=uuid.UUID(intent['root']).bytes,
            coordinator_state_ref=ref), timeout=5)
    assert not native.HasField('decision'), 'startup inferred Abort from absent authority'
    observation['native_authority'] = native.SerializeToString().hex(); save()
    assert lines().count('transaction-apply') == 1 and lines().count('transaction-child') == expected_child_entries
    pre.with_suffix('.release').touch()
    # Do not wait for a terminal which this bounded owner is not allowed to mint.
    # The original target delivery queues on the same owned admission.
    stop(t); stop(c, cs); stop(d); stop(ld)
if child_proxy:
    child_proxy.terminate(); wait(child_proxy); assert child_proxy.returncode == 0
stop(planner)
cases.append(dict(case=requested_case, original_root_transaction_id=intent['root'], before=before,
    observations=observations, expected='original-startup-admission-owned-native-authority-unknown-Pending',
    events=lines(), plan=plan.SerializeToString().hex()))
save()
