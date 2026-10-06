# Rust SDK parity ledger

## Reader-only one-shot task checkpoint

Partial vertical: generated immediate or absolute-UTC-scheduled unary reader tasks without declared errors,
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
Live admission also exercises 1023 pending plus one staged (committed state and
task) and 1024 plus one staged (ResourceExhausted, unchanged actor, absent staged
task). The fixture seeds real Store records while exclusive admission is held;
a same-host reader proves denied-root admission was released, and RocksDB restart
preserves all 1024 pending records in both cases. `*TasksAt` helpers accept
canonical protobuf UTC timestamps; staging and recovery validate their range.
Future records remain pending and do not block later immediate tasks. A real
RocksDB acceptance schedules a reader through the generated root, completes an
immediate peer before its deadline, crashes/restarts before the deadline, and
records the actual handler invocation instant to prove no early delivery. The
recovered task completes durably with its timestamp unchanged. Dispatch uses
host-owned 100ms canonical rescans, not per-task detached timers; handler failure
still leaves a task pending and fails supervision rather than retrying silently.
Canonical `rbt.v1alpha1.Tasks.Wait` is mounted as a public readiness-gated
service for one registered local actor. `wait_service(application, server_id,
placement)` requires server-owned identity and the host's shared accepted legacy
placement snapshots. It validates actor/UUID identity and routed-header agreement,
checks per-actor serving authority before and after Database Load and on every
pending poll, and waits
read-only for durable completion, and returns NotFound for absent tasks. Generated
`*TasksWait` helpers preserve Tonic request metadata/deadlines and decode the
method's exact response Any type. Real C++ acceptance exercises canonical and
typed deadlines without changing pending records, then typed completion/retrieval
and fail-closed wrong-type/malformed responses while the host remains running.
A newer live planner snapshot moving the actor revokes pending Wait and denies
completed retrieval on the old host without changing records; restoring authority
with a still newer plan allows retrieval without restart. Removing authority checks
fails this real-process regression. A deterministic restart vector also pauses
Wait after its real C++ Database Load reply, confirms a moved accepted plan through
a second request, then releases the first: it must reject the already-loaded
completion without changing the record or invoking the handler. Removing only the
post-Load check returns the stale result and fails this regression. The barrier is
behind test-support and a process-specific environment variable, with a 10-second
fallback bound. Another restart vector uses a real 250ms Wait deadline and confirms
the parked server future is dropped within two seconds, without releasing the
barrier or changing durable completion; a subsequent Wait still succeeds.
An append-only handler invocation log remains exactly one entry through result
retrieval, host recovery and deadline cancellation. Deliberately replaying the real
generated reader from completed Wait makes that assertion fail. Fixture host guards
kill and reap children on assertion failure as well as successful cleanup.
This proves no replay in these exercised completed-result paths, not exactly-once
task side effects generally.

Generated `*TasksWaitRouted<R>` owns an explicit `TransactionalChannelResolver`.
With `LegacyApplicationResolver`, every typed Wait resolves its TaskId against the
latest accepted plan for the caller-selected application before using the existing
canonical helper; metadata, routing headers and RPC timeout are preserved.
This matches the channel-selection portion of `templates/reboot.py.j2:4736-4759`,
not Python's retried-call or cross-application machinery. The resolver does not
cache a channel or retry an RPC; a custom resolver's own execution/deadline policy
remains the caller's responsibility. Real-process acceptance reuses one generated
client across two canonical client-planner snapshots and observes exactly one call
at each selected forwarding endpoint; responses come from the authoritative
generated host and actual C++ Database. The server's plan does not move: this is
client route selection, not dispatcher/actor migration. Deliberate channel caching
fails the endpoint-count assertion. Routed pending deadlines and typed completion
also run through the live canonical planner.

This is read-serving authority only, not
ownership fencing of the dispatcher or a guarantee against concurrent plan changes
after the final synchronous check.
ListTasks/streaming/CancelTask return Unimplemented; task authorization, typed
terminal errors and external/cross-application task routing remain outside this slice.

`ReaderTaskWaitService::new(owners, application, server_id, placement)` provides an
immutable multi-actor read-serving registry keyed by exact `(state_type, state_ref)`.
Empty/duplicate registrations and empty server identity fail construction. The
existing `OneShotTasks::wait_service` remains the single-actor convenience API.
Each owner must be separately registered with host recovery; Wait chooses that
owner's sidecar/binding/active state and retains routed-header, UUID and per-poll
before/after-Load placement checks. No unknown-actor fallback or dynamic discovery.
Source: Python `aio/internals/tasks_servicer.py:54-57` middleware registry; Rust
`src/one_shot_tasks.rs`. New real-C++ acceptance seeds durable pending records in
two independent actor sidecars and uses their actual generated readers to complete
them. Both actors deliberately share a task UUID but return distinct results;
unknown actor/type fail, restart preserves both completions, and invocation logs
stay at one entry each. A first-owner fallback RED control fails result retrieval.
A second real-process vector registers two different generated state types with
the SAME state-ref and UUID. Their reader bindings produce different protobuf
response types (`TransactionCounterValue` and string-valued `RegistryGaugeValue`);
Wait checks exact Any URLs and decodes the distinct results before and after
restarting BOTH RocksDB sidecars and the serving host. Full durable completion
records remain unchanged and each binding's invocation log stays at one entry.
Replacing composite lookup with state-ref-only matching fails result retrieval.
The gauge transaction method is explicitly unsupported in this seeded reader
fixture: no second-actor transaction scheduling/recovery proof is implied.
This proves multi-actor/heterogeneous Wait with independent registered recovery
owners, not multi-actor transaction scheduling, shared-shard Recover partitioning,
or migration. `OneShotTasks::pending` still validates the whole recovered batch
against its one registered actor; do not register independent owners over a shared
Recover stream containing both actors. C++ `reboot/server/database.cc:4121-4160`
recovers pending tasks by shard, without state-tag filtering; changing only each
Rust owner's state-tag map cannot safely partition the canonical stream. Source: aio/internals/tasks_servicer.py:48-126 and
templates/reboot.py.j2:4697-4775. Earlier durable RPC cancellation windows still need dedicated
acceptance. No exactly-once
handler effects, writer tasks, workflows, distributed task
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
