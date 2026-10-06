# Rust SDK parity ledger

## Reader-only one-shot task checkpoint

Partial vertical: generated immediate unary reader tasks without declared errors,
for the same local actor, scheduled only by fresh exclusive non-factory roots.
The host owns one dispatcher per normalized Database endpoint/type/reference;
startup and live canonical recovery scans validate the whole bounded pending set
before dispatch. Delivery is serialized, notifications are coalesced hints, and
live scans discover durable commits even when notification is lost. Staging
checks UUIDv4/RFC4122 identity, duplicate staged IDs, any existing durable ID,
and pending-plus-staged capacity (1024) while participant actor admission is held.
Cancellation/errors leave pending records, not synthetic terminal results.

Real C++ Database/RocksDB acceptance exercises generated root invocation through
live canonical PlacementPlanner, denial cleanup, commit plus pending task,
crash/redelivery, CompleteTask, second restart without redispatch, completed-ID
reuse denial, and live durable discovery without a notification. The discovery
vector writes a pending record via real Store. A separate real-C++ ownership
acceptance cancels a fresh root in its handler, admits the next root, loses that
root's durable participant Commit ACK, observes supervised host failure, then
restarts through legacy transaction recovery and completes the task. Uncertain
handoff never speculatively releases or aborts the participant. Duplicate-owner
release has an ownership-only unit test, not cross-process fencing evidence.
Admission-specific local ownership tokens prevent delayed guard cleanup from
releasing a later admission which reuses the transaction UUID; a deterministic
regression exercises old-guard Drop after readmission. The full generated C++
process suite also exercises exclusive inbound mutated-state persistence when
`final_state` is omitted; explicit final-state overrides remain authoritative.
A real Tonic request deadline also cancels admission after canonical Recover
and before staging/Prepare, verifies unchanged actor state and no durable task or
transaction records, then admits a retry on the same participant. A second
request deadline cancels after real Database Commit while terminal delivery is
parked: the supervised host fails, the task reader does not acquire the uncertain
lease, and restart through legacy recovery completes the task. Failed readiness
also cancels already-admitted unary RPCs, including control calls, without
releasing uncertain participant ownership. A real competing-request regression
keeps its client open without a deadline, proves host termination, and completes
the task after restart; removing only the ingress cancellation reproduces the
shutdown hang. Generator regression coverage excludes declared-error readers
from scheduling and dispatch surfaces. Real RocksDB recovery accepts exactly
1024 pending tasks and rejects 1025 with ResourceExhausted before any reader
runs; crash/restart retains every pending record unchanged in both cases.
Live pending-plus-staged saturation and earlier durable RPC cancellation windows
still need dedicated acceptance. No exactly-once
handler effects, writer tasks, workflows, delayed schedules, distributed task
ownership, task auth, retries, or full Rust/Python task parity are claimed.
Python sources: templates/reboot.py.j2:420-467,858-1028,2350-2475;
aio/state_managers.py:4743-5009,6586-6593,6848-6867;
aio/internals/tasks_dispatcher.py. Rust: src/one_shot_tasks.rs and src/codegen.rs;
acceptance: tests/fixtures/task_vertical_acceptance.rs.


This ledger is deliberately evidence-based. A row is **implemented** only when
it has an exercised Rust path; it is **proven against the sidecar** only when a
real C++ Database process/RocksDB acceptance covers it. Unit fixtures and
in-process fake sidecars are useful but do not establish distributed semantics.

## Implemented and verified in Rust

- Proto/Tonic generation, concrete unary service adapters, state admission, and
  typed outbound transaction clients.
- Durable Database-sidecar state and idempotency mutation handling, including a
  request fingerprint collision guard.
- Root exclusive transactions, root factory transactions, inbound participant
  handling, returned participant collection, and durable legacy coordinator
  `Watch`/recovery ordering.
- Bounded shared/read-only transactions: read-only participants are classified
  separately from writers, and all-read-only decisions are persisted.
- Isolated Native2pc protocol, recovery/materialization primitives, placement
  plan validation, and native state reads. Native2pc deliberately does not reuse
  legacy participant/coordinator records or RPCs.
- Actor gate shared/exclusive exclusion, FIFO writer queueing, reader-barge
  prevention, cancellation-safe queue removal, and retryable upgrade rejection
  when a queued writer would otherwise deadlock a snapshot holder.

The strict Rust baseline at commit `a4c56672` is `cargo fmt --check`, locked
all-target/all-feature Clippy with warnings denied, and locked all-target/all-
feature tests. On 2026-10-05, all available real C++ Database/RocksDB
acceptances were rerun successfully with the Rust checkout at `0238b3b0`: 10
generated legacy-process tests and 8 Native2pc transport-process tests. They
remain explicitly gated by `REBOOT_NATIVE2PC_CXX_DATABASE` for future
environments.

## Pending: fresh local shared-to-exclusive promotion

