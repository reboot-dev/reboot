## Bounded descendant first-touch rollback (review candidate)

Supervised exclusive non-idempotent **A→B→C**, distinct existing actors, now
admits C's canonical method-declared first-touch error at B. B must enlist the
exact singleton C reader before exposing the catch, then succeed; A remains the
only coordinator and commits A/B writers plus C reader. Actual guard-installed
inbound provenance binds the complete original headers and initialized ledger;
a derived outbound clone or builder opt-in cannot manufacture this authority.
The ordinary `enforce_live_leaf` restriction is unchanged. C's private mutation
and task envelope are never staged, and its exact live incarnation atomically
retains a read-only lease until valid aware/read-only Prepare.

Python references: `reboot/aio/contexts.py:1225–1244` (original root coordinator),
`state_managers.py:835–947,1082–1108,1179–1216` (ownership, first-touch rollback),
`aio/stubs.py:698–755` (error membership before call completion), and
`state_managers.py:6417–6465` (ownership barrier/read-only Prepare release).
Rust source: `src/{runtime,explicit_abort,durable_participant,codegen}.rs`;
real-process fixtures: `tests/fixtures/descendant_rollback{,_failure}_acceptance.rs`.

Exercised scoped acceptance uses three real canonical CXX/RocksDB processes:
typed and distinct legacy Status-only C handlers, B-catch and A-after-B barriers,
unchanged admitted C readers and blocked genuine C writers, durable exact
A/B-writer+C-reader maps, actual paths/original A identity, absent canonical C
private task identity (Pending or Completed), no C-error canonical idempotent records (legitimate Apply(0) readmission probes
are distinguished by their exact request fingerprint),
and all-sidecar restart. Failure vectors cover B failure
after catch (including declared error; A cannot recover that subtree), A error
and deadlines, lost B success/unknown C's actual A Watch, unsupported error/member
vectors at B with independently wrong type/reference, and C restart before
Prepare. That restart exposed a previous successful public response after a
definitive durable Abort: completion now carries an internal acknowledged outcome
so the guard releases settled supervision but returns Aborted, rather than
confusing it with ambiguous handoff failure. Exact lifecycle units retain all
three wrong Prepare flag pairs and queued/inflight old Watch exclusion against a
still-live replacement, plus shutdown uncertainty and full-path negatives.

**Not full Python/Rust parity.** No general subtree/ancestor staged snapshot
rollback, sibling/reentrant actors, arbitrary depth, retries, shared/factory or
idempotent scopes. Missing-pending duplicate-Prepare/lost-ACK retry parity is
explicitly excluded: restarted C must fail closed; no synthetic Prepare success
or crash-surviving read lock is supplied. Final source-stable verification and
causal-control evidence are tracked separately in
`/tmp/reboot-rust-descendant-checkpoint.md`; this section is not certification.

## Candidate: bounded first-touch declared-error leaf rollback

The supervised A→B path now rolls a method-declared error back to retained
shared/read-only B ownership. Generated clients validate exact singleton read-only
error membership, enlist it, and complete the counted outbound scope before
exposing the typed error. A can catch and commit its own state. The default typed
transaction hook preserves legacy Status handlers, but malformed/noncanonical
rich statuses, unknown/system/transport errors and missing/invalid membership
still doom the supervised root. This is a cooperative application contract,
not malicious-registrar or malicious-handler isolation.

Only existing distinct actors, active registered exclusive non-factory/non-idempotent
fresh root, exact first-touch direct B incarnation and active reserved Watch are
supported. Staged B effects, descendant calls, reentry, sibling fanout and previous
membership are rejected. Private failed handler state/effect envelopes are never
staged; this does **not** restore previously staged ancestor or sibling effects.
There is no general RelinquishOwnership, nested rollback/retry, pre-Prepare crash
recovery, migration fencing, or full Python parity claim.

