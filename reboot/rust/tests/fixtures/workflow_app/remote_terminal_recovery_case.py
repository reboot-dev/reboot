"""Included by prove_remote_transaction.py under its original child custodian.
Post-handoff native terminal authority only; pre-handoff child uncertainty is
NOT resolved. Abort recovery deliberately leaves the source Task Pending.
"""
commit = case == 'authority-commit-ack-loss'

def original_authority():
    stub = dg.DatabaseStub(grpc.insecure_channel(f'127.0.0.1:{dp}'))
    pages = list(stub.Recover(db.RecoverRequest(
        shard_ids=[shard_by_server['root'].id],
        state_tags_by_state_type={'workflow.v1.AtomicLedger': 'AtomicLedger'},
        skip_idempotent_mutations=True), timeout=5))
    records = [(key, value) for page in pages for key, value in page.transaction_coordinators.items()
               if value.state_ref == ref]
    return records

def authority_readback(root_id):
    stub = dg.DatabaseStub(grpc.insecure_channel(f'127.0.0.1:{dp}'))
    decision = stub.TransactionCoordinatorDecisionGet(db.TransactionCoordinatorDecisionGetRequest(
        root_transaction_id=uuid.UUID(root_id).bytes, coordinator_state_ref=ref), timeout=5)
    return dict(root_transaction_id=root_id, decision=decision.SerializeToString().hex(),
                coordinators=[dict(root_transaction_id=k, record=v.SerializeToString().hex())
                              for k, v in original_authority()], state=snapshot(task), events=lines())

# Constructors must complete before the one exact decision-ACK fault is armed.
# Abort is obtained from genuine participant Prepare after its process crashes;
# no request fabricates an abort response, native record or decision.
if not commit:
    stop(t, ts); stop(c, cs)
    prepare_pause = work/'child-before-native-prepare'
    c, cs = host(True, dict(REBOOT_TEST_PAUSE_PARTICIPANT_PREPARE_REF=leaf,
                           REBOOT_TEST_PAUSE_PARTICIPANT_PREPARE=str(prepare_pause)))
    t, ts = host()
(dbfault/'armed').touch()
key = str(uuid.uuid4())
admitted = canonical('spawn', key)
task = tasks.TaskId.FromString(bytes.fromhex(admitted['task_id']))
if not commit:
    until(prepare_pause.exists, c)
    # Wait for the other fan-out member to be durably prepared; a marker alone
    # proves only that the child was parked, not that root handoff is durable.
    def root_prepared():
        current = snapshot(task)
        return any(db.Transaction.FromString(bytes.fromhex(raw)).prepared
                   for raw in current[0]['participants']) and len(original_authority()) == 1
    until(root_prepared, t)
    initial = original_authority()
    assert len(initial) == 1 and initial[0][1].preparing
    original_root = initial[0][0]
    rec.setdefault('authority_attempts', []).append(dict(case=case, phase='pre-crash',
        readback=authority_readback(original_root))); save()
    stop(c)  # requested crash while original Prepare is parked
    wait(t); assert t.returncode != 0
    stop(d); stop(ld); d, ld = database(), database(True)
    c, cs = host(True)
    t, ts = host(False, wait_ready=False)

