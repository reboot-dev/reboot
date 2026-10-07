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

## Next vertical: recoverable declared-error rollback of a first-touch leaf

**Missing; not implemented or certified.** Target A→B with existing distinct actors:
B mutates private state and returns a method-declared error; A catches it and
commits. B must discard its mutation/effects yet retain shared/read-only ownership
until root Prepare, preserving state inferred from the error.

Python sources: `aio/contexts.py:202–215`, `aio/state_managers.py:892–947,
966–984,1044–1108,1179–1216`, `aio/stubs.py:716–755`. Rust currently dooms
supervised error calls (`src/codegen.rs:1575`) and marks incomplete outbound scopes
uncertain (`src/runtime.rs:200–209`). Existing atomic lease downgrade
(`runtime.rs:1470–1491`) and read-only-aware Prepare release
(`durable_participant.rs:1336–1345`) are foundations, not proof of rollback.

Required evidence: exact-incarnation rollback and atomic downgrade unit tests;
generated adapter/client error-path read-only membership tests; real independent
CXX/RocksDB A/B catch-and-Commit/restart, reader admission with writer blocked until
Prepare, root failure/deadline cleanup, and malformed/missing/transport-error
fail-closed negatives. Causal REDs must detect omitted read-only membership, early
release and leaked mutation. Only first-touch exclusive non-factory/non-idempotent
remote leaves; no descendant rollback, reentry, fanout, retry, constructors or
ancestor/sibling prior effects. No general RelinquishOwnership claim.

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

## Supervised successful-return descendant trees

Explicit generated `with_supervised_transaction_tree()` is separate from default
leaf task ownership. It requires actual registered fresh-root execution or an
active reserved exact-incarnation participant Watch execution, existing distinct
actors, exclusive non-factory/non-idempotent methods, one child per branch,
<=32 transaction IDs and <=1024 transitive participants. Inbound contexts own a
new branch collection; local clones/nesting share that ledger without granting
fresh-root authority. Successful trailers aggregate local+descendant identities
with writer precedence. Seal requires zero generated outbound futures and known
membership, before root execution release. Error/Drop closes clones synchronously;
bounded host workers wait for actual scoped futures before releasing execution.
A successfully sealed root still belongs to its registered pre-handoff owner
while execution-mutex release awaits: cancellation transfers that same sealed
ledger, registration and permit to host cleanup. Queue admission rejects a local
capability already handed to durable recovery. Deterministic unit mutex contention
proved the original stranded-lease failure, then restored Abort/readmission with
one remote/local terminal attempt. This is local lifecycle evidence, separate
from the three-sidecar durability matrix. Public manual scoped helpers require
caller-retained scope/trailer discipline; generated calls, not arbitrary manual
scope reuse or premature caller completion, define counted outbound guarantees.
Only the root publishes immutable Abort; unknown descendants self-Watch.

Sources: Python `aio/contexts.py:111-235`, `aio/stubs.py:685-755`,
`aio/state_managers.py:892-1041`; Rust `runtime.rs`, `explicit_abort.rs`,
`codegen.rs`, `successful_trailers.rs`. Child-specific relinquish/rollback is
still unavailable. No sibling/reentrant/shared/factory/idempotent trees, arbitrary
cross-actor tasks, retry/recoverable-error Commit, migration or pre-Prepare crash guarantee.
The candidate participant-local task extension above is separate from this delivered checkpoint.
Actor-only lost terminal ACKs retain ownership and fail supervision without retry.

New real canonical C++/RocksDB fixture uses three independent sidecars/hosts;
B actually calls C. Focused evidence covers actual paths, transitive durable root
membership, Commit/restart, confirmed root failure/deadline, B lost upstream
trailers with C self-Watch, target-Watch-ready-before-root recovery, active child
Prepare/terminal exclusion, closed clones, missing/inactive/full Watch owners,
all-actor missing-task-owner denial and C ACK-held competitor admission/one attempt/restart.
The same-revision nine-case tree matrix also exercises the actual B handler catch
of uncertain C staging, distinct positive path IDs, duplicate/depth overflow,
shared/factory/idempotent rejection and generated self/root reentrant child calls.
The distinct-actor requirement remains host composition: the seam explicitly
rejects self/root targets, not arbitrary ancestor routing. No claim of generic
ancestor enumeration or migration/fencing is made.
Public API unit tests exercise non-drainable ledgers, counted helper rejection,
context identity and inbound root-drive rejection. All five causal RED controls
failed independent invariants (durable membership, actual late child success,
Prepare success while child active, C exclusive readmission, target host exit).
Post-fix verification passed formatting, locked strict all-features/all-targets
Clippy, locked all-features/all-targets tests (250 library units and 26 generated
downstream vectors), the complete **71 ignored generated C++ process tests**
(baseline62 plus9 tree cases), then **8 ignored Native2pc transport tests**.
Final logs: `/tmp/tree-final-{fmt,clippy,alltargets,full-cxx,native}.log`.
Native2pc remains independent protocol regression, not Python legacy parity.
The sealed-root cancellation regression executed one invariant-specific original
source RED (stranded readmission), followed by fixed-source GREEN; an independent
delta source review found no new blocker. Review did not independently rerun tests.
Delivered in commit `7e91e2e1994f2ad9e73a23d6517f3706063a1373` on PR #1.
The delivered tree was verified identical to the exercised candidate. See
`/tmp/supervised-descendant-trees-checkpoint.md` for exact source/log identities,
review provenance, scope boundaries and sole-build-owner release status.

# Python → Rust SDK parity map

## Remote actor unary-reader task checkpoint

**Partial, bounded executable vertical.** Generated exclusive
non-factory/non-idempotent direct-root inbound leaves now require actual
`RootHandlerGuard::live_leaf_tasks_owned()` authority: reserved active Watch
ownership plus the exact admitted execution token. A builder/empty membership
is not authority. Existing root-local restrictions remain separate. Task owner
attachment must match actor and Database identity; active singleton validation
checks own actor/type, descriptor reader method, payload, duplicate/persisted IDs
and pending-plus-staged capacity under the participant exclusive actor lease.
Shared registry scheduling, ownerless inbound, factory/shared/idempotent and
descendant shapes remain outside this vertical.

Python sources: `aio/state_managers.py:6261–6276,6408–6480,6535–6593` and
`aio/internals/tasks_dispatcher.py:93–128,410–451`. Rust coupling:
`src/explicit_abort.rs`, `src/codegen.rs::emit_transaction_flow`, existing
participant Prepare/terminal/Watch ownership and `src/one_shot_tasks.rs`.
Inbound RPC success emits **no dispatch notification** and owns no root handoff;
it only stages effects. The target's host-supervised 100ms canonical rescan,
actor admission and canonical record reload own delivery after Commit ACK.
No new C++ RPC, dispatcher or caller-controlled eligibility flag was introduced.

Actual new two-independent-C++-sidecar process acceptance is in
`tests/fixtures/remote_leaf_{task,failure,scope,uncertainty}_acceptance.rs`:
- Target mutation plus immediate/delayed typed canonical Wait; no root task.
- Staged successful trailers and durable prepared target task are separately
  parked with no reader/no premature inbound hint; immutable Commit precedes
  target-first canonical recovery, actual blocked reader interruption, Pending
  redelivery, durable Completed equality and append-only no-replay counts.
- Malformed/unsupported/foreign actor/type/duplicate/persisted identity,
  oversized batch, inactive/missing task owner, shared registry and 1024+1
  overflow reject precisely, with both actors' live exclusive Apply readmission.
  Missing/inactive/full live-Watch owners reject independently of task ownership;
  FULL is filled by a real generated auxiliary inbound sharing that owner.
  A caught generated descendant call remains monotonically doomed. Configured
  task-producing shared/factory/idempotent/deeper inbound shapes reject before
  handler effects: fail-closed scope, not unsupported-tree cleanup/recovery.
  Full preserved Completed and all 1024 seeded Pending records compare after
  rejection and RocksDB restart; overflow seeds are intentionally future-due.
- Actual caught lost staged trailers and real handler/validation/staging/
  pre-trailer deadlines converge through immutable root Abort and target
  selfWatch. The remote terminal producer asserts actual future Drop BEFORE its
  sidecar terminal RPC. This is distinct from root DecisionPut ordering.
- Real CoordinatorPrepare ACK then deadline preserves membership/fails host
  without competing Abort; canonical restart aborts the unprepared set. Lost
  real remote Commit ACK retains the lease, blocks an actual exclusive writer,
  issues one terminal attempt, fails target host, then completes through restart.

Original blanket gate, premature inbound notification, canonical rescan and
missing selfWatch RED tests are separately exercised. The lost-ACK regression
additionally parks live Watch after execution quiescence, lets coordinator-driven
Commit lose its ACK, observes root failure, then resumes Watch. The retained
terminal-attempt latch must fail the target host without another terminal RPC;
removing that check fails the independent target-exit assertion before any
branch-specific marker check. This is not universal immediate uncertainty
detection: an already-pending Watch rechecks after a response/retry, with the
existing 300-second owner deadline as fallback. The two-participant recovery
fixture now proves prepared Watch activation before starting root recovery,
rather than confusing a listener/planner connection with restored ownership.
See `/tmp/remote-leaf-reader-tasks-checkpoint.md` for exact final verification
inventory, including strict checks and independent source review. Final restored
revision passed formatting, locked strict all-features/all-target Clippy, locked
all-features/all-target tests (247 library units and 26 generated downstream
tests), all **62 ignored generated C++ process tests**, and all **8 ignored
Native2pc transport tests**. Native2pc remains separate evidence, not Python legacy
transaction parity. Logs: `/tmp/remote-leaf-delivery-{fmt,clippy,alltargets,cxx,native}.log`.
Fixed actor ownership
only; no pre-Prepare coordinator-crash guarantee, general descendant recovery,
migration/fencing, task errors/workflows/auth, or exactly-once handler effects.

## Live registered-root abandonment and exclusive inbound leaf Watch

**Partial, fixed-owner live vertical, not coordinator-crash or general tree recovery.**
Python registers the root before Load (`reboot/aio/state_managers.py:5101–5116`)
and activates participant Watch only after the actual method ends (`4255–4291`).
Canonical Abort carries no membership (`rbt/v1alpha1/database.proto:611–643`);
C++ immutably stores the decision under GetForUpdate (`reboot/server/database.cc:3457–3517`).
Rust couples generated `RegisteredRoot::before_load`, the admitted exact local
incarnation, consuming pre-CoordinatorPrepare revocation, and `LiveParticipantOwner`.
Registration reserves an active host permit and a unique execution token before
actor Load/state authorization/handler effects. Token verification retains its
existing earlier external ordering. An unfinished Load has **no admitted actor
capability**: cancellation drops its actual future/gate and registration, performs
no actor terminal RPC, and fabricates no decision. Real Watch remains Unavailable.