Real CXX/RocksDB acceptance covers both the typed handler and a distinct legacy
Status-only handler using the generated default typed hook, through the actual
adapter/client and durable catch+Commit/restart. It checks unchanged B, reader
admission while a writer remains blocked until root Prepare, root Abort/deadline
cleanup, and failclosed error/membership paths including independent wrong-type/
right-reference and right-type/wrong-reference vectors. Unsupported outcomes may
remain typed or System errors: the harness checks caught errors, empty membership
and a doomed root, not an incorrectly mandatory Grpc variant. Unit acceptance
covers exact-incarnation rejection, old guard/Watch against a live same-root
replacement (queued and in-flight Commit), atomic downgrade/Prepare exclusion,
all three wrong Prepare flag pairs, and Watch shutdown before/after downgrade,
queued and active transfer.
The failed method's private task envelope is discarded before staging; absence
of Pending tasks is checked on all sidecars/restart, not proof of rollback of
already-staged effects or exactly-once dispatch. No failed-method idempotent
effects are staged (idempotent scopes are excluded). Three separately exercised
causal RED controls detect early release, omitted enlistment and actual durable
private-state leakage; finally restoration compares full source inventories.
Final broad regression and independent review status belongs to
`/tmp/leaf-rollback-checkpoint.md`; this section is candidate scope, not certification.

## Verified bounded slice: method-declared one-shot task results (2026-10-07)

This verified slice extends the historical response-only task slices below;
those older sections retain their original acceptance scope, not a current exclusion
of declared task errors. **Overall Python/Rust task and transaction parity remains
partial.** See `TASK-DECLARED-RESULT-CANDIDATE.md` for current-source evidence.

- Generated existing-actor unary readers and ordinary non-constructor writers can
  persist method-declared `Any<google.rpc.Status>` results and use typed canonical
  `Tasks.Wait`. Workflows and transactional task targets remain excluded.
- A registration-time immutable method table binds full RPC identity, Rust state
  declaration, request and response types, persisted request decoding, response URL,
  declared error URLs and payload decoders. Generated owners install this table;
  overridable custom binding validators cannot grant extra declared authority.
  Legacy `OneShotTasks::new` remains response-only. `new_with_declarations` is an
  **explicit trusted application registration API**, not proof that a declaration
  originated in protoc and not a sandbox against malicious host registration.
- Generated waiters set the full expected method on the canonical Wait RPC; the
  server checks the stored task's actual method and validates its terminal before
  returning it. Same-response/same-error cross-method TaskIds are rejected.
  Rich RPC failures stay `Grpc`; only a validated stored error becomes a declared
  typed result. This is a same-framework canonical-service contract, not an
  authenticated result certificate for an arbitrary third-party Tasks server.
- Writer failure discards private mutated state before Store. Only runtime-produced
  pre-Store handler failure receipts receive three bounded host-owned attempts,
  reloading and readmitting the original task without rewriting its schedule.
  **Reader escaped failures are not retried in this slice.** Store/Load/checkpoint
  and completion uncertainty, cancellation and transport failures are not retried.
- Declared receipts keep fail-before-exclusive-release protection across custom
  binding awaits and completion CAS. Lost completion ACK is one attempt, sticky
  failed readiness and restart recovery. Before completion CAS a declared handler
  return is explicitly at least once; no error checkpoint or exactly-once handler
  guarantee is claimed.
- Participant-local declared-capable A→B→C tasks remain invisible before Commit;
  Abort discards staging. Equal CAS error winners are accepted only after canonical
  reload and exact terminal comparison; conflicting winners fail closed.

# Rust Reboot SDK

## Verified participant-local reader and writer tasks in supervised trees

This **verified bounded vertical, not full Python SDK parity**, extends
explicit `with_supervised_transaction_tree()` to unary immediate/absolute-UTC
reader and ordinary-writer tasks for each participant's own existing actor.
The root needs its actual registered cleanup/execution reservation; inbound B/C
need an active reserved Watch and the exact admitted live incarnation. An open,
quiescent, non-doomed exclusive non-factory/non-idempotent branch and a registered
singleton dispatcher sharing the participant's actor, Database endpoint **and
actor gate** are required. Builder attachment alone is not authority.

Tasks remain local participant effects carried by Prepare. Successful inbound
trailers, a root decision alone, and queue hints are not publication authority.
Canonical committed Pending records become runnable only after immutable root
Commit and local terminalization; the retained exclusive lease blocks dispatch
when terminal ACK is uncertain. One terminal attempt is retained and the host
fails rather than blindly retrying. Prepared recovery uses durable decisions;
unknown C observes root Abort through its own reserved Watch, never presumed
absence. The writer executor retains acknowledged state+saved-response Store
followed by separate completion CAS, replaying the saved response without
remutating even after an intervening ordinary writer.