until((dbfault/'ack-observed.json').exists, t)
request = db.TransactionCoordinatorDecisionPutRequest.FromString((dbfault/'store-request.pb').read_bytes())
original_root = str(uuid.UUID(bytes=request.root_transaction_id))
assert request.decision.coordinator_state_ref == ref
expected_outcome = db.TransactionCoordinatorDecision.COMMIT if commit else db.TransactionCoordinatorDecision.ABORT
assert request.decision.outcome == expected_outcome
lost_ack = authority_readback(original_root)
assert len(lost_ack['coordinators']) == 1
assert lost_ack['coordinators'][0]['root_transaction_id'] == original_root
assert db.TransactionCoordinatorDecisionGetResponse.FromString(bytes.fromhex(lost_ack['decision'])).decision == request.decision
rec.setdefault('authority_attempts', []).append(dict(case=case, phase='native-decision-ACK-lost', readback=lost_ack)); save()
(dbfault/'release').touch()
wait(t); assert t.returncode != 0
stop(c); stop(d); stop(ld)
# There is now an immutable terminal decision under the original transaction ID.
# A mutation outage is non-definitive, not a new outcome. Recovery must use Get
# and original membership/terminal RPCs rather than require DecisionPut again.
(dbfault/'deny-decision-put').touch()
d, ld = database(), database(True)
c, cs = host(True, wait_ready=False); listening(c, cp)
pre = work/'recovered-source-before-dispatch'
t, ts = host(False, dict(REBOOT_TEST_OUTBOUND_WRITER_BEFORE_DISPATCH=str(pre)), wait_ready=False)
until(lambda: pre.exists() or t.poll() is not None)
recovered = authority_readback(original_root)
rec.setdefault('authority_attempts', []).append(dict(case=case, phase='restarted-terminal-recovery', readback=recovered,
    denied_decisions=(dbfault/'denied-decisions.jsonl').read_text() if (dbfault/'denied-decisions.jsonl').exists() else '')); save()
# These exact native assertions are the RED oracle, not a Wait timeout.
assert recovered['coordinators'] == [], recovered
assert not any(x['participants'] for x in recovered['state']), recovered
assert [x['value'] for x in recovered['state']] == ([7, 7] if commit else [0, 0]), recovered
assert recovered['decision'] == lost_ack['decision'], 'recovery changed original authority'
assert pre.exists() and t.poll() is None
assert not (dbfault/'denied-decisions.jsonl').exists(), 'recovery republished a known immutable decision'
assert lines().count('transaction-apply') == 1 and lines().count('transaction-child') == 1
original_task = db.Task.FromString(bytes.fromhex(recovered['state'][0]['tasks'][0]))
assert original_task.status == db.Task.PENDING and not original_task.HasField('response') and not original_task.HasField('error')
if commit:
    # Reauthorization before the cached target response remains mandatory. Only
    # the real saved root receipt may bridge the separate source journal/CAS.
    deny.touch(); stop(t)
    t, ts = host(False, wait_ready=False); wait(t); assert t.returncode != 0
    assert authority_readback(original_root) == recovered
    deny.unlink(); t, ts = host()
    result = canonical('wait', admitted['task_id'])
    assert result == {'response': {'value': '7'}}, result
    final = authority_readback(original_root)
    finished = db.Task.FromString(bytes.fromhex(final['state'][0]['tasks'][0]))
    assert finished.status == db.Task.COMPLETED
    assert finished.response.type_url == 'type.googleapis.com/workflow.v1.Value'
    assert app.Value.FromString(finished.response.value).value == 7
    assert final['events'] == recovered['events'] and final['coordinators'] == []
    stop(t, ts); stop(c, cs); stop(d); stop(ld)
    d, ld = database(), database(True); c, cs = host(True); t, ts = host()
    assert canonical('wait', admitted['task_id']) == result
    assert authority_readback(original_root) == final
    stop(t, ts); stop(c, cs)
else:
    # A native Abort is NOT a declared-result receipt, source Stored ACK or
    # terminal Task CAS. There is no authority here to invent any of those.
    assert not recovered['state'][1]['pending']
    assert len(recovered['state'][0]['pending']) == 1  # original source only
    final, result = recovered, dict(terminal=False, source_task='Pending', native_original_attempt='Abort resolved')
    stop(t); stop(c, cs)
stop(d); stop(ld)
dbproxy.terminate(); wait(dbproxy); assert dbproxy.returncode == 0
stop(planner)
cases.append(dict(case=case, admission=admitted, original_root_transaction_id=original_root,
    lost_ack=lost_ack, recovered=recovered, final=final, result=result,
    events=lines(), plan=plan.SerializeToString().hex()))
save()