**Use case:** a fresh root transaction for one existing actor starts shared. If
its final state is byte-for-byte unchanged, it completes read-only. If its
final state changes, it upgrades atomically and commits as the sole local
writer. This is the bounded Python-compatible case; it excludes factory,
nesting, placement, automatic idempotency, tasks, collection effects, returned
participants, remote calls, workflows, and Native2pc.

**Why it is pending:** Rust has the gate and participant classification pieces,
but no safe end-to-end generated path yet. The production path must retain the
exact local pending ownership and actor lease through successful
`CoordinatorPrepare` acknowledgement. It must then directly prepare/commit/abort
that exact local participant rather than resolve it again by address.

The generated fresh-shared API also needs a separate opaque local-only handler
context. Passing the normal `TransactionContext` would permit outbound calls or
returned participants, violating the bounded local guarantee. Compatibility is
non-negotiable: if an application does not opt into the opaque hook, the
promotable local lease must be dropped first, then the existing legacy shared
read-only handler runs in a separately started transaction. The legacy handler
must never inherit promotion authority.

**Required acceptance coverage before this can be marked implemented:**

1. Generated/downstream fixture: opt-in changed final state uses direct local
   coordinator completion; the resolver is never called for that participant.
2. Generated/downstream fixture: opt-in unchanged final state completes the
   direct read-only path without C++ participant write/terminal calls.
3. Generated/downstream fixture: `Unsupported` hook releases the local
   promotable lease before the legacy handler begins; the legacy handler cannot
   promote, mutate transaction state, or make an outbound transactional call
   under that authority.
4. Unit tests: pre-`CoordinatorPrepare` error/cancellation drops and releases
   pending gate ownership; after a successful acknowledgement, drop does not
   release it because durable recovery owns ambiguity.
5. Unit tests: reject every out-of-scope shape (factory, nested, absent actor,
   tasks, idempotency, returned participants, placement, remote effects).
6. Real C++ Database/RocksDB process tests: same-host contention, durable final
   bytes, kill/restart after coordinator-prepare and after decision, recovery,
   and exactly-once final application/response.

## Implemented: exclusive-to-shared downgrade

**Python source:** `aio/state_managers.py:1711-1760,1936-1961` defines an
exclusive-to-shared transition that admits compatible queued readers before the
next writer while preventing reader barging.

**Rust implementation:** `src/runtime.rs` uses one ordered reader/writer waiter
queue. `ExclusiveActorLease::downgrade(self) -> SharedActorLease` performs the
linear mode transition and wakes the leading reader cohort; readers after a
queued writer remain blocked. Dropping any queued reader or writer removes its
ticket and wakes the queue. Upgrades still reject when any queue entry exists,
so a shared snapshot never bypasses or deadlocks behind a writer.

**Unit evidence:** `actor_gate_downgrade_admits_earlier_readers_without_reader_barge`
and `actor_gate_cancellation_removes_a_grant_ready_reader` cover the new queue
semantics. Existing `actor_gate_queues_writers_fifo_and_blocks_reader_barge`,
`actor_gate_cancellation_removes_queued_writer_even_when_grant_is_ready`, and
upgrade tests cover FIFO writer exclusion, grant-ready cancellation, and
non-bypassing upgrade behavior.

## Pending: workflow-scoped idempotency aliases and seeds

**Use case:** Python can derive stable idempotency keys from a human alias, an
optional control-loop iteration, and nested workflow seed scopes. Identical
seeded calls must retain the same UUID across process restarts and SDK versions;
inner seed entries override outer keys.

**Why it is pending:** Rust has only a caller-supplied UUID for generated
root-exclusive transactions. Python derives its seed UUID with UUIDv5 over the
hex of a protocol-4 Python pickle of sorted entries (`aio/idempotency.py:34-134`).
Replacing that with `serde`, a debug string, or Rust's default hasher would
silently generate incompatible keys, which is worse than no API. Workflow and
iteration ownership are also absent from the Rust runtime.

**Required acceptance coverage:** cross-language vectors for alias-only,
iteration-only, alias-plus-iteration, nested seed override/restoration, and
seeded UUID derivation; then a real sidecar replay acceptance across a Rust
process restart. No Rust public alias/seeds API should be exposed before those
vectors and workflow context semantics exist.

## Other known parity gaps

These are not blockers for the local promotion slice and should be tackled
independently rather than smuggled into it:

- Generic Rust application lifecycle/registration comparable to Python's
  application and middleware runtime.
- Task/workflow execution, reactive/streaming readers, colocated collection
  range effects, and their durable recovery semantics.
- General nested/distributed transaction behavior beyond the explicitly
  supported legacy and isolated Native2pc paths.
- First-class Rust state reflection/derive support with the same schema
  compatibility model as the Python-facing SDK.
- CLI support to build/install/run a Rust application rather than requiring a
  prebuilt plugin and consumer-owned Prost/Tonic bindings.

Each requires its own design and real sidecar acceptance; none should be claimed
by the current generated unary adapter surface.
