# Durable future transaction successor execution

Frozen implementation/proof source: `e4a570a8f76581acb7738cb9853c0c2d16e38382`.
Reviewed predecessor: `d3160c1b833ee4ec5267ceca432c392981c7e1d5` (PR216).

## Source-backed contract

- Python `reboot/templates/reboot.py.j2:861-946` dispatches transaction tasks through the generated application RPC, with task-stable idempotency, and completes the task separately. `reboot/aio/state_managers.py:6481-6519` prepares state, tasks and idempotent mutations together; `:6541-6598` waits for native participant Commit before dispatching tasks.
- C++ `reboot/server/database.cc:2671-2679` requires transaction task upserts to belong to the same participant actor. `:3457-3555` commits/rolls back the RocksDB transaction; `CompleteTask` is a separate terminal CAS. A same-actor successor is therefore not a foreign-actor task Store hidden inside the parent transaction.
- Rust already has the needed execution seam: generated `AtomicLedgerMethodsTasks::apply`, transaction `task_upserts`, original-participant root-star commit, host-owned `MultiOwnerTaskRecovery` canonical rescanning, durable due-time checks and canonical typed Wait. No runtime/generator change is necessary or claimed. `one_shot_tasks.rs:2832-2879` bounds and owns recovered deliveries and rescans canonical Pending records. Transaction dispatch releases initial admission before the generated root RPC; target commit, task-scoped source journal and terminal CAS remain distinct boundaries.
- `workflow_outbound_writer.rs:328-355` stores the acknowledged typed result in a task-scoped `Any(AtMostOnceResultV1)` envelope. `workflow_store.rs:407-455` persists that journal independently. The source journal's raw response is not the target root receipt's raw response: decode format, Stored phase and typed result before comparing payloads. `runtime.rs:1088-1095` deliberately requires the bounded transaction-root receipt's `task_ids` to be empty; successors remain separately canonical durable tasks committed with the participant effects. Do not retrofit ordinary-writer checkpoint task IDs into that different receipt contract.

## Executable capability

`TRANSACTION_SUCCESSOR_PROOF` is a fixture-only mode. A canonical Python `WeakReference.spawn(Apply)` runs the existing registered exclusive root→leaf transaction with amount 7. Its root commits an actual future `Apply(amount=11)` task in the same actor scope. The successor runs the same root→leaf transaction; both actor values become 18. It suppresses recursive successor staging. Append-only events at each real handler entry record execution counts and the successor's wall-clock entry time.

The mixed fixture's child owner must be transaction-capable in this mode so the declared-error negative can stage an actual transaction child task. The old reader-only child owner correctly rejects that binding; this is fixture configuration, not an invented runtime capability. Default fixture behavior and the pure adapter's explicit journal-store ownership remain unchanged.

`prove_transaction_successor.py` exercises three cases independently for mixed and pure services:

1. Live future successor execution, typed canonical Python Wait, durable response and root/leaf effects.
2. Application plus native Database/RocksDB restart while the exact successor remains Pending, with unchanged records inspected **before** the recovered application starts; then actual execution after its retained timestamp.
3. Crash after the successor's real target root ACK but before source journal ACK/terminal CAS. Both actors are already 18 while the task remains Pending. Restart replays the target receipt, returns typed 18 and does not rerun either handler.

Every case also restarts both processes after terminal completion, replays the original parent spawn/Wait and successor Wait, compares full retained records, and requires exactly two root Apply entries and two leaf Apply entries overall (one parent execution and one successor execution). Actual successor handler timestamps must be at or after the durable schedule.

`prove_transaction_successor_abort.py` runs canonical typed declared failure with an actually staged future transaction task on the leaf, acknowledged child Abort and separate root error receipt. It requires root/leaf values 0, no escaped Pending child, no successor handler entry, typed error 4242/7, and unchanged retained storage after restart **and after the aborted child's original due time has passed under a live recovered host**.

## Boundaries

This qualifies one existing-actor, exclusive, registered local root-star transaction successor vertical for mixed and pure adapters. It is not arbitrary external-effect exactly-once execution, distributed task migration, remote-child composition, shared/factory task admission, or due/running transaction cancellation. Those fences remain in force and are regression-tested. Pure construction still uses separate bootstrap factory hosts. Canonical/local protobuf Empty consumers are compiled and linted, not presented as native Empty-service execution.

See `tests/evidence/transaction-successor-20261021.md` for exact native counts, RED controls, archive pins, custody and reproduction commands. Historical checkpoint reports retain their original staging-only qualification; they are not rewritten retroactively.