Source comparison: Python `aio/state_managers.py` task validation/staging/Commit
and `aio/contexts.py`, `aio/stubs.py` transaction membership; Rust
`src/{codegen,explicit_abort,durable_participant,one_shot_tasks,runtime}.rs` and
`tests/fixtures/tree_participant_task_acceptance.rs`. Real-process acceptance
uses three independent canonical C++ Database/RocksDB sidecars and generated
A→B→C hosts, not a synthetic store. Final restored-source verification passed **88 real CXX/RocksDB process cases**
(baseline78 plus10 tree-task cases), **8 Native2pc cases**, locked all-features/
all-targets tests (**255 library**, **26 generated downstream** vectors), strict
Clippy (`-D warnings`), formatting and **3 compile-fail doctests**. Full-record
negative matrices cover all three actors and preserve seeded Pending/Completed
records across RocksDB restart. The C-only no-Watch causal mutation failed at
C exclusive readmission after actual A→B→C paths and successful A/B readmission;
source was restored with an equal complete inventory. Earlier old-gate,
premature-hint, no-canonical-scan and no-terminal-retention controls are separately
checkpointed. Independent read-only bounded source review found no new blocker;
it did not rerun acceptance. Logs are `/tmp/tree-tasks-final-{full-cxx,native,
alltargets,clippy,fmt,doctests}.log`; exact source/log identities and ownership
handoff are in `/tmp/tree-participant-tasks-checkpoint.md`. This is a self-contained verified delivery, not a full-parity release.

Unsupported: arbitrary cross-actor task upserts, shared/factory/idempotent tree
scheduling, sibling fanout, nested rollback/retry or catch-and-Commit after
uncertainty, general pre-Prepare coordinator-death resolution, migration,
endpoint-alias/cross-process fencing, task declared-error retry policies,
workflows and exactly-once external effects. This does not establish atomic
Store+CompleteTask or the full Python task/runtime contract.