After admitted execution, failure/cancellation synchronously CLOSEs outbound
admission, transfers the registration token and permit into the bounded host
worker, validates the exact local actor/root/incarnation, and publishes immutable
Abort before known fanout/local terminal delivery. Unknown membership stays sticky
and never authorizes Commit; ACKed known fanout does not enumerate unknown actors.
The old confirmed-only explicit-Abort helpers retain their stricter seal contract.
The root registration lives through queued/running cleanup, not a caller boolean.
DecisionPut/terminal uncertainty retains ownership and fails supervision; no blind
actor-only retry is introduced. Live participants additionally latch the first
terminal attempt. Ownerless/recovered legacy terminal behavior is unchanged.

Target adapters opt in with `with_live_participant_owner`, an exact host-selected
coordinator identity, placement-backed Watch endpoint, and the same owner's
`live_participant_recovery_registration` on ApplicationHost. Only a non-idempotent,
non-factory exclusive **direct-root inbound leaf** is supported. Generated supplied
contexts reject outbound calls before resolver/network, public outbound-request
helpers, manual enlistment, deeper nesting and unsupported scopes before effects.
This is a cooperative generated-handler contract, not security against trusted
handlers reconstructing headers or issuing arbitrary raw Tonic RPCs. Delivered
root-local tasks with confirmed remote members are unchanged. The bounded inbound
reader task checkpoint above changes only guard-owned singleton leaves; general
subtree scheduling remains rejected.

The exact local incarnation owns an execution barrier spanning handler/staging.
Every direct Prepare/terminal control respects quiescence; staging after Prepare
or terminal uncertainty is rejected. Watch is activated only after real future
completion/Drop, retries read-only observation with bounded exponential backoff,
validates its incarnation under the mutex held through terminal ACK, and is
interrupted by direct acknowledged release. Queued+running permits bound lifetime;
host cancellation aborts and joins workers without speculative ownership release.
Missing decisions remain Unavailable: no presumed-absence Abort, proto extension,
pre-Prepare coordinator-crash recovery, migration fencing, or exactly-once claim.

Acceptance source: `tests/fixtures/live_root_abandonment_acceptance.rs` uses two
independent C++ sidecars and canonical planner routing. Four vectors exercise lost
successful trailers after **actual remote staging**, deadline and actual caught
failure, both actors' unchanged-state/task exclusive live readmission, Abort across
RocksDB restart, a separately parked target handler protected from direct Abort
and Prepare until actual future completion, and registered unfinished Load with
real nonterminal Watch/early cancellation. Unit vectors separately cover stale
same-UUID active replacement, retained lost terminal ACK, direct control barriers,
registered lost DecisionPut/terminal ACK, and queued token lifetime/shutdown.
Registered admission atomically reserves cancellation and active execution under
one pending mutex, with no second await between disarming local Drop and guard
construction. A deterministic FIFO-mutex unit vector cancels admission while
contended (no decision, successful readmission), queues Prepare behind admission
(one-poll guard construction and Prepare blocked before effects), and stops the
host during admission (no handler/terminal effects, exact ownership retained).
Restoring the original two-lock reservation fails this same nonzero test at
`admission disarmed then suspended behind queued Prepare`.
Capacity-one competitors now fail before Load with the exact registered-owner
ResourceExhausted status; the process test retains unchanged handler identity,
no premature decision, unchanged state/tasks, and successful post-cleanup actor
readmission. This is bounded pre-Load rejection, not two admitted concurrent roots.
RED no-Watch, uncertain-abandonment rejection, stale-incarnation wait, and removed
quiescence controls are recorded separately from restored-source verification in
`/tmp/live-root-abandonment-*.log`. This acceptance does not claim broad subtree
retry or durable registration before Prepare.

Prior delivered live-abandonment slice verification: locked all-features
strict Clippy/all-targets, 247 library unit tests, 26 generated downstream tests,
all 57 ignored generated C++ Database/RocksDB process tests, and all 8 ignored
Native2pc transport sidecar tests passed. Native2pc remains a separate protocol,
not legacy Python transaction evidence. Stage logs are
`/tmp/live-root-abandonment-final-{fmt,clippy,alltargets,cxx57,native8}.log`;
the deterministic seam GREEN and original two-lock RED logs are separately
`/tmp/live-root-abandonment-atomic-{green,red}.log`.

## Owned distributed roots with root-local reader tasks

**Partial, bounded executable vertical.** A fresh, exclusive, non-factory,
non-idempotent single-root generated transaction may commit successfully returned
remote participants while staging **only its own actor's unary reader tasks**.
The distributed gate requires `RootHandlerGuard::cancellation_owned()`: an actual
pre-handler reserved permit from an active host registration, not merely an
attached builder. Keep the generated adapter's singleton reader-task owner and
register both its task recovery and `explicit_abort_recovery_registration()` with
`ApplicationHost`. Remote staging is covered only by the separate bounded
live-leaf checkpoint above. Foreign actor identities, shared-registry scheduling,
factory/shared/idempotent distributed roots and
ownerless distributed scheduling remain rejected. The fresh-shared response-only
handler cannot return tasks.

Python coupling: `aio/state_managers.py:6261,6586–6593,6848–6867` validates tasks
before Prepare, dispatches after committed state, and collects recovery before
dispatch; `aio/internals/tasks_dispatcher.py:93–107` requires serialized validation.
Rust source: `src/codegen.rs::emit_transaction_flow`,
`src/explicit_abort.rs::RootHandlerGuard`, `src/one_shot_tasks.rs::validate_staged`,
and durable participant/coordinator staging and recovery. No new wire RPC or
standalone scheduling helper is introduced. Actor-exclusive admission serializes
staging, while canonical pending plus the staged batch is capped at 1024.

Executed through generated Tonic adapters, a live canonical planner, **two
independent C++ Database/RocksDB sidecars**, and actual generated reader bindings
(`tests/fixtures/owned_distributed_task_acceptance.rs`):

- Immediate and absolute-UTC delayed tasks commit root/remote state and return the
  typed canonical Wait result; the target sidecar never receives the root task.
- Immutable Commit is read before killing hosts prior to terminal delivery.
  Restart starts target recovery first, converges both actor states, interrupts a
  genuine pending reader delivery, redelivers after RocksDB restart, completes,
  then restarts again with unchanged completion and append-only no-replay counts.
- Malformed request, duplicate/persisted identity, foreign actor, oversized batch,
  1024 pending plus one staged, missing/inactive owner, shared registry and
  ownerless denials preserve states/records and re-admit **both actors exclusively
  in the live hosts**, without restart. Factory, inbound/shared-inbound and
  idempotent negatives also execute their real generated paths; unsupported
  idempotent distributed cleanup is not promised.
- Actual Tonic deadlines during handler, validation and staging destroy the real
  awaited future; cleanup checks its Drop marker **before DecisionPut**, then
  owned immutable Abort/remote/local ACKs permit both actors' live re-admission.
- Deadline after real CoordinatorPrepare ACK preserves full root/remote membership,
  fails the supervised host, and writes no competing Abort. Restart of that
  pre-participant-Prepare state yields Abort and no task, not invented Commit.
- Unfinished outbound and a genuinely caught uncertain RPC remain sticky. The
  newer registered-root/live-leaf vertical above can publish authoritative Abort
  and let an unenumerated live leaf discover it. Ownerless targets and coordinator
  crash before durable handoff still lack unknown-membership restart recovery.
- A competing scheduling root receives exact `ResourceExhausted` from bounded
  pre-Load registration before handler entry while the first owns capacity one.
  Unchanged handler identity/no premature decision and successful exclusive Apply
  on both actors after cleanup prove no competing effects and actor readmission,
  not a second registered Increment lifecycle. This is bounded admission plus
  overflow rejection, not a shared cross-actor capacity reservation or a
  two-successful-batch concurrency proof. Existing singleton 1023+1/1024+1
  real-sidecar vectors remain applicable.

Prior delivered root-local distributed slice verification: locked all-features/all-targets, formatting
and strict Clippy pass; **53 generated ignored CXX tests** (48 baseline plus five
coupled tests) and **8 separate Native2pc ignored CXX tests** pass. Restoring only
the old blanket returned-membership gate makes the new Commit test fail with
FailedPrecondition (one actual test), then the bounded gate is restored before
all broad execution. Logs: `/tmp/owned-distributed-tasks-{fmt,clippy,all-targets,full-ignored,native-ignored,red-gate}.log`.
Native2pc remains a separate protocol, not Python legacy parity.

This requires fixed actor ownership and one process dispatcher. It provides no
migration/overlapping-owner fencing, general remote-actor scheduling/tree retry,
unknown-membership enumeration, task auth/errors/workflows, or exactly-once reader
side effects. Host supervision and canonical recovery must not be replaced by
speculative local release or blind actor-only terminal retries.

## Bounded generated root handler cancellation

**Partial transaction-tree ownership vertical.** Python source authority is
`reboot/aio/state_managers.py:5179–5215,5869–5980` (root failure/Abort and
participant watcher fallback). Rust couples `src/codegen.rs::emit_transaction_flow`,
`src/explicit_abort.rs::RootHandlerGuard`, the exact local incarnation in
`src/durable_participant.rs`, and `src/durable_coordinator.rs::own_explicit_abort`.
It does not implement Python's general transaction-tree recovery.

Scope is only an **owner-attached fresh non-idempotent exclusive non-factory root**.
Use generated `with_explicit_abort_owner(ExplicitAbortOwner::new(capacity)?)` and
register the same adapter's `explicit_abort_recovery_registration()` with
`ApplicationHost::with_host_recovery`. Unsupported/inbound/shared/factory/idempotent
and ownerless paths do not acquire this cancellation authority. Root-local reader
tasks with confirmed remote membership require this reserved ownership; see the
[bounded task extension](#owned-distributed-roots-with-root-local-reader-tasks).

Before handler effects, the guard reserves one bounded host permit, verifies the
same normalized Database/coordinator authority and exact admitted live local
incarnation, and rechecks active/sticky-failure state **after** awaited validation.
The admitted capability derives eligibility; downstream callers cannot opt out
with a boolean, dereference the local handle, or separately mark handoff/completion.
The consuming `complete_root` validates identity, seals actual successful returned
membership, revokes cancellation before the first potentially durable coordinator
RPC, and releases the reservation only after real coordinator completion. Both
local handoff/disarm paths revoke cancellation authority. The consuming local
Abort helper also checks its exact incarnation under the ACK-held pending mutex.

Dropping an actual awaited handler destroys its outbound futures first. The guard
then synchronously transfers the parked incarnation/context and **existing** permit
to the host worker. That worker validates/seals and executes immutable Abort ACK →
remote Abort ACKs → exact local Abort ACK directly; it never recursively enqueues
or reacquires capacity. Capacity counts reserved handlers plus queued/running
cleanup (1..=1024); one serial worker, <=1024 remote targets, configurable bounded
cleanup timeout, no actor-only ACK retry. There is no imposed handler timeout beyond
the caller/host cancellation. After handoff, cancellation/error retains ownership
and fails host supervision instead of issuing a competing Abort.

Outstanding or unfinished generated outbound scopes permanently make membership
uncertain, **including an empty returned set or a caught outbound failure**. No
synthetic decision, terminal RPC, or local release is allowed; the host fails and
ownership stays retained. Typed recoverable error status is not successful-trailer
membership authority. This does not enumerate lost participants or recover their
undurable leases. Pre-reservation cancellation is pre-handler/pre-effect only;
retention is not crash-durable membership, automatic retry, or restart convergence.
Detached/manual outbound effects and general nested/tree cancellation remain out.

Executed acceptance on the real C++ Database/RocksDB binary, through canonical live
PlacementPlanner and genuine generated Tonic adapters:

- `owned_root_handler_cancellation_survives_generated_rpc_deadline`: two independent
  sidecars, park after confirmed generated remote success; actual deadline destroys
  the handler **before DecisionPut** (asserted at worker entry), immutable Abort ACK,
  remote/local exclusive readmission without restart, same live hosts, unchanged
  actor states/no tasks, immutable Abort retained across subsequent RocksDB restart.
  The owner capacity is **one**.
- `owned_root_success_commits_confirmed_remote_membership`: successful ACK-backed
  distributed completion commits both actors and preserves live remote readmission.
- `owned_root_postprepare_deadline_retains_without_competing_abort`: deadline after
  real CoordinatorPrepare ACK with full root+remote membership; supervised nonzero
  host exit, retained remote exclusive lease, unchanged states/tasks, no Abort.
- `owned_root_unfinished_outbound_deadline_has_no_synthetic_abort` and
  `owned_root_caught_outbound_failure_empty_membership_has_no_synthetic_abort`:
  actual generated remote handler reached without success trailers; deadline or
  caught uncertain error yields fatal supervision with no fabricated decision or
  coordinator record and unchanged durable states/tasks.
- Unit coverage includes stopped/sticky-failed admission while the participant
  mutex is held, stale incarnation and same-UUID replacement (no terminal RPC,
  competitor still blocked), both handoff revocations, capacity-one rejection and
  cleanup, unknown/active membership, one-attempt ACK timeout, shutdown, and private
  lifecycle phase rejection. Generated downstream fixture executes 26 tests.

Verification logs: `/tmp/handler-owner-fmt.log`, `/tmp/handler-owner-clippy.log`,
`/tmp/handler-owner-all-targets.log`, `/tmp/handler-owner-full-ignored.log`, and
`/tmp/handler-owner-cxx-paired.log`; explicit locked compile is in
`/tmp/handler-owner-check.log`. Locked all-features/all-targets suite passes
**241 unit tests and 27 outer integration tests** (268 total), with **26 + 1
executed nested generated-fixture tests** separately;
full ignored process execution passes **48 generated CXX tests** (all original 43
plus these five) and **8 separate Native2pc CXX tests**. Native2pc remains an isolated
protocol, not Python legacy parity. Expected deliberately failed fixture children
are checked by their acceptance tests; they are not ignored test failures.

## Host-owned explicit Abort after queue acceptance

**Partial transaction-tree cancellation prerequisite**, not distributed-task or
crash-recovery parity. Python's root error path and participant watcher fallback
are in `reboot/aio/state_managers.py:5179–5215,5869–5979`; Rust instead explicitly
owns an acknowledged Abort fanout in `src/explicit_abort.rs` and the generated
error/admission branches in `src/codegen.rs`.

Attach one `ExplicitAbortOwner::new(capacity)` with the generated adapter's
`with_explicit_abort_owner`, and register that same adapter's
`explicit_abort_recovery_registration()` through `ApplicationHost::with_host_recovery`.
The owner is inactive until registration. Capacity must be 1..=1024 total queued
plus running jobs; one serial worker owns execution. Confirmed remote targets are
capped at 1024. Each running job has a 30-second default deadline, configurable
with `with_timeout` to a nonzero duration of at most 300 seconds.

The guarantee starts **only after successful queue acceptance**: fresh-root,
Database/coordinator and live-incarnation checks seal membership and disarm local
Drop before the owned future is submitted without another await. Dropping the
RPC response observer cannot cancel that future. Immutable Abort ACK precedes
remote terminal ACKs and exact-incarnation local ACK. There are no terminal RPC
retries. A timeout, lost ACK or admission uncertainty fails host supervision and
retains incomplete ownership; it does not establish restart convergence. Shutdown
cancels and joins the worker and drops queued sealed jobs without speculative release.

An unfinished generated outbound scope permanently marks membership uncertain,
even when its active count reaches zero; explicit sealing rejects that state.
Successful calls mark the scope complete only after decoding/enlisting trailers.
This does not discover lost participants or make every empty-membership error path safe.
Cancellation during the handler, preseal pending-mutex await, and before queue
acceptance remains outside this guarantee. Crash-durable membership, automatic
cleanup retry and general tree scheduling remain outside that seam; bounded live-root
ownership and remote-leaf reader scheduling are covered separately above.

Acceptance: a real generated Tonic deadline drops the server response observer
while a host-owned worker is parked after real C++ Database DecisionPut ACK;
after release both original actors exclusively re-admit without restart, state
and tasks remain unchanged, and Abort survives RocksDB restart. Unit tests cover
observer independence, bounded admission, queued-unpolled shutdown, sticky
uncertainty, fatal watch state, and lost-local-ACK/timeout one-attempt retention.

## Explicit pre-handoff transaction-tree failure checkpoint

Bounded prerequisite for distributed tasks: generated fresh, non-idempotent,
exclusive, non-factory roots now clean up confirmed returned participants on
explicit handler, task-admission or staging rejection. Ownerless scheduling with returned participants remains rejected. The
[owned root-local reader extension](PARITY-MAP.md#owned-distributed-roots-with-root-local-reader-tasks)
does not itself enable remote-actor tasks; the separate
[guard-owned live-leaf extension](#remote-actor-unary-reader-task-checkpoint) does.

The capability validates fresh-root provenance, admitted scope, exact local
incarnation and actor/coordinator identity, and matching normalized Database
endpoints. Generated outbound guards span resolution through successful-trailer
enlistment. Cleanup atomically seals only a quiescent collection, blocks new
generated calls, and snapshots the deduplicated writer/read-only union. It writes
immutable Abort directly, then awaits remote terminal ACKs and owner-token-checked
local Abort ACK under the participant mutex before clearing confirmed membership.
It creates no preparing coordinator record and rejects post-handoff authority.

Source comparison: Python `aio/state_managers.py` `_transaction_coordinator_abort`
(lines 5869–5980). Rust Watch treats absent decisions as unavailable, so direct
durable Abort—not presumed absence—is the terminal authority here. Unit coverage
exercises ordering, lost ACK/future drop, scope/identity/endpoint rejection,
same-UUID replacement, held-ACK mutex and outbound sealing races. The real C++
process vectors `distributed_task_admission_failure_must_release_remote_actor`
and `distributed_direct_handler_failure_must_release_remote_actor` require
unchanged actor/task state, exclusive remote re-admission without peer restart,
no preparing records, and immutable Abort surviving RocksDB restart.

**Still blocked:** ownerless/general cancellation before cleanup, enumeration of unknown/lost successful trailers,
general inbound task-tree ownership, automatic fanout retry and restart convergence of the
in-memory enlistment worklist. Interrupted cleanup parks uncertain ownership;
retention is not durable membership or automatic recovery. Manual late enlistment
is retained and dooms the context, not silently discarded as acknowledged work.

## Reader-only one-shot task checkpoint

Partial vertical: generated immediate or absolute-UTC-scheduled unary reader tasks without declared errors,
for the same actor, scheduled by fresh exclusive non-factory roots or the separately
[guard-owned direct-root remote exclusive leaf](#remote-actor-unary-reader-task-checkpoint).
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


**Baseline:** `c32bf6da` (2026-10-06). This is a capability map, not a claim
that similarly named APIs have the same distributed semantics.

## Evidence rules

- **Implemented** means there is an exercised Rust implementation.
- **Partial** means the listed subset exists; absent behavior is not implied.
- **Missing** means no equivalent public/runtime implementation was found.
- **Real-sidecar proof pending** means in-process/unit coverage exists but the
  C++ Database/RocksDB acceptance is currently ignored without
  `REBOOT_NATIVE2PC_CXX_DATABASE`.
- Native2pc is a separate Rust protocol island, not Python legacy-2PC parity.

The baseline Rust suite passed `cargo fmt --all -- --check`, locked
all-target/all-feature tests, strict Clippy, and `git diff --check`: 204 unit
and 10 host tests, plus the 26-test generated downstream fixture and its
one-test default-helper fixture. The ordinary locked suite skips 18 C++
Database acceptances when `REBOOT_NATIVE2PC_CXX_DATABASE` is absent; their
real-sidecar evidence is recorded in the individual capability rows.

## Delivery order

1. Restore end-to-end *legacy* root transaction/application-host wiring and
   real-sidecar CI. This unblocks evidence for existing coordinator/participant
   code; do not broaden Native2pc as a substitute.
2. Finish bounded fresh-local shared promotion with its opaque handler API and
   direct local durable completion.
3. Add typed SDK boundary primitives (StateRef, idempotency policy) only after
   their cross-language vectors are defined.
4. Independently design larger runtimes: tasks/workflows, streaming/reactive
   reads, collections, nested/distributed transactions, HTTP/auth/application
   lifecycle. They are not follow-up flags on the unary adapter.

## Capability matrix

### Schema, protobuf, and generated adapters

| Capability | Python reference | Rust status and reference | Evidence / remaining work |
|---|---|---|---|
| Descriptor-driven schema/generation | `protoc_gen_reboot_generic.py:354-1177`; `protoc_gen_reboot_python.py:112-322` | **Partial.** Explicit DSL and proto emitter: `src/lib.rs:36-251,1083-1447`; bounded compatibility checker starts at `src/lib.rs:1273`. The raw Rust generator treats either `rbt.v1alpha1.service` or any `rbt.v1alpha1.method` annotation as a Reboot service. **`google.api.http` boundary (2026-10-05):** raw `generate_from_wire` descriptors preserve the HTTP extension and accept it on legacy gRPC methods while rejecting it on Reboot methods, matching `_check_services`' Reboot-only `HasExtension(annotations_pb2.http)` rule (`src/codegen.rs:461-472,2451-2544`; Python `protoc_gen_reboot_generic.py:466-477`). **Reboot service-name contract (2026-10-05):** every generated Reboot service must end in `Methods`, including an explicitly annotated service; an invalid linked dependency is permitted until it is listed in `file_to_generate`, matching Python `process_file` → `_check_services` scope (`src/codegen.rs:262-460,2359-2423`; Python `protoc_gen_reboot_generic.py:376-490,1131-1158,1177-1254`). A method-only service derives its state from the required `Methods` suffix; the established explicit-service-option path still requires a non-empty state. At the generated-file boundary it rejects every descriptor whose syntax is not exactly `proto3`, retaining Python's sole `google/protobuf/descriptor.proto` missing-syntax exception. **Package/path contract (2026-10-05):** executable-plugin and descriptor-set generation now mirror `template_data`'s generated-file-only validation: a package is required; each slash-separated descriptor directory component is ASCII letter/digit/underscore only; and the directory must exactly equal the package with `.` replaced by `/`. Dependencies linked in the descriptor pool are deliberately not rejected merely for a mismatched path (`src/codegen.rs:175-230,916-969`; Python `process_file`/`template_data`: `protoc_gen_reboot_generic.py:597-646,1177-1254`). **Linked state/service scope (2026-10-05):** `_check_services` and `_check_states` relationship checks run only for each generated file, while resolving its linked states/services across the whole pool; malformed dependency relationships are accepted until that dependency is in `file_to_generate` (`src/codegen.rs:492-757,2672-2812`; Python `protoc_gen_reboot_generic.py:376-408,492-517,1131-1158`). **Reader state-option boundary (2026-10-05):** the raw plugin now decodes `ReaderMethodOptions.state`; its `STREAMING` value rejects even an otherwise-unary RPC, matching the Python generic feature derivation before Rust would incorrectly emit a unary-state adapter. `DEFAULT`, `UNARY`, and unknown enum values retain unary behavior; streaming adapter/runtime parity remains missing (`src/codegen.rs:138-174,442-473,2125-2174`; Python `protoc_gen_reboot_generic.py:875-899,1259-1287`; `rbt/v1alpha1/options.proto:7-20`). **Transaction mode-option wire parity (2026-10-05):** `TransactionMethodOptions.mode` now decodes as its actual protobuf `oneof`, so raw option bytes select the final exclusive/shared field as Python does; an absent mode reports Python's complete diagnostic. This applies only as a generated-file service-local validation, while linked dependencies remain opaque until generated (`src/codegen.rs:167-188,430-505,3157-3234`; Python `protoc_gen_reboot_generic.py:875-924,1131-1158,1177-1254`; `rbt/v1alpha1/options.proto:30-44`). Direct `generate_from_wire` vectors preserve ordinary descriptor fields alongside option extension bytes and accept both unary supported modes plus a constructor, while rejecting absent mode. **Method-kind wire parity (2026-10-05):** `MethodOptions.kind` now decodes as its actual protobuf `oneof`, so raw custom-option bytes retain the final reader/writer/transaction/workflow field exactly as Python's generated options message does. A `generate_from_wire` vector proves that a streaming reader followed by a writer emits the supported writer adapter rather than rejecting the overwritten reader; workflow remains rejected because its runtime/lifecycle is unavailable (`src/codegen.rs:153-185,437-505,2243-2302`; Python `protoc_gen_reboot_generic.py:806-924,1131-1158,1177-1254`; `rbt/v1alpha1/options.proto:110-120`). **Declared-error option parity (2026-10-05):** raw `MethodOptions.errors` (field 7) now takes Python's generic-plugin `error` feature path: a non-empty declaration is rejected at the generated-file Reboot-service boundary because Rust has no generated declared-error types or rich status-detail decoding. The same `generate_from_wire` vector accepts empty errors alongside supported transaction modes and rejects a populated error declaration; linked dependencies remain opaque until generated (`src/codegen.rs:161-168,420-444,3269-3355`; Python `protoc_gen_reboot_generic.py:949-956,1259-1287`; `rbt/v1alpha1/options.proto:110-136`). It rejects a Reboot service whose any method lacks `rbt.v1alpha1.method`, rejects an annotated Reboot service with no RPC methods, rejects annotated methods whose first character is lowercase, rejects Python-reserved Reboot method names (`Read`, `Write`, `Delete`, `State`, `Schedule`, `Spawn`) while retaining the source-specific `rbt.cloud.v1alpha1.secrets.SecretMethods` exception, and rejects the `google.api.http` extension on every Reboot method as Python does. **State/service consistency (2026-10-05):** raw top-level `DescriptorProto` state annotations now mirror Python `_check_states`: the state’s explicit (or implied `<State>Methods`) service must exist across the descriptor set and resolve back to the annotated state; relative state/service names are package-qualified like Python. Rust also mirrors Python `_check_services`' optional inverse: a Reboot service may refer to an absent state descriptor, but if its linked top-level message is present anywhere in the set it must carry `rbt.v1alpha1.state`: `src/codegen.rs:203-610`; Python `_check_services`/`_check_states`: `protoc_gen_reboot_generic.py:380-517`. | Rust validates scalar/enum/map/oneof/reservation cases and compiles emitted proto against Reboot options. Direct vectors cover proto2 rejection and the `descriptor.proto` missing-syntax exception; raw-option vectors cover method-only service classification/default-state emission, missing method options, option messages with no Reboot extension, no-RPC Reboot-service rejection through `generate_from_wire`, lowercase annotated method names, reserved-method rejection plus the SecretMethods exception, `google.api.http` rejection by its source-defined extension tag 72295728, and state→service existence/back-reference acceptance plus missing/mismatched cross-file rejection, as well as service→present-state annotation rejection with cross-package and absent-state acceptance. It lacks Python-equivalent generated state declarations and a Python↔Rust golden descriptor corpus. **Duplicate state methods (2026-10-05):** raw descriptor validation now mirrors `_check_no_duplicate_methods`: within each **generated file** (not merely another descriptor in the request/pool), a Reboot RPC name may occur only once across services supplying the same package-qualified state, including an absent state descriptor; `src/codegen.rs:441-498`. A direct raw-wire vector invokes `generate_from_wire` to prove that duplicate methods in a dependency descriptor are accepted when only `main.proto` is generated and rejected with the source-identical conflict diagnostic when `dependency.proto` is generated. **Auto-construct required method names (2026-10-05):** for each generated top-level state whose `rbt.v1alpha1.state.auto_construct` is nonzero, raw descriptor validation now mirrors `_base_services_for_state`: linked services across the descriptor pool must collectively contain `Create` and `SetClaims`; `src/codegen.rs:705-789`; Python `protoc_gen_reboot_generic.py:1005-1045,1140-1154`. The direct `generate_from_wire` vector exercises raw state-option tag 3 plus linked dependency services, rejects each missing name with the Python diagnostic, and accepts both. As in Python's exact implementation, this is a name-presence rule despite the diagnostic calling them Transaction methods; it does not infer/validate their method kinds. **Service-local validation scope (2026-10-05):** the raw executable-plugin path now keeps Python `_check_services` at the `process_file` boundary: an ungenerated dependency service is opaque to its Reboot-option classification and service-local checks (method annotation/kind/mode, naming, reserved names, and HTTP annotation) until listed in `file_to_generate`; relationship checks retain their separately mapped descriptor-pool scopes (`src/codegen.rs:262-476`; Python `protoc_gen_reboot_generic.py:376-490,1131-1158,1177-1254`). A direct raw-plugin overlay proves a dependency with a lowercase annotated unary writer is accepted when generating `main.proto` and rejected with Python's diagnostic when generating that dependency. **Trusted-effects boundary (2026-10-05):** Python reads `StateOptions.trusted_effects` only while constructing a generated file's `BaseState`, then emits middleware that changes effect-validation re-runs (`protoc_gen_reboot_generic.py:714-758`; `templates/reboot.py.j2:2691-2697`). Rust has no equivalent effect-validation runtime, so raw `generate_from_wire` descriptors fail closed when a generated top-level Reboot state requests trusted effects, while an identically annotated dependency remains opaque until listed in `file_to_generate` (`src/codegen.rs:116-123,764-813,3254-3322`). **Remaining `RebootProtocPlugin` template-data boundary (2026-10-05):** no further independently applicable bounded Rust adapter slice remains. `StateOptions.uis`, `MethodOptions.mcp`/description (including deprecated `mcp.description` fallback), and generated UI/MCP registration are consumed only by the Python/React templates and require an MCP/application host, trusted request context, UI asset serving, and lifecycle/recovery semantics absent from Rust (`protoc_gen_reboot_generic.py:714-758,926-956`; `templates/reboot.py.j2:2733-3159`; `protoc_gen_reboot_react.py:238`). `FileOptions.zod` path rewriting is NodeJS schema-import generation; `pydantic`/`api_digest` and `find_error_message` feed Python/TypeScript schema/error conversion rather than the bounded Rust adapter (`protoc_gen_reboot_generic.py:652-675,792-801,1289-1304`; `protoc_gen_reboot_nodejs.py:302-325`; `protoc_gen_reboot_python.py:176-201,356-421`; `protoc_gen_reboot_typescript.py:225`). Implementing any of these in Rust would require a new language/runtime surface, not descriptor parity. Process-file output filtering (`only_generates_with_reboot_services`, system-package exclusion, language suffix/template selection) is abstract `PluginSpecificData` policy, while Rust deliberately emits its forwarding adapter for ordinary services (`protoc_gen_reboot_generic.py:1200-1243,1360-1367`; `src/codegen.rs:978-1028`); changing that policy would be an incompatible plugin-contract decision, not a safe parity slice. The remaining generic feature gate is already fail-closed for unsupported workflow, declared errors, and streaming; bounded Rust supports only unary reader/writer and current transaction forms. |
| Unary reader/writer generated adapters | Python generator method surface: `protoc_gen_reboot_python.py:213-228` | **Implemented, bounded.** `src/codegen.rs:422-583,733-855`; Cargo helper `src/build.rs:30-141`. | Plugin and downstream fixtures execute durable adapters. Same-package, top-level unary shapes only. |
| Transaction generated adapters | `protoc_gen_reboot_python.py:213-228`; transaction completion `templates/reboot.py.j2:1433-1462` | **Partial.** `src/codegen.rs:607-730,1693-1705`; `src/durable_participant.rs`; `src/durable_coordinator.rs`. | Exclusive, inbound/shared read-only, factory, and returned-participant paths have fixtures. **Fresh-exclusive post-handler state (2026-10-06):** a non-factory exclusive handler that mutates its `&mut state` and leaves `TransactionExecution.final_state` unset now stages the mutated state, matching Python's unconditional `Effects(state=state, ...)`; an explicit final-state override remains authoritative. Generated-Tonic acceptance covers both branches, and a real C++ Database/RocksDB host supplied by a live canonical `PlacementPlanner` stream proves `5 → 12` durably. **Factory declared errors (2026-10-06):** exclusive factory roots now accept method-declared errors, emit the generated method-specific rich-status union, and abort their admitted participant before durable preparation; a clean same-key retry then creates/replays exactly once. Generated-Tonic and live canonical-`PlacementPlanner` C++ Database/RocksDB proof cover the declared trailer, empty failed state/idempotency record, database restart, successful retry, and replay. General nesting, placement-selected roots, and generated local shared promotion are absent. |
| Streaming, workflow, errors, Pydantic-style conversion, broad service forms | `protoc_gen_reboot_python.py:120-322`; boilerplate plugin | **Missing/rejected by design.** Streaming is rejected in `src/codegen.rs`; no workflow/error conversion runtime. | Publish a Rust generator support matrix and add descriptor-corpus accepted/rejected tests before expanding one method kind at a time. |
| Cargo-native generation / protoc plugin | `cli/commands/generate.py:46-105,177-188`; `cli/rust_generate.py:7-21` | **Implemented for current bounded adapter surface.** `src/build.rs`; `src/bin/protoc-gen-reboot_rust.rs`. | Downstream Cargo fixtures pass. CLI requires a prebuilt plugin on PATH and pre-existing Prost/Tonic bindings; it does not build/install it. |
| Generated-code/runtime SDK version compatibility | Python carries `REBOOT_VERSION` from `protoc_gen_reboot_generic.py:39,342,1171` into `templates/reboot.py.j2:51-55`, which imports the installed runtime checker; `versioning.py:82-100` rejects any exact mismatch. | **Blocked; no Rust compatibility claim.** Rust generation emits only the adapter banner/import (`src/codegen.rs:332-368`), Cargo helper/plugin forward no SDK-version parameter (`src/build.rs:30-141`; `src/bin/protoc-gen-reboot_rust.rs:4-13`), and the runtime exposes no SDK-version constant. | **Use case:** fail at compile/include time when an adapter generated by one released Rust Reboot SDK is compiled with another. This cannot be implemented honestly today: `rust/Cargo.toml:1-7` declares an unpublished experimental `reboot-rust-schema` package at `0.0.0`, while the released Python/Node SDK version is generated from `versions.bzl` (`rules.bzl:621-638`; `versions.bzl:23`). No source states whether Rust uses that shared release version, an independently released Cargo version, or no stable version contract. Emitting `CARGO_PKG_VERSION` would invent a semantic relationship for `0.0.0`; copying `versions.bzl` into Rust would assert a lockstep release policy that does not exist. Required first: define and publish one Rust SDK version source plus its release relationship, expose it from the runtime, have both `generate_from_wire` and `compile_protos_with_runtime` embed it in every generated file, and add source-backed match/mismatch downstream-compilation tests. |

### State, metadata, and external clients

| Capability | Python reference | Rust status and reference | Evidence / remaining work |
|---|---|---|---|
| Reboot header transport | `aio/headers.py:124-255,242-292,346-352,400-509`; `time.py:27-46,74-80`; `aio/caller_id.py:10-65`; `aio/call.py:10-24` | **Partial.** `RebootHeaders`, the bounded inbound schedule parser, and typed `CallerId` in `src/lib.rs:589-1006`; `ExternalContext` follows. | A source-backed corpus proves malformed/empty caller components, unknown caller keys, last-value-wins duplicate caller and metadata keys, known-header round trips/drop of unknown inbound headers, and transaction-free authorization projection. Strict malformed input, 4,096-character bearer validation, and typed `task_schedule` empty-header→now behavior are also tested. `CallerId` validates Python wire IDs and canonicalizes output. **Task-schedule ISO slice (2026-10-05):** Python `DateTimeWithTimeZone.fromisoformat` delegates to `datetime.fromisoformat`; Rust now exactly normalizes its explicit integral-minute basic offsets (`+HHMM`/`-HHMM`) before Chrono RFC 3339 validation, including `+0200` and `-0530`. `Z` and a space separator already parse in Chrono. The source-backed vectors also assess but intentionally reject offset seconds (including basic seconds), fractional offset seconds, and non-RFC `X` separators: fractional offsets cannot be represented by `FixedOffset`, while whole-second offsets/separators need a separately specified grammar rather than a piecemeal widening. Naive timestamps and date-only values remain rejected—Python would attach local `ZoneInfo` and choose DST fold semantics that `FixedOffset` cannot retain. Schedule metadata is parsed inbound only and is never emitted by `to_metadata`. **Inbound application-identity trust boundary (2026-10-05):** `RebootHeaders::from_metadata` now discards client-supplied `x-reboot-application-id`, and the parsed header cannot re-emit it (`src/lib.rs:852-860,2318-2366`). Python replaces this wire value with the server-owned identity injected by `UseApplicationIdInterceptor` in `Headers.from_grpc_metadata` (`aio/headers.py:279-291`); Rust has no equivalent server/application lifecycle, so retaining it as a parsed public value was unsafe rather than parity. Explicit outbound `RebootHeaders.application_id` remains available for an owning future host to emit. Typed server/application IDs and server-context application-ID injection remain absent. **Lifecycle-blocked:** parity requires a server/adaptor lifecycle that authenticates and injects application identity, generated-adapter use of that context, plus ingress acceptance proving spoofed metadata cannot affect identity. Do not add a wrapper that trusts the wire header. **Health-probe boundary (2026-10-05):** `aio/health_check.py:15-99` is a client-facing standard gRPC Health polling helper, but its exercised contract depends on the Python Application host’s `HealthServicer` lifecycle and readiness meaning (`aio/internals/health_servicer.py:12-78`; `tests/reboot/aio/internals/health_servicer_tests.py:14-120`). In particular, `SERVING` proves the host has started and its React websocket health probe succeeds; optional `StateRef` probes target host-selected replicas through `x-reboot-state-ref`. Rust has neither an application/React websocket host nor typed-header ownership/placement for durable actors. A standalone Tonic Health wrapper would only prove a socket responds and would falsely advertise Reboot readiness. **Blocked:** first add generated/host API registration, server-owned state-ref routing, startup/recovery readiness, and end-to-end serving/not-serving/state-target acceptance; then implement the polling helper against that host. `Headers.state_id` requires an exact typed/reversible `StateRef` migration; deriving it from Rust’s opaque durable `state_ref` would either reject existing identities or change their lock/database/idempotency keys. Python `Options` (`aio/call.py:11-24`) permits arbitrary request metadata and is used for per-call bearer override outside Reboot state calls (for example `thirdparty/mailgun/servicers.py:137`); adding it to generated Rust calls would create an unscoped metadata-forwarding API without Python’s call/context merge and idempotency-collision semantics. Python `ExternalContext`’s `name` and `_ChannelManager` (`aio/external.py:18-137`) are resolver/idempotency-manager identity, not wire metadata; Rust’s direct endpoint context intentionally has neither, so a name-only field would be dormant scaffolding. |
| Typed StateRef/readable refs/colocation | `aio/types.py:46-310,378-418` | **Implemented as a codec only.** Public codec: `src/state_ref.rs`; headers and existing runtime actors retain opaque durable keys in `src/lib.rs:588-823`. | Python-compatible SHA-1 tags, readable normalization, escaping, compound components, type matching, and ID validation are unit-tested. Do not normalize every wire header: established Rust actor identities include opaque durable keys such as `actor/42`, which are neither readable nor canonical Python StateRefs. Rewriting them would split existing lock/database/idempotency identities or reject valid current SDK requests. A future typed-header migration needs an explicit compatibility contract plus real C++ sidecar/restart proof. Native2pc identity remains separate. |
| External client routing/retry | `aio/internals/channel_manager.py:30-150`; `aio/stubs.py:61-740`; `aio/call.py`; `aio/external.py:23-137`; `aio/aborted.py:16-34` | **Partial.** Typed generated external unary reader/writer clients use `ExternalContext`; `ExternalContext::connect(endpoint)` creates one direct caller-requested Tonic channel; `ExternalEndpoint` offers Python-compatible explicit HTTP(S) URL validation before `connect_validated`; `ExternalChannelManager` accepts one validated endpoint and immutably caches one shared, lazy Tonic `Channel`; `is_retryable_status_code`/`is_retryable_status` preserve Python's narrow `Unavailable` classification: `src/codegen.rs:583-636`; `src/lib.rs:970-1175`; `src/runtime.rs:217-301`. | Generated clients attach reader metadata, optional typed `x-reboot-caller-id`, automatic seven-day UUIDv7 writer keys, or caller-owned writer keys. **External unary retry slice (2026-10-06):** generated database reader/writer clients rebuild canonical protobuf request bytes and exact typed Reboot metadata after only `Unavailable`; writer key allocation occurs once per logical call and is reused across attempts. Retry waits use a cancellation-safe Python-shaped exponential delay (1 second initially, cap 30 seconds, jitter); declared/rich and every non-`Unavailable` status return after one attempt. Downstream Tonic acceptance proves exact request/metadata/key preservation and one-attempt error boundaries; a direct generated external Tonic host backed by a real C++ Database/RocksDB sidecar converts its first successful adapter response to `Unavailable`, then proves the retry has one durable state/idempotency mutation after sidecar restart (`tests/protoc_plugin_counter.rs`; `tests/generated_cxx_database_process.rs`). Unit and downstream Tonic acceptance cover endpoint construction, URL validation, the external-context boundary, reader dispatch, explicit-key replay, unavailable-only classification, and concurrent manager clones sharing one in-process-server connection while preserving `ExternalContext` metadata. This is not Python’s general `_ChannelManager`: there is no resolver/address-change cache, explicit shutdown/health observation (Tonic exposes no sound public `Channel` state for it), transparent retry-age policy, nested retry behavior, or general service resolver. Tonic owns transport reconnect behavior; the Rust manager makes no retry/outcome or TLS-equivalence decision. Success trailers are enlisted for transaction calls. |
| RPC status / abort classification | `aio/aborted.py:16-34,248-328,402-605`; rich-status call boundary `aio/stubs.py:219-228,653-661,716-729`; generated method contract `templates/reboot.py.j2:5022-5065`; call options `aio/call.py:11-28` | **Implemented, bounded rich declared-error and transactional system-abort slice; code-only elsewhere.** `is_retryable_status_code` / `is_retryable_status` retain unavailable-only classification and public `GrpcStatusError::{from_code,from_status,code}` exactly maps every non-OK `tonic::Code`; `Ok` maps to `Unknown`, matching Python’s `error_from_google_rpc_status_code` fallback. `declared_error_status` emits a standard ordered `google.rpc.Status.details` trailer and `declared_error_details` decodes it without deciding outcomes; `SystemAborted` and `system_aborted_from_detail` recognize the source-defined Reboot details needed by the bounded exclusive transaction client, while `SystemAborted::into_status` emits a matching source-compatible rich backend status for a Rust Tonic handler: `src/lib.rs:1251-1470`; generated contracts: `src/codegen.rs:1230-1409,1513-1536`. | The unit matrix covers all 16 error codes, reverse-code round trips, `Ok` fallback, and a `tonic::Status`. Python packs concrete errors in ordered `google.rpc.Status.details` `Any` values, writes `grpc-status-details-bin` through `grpc_status.rpc_status`, then decodes it with `rpc_status.from_call`; the Rust decoder keeps unknown types, malformed details/envelopes, no trailers, and an inner/outer code-or-message mismatch conservative as raw `Grpc` failures. A compatible maintained Rust binding exists (`googleapis-tonic-google-rpc` 0.11 for the current Prost/Tonic generation), and Tonic exposes binary status details, so the external Google schema is **not** a blocker. The bounded slice generates unary database-reader/writer declared-error enums (including constructors) plus exclusive non-factory transactional clients. **External constructor declared-error acceptance (2026-10-06):** the real downstream generated Tonic adapter encodes a constructor's declared `ConstructorInitialValueRejected` payload and its generated external client decodes that exact enum payload; malformed rich details and no rich trailer remain `Grpc`, no failing call issues `CreateActor`, and a following success creates exactly one actor/idempotency mutation (`tests/protoc_plugin_counter.rs`; `tests/reboot/protoc/constructor_counter.proto`). **Real C++ Database/RocksDB proof (2026-10-06):** a direct generated external unary Tonic host (no placement/Native2pc route) returns a declared constructor error, verifies absent durable actor and idempotency mutation before and after sidecar restart, then proves a valid call creates exactly one durable actor/mutation and same-key replay does not duplicate it (`tests/generated_cxx_database_process.rs`; `tests/fixtures/generated_cxx_database_process`). **External unary system-abort vertical (2026-10-06):** declared reader/writer method enums now carry `SystemAbort { error, message }`; generated database adapters encode its source-compatible `SystemAborted` detail with the rich-status message, and generated external clients reconstruct the same typed error/message (`src/codegen.rs:1239-1459`; `src/lib.rs:1294-1470`). Downstream Tonic acceptance proves the writer round trip yields `NotFound` with `counter is absent` and does not persist state (`tests/protoc_plugin_counter.rs`). Declared method errors and the Python recoverable backend set (`StateNotConstructed`, `StateAlreadyConstructed`, `InvalidArgument`, `NotFound`, `AlreadyExists`, `FailedPrecondition`, `Aborted`, `OutOfRange`, `DataLoss`) may be caught without dooming the root; `TransactionShouldRetry`, nested retry, unknown/malformed/no-trailer, and transport errors doom it. The real C++ Database/RocksDB process acceptance proves both a caught `NotFound` commits and an unrecoverable retry outcome aborts without durable mutation (`tests/generated_cxx_database_process.rs`). Nested retry reissue, shared/factory paths, streaming/reactive/workflow/task errors, generic retry execution, and broader nested/distributed transaction semantics remain excluded. `aio/call.py`’s arbitrary metadata `Options` and `MixedContextsError` also lack a safe public Rust analogue: `ExternalContext` intentionally emits only typed Reboot headers. Required acceptance: generated server/client plus wire-level known-declared, known-system, unknown-detail, malformed-detail, detail-order, and code-fallback vectors; downstream compilation; and transaction outcome tests proving recoverable versus unrecoverable behavior—separate from retry execution. |
| Generated external unary authentication/authorization | `aio/servers.py:465-507`; `templates/reboot.py.j2:1313-1415,1433-1462`; `aio/state_managers.py:5011-5122` | **Implemented, bounded external database (including database methods on mixed transaction/database services) and fresh exclusive-transaction slice (including factories).** Every generated external database reader/writer adapter—database-only or mixed—owns `AuthorizationPolicy`, preserves `new(...)`, and exposes `with_authorization`; mixed transaction RPC dispatch remains on its existing transaction lifecycle. Database-only constructors verify before replay/load, authorize the immutable optional loaded state before exposing absent/already-constructed outcomes, and only invoke/create after acceptance. Fresh exclusive transaction roots, including root-only factories, verify trusted headers before idempotency replay/admission; matching replay returns before state authorization; after participant start/state decode they authorize immutable canonical request/state bytes and abort the started participant on denial/error before handler/stage/completion. Factory authorization receives the optional loaded state (`None` when absent) before the existing-actor outcome is revealed. Inbound/nested, shared, promotion, resolver, and retry paths remain unchanged. | Generated Tonic/downstream acceptance proves a database-only constructor verifier rejection bypasses authorizer/handler; absent-state denial receives canonical request plus `None` and creates neither actor nor idempotency mutation; allowed construction records safe headers/method/canonical request/`None`, and an existing actor is authorized from immutable `Some(state)` before the conflict is disclosed (`tests/protoc_plugin_counter.rs`, `tests/reboot/protoc/constructor_counter.proto`). It also proves mixed-service verifier rejection and writer denial leave database state unchanged; allowed mixed readers/writers see canonical immutable state/request bytes and safe headers, while the established mixed transaction RPC continues to dispatch unchanged. Generator assertions prove database-only and mixed authorized-envelope selection. Other transaction shapes, streaming, OAuth/HTTP, tasks/workflows, claims delivery, and internal calls remain outside this slice. `x-reboot-internal-call` remains untrusted and cannot bypass policy. |
| Idempotency/replay/fingerprint | `aio/idempotency.py:34-735`; `aio/stubs.py:522-545`; `aio/state_managers.py:130-157,2456-2686,5217-5429` | **Partial.** Canonical SHA-256 fingerprint, collision-safe replay, UUIDv7 expiry enforcement, Python-compatible seven-day-expiring automatic external writer keys, and fresh-exclusive-root replay re-check after local actor admission: `src/runtime.rs:70-135,825-845,1464-1866,2023-2060`; `ExternalContext::writer`: `src/lib.rs:1004-1025`; generated transaction adapter: `src/codegen.rs:665-730`; participant effect staging: `src/durable_participant.rs:236-264`. | Cross-language fingerprint vector, unary/durable replay, collision, UUIDv7 past/equal/future boundary, automatic-writer version/expiry-window, and generated ordering/downstream-compilation tests exist. The post-admission re-check closes the completed-original/queued-duplicate race and aborts the duplicate participant before returning replay. **Idempotency alias/seed boundary (2026-10-05):** `aio/idempotency.py:58-135` has two superficially small helpers, but `make_idempotency_alias` is consumed only by workflow/iteration contexts and `make_derived_idempotency_key` folds the active context-local, protocol-4-pickled seed UUID into a workflow/task seed (`contexts.py:1488-1496`; `memoize.py:119`; `idempotency.py:75-123,657-736`). Rust has no workflow/task runtime, context-local seed scope, pickle wire contract, or a public API that can safely consume the result. **Blocked:** a standalone UUIDv5/alias façade would be dormant and would silently omit active-seed semantics. Required first: specify a Rust cross-language seed serialization/context contract, integrate it with workflow/task/idempotency ownership, and add vectors for no seed, deterministic key ordering, nested override/restore, alias+iteration, plus durable replay. Missing aliases/seeds, workflow/iteration scope, checkpoints, uncertainty acknowledgement, and distributed in-flight duplicate coordination. |
| Placement and resolver API | `aio/placement.py:31-487`; `aio/resolvers.py:9-69` | **Partial.** Native2pc remains isolated in `src/placement.rs:92-405`. A separate legacy application-plane immutable last-good planner snapshot parses canonical `PlacementPlanner.ListenForPlan` DTOs, validates application/service/state/shard/server/address topology, routes raw legacy wire state references by Python's first-component SHA-1 predecessor rule, and notifies only after an accepted snapshot: `src/legacy_placement.rs:1-399`; Python authority `aio/placement.py:242-315,323-413`. Opt-in `ApplicationHost` readiness derives local generated service names from `NamedService::NAME` and keeps public routes `Unavailable` until the host application's accepted snapshot declares every registered public service; legacy Coordinator/Participant controls remain exempt: `src/application_host.rs:224-292,504-755`; Python authority `aio/servers.py:617-648`. | Canonical DTO/unit tests prove routing and invalid/stale retention; host acceptance proves recovery-gated public ingress remains closed through no plan, malformed plan, missing-service valid plan, and stale replacement, then opens only after a newer valid matching plan (`tests/application_host.rs:474-632`). `PlacementPlannerRecovery` exercises canonical `ListenForPlan`, unavailable-only reconnect, last-good retention, cancellation, and supervised fatal statuses (`src/application_host.rs:184-286`, `tests/application_host.rs:812-927`). **Real sidecar proof (2026-10-06):** `generated_factory_root_recovers_target_through_live_placement_planner_across_two_cxx_database_processes` serves each two-host phase from a canonical planner stream rather than `--legacy-placement-plan`; the same stream-fed placement instance routes generated outbound calls, root participant controls, and recovered participant Watch. It starts target recovery before root, waits the durable Watch terminalization marker, and separately polls both independent C++ Database/RocksDB sidecars (`tests/generated_cxx_database_process.rs`). Missing production planner configuration/discovery, dynamic ownership/lease fencing, actor admission/authorization, planner cache/retries beyond the bounded stream lifecycle, and general application deployment topology. This snapshot/gate grants neither ownership nor authorization. |
| Context/process scheduling helpers | `aio/contexts.py`; `aio/cooperatively.py:7-39`; `aio/memoize.py:51-369`; `aio/once.py:6-48`; `aio/directories.py` | **Rejected as standalone Rust façade.** | `contexts.py` needs transaction/workflow/reactive ownership; trailers are transport-only. `cooperatively()` promises executor-specific `asyncio.sleep(0)` yielding per element, which has no executor-neutral Rust equivalent. `memoize()` needs durable generated state, workflow/idempotency context, effect checkpoints, and Python pickle. `Once`/`AsyncOnce` accept arbitrary call arguments and mark completion through Python exception/cancellation paths; `std::sync::Once` or a zero-argument wrapper is not equivalent. Process-global `chdir` is unsafe in concurrent Rust programs. Implement only with their owning runtime/lifecycle, not as decorative utilities. |

### Actor state and legacy transactions

| Capability | Python reference | Rust status and reference | Evidence / remaining work |
|---|---|---|---|
| Unary actor admission, read/write, constructors | `aio/state_managers.py:3409-3988,4326-4741,4618-4741` | **Partial.** `DatabaseActorStore`: `src/runtime.rs:1337-1964`. | Durable load/read/write and `RequireExisting`/constructor replay are tested. Missing generic StateManager, authorization callback, broad effects execution, and generated declaration coverage. |
| Per-actor locking and nested ownership | `aio/state_managers.py:709-947,1711-2237,2873-2913,5454-5520` | **Partial.** local `ActorGate`: `src/runtime.rs:845-1080`; one pending local participant: `src/durable_participant.rs:416-651`. | FIFO exclusive queue, no reader barge, cancellation, and atomic upgrade are tested. Missing transaction-tree ownership, relinquish RPC, snapshots/rollback, sibling deadlock handling, and exclusive→shared downgrade. |
| Legacy participant prepare/terminal | `aio/state_managers.py:6139-6719` | **Partial.** `src/durable_participant.rs:654-911,998-1046`. | One actor, durable prepare, read-only release, definitive abort and acknowledged terminal paths are covered. Task validation/dispatch is coupled for the bounded root and live-leaf reader paths above; streaming effects and general concurrent participant trees remain missing. |
| Legacy root coordinator and enlistment | `aio/state_managers.py:5011-5980,7066-7183` | **Partial.** `src/durable_coordinator.rs:456-595,799-943`; trailers `src/successful_trailers.rs`. **Prepare fan-out slice (2026-10-05):** Python `_transaction_coordinator_complete` persists the coordinator record while initiating participant Prepare work, and `_transaction_coordinator_prepare` treats only an explicit `abort` response as definitive (`aio/state_managers.py:5535-5649,5665-5820`). Rust now seals the complete participant record in the Database sidecar before concurrently resolving/Preparing every participant, both on initial completion and re-prepare recovery (`src/durable_coordinator.rs:537-672,782-826`). It waits for all started Prepare work; any transport/task failure remains ambiguous and returns with the sealed record untouched—never converted to Abort—while an all-settled explicit abort response drives the established durable abort/terminal/cleanup path. | The barrier-backed unit test proves two Prepare calls enter the fan-out concurrently only after `DbPrepare` (`src/durable_coordinator.rs:1491-1523`); existing process-local fixtures cover ordering and definitive abort. **Real sidecar recovery acceptance (2026-10-06):** `generated_legacy_root_recovers_two_remote_participants_through_live_placement_planner` starts a generated root plus two separately persisted remote actors against three C++ Database/RocksDB sidecars, drives all outbound/control/Watch routes from canonical live `PlacementPlanner.ListenForPlan` streams, kills every host after the durable root decision, restarts every sidecar, starts both recovered participants before the root, and proves each Watch terminalizes once and all three durable states commit. Broader transaction trees, tasks/effects, fencing, and Python's remaining generated-root semantics are still outside this bounded proof. |
| Coordinator Watch and recovery | `aio/state_managers.py:5982-6127,6823-7183` | **Partial.** `src/legacy_coordinator.rs:20-152`; participant recovery `src/durable_participant.rs:711-855`. | Durable decision lookup and authoritative Watch membership checks are tested. Application lifecycle must create hosts at exact identities and invoke recovery; the bounded unary-reader task restart proof is above; general transaction-tree and workflow recovery remain absent. |
| Fresh local shared → exclusive promotion | Python effects classification: `aio/state_managers.py:163-211` plus actor-lock semantics | **Partial, bounded fresh-root vertical (2026-10-05).** `StartedLocalTransaction::into_shared_local_promotion` consumes the exact staged local actor/proof into non-cloneable direct-local authority; `complete_shared_local_promotion` now performs DB prepare → direct local prepare → DB prepared → decision → direct terminal → cleanup without `ParticipantResolver`, while transport ambiguity remains recoverable (`src/durable_participant.rs:333-423`; `src/durable_coordinator.rs:522-592`). The generator uses that path only for a fresh, non-factory shared root on one existing local actor: generated `SharedLocalTransactionContext` exposes no transaction metadata, routing, enlistment, tasks, idempotency, or returned participants; inbound shared execution retains the established `TransactionContext`/read-only path (`src/runtime.rs:71-91`; `src/codegen.rs:1451-1487,1605-1614`). | Unit acceptance proves held-participant direct ordering, resolver non-use, reject-before-I/O, and post-prepare ambiguity preservation. Generated Tonic/downstream acceptance proves unchanged state takes the read-only coordinator path, changed state takes exactly one direct-local promotion, and handler failure releases the undurable lease (`src/durable_coordinator.rs`; `tests/protoc_plugin_counter.rs`). **Real-sidecar recovery (2026-10-05):** `generated_fresh_shared_local_promotion_recovers_after_durable_decision` starts the current generated fixture against C++ Database/RocksDB, changes `5 → 12` through the fresh shared handler, kills the host after the durable coordinator decision, restarts Database, starts recovery, and boundedly observes the committed durable state (`tests/generated_cxx_database_process.rs`). It intentionally excludes factory, inbound, remote/returned-participant, nested/multi-ID, placement, effects/tasks/idempotency and all broader distributed semantics. See [`PARITY.md`](PARITY.md). |
| Exclusive → shared downgrade | Python lock behavior: `aio/state_managers.py:1711-2237,1936-1961` | **Implemented, process-local.** `ActorGate` uses one ordered reader/writer waiter queue and `ExclusiveActorLease::downgrade(self) -> SharedActorLease`: `src/runtime.rs:854-1160`. | Unit tests prove pre-writer readers are admitted after downgrade, post-writer readers cannot barge, grant-ready reader and queued-writer cancellation are removed safely, and upgrades reject queued work rather than bypassing or deadlocking their snapshot. It remains a process-local gate—not distributed ownership or a durable transaction promotion path. See [`PARITY.md`](PARITY.md). |

### Tasks, collections, and reactive behavior

| Capability | Python reference | Rust status and reference | Evidence / remaining work |
|---|---|---|---|
| Tasks, task workflows, responses, dispatch and recovery | `aio/state_managers.py:4743–5009,5431–5438,6408–6416,6586–6593,6848–6867`; `aio/internals/tasks_dispatcher.py:225–305`; generated ownership `templates/reboot.py.j2:420–467,858–1028,2350–2475` | **Partial: generated existing-actor unary reader and ordinary-writer one-shot tasks, including method-declared terminal errors.** `src/codegen.rs` supplies typed immediate/absolute-UTC scheduling and method-bound canonical Wait; `src/one_shot_tasks.rs` owns durable rescan/dispatch, immutable trusted-host method registration, terminal validation and completion CAS; `src/runtime.rs` seals admitted writer outcomes, discards failed private state and checkpoints successful writers for replay. Participant-local supervised-tree task staging is coupled to Commit/Abort. | Real CXX/RocksDB matrix: 92 cases, including declared reader/writer restart, public Wait malformed/stored-method/cross-method negatives, cancellation-before-readmission, lost completion ACK, equal/conflicting CAS winners and A→B→C Commit/Abort. Native2pc8 is separate regression evidence. Three restored causal REDs cover cancellation, full-method association and rich RPC classification; additional declared-specific mutation controls remain follow-up work. Writer handler-only pre-Store failures have three bounded attempts; reader escaped failures are not retried. Workflow iterations, task authorization, task cancellation/list APIs, distributed fencing and atomic Store+CompleteTask remain missing. Application registration is trusted, not nonforgeable generated-origin authority. No exactly-once handler/external-effects or full SDK parity claim. |
| Colocated collections / SortedMap range | `aio/state_managers.py:3739-3816,6721-6820`; `std/collections/v1/sorted_map.py` | **Missing.** Only FakeDatabase test stubs exist. | Requires collection effect model, sidecar range bindings, transaction visibility, and generated collection API. |
| Streaming and reactive readers | `aio/state_managers.py:4350-4613,6554-6699` | **Missing.** Runtime reader is unary; successful trailers are transport plumbing, not state subscriptions. | Requires lifecycle/backpressure/reconnect/visibility contract and subscription runtime before any generated API. |

### CompleteTask sidecar prerequisite (2026-10-06)

`rbt/v1alpha1/database.proto` adds a distinct `Database.CompleteTask` RPC;
`reboot/server/database.cc` serializes concurrent completers through the existing
check/write mutex and atomically stores COMPLETED while deleting PENDING in one
RocksDB WriteBatch. An absent pending record returns `completed = false` without
creating a column family or terminal result. Scheduling fields are copied from
the durable pending record; mismatched method/request/iteration is rejected.
Only the supplied terminal response/error is used. Responses require a typed
Any URL (nonempty prefix and final name), but application payloads remain opaque
and may be empty. Errors must unpack as `google.rpc.Status` with a canonical
non-OK code (1..16); details require typed Any URLs and remain payload-opaque.

**Compatibility boundary:** this is first-completion-wins among `CompleteTask`
callers on the sidecar, not a global invariant. Legacy `Store`, transactional
`Apply`, and import/restore paths retain unconditional task-upsert semantics;
nontransactional Store shares the mutex but still unconditionally overwrites,
while transaction commit/import have separate write authority. These paths can
overwrite a terminal result or recreate pending data. Python still completes through `_store` under its actor
lock (`aio/state_managers.py:4743-4782`). Enforcing a global invariant requires a
separate migration of those authorities, including workflow iteration behavior;
this change deliberately does not alter that established contract.

Real RocksDB/gRPC tests in `tests/reboot/server/database_tests.cc` cover restart
persistence, deterministic competing completion at the locked read/write
boundary, malformed terminal/identity/scheduling rejection with subsequent
successful completion after restart, packed status persistence, valid empty
response payloads, absent-task no-op, and the legacy Store overwrite boundary.
The Rust actor-store fake explicitly returns Unimplemented for this RPC; it is
not CAS evidence. **Task SDK/runtime parity remains missing:** no generated
handler/dispatch owner, actor-locked SDK completion, or crash/redelivery runtime
has been added by this prerequisite.

### Application host, web, and security

| Capability | Python reference | Rust status and reference | Evidence / remaining work |
|---|---|---|---|
| Application/server lifecycle, service registration, readiness/config | `aio/applications.py:1003-1125`; `aio/reboot.py:196-214,483-590,699-743`; `aio/servers.py:264-286,587-662`; `aio/interceptors.py:169-205`; `aio/headers.py:279-292`; `aio/servicers.py` | **Partial: trusted ingress plus listener-first legacy-recovery control/readiness and bounded host-owned gRPC health.** `ApplicationHost` owns one immutable application ID, registers arbitrary generated Tonic services, and starts its typed router; its mandatory Tower ingress removes inbound `x-reboot-application-id` and inserts unconstructable `TrustedApplicationContext` in request extensions. Registered generic `ApplicationLifecycle` components initialize, then recover, before Tonic binds; startup errors close initialized components and fail closed. `serve_with_shutdown` waits for Tonic graceful shutdown before lifecycle cleanup (`src/application_host.rs`). `RebootHeaders::from_request` lets generated transaction adapters consume that server context, while `from_metadata` remains untrusted (`src/lib.rs`; `src/codegen.rs:1343-1351`). | `tests/application_host.rs` starts two distinct generated services through one lifecycle-bearing host, proves initialize/recover/serve/shutdown ordering, verifies both services receive `server-owned-app`, and verifies spoofed inbound metadata is masked; a failing recovery proves no listener opens and initialized components are cleaned up. **Boundary:** these hooks are generic host execution, not Python Reboot recovery. Python `ServiceServer.start` invokes `StateManager.recover` before gRPC start, then web/React and lifecycle-owned health; `Reboot.up` separately owns planner/config/initializer ordering and `Reboot.stop` owns placement/Envoy/sidecar teardown. The remaining boundary is host-level placement/config: Rust still has no readiness/config, HTTP/auth, observability, or real process/sidecar acceptance. **Host-owned gRPC health slice (2026-10-06):** `ApplicationHost` installs the standard `grpc.health.v1.Health` service itself, excludes it from placement completeness, admits it while recovery ingress remains closed, and reports `NOT_SERVING` until recovery finishes then `SERVING` (`src/application_host.rs`; `tests/application_host.rs`). It does not attempt Python's React websocket probe, HTTP health, Watch streaming, or broader application health semantics. **Listener-first legacy-recovery vertical (2026-10-05):** `ApplicationHost` now binds its fixed router before registered `HostRecovery` work, gates public RPC paths as `Unavailable`, admits legacy Participant/Coordinator paths, and cancels/joins supervised Watch tasks on failure or shutdown (`src/application_host.rs`). Generated adapters expose only their injected participant/coordinator/control services and create `LegacyDurableRecovery` from explicit recovery metadata plus a host-selected Watch endpoint (`src/codegen.rs:1631`; `src/application_host.rs:95-179`). Python constructs the complete work set before serving: registered middleware gives `StateManager.recover` its state-type map, application identity, channel manager, and owned shard IDs (`aio/servers.py:453-568,587-596`; `aio/state_managers.py:6823-6914`); recovery restores each local participant lock then *spawns* a cancellable coordinator-watch task, and separately restores each coordinator control loop (`aio/state_managers.py:6901-6955`). Its Watch resolves the coordinator through the channel manager using the exact coordinator state type/ref and sends the coordinator state ref as routing metadata (`aio/state_managers.py:5982-6046`); the control services are registered on that same server (`aio/state_managers.py:6058-6060`). Rust has no equivalent generated registration/host ownership boundary. `DurableActorParticipant::recover_and_watch` instead requires one concrete `(state_type, state_ref)`, `ParticipantRecovery { state_tags_by_state_type, shard_ids }`, and host-selected `CoordinatorWatchEndpoint`, holds the actor lock, and awaits a terminal decision (`src/durable_participant.rs:725-870`). `DurableRootCoordinator::recover` separately requires `CoordinatorRecovery { state_tags_by_state_type, shard_ids, coordinator_state_ref }` and a `ParticipantResolver`; neither durable module invents placement or discovery (`src/durable_coordinator.rs:65-83,126-152,586-672`; `src/legacy_coordinator.rs:13-16`). Generated adapters only receive already-built participant/coordinator instances and expose no recoverable identity/state-tag/shard declaration, coordinator ownership, sidecar-client owner, or control-route resolver/watch registration (`src/codegen.rs:1606-1626`). Therefore `ApplicationHost` cannot construct the work set. Its lifecycle also starts before its sole router binds (`src/application_host.rs:284-292`), so directly awaiting `recover_and_watch` deadlocks on a local Watch route; detaching it would lose the required host cancellation/error ownership. The C++ fixture deliberately hand-assembles this missing graph—two sidecar clients, actor participant host, coordinator Watch host, route table, listener, then recovery (`tests/fixtures/generated_cxx_database_process/src/main.rs:250-400`)—and is not a reusable generated/host path. **Required minimal contract and acceptance plan:** (1) generator emits a registration record for every adapter containing exact actor/coordinator identities, state tag, shard ID, and a consuming direct-local participant control binding (never resolver re-resolution of a held actor); (2) `ApplicationHost` owns sidecar clients, placement-backed participant resolver, registry validation/deduplication, and one cancellable recovery supervisor; (3) startup first binds only registered Participant/Coordinator control routes, drives participant-watch and coordinator convergence, fails closed/cancels/cleans up on any error, then enables generated application ingress; (4) unit/integration test proves application RPC is unreachable during stage one while local Watch can terminalize, and is reachable only after convergence; (5) ignored real C++ Database/RocksDB crash/restart test waits for durable participant and coordinator completion before asserting one terminal state/replay. C++ `DatabaseService` can restore RocksDB and stream `Recover`, but does not supply application identities or placement (`server/database.cc:797-817,4949+`). Do not add a generic lifecycle callback, fabricated sidecar recovery, or partial/dormant registry. Health remains lifecycle/React-websocket-owned and is intentionally not a generic endpoint. `src/main.rs` remains the fixed Echo demo. |
| HTTP/ASGI routes and external-context injection | `aio/http.py:25-375`; `aio/applications.py:598-608` | **Partial: bounded external-only GET/POST/OPTIONS registration.** `ApplicationHost::http()` consumes the initial host stage into `HttpApplicationHost`, preserving its server-owned application ID and lifecycle while serving an Axum router (`src/http_host.rs`). Handlers receive `HttpRequestContext` with host-created `TrustedApplicationContext` plus an `ExternalContext` named exactly `HTTP {method} '{path}'`; it has no caller ID. `Authorization` is copied only when whitespace splitting yields exactly two tokens and the scheme equals `Bearer` case-insensitively, matching `aio/http.py:228-259`. | Locked Rust acceptance uses a real Hyper HTTP/1 client against the bound listener, exercises registered GET/POST/OPTIONS routes, and proves application identity, method/path context naming, accepted mixed-case bearer, rejected extra/malformed bearer, and no caller ID (`src/http_host.rs`). HTTP/gRPC multiplexing, app-internal routes, mounts/factories, OAuth/React/static assets, proxy handling, websockets/streaming, bodies/parameters, tasks, workflows, and placement readiness remain out of scope. |
| Authentication, authorization, OAuth/OIDC | `aio/auth/token_verifiers.py`; `authorizers.py`; `oauth_server.py`; providers | **Missing.** Rust carries bearer metadata only. | Create token-verifier and authorization traits with default deny, then test metadata/auth integration; OAuth requires the HTTP host. |
| CLI init/dev/run | `cli/commands/init`; `cli/commands/dev.py:132-166,1041-1046,1968-1970` | **Missing.** Cargo can run the bounded binary; `rbt dev run` only supports Python/Node. | Pick Cargo-only support or build `rbt init/dev run --rust` after generic host lifecycle exists. |

### Native2pc: explicitly separate from Python legacy parity

Rust Native2pc (`src/native_2pc.rs`) has validated identities, capability
negotiation, placement-plan routing, one-pass prepare/decision, prepared/staged
recovery, and bounded singleton state-only materialization. Its tests cover
validation, recovery, and transport; real C++ acceptances remain skipped without
the sidecar binary.

Python `aio/state_managers.py` contains legacy Database Participant/Coordinator
2PC, not Native2pc journals or RPCs. Native2pc must not reuse legacy records,
`Database.Recover`, or legacy participant/coordinator mutators. It is therefore
**Rust-only bounded functionality**, not evidence of Python transaction parity.

## Real-sidecar evidence

The following tests remain `#[ignore]` by default because they require an
explicit `REBOOT_NATIVE2PC_CXX_DATABASE` artifact, but they were run against a
fresh real C++ Database/RocksDB process on 2026-10-05 using the artifact built
from `//reboot/server:database` at PR commit `8468ea09`:

- `rust/tests/generated_cxx_database_process.rs` — **10 passed**: generated
  legacy adapter, factory, idempotency, read-only recovery, and shared-root
  acceptance coverage.
- `rust/tests/native_2pc_transport.rs` — **8 passed**: native
  preparation/recovery and materialization coverage.

The remote test host is reachable as `ladin@maxbucek-orignal-omarchy`; its
user-local test toolchain includes Rust and the compatibility `libcrypt.so.1`
needed by Bazel's pinned Python. Local free disk remains below the 40 GiB Bazel
guardrail, so local sidecar rebuilding is still prohibited. Passing unit or
fake-sidecar tests never substitutes for the recorded process/restart evidence.

Future added real-sidecar acceptances remain gated on supplying the artifact
through `REBOOT_NATIVE2PC_CXX_DATABASE`.


## Verified bounded generated writer tasks

**Verified bounded vertical; overall task parity partial:** singleton fixed existing local actor, explicitly attached writer-capable generated dispatcher, eligible unary non-constructor writers without declared errors. Generated immediate/absolute-UTC scheduling, typed canonical Wait, and mutable handler execution are coupled. Reader-only attachment, shared-shard reader recovery, remote-leaf reader allowance and whole-tree task denial remain distinct.

Python authority: `reboot/templates/reboot.py.j2:899–943` invokes writers with alias `Task {task_uuid}` then separately completes; `reboot/aio/contexts.py:912–918` seeds task UUID; `reboot/aio/idempotency.py:125–134,511–522,633–699` defines UUIDv5 and quoted fully-qualified RPC plus decoded final actor ID; `reboot/aio/state_managers.py:4694–4782` separates writer state+response persistence from completion. Verified runtime: `src/runtime.rs` admitted task execution/checkpoint/key, `src/one_shot_tasks.rs` exclusive dispatcher/opaque receipt/whole-binding durability guard, `src/codegen.rs` generated binding and writer-only attachment; `src/application_host.rs` lifecycle-bound synchronous sticky Failed authority.

Real canonical CXX/RocksDB generated acceptance executes scheduling, Store checkpoint crash, RocksDB restart, intervening ordinary admitted writer, original response without handler/Store replay, then completed restart without replay. Additional exercised process vectors: pre-Store handler interruption/redelivery, exclusive ordinary-writer exclusion, one-attempt lost Store and completion ACKs, bare handler Status leaves Pending and fails host. These are atomic **state+response Store THEN separate CompleteTask**, not atomic mutation+completion. Python UUIDv5 alias has an independently computed fixture vector.

Causal RED controls executed: bypass replay and fresh replay lookup key return 118 instead of original 15; reentrant exclusive acquisition misses bounded Store barrier; no actor admission permits ordinary Apply overlap; premature completion deletes Pending before required Store checkpoint barrier; omit synchronous failure fails unit Failed-before-lease-release invariant. Shared instead of exclusive also blocked ordinary exclusive entry and was an insensitive control, replaced by removal of actual admission. Production restored after every control. Failure-before-release unit proof is not universal actual-host race evidence.

Additional acceptance (2026-10-07): `tests/fixtures/writer_task_authority_acceptance.rs` uses an actual downstream public custom binding against CXX/RocksDB and a real ApplicationHost/Tonic listener. Discarded admission cannot complete; a receipt parked after acknowledged Store or strict replay is dropped by graceful shutdown, which returns RecoveryTask rather than success, joins the binding, closes the listener and preserves the complete Pending task after RocksDB restart. Canonical persisted request bytes are decoded inside the capability and the method-bound fingerprint is inspected. Three executed compile-fail doctests reject receipt construction, Any completion bypass and caller replacement of method/request. The binding remains trusted handler/descriptor configuration, not an untrusted code sandbox.

`tests/fixtures/writer_task_process_acceptance.rs` drives the actual generated host: staged participant effects and durable participant/coordinator preparation have no dispatcher entry or Pending record before terminal commit; generated writer At waits until the persisted UTC deadline; eleven malformed identity/request/scheduling/method and inactive/missing-owner vectors reject without state/task effects. Actual sidecar strict-checkpoint negatives cover absent/empty/different-request/different-full-method fingerprints, malformed response and task IDs; missing actor does not create state. An intentionally competing sidecar completion causes actual CAS false, whose different saved response is preserved rather than overwritten, including after restart. Unit matrices additionally exercise returned-checkpoint foreign actor/key/workflow fields and exact completed-record identity/scheduling; those unit vectors do not claim the canonical sidecar returned corrupt records.

A test-only bounded destructor barrier parks the actual Store guard after synchronous Failed but before exclusive lease destruction. A competing generated ordinary writer returns Unavailable and never enters its handler while that barrier remains parked. Its launch precedes Failed, but a sleep rather than a positive ingress/queued marker means this test does not conclusively establish that it crossed ingress before Failed. It uses block_in_place so the test does not strand Tokio's runnable queue; two earlier attempts without that handoff reached client cancellation, not ordering proof. Removing synchronous Failed makes the final test reach Cancelled instead of Unavailable. Removing whole-binding coverage or the shutdown latch makes downstream post-Store cancellation return false success; each RED is restored. A live-Tonic startup regression proves an earlier latched failure cannot be overwritten by Ready and propagates through shutdown. The actual-host proof is local fixed-owner ordering, not multi-host fencing.

Final restored verification passed on 2026-10-07: 255 library tests, 26 generated downstream vectors, 78/78 real CXX/RocksDB process cases, 8/8 Native2pc, 3/3 compile-fail doctests, formatting and strict locked all-features/all-targets Clippy. Independent safety delta review found no new blocker; its remaining regression gate was satisfied by the final restored runs. Runtime validation errors now retain their precise Status rather than being masked as shutdown uncertainty; otherwise successful exits check sticky failure after child destruction on shutdown, interrupted startup and early router exit. See `/tmp/writer-task-replay-checkpoint.md` and separate GREEN/RED logs for exact execution inventory.

Excluded: retries (including mutation Unavailable), terminal task errors/declared errors, workflows/iterations, task auth, transactional targets/constructors, nested scheduling, tree tasks, migration/fencing, overlapping hosts, global first-result-wins across legacy Store/import/transaction writers, checkpoint deletion, and exactly-once handler/external effects. A pre-checkpoint crash can rerun user code. CAS false rereads exact canonical identity/scheduling and typed response; a different winner response is treated as a collision/failure, preserved unchanged, never advertised as the losing candidate.