Generated adapters can opt into bounded host-owned root handler cancellation;
see [scope, registration, safety limits and executed evidence](PARITY-MAP.md#bounded-generated-root-handler-cancellation).
Root-local readers can be staged by
[owned distributed roots](PARITY-MAP.md#owned-distributed-roots-with-root-local-reader-tasks);
A [bounded remote exclusive-leaf reader extension](PARITY-MAP.md#remote-actor-unary-reader-task-checkpoint)
now stages tasks on the remote actor. General remote task trees, unknown-membership
enumeration and pre-Prepare coordinator-crash recovery remain unsupported.

For the narrower explicit-error cleanup contract, see the canonical
[pre-handoff failure checkpoint](PARITY-MAP.md#explicit-pre-handoff-transaction-tree-failure-checkpoint).

## Supervised successful-return descendant trees

Generated adapters explicitly opt in with `with_supervised_transaction_tree()`.
This is a separate bounded transaction path, extended only by the candidate
participant-local reader/writer task authority above: fixed hosts, existing distinct actors, exclusive non-factory and
non-idempotent methods, one child per branch, at most 32 transaction IDs and
1024 transitive participants. The root requires its actual active registered
execution/cleanup reservation; each inbound actor requires an active reserved
exact-incarnation live-Watch execution. Builder attachment alone grants neither.
Successful return carries local plus transitive descendants; a non-drainable
branch ledger and counted generated outbound scopes seal only at quiescence,
before execution ends. Surviving generated clones cannot start another child after
closure. Manual scoped-request callers must retain their scope through validated
trailers; reusable scopes/caller-asserted completion are not misuse-proof RPC
ownership. Cancellation during the sealed pre-handoff execution-mutex wait retains
the same host cleanup registration/permit; durable handoff still forbids Abort.
Inbound branches cannot drive the root coordinator. Caught uncertain child
outcomes doom the branch: no child rollback or retry permits catch-and-Commit.

Three independent generated hosts and canonical C++ Database/RocksDB sidecars
exercise A -> B -> C Commit/restart, complete durable membership before fanout,
confirmed root error/deadline cleanup, lost B trailers with unknown C self-Watch,
target-first prepared recovery, active-child Prepare/terminal exclusion,
missing/inactive/full Watch owners, missing-task-owner denial at all three actors, and lost C
terminal ACK with retained exclusive admission, one attempt and restart. Explicit
scope vectors exercise duplicate IDs, depth overflow, shared/factory/idempotent
rejection and self/root reentrant child rejection; caught B -> C uncertainty is
asserted at the actual handler catch branch. Public API tests separately exercise
ledger/helper ownership and inbound root-drive rejection. Final verification and
remaining scope are recorded in
[the parity map](PARITY-MAP.md#candidate-supervised-successful-return-descendant-trees-not-yet-delivered).

No general cross-actor task trees, sibling fanout, child rollback/retry, arbitrary ancestor actor
routing validation, pre-Prepare coordinator-crash recovery, migration/fencing or
exactly-once effects are established. Actors must be distinct by host composition;
the outbound seam rejects the current actor and root coordinator explicitly.
Lost actor-only terminal ACK retains ownership and fails supervision without
retry. An already-pending Watch observes uncertainty on response/recheck or the
existing owner deadline, not a universally immediate wakeup.

## Delivered reader-only one-shot task checkpoint

The **verified bounded writer-task vertical** additionally emits immediate/UTC
writer scheduling and typed Wait for unary non-constructor/no-declared-error
targets, behind explicit `with_one_shot_writer_tasks` singleton attachment.
It uses dispatcher-owned exclusive admission, an opaque acknowledged
Store/checkpoint receipt, and separate completion CAS. Real CXX/RocksDB crash
replay and lost-ACK vectors are exercised. Added downstream custom-binding
acceptance proves post-Store and strict-replay receipt cancellation propagates
Failed through graceful shutdown while preserving Pending; compile-fail tests
reject fabricated receipts, arbitrary Any success, and method/request replacement.
Generated real-process proof covers writer staging/Prepare without dispatch, UTC
`At`, and malformed identity/scheduling/inactive-owner rejection. Strict checkpoint
and losing-CAS rejection preserve canonical records across RocksDB restart.
Final verification: 255 library tests, 26 generated downstream vectors, 78 real
CXX/RocksDB process cases, 8 Native2pc cases, 3 compile-fail doctests, formatting
and strict Clippy passed; independent safety delta review found no new blocker.
See the verified writer section of `PARITY-MAP.md` for bounded evidence scope.
The reader exclusions below describe the reader contract, not writer capability.

Partial vertical: generated immediate or absolute-UTC-scheduled unary reader tasks without declared errors,
for the same actor, scheduled by fresh exclusive non-factory roots or a guard-owned
non-idempotent direct-root remote exclusive leaf. The latter requires the generated
adapter's `with_live_participant_owner(...)` and the same owner's
`live_participant_recovery_registration()` on `ApplicationHost`, in addition to
the matching singleton task owner/recovery registration. Builder attachment is
not active ownership. Shared/factory/idempotent/deeper/descendant **task-producing**
shapes and shared-registry scheduling remain rejected. Explicit supervised
transaction-tree opt-in also permits the bounded candidate participant-local tasks above. Inbound success stages effects only:
no predecision dispatch hint is emitted; canonical host scans admit/reload the
durable task after participant terminal ACK. Independent C++ sidecar acceptance
exercises target-local Commit/Wait, prepared restart/redelivery, no completed
replay, precise ownership/scope rejection and Drop-before-terminal cancellation.
Lost coordinator-driven terminal ACK retains ownership and is detected when live
Watch rechecks its exact participant under the mutex; this is not universal
immediate detection for an already-pending Watch RPC, nor actor-wire fencing.
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
Rust owner's state-tag map cannot safely partition the canonical stream.
Real-sidecar fail-closed acceptance now seeds a valid local Pending task plus a
foreign-ref or foreign-type Pending task in the SAME shard/database. After a
RocksDB restart, a primary-type-only canonical Recover request returns BOTH full
records. Single-owner host startup rejects with the exact identity validation
error before any reader marker/invocation; actor state and both Pending records
remain unchanged after another RocksDB restart. A RED silently filtering unknown
owners admits the host and fails both tests. This is rejection-boundary evidence,
not successful shared-shard multi-owner recovery. Wrong-type Wait rejection uses
a registered state-ref in both registry vectors, isolating the type mismatch.

**Shared-shard reader recovery:** `ReaderTaskRecoveryRegistry::new(owners, request)`
now collects ONE canonical stream from a common Database endpoint, bounds the
entire Pending batch to 1024, partitions by exact `(state_type, state_ref)`, and
validates EVERY generated binding before activating any owner. Empty/duplicate
owners, mismatched endpoints, missing state tags/shards, foreign task identities,
and malformed binding requests fail closed. One host-owned serial dispatcher
rescans the whole stream every 100ms, reuses canonical task Load/actor admission/
UTC scheduling/CompleteTask CAS, and owns every local dispatcher claim. Its
uncertainty watchers are bounded by owner count and cancelled/joined on exit.
Register this component after legacy transaction recovery; do NOT also register
individual `owner.recovery(...)` components for the same owners.

Real C++/RocksDB acceptance covers two actors and two heterogeneous generated
state types over the SAME shard/database, including same UUID and, for the
heterogeneous case, same state-ref. Distinct typed results survive actual
Database/host restart, completed records stay unchanged, and handler-entry logs
remain one each. Unknown-owner and malformed-binding startup vectors preserve
all Pending records and execute no reader; omitting whole-batch binding validation
fails the required early-rejection diagnostic. Actual generated scheduling RPCs
are deliberately rejected with FailedPrecondition before and after restart, with
root state unchanged: this registry supports recovered readers, NOT cross-actor
transaction task scheduling/admission. It intentionally does not install an
individual scheduling recovery request. Shared activation explicitly clears any
stale singleton admission request before publishing active ownership, and owner
Drop clears that request before releasing the local claim. A lifecycle regression
plus stale-request RED exercise this reuse boundary. Real-process acceptance now
also completes a generated reader under a singleton ApplicationHost, gracefully
stops and joins that host, then reuses the SAME OneShotTasks owner (including its
consumed singleton notification receiver) in shared recovery. Only after the
singleton returns does the parent persist the second generated actor/task in the
same RocksDB shard; shared recovery returns both distinct typed results and denies
actual generated scheduling without mutation. After Database/host restart, both
host phases repeat against unchanged completed records with one handler entry
each. Removing BOTH activation and teardown admission revocation makes generated
scheduling succeed and fails this regression. This proves the actual host reuse
transition, not only a seeded unit-metadata approximation. Shared-shard capacity
acceptance also partitions 1024 pending records across two registered actors
(512 each), admits an actual generated reader, and crashes it while parked before
completion. With 1025 records (513 plus 512), the shared recovery stream rejects
with ResourceExhausted before either handler enters, despite both owner-local
counts being below 1024. Full pending records and both actor states survive a
further RocksDB restart. Removing only the shared cumulative capacity check fails
the 1025 rejection regression. This is bounded recovery capacity, not shared
transaction scheduling or live cross-actor admission authority. Graceful shared
host-stop acceptance follows Python tasks_dispatcher.py:410-451: interrupt a
running reader without marking its durable task cancelled, and permit redelivery.
The real host exits successfully within two seconds (before the five-second
fallback abort); a Drop marker at the actual generated handler await proves the
parked reader future was dropped. Both full Pending records and actor states
survive RocksDB restart, canonical Wait then returns both typed completions, and
another completed restart preserves records without replay. Append-only logs
allow precisely one extra entry for the interrupted reader. Removing only shared
worker cancellation fails the shutdown bound. This is host shutdown/redelivery,
not the public CancelTask API or exactly-once handler side effects. ApplicationHost
now also observes its shutdown signal while awaiting each HostRecovery::start,
not only after all registrations finish. An interrupted startup future drops
before readiness revocation, root cancellation, child/router joining and lifecycle
cleanup; later registrations never start and public ingress never opens. A live
Tonic regression parks an owned startup future plus supervised child, verifies
Unavailable public ingress, then proves graceful shutdown, exactly one owner Drop,
cooperative child join, lifecycle cleanup and closed listener within one second.
The old implementation fails this regression. This proves local host ownership,
not a new C++ durable recovery outcome; lifecycle initialize/recover hooks before
listener bind remain outside this cancellation slice. Startup also supervises
children from earlier completed registrations while a later registration awaits.
Per-registration JoinSets keep current-start mutation separate from polling earlier
children; all groups, including children created by an interrupted start, remain
owned and are cancelled/joined through the existing fallback. Live Tonic acceptance
fails an earlier child after a later start is demonstrably parked, then checks
precise RecoveryTask/Aborted propagation, gated ingress, startup owner Drop,
cooperative child join, skipped subsequent registration and closed listener. The
old implementation ignores that failure and fails the bounded regression. Children
created by the currently pending start are not independently polled until it
returns; this is not full concurrent startup or a durable transaction outcome. Global staged-capacity reservations,
second-actor transaction control/recovery registration, task auth/errors/retries,
and distributed dispatcher fencing/migration remain outside this slice. Source: aio/internals/tasks_servicer.py:48-126 and
templates/reboot.py.j2:4697-4775. Earlier durable RPC cancellation windows still need dedicated
acceptance. No exactly-once
handler effects, writer tasks, workflows, distributed task
ownership, task auth, retries, or full Rust/Python task parity are claimed.
Python sources: templates/reboot.py.j2:420-467,858-1028,2350-2475;
aio/state_managers.py:4743-5009,6586-6593,6848-6867;
aio/internals/tasks_dispatcher.py. Rust: src/one_shot_tasks.rs and src/codegen.rs;
acceptance: tests/fixtures/task_vertical_acceptance.rs.


The crate began as a schema/proto spike and now contains several durable Rust
runtime slices. It is not yet full Python SDK parity; the evidence-backed
implementation status and pending sidecar acceptances live in
[`PARITY.md`](PARITY.md), and the source-to-source capability inventory is in
[`PARITY-MAP.md`](PARITY-MAP.md).

It proves two real boundaries without importing Python or Node.js:

1. Rust can describe Reboot state/method semantics and emit the existing
   language-neutral Reboot `.proto` contract.
2. Rust can compile Reboot's existing cross-language Echo proto with `tonic`,
   build typed gRPC clients, and attach the external-call metadata Reboot
   requires (`x-reboot-state-ref`, caller-supplied or generated write
   idempotency UUID, optional Bearer token).

```sh
cd reboot/rust
cargo test --locked
# Serves the in-memory EchoMethods host on 127.0.0.1:50051.
cargo run --locked
# Use Reboot's durable Database sidecar for the single-actor Echo adapter.
# The endpoint must include its scheme, for example http://127.0.0.1:50053.
REBOOT_RUST_DATABASE_ENDPOINT=http://127.0.0.1:50053 cargo run --locked
# Use a local, restart-safe state directory for the Echo host. This remains a
# single-process development store, not distributed Reboot durability.
REBOOT_RUST_STATE_DIR=./reboot-rust-state cargo run --locked
# Override explicitly when running more than one local host.
REBOOT_RUST_LISTEN_ADDR=127.0.0.1:50052 cargo run --locked
```

The `build.rs` compilation input is Reboot's existing
`tests/reboot/protoc/explicit_state_annotations_full.proto`, including its
Reboot options and gRPC service. This is deliberately **proto-first**: it
exercises the stable wire format rather than pretending that Rust has a mature
schema-reflection implementation already.

The emitted schema uses Reboot's current `rbt/v1alpha1/options.proto`:

- state type and stable protobuf field tags;
- required/optional field compatibility metadata;
- service → state mapping;
- reader/writer/transaction/workflow method kinds.

The Rust test suite writes the emitted Clinic schema to disk and invokes the
vendored `protoc` against the repository's actual Reboot options. That matters:
string assertions alone can happily bless a proto that cannot compile. The
current DSL emits all proto3 scalar types plus named nested, enum, `repeated`, `map`, and
`oneof` request/response models; maps accept every protobuf-eligible scalar key type. All
models retain the same stable tags and requiredness
metadata as state; enum declarations require a zero/default first variant plus unique
variant names/numbers; package segments and top-level state/message/enum names are valid and
unique. Impossible nested `repeated`/`map` shapes and duplicate field names (including
fields shared with a `oneof`) are rejected before emission.
Undeclared/duplicate method request-response models are rejected too.
`check_backward_compatible_with` also rejects a
published field tag or enum variant being removed, repurposed, or otherwise
changed. A field may be removed only by reserving both its old protobuf tag and
name, which the emitter writes as native `reserved` declarations. Broader
compatibility rules are the next schema slice.

## What this proves

The Reboot **proto and external-client** boundary is viable across languages.
The generated Rust client compiles against the same Echo service surface that
Python and TypeScript integration tests use. The crate also exports a small,
executable `runtime::InMemoryHost` Tonic `EchoMethods` implementation. It keys
process-local actors by `x-reboot-state-ref`, requires a UUID
`x-reboot-idempotency-key` for `Reply`, replays completed writes only for the
same canonical request, rejects same-key request collisions, and serves
`LastMessage` from the matching actor. Its integration tests use generated
clients against a real Tonic server to verify state persistence, replay, actor
isolation, and invalid metadata handling. This does **not** prove that Reboot
servicers are language-neutral: today the server lifecycle and service adapter
are Python-owned, and the Node implementation embeds/generated Python plus a
native Node↔Python bridge.

## Current limits exposed by the spike

This is **not** a runnable generic Rust Reboot backend yet. Current source has hard-coded
Python/Node assumptions that must be generalized before `rbt dev run` can host
one:

1. `reboot/cli/commands/dev.py` accepts only `--python` or `--nodejs` and
   chooses `sys.executable` or `node` as the launcher.
2. `rbt generate` can invoke this crate's prebuilt plugin, but it does not
   build or install it. Rust generation remains adapter-only and requires
   pre-existing protobuf bindings.
3. The crate has executable process-local runtime slices: the default
   `InMemoryActor` host has serialized state reads/writes, idempotent
   write-response caching with same-key collision detection, and rollback of
   failed transactional writes.
   `REBOOT_RUST_DATABASE_ENDPOINT` selects a reusable `DatabaseActorStore`
   plus the concrete `EchoMethodsAdapter`. The store uses Reboot's existing
   Database sidecar to atomically persist state and a completed writer response
   in one `Store(sync=true)` request, then the adapter recovers a response by
   UUID before running a retry. The same store is exercised by a separate
   generated-style Counter reader/writer adapter fixture, proving that the
   storage boundary is not Echo-specific. Concrete Tonic service adapters still
   must be generated per service; this is not a generic dispatcher or complete
   sidecar lifecycle. `REBOOT_RUST_STATE_DIR` instead selects `FileBackedHost`
   for local restart testing, including persisted same-key collision detection;
   that file store remains single-process and has no
   inter-process locks, compaction, encryption, or distributed coordination.
4. Python and Node generated servicer libraries own context propagation,
   retries, persistent state reads/writes, task/workflow semantics, and gRPC
   registration. Rust still needs the corresponding durable runtime crate.
5. Rust has no built-in reflection for struct fields/tags. A production SDK
   needs a `#[derive(RebootState)]` procedural macro or an explicit schema DSL
   to retain stable tags and compatibility checks.

## Cargo-native adapter generation

Downstream Cargo consumers can generate Prost/Tonic bindings and Reboot adapters
from their own `build.rs`; no installed `protoc` or `protoc-gen-reboot_rust` is
needed. Add the feature only to build dependencies:

```toml
[build-dependencies]
reboot-rust-schema = { path = "../reboot/rust", features = ["build"] }
```

```rust
// build.rs
fn main() {
    reboot_rust_schema::build::compile_protos(
        &["proto/counter.proto"],
        &["proto", "../reboot"],
        "crate::proto",
    ).unwrap();
}
```

The helper uses a vendored `protoc` for that build-script invocation, invokes
`tonic-build` with `build_server(true)` and `btree_map(["."])`, writes
$OUT_DIR/reboot-rust-descriptor-set.bin`, and emits a proto-relative adapter
such as `$OUT_DIR/counter.reboot.rs`. The consumer owns the protobuf module and
includes both outputs:

```rust
pub mod proto {
    tonic::include_proto!("my.package");
}
mod adapters {
    include!(concat!(env!("OUT_DIR"), "/counter.reboot.rs"));
}
```

`proto_module` must be a Rust path matching that module (for example
`crate::proto`). By default, generated durable adapters import the runtime as
`reboot_rust_schema::runtime`. If the Cargo dependency is renamed, pass that
crate path to `compile_protos_with_runtime`:

```toml
[build-dependencies]
reboot = { package = "reboot-rust-schema", path = "../reboot/rust", features = ["build"] }

[dependencies]
reboot = { package = "reboot-rust-schema", path = "../reboot/rust" }
```

```rust
// build.rs
fn main() {
    reboot::build::compile_protos_with_runtime(
        &["proto/counter.proto"],
        &["proto", "../reboot"],
        "crate::proto",
        "reboot",
    ).unwrap();
}
```

`proto_module` and `runtime_module` must be valid Rust paths. Unsupported
inputs fail exactly as the executable plugin: only unary reader/writer methods,
same-package top-level request/response/state types, and annotated service
state are supported.

## Concrete Tonic forwarding plugin

This crate also provides `protoc-gen-reboot_rust`, a narrow `protoc` plugin for
authoring concrete Tonic handlers against the schema bindings already exported
as `reboot_rust_schema::proto`. Build it with Cargo, make the binary available
on `PATH`, then invoke `protoc` with the required deterministic parameter:

```sh
cd reboot/rust
cargo build --locked --bin protoc-gen-reboot_rust
PATH="$PWD/target/debug:$PATH" protoc \
  --reboot_rust_opt=module=reboot_rust_schema::proto \
  --reboot_rust_out=generated \
  --proto_path=../.. ../../tests/reboot/protoc/counter.proto
```

After installing that prebuilt binary on `PATH`, the equivalent Reboot CLI
invocation is:

```sh
rbt generate \
  --rust=generated \
  --rust-module=reboot_rust_schema::proto \
  api
```

This invokes only `protoc-gen-reboot_rust` with the supplied module path. It
does not build the plugin or generate Prost/Tonic protobuf bindings; provide
those bindings in the module named by `--rust-module` first. Durable adapters
import `reboot_rust_schema::runtime` by default. When the runtime Cargo
dependency is renamed, add `runtime_module=<Rust path>` to
`--reboot_rust_opt`, for example
`--reboot_rust_opt=module=crate::proto,runtime_module=reboot`.

The direct plugin cannot choose the map container in consumer-owned Prost
bindings. For fingerprinted writer requests containing protobuf maps, direct
plugin consumers must generate deterministic bindings (for example with
`tonic_build::configure().btree_map(["."])`) so those fields use `BTreeMap`.
The Cargo-native helper does this automatically; raw direct-plugin generation
is not changed by it.

For every selected service, the plugin preserves the concrete unary forwarding
`ServiceHandler`/`ServiceAdapter<H>` output. When `protoc` supplies a genuine
`rbt.v1alpha1.service` state option and a unary `rbt.v1alpha1.method` reader or
writer option, it additionally emits an async `ServiceDatabaseHandler`
(using `#[tonic::async_trait]`) and a `ServiceDatabaseAdapter<H>` backed by
`DatabaseActorStore`. Handlers may await while borrowing loaded state. The
adapter also emits a public `StateDurableState` marker implementing
`runtime::DurableStateDeclaration`, binding its Prost state to the canonical
Database state-type string without an impossible orphan-rule implementation on
the downstream protobuf type. Generated adapter calls use that marker; this is
a type-safe local binding, not generic dispatch or distributed coordination.

The durable adapter owns metadata validation, state-reference isolation,
idempotent writer replay, state load, and atomic `Store(sync=true)` of the final
state and idempotency response; application handlers retain their domain
behavior. Writer serialization is process-local for stores using the same
normalized Tonic endpoint, state type, and state reference, including
independently connected stores. It is not guaranteed across endpoint aliases,
proxies, or alternative spellings, and never coordinates across processes,
hosts, or a distributed deployment. `Store` does not make side effects awaited
by a handler transactional or exactly-once.
Streaming methods, unsupported Reboot method kinds, missing annotated state,
cross-package message types, and nested types are rejected rather than guessed.
This remains concrete per-service code: there is no dynamic dispatcher, macro
system, or generic domain mutation.
