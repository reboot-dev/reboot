# Rust SDK parity

This is the **single current parity and capability ledger** for the Rust SDK.
It replaces the separate parity map, capability notes and candidate/contract
records. Historical proposals and failed runs remain available in Git history;
they are not additional current specifications.

**Verdict:** useful experimental local applications and bounded durable runtime
verticals exist. Full Python/TypeScript feature equivalence and production
readiness do not. Languages are intended to be used independently: mixed-language
applications are **not a requirement or a parity gap**. Existing canonical
protocols are implementation contracts, not an interoperability certification.
No overall percentage is asserted.

## How to read the evidence

- **Implemented, bounded:** a public/generated path exists, with the limitations
  stated here. This never means every shape of that Python feature works.
- **Executed:** the cited acceptance actually ran successfully on a recorded
  source snapshot. Tests merely existing or compiling do not earn this label.
- **Test coverage:** source contains executable cases, but the latest batch did
  not necessarily execute every ignored native case.
- **Missing:** required semantics/API are absent or explicitly rejected. A
  rejected operation is not an implementation waiting for a compiler flag.

The latest scheduled-workflow cancellation was implemented on baseline
`f385e2b49680e1fb7d2e7bfd557bfe3bc2875cf2` (2026-10-08). Workflow-service reactive
integration was based on `2ab2695302a62ded67eda4a63cf0919efc41a11d`. The preceding explicit
reconnect vertical was based on `dfb8734c9834f31a2038d36deb8bbadfb6e80601`. Declared workflow
terminals were implemented from `ba58bae69fb047b52e637525b36aa19227c7a7b5`;
the original public batch app was based on `e2a6bdc5914a8c152eb48c102c3dc91249cc4ead`. Executed
public Cargo/native application acceptance and retained greeting regressions
are described in [Verification](#verification). Older workflow/transaction
proofs below retain their separate source snapshots and limits.

## Capability overview

| Capability | Current useful slice | Main remaining gap |
| --- | --- | --- |
| Local app DX | Cargo scaffold, annotated-proto generation, typed client, durable dev host | Production packaging/bootstrap and general distributed application composition |
| Schema/codegen | Explicit schema DSL, Prost/Tonic bindings and concrete typed adapters | Rust derive/reflection and complete schema/tooling contract |
| State/client runtime | Durable constructors/readers/writers, idempotent response replay, metadata/auth | General distributed ownership/fencing and arbitrary external effects |
| Transactions | Legacy durable coordinator/participant paths and bounded supervised chains/star | General nested snapshots, reentrancy, intersecting subtrees, migration |
| Tasks | Durable scheduled tasks, typed results/Wait, recovery, local admin list/stream and scheduled-workflow cancellation | Transactional targets, running/ordinary/distributed cancellation, aggregation, broad retry and dispatcher fencing |
| Workflows | Finite typed named steps, finite indexed replay, saved reader decisions, typed declared business terminals; explicit local-body resumption | Python unbounded Task cursor/GC/Break, cross-actor composition, framework failure isolation |
| Reactive readers | Typed bounded database/workflow/transaction-service ordinary reader subscriptions, commit invalidation and explicit same-query reconnect | Cross-actor/remote invalidation, transparent reconnect/durable resume, streaming/transaction RPC subscriptions |
| SortedMap | Canonical empty constructor, serial same-host app/map transactions and public two-map atomic approval transfer | Public inbound adapter, nested/reusable siblings, distributed collection lifecycle |

## Local app development

**Implemented, bounded:** one local public gRPC host backed by one canonical
C++ Database/RocksDB process. The SDK crate is unpublished and requires a checkout.
The CLI does not use Python/Node Envoy/bootstrap, distributed placement, dashboard
or chaos machinery. The default greeting scaffold wires ordinary unary
constructor/writer/reader methods. The opt-in `--rust-example=batch-ledger`
scaffold additionally composes a finite approval-gated workflow, typed canonical
Tasks.Wait, a local reactive subscription and transactional SortedMap in one
host. It restores **all** application/map participant ownership before coordinator
recovery, authoritative Watch convergence, task recovery and public readiness.
One task owner and one Wait service serve this bounded one-server topology;
this is not general distributed placement or mixed-language composition.

Generate it with the same Cargo/native development path:

```sh
rbt init --backend=rust --frontend=none --application-name=batch_ledger \
  --rust-sdk=/absolute/path/to/sdk/reboot/rust --rust-example=batch-ledger
```

Its generated README documents `create`, `submit`, `approve`, `watch`, `wait`,
`read`, `history`, `archive`, `archive-history` and typed archive rejection.
Approval updates the ledger and index in one transaction; archive moves an exact
approval entry between two distinct canonical maps and updates a cumulative counter
under the same admitted app root. Existing workflow terminals/checkpoints are retained;
workflow steps wait without holding an exclusive lease. The stable empty-map
constructor replays on restart; no private state seeding is required. Arbitrary
external-effects exactly-once and additional status-code retry policies are not
claimed.

```sh
mkdir greetings && cd greetings
rbt init --backend=rust --frontend=none --application-name=greetings \
  --rust-sdk=/absolute/path/to/sdk/reboot/rust
export RBT_RUST_DATABASE_BINARY=/absolute/path/to/reboot/server/database
rbt dev run --rust-allow-insecure-database
# In another terminal in the generated project:
cargo run --manifest-path backend/Cargo.toml --bin client -- create
cargo run --manifest-path backend/Cargo.toml --bin client -- greet
cargo run --manifest-path backend/Cargo.toml --bin client -- read
# Reuse this same logical mutation key when retrying:
cargo run --manifest-path backend/Cargo.toml --bin client -- \
  greet hello 11111111-1111-4111-8111-111111111111
```

**Security boundary:** the canonical C++ executable binds unauthenticated
`0.0.0.0`; only the public Rust host is loopback-bound. The explicit insecure
opt-in is mandatory. Use an isolated trusted development network, not production.
Use the compatible canonical Database binary, not the isolated Native2pc sidecar.
The runner needs POSIX process groups/`fcntl`; Linux descendant cleanup uses
child-subreaper support.

Cargo `build.rs` generates bindings/adapters in `OUT_DIR`. The Rust `.rbtrc`
disables the ordinary background generation watcher; `rbt generate --rust` is a
separate prebuilt-plugin route, not the Cargo app build path. The CLI builds app
and client, validates app `--server-info`, starts Database/host, then checks
canonical Health.Check through the client. Rust/proto/build/manifest changes
rebuild and restart the host while retaining Database state; failed builds end
the session. Configuration changes require restarting the command.

State persists at `.rbt/dev/<application-name>/rust/rocksdb`; `database.log` and
`host.log` live alongside it. An advisory lock rejects simultaneous sessions on
the same state directory. Signals cancel/terminate/reap owned process groups;
unexpected child exit fails the CLI and cleans up the other child. The runner
requires `--servers=1` and rejects unsupported frontend/TLS/Node/Python/tracing/
transpilation/background-command modes. `--terminate-after-health-check` is a
bounded startup smoke option. `--port=12991` changes the public listener; use
`RBT_RUST_URL=http://127.0.0.1:12991` on the client. Expunging local state is
separate and destructive, never a normal verification step.

Init validates SDK/frontend/name and collisions before writes, rejects symlinked
scaffold parents/overwrites, and publishes `.rbtrc` last. Python 3.10 uses `tomli`;
newer Python uses `tomllib`.

**Sources:** [rust_init.py](../cli/commands/init/rust_init.py),
[rust_dev.py](../cli/commands/rust_dev.py), [dev.py](../cli/commands/dev.py),
[templates](../cli/commands/init/templates).
**Coverage:** [CLI behavior tests](../../tests/reboot/cli/rust_app_dx_test.py),
[real app acceptance driver](../../tests/reboot/cli/rust_app_dx_e2e.py).
These cover create/write/same-key replay/read, canonical Load, RocksDB restart,
rebuild and owned-child cleanup; process-shim tests alone are not durability proof.

## Schema, generation and ordinary state APIs

The explicit schema DSL emits stable tags/requiredness, proto3 scalar types,
nested models, enums, repeated/map/oneof fields and reserved removed tags/names.
Compatibility checks reject supported tag/type/enum changes; this is not full
Python model validation/reflection. No mature `derive(RebootState)` equivalent
is claimed.

Cargo-native generation uses vendored protoc and deterministic Prost map fields
(`BTreeMap`) for request fingerprints. The direct plugin needs pre-existing
Prost/Tonic bindings and an explicit module/runtime path; it cannot silently
change those bindings' map containers. Generated services are concrete typed
handlers/adapters/clients, not caller-selected dynamic dispatch. Descriptor,
method-kind, symbol and unsupported-shape validation fail closed. Streaming
reader state is not ordinary unary state; canonical map and standalone workflow
services use specifically supported generator paths, not a blanket exception
for arbitrary trusted effects. Request/state/declared-error protobuf shapes are
bounded to supported same-package top-level models. Declared errors are supported
for ordinary unary readers/writers, exclusive transactions and standalone workflow
terminals, not shared transactions or declared reader/writer step errors in
workflow services. Metadata/StateRef helpers also remain a
subset: the StateRef codec is not automatic migration of opaque durable keys;
full per-call Options/context merge, timezone/DST parsing and cross-application
service discovery are not supplied.

```toml
[build-dependencies]
reboot = { package = "reboot-rust-schema", path = "/path/to/reboot/rust", features = ["build"] }
[dependencies]
reboot = { package = "reboot-rust-schema", path = "/path/to/reboot/rust" }
```

```rust
// build.rs; consumer owns the crate::proto module and includes emitted adapters.
fn main() {
    reboot::build::compile_protos_with_runtime(
        &["proto/counter.proto"], &["proto", "/path/to/reboot"],
        "crate::proto", "reboot",
    ).unwrap();
}
```

Database-backed adapters isolate actor/type, validate state references and call
metadata, load state, and durably Store state plus writer-response replay data.
Same-key request/method collisions fail closed. Constructor uniqueness,
automatic writer-key expiration and declared error envelopes have scoped tests.
Generated ordinary external unary readers/writers retry **Unavailable only** with
the same request/metadata/logical writer key. Backoff starts at one second, doubles
and caps at 30 seconds; the generated loop has **no total attempt/time budget**.
Callers must own a timeout/cancellation for bounded waiting. After an uncertain
call, a new `_with_key` invocation must reuse the original key; a new automatic
writer invocation creates a new logical key. This is not nested transactional or
arbitrary external-effect retry authority.
Actor gates are process-local, keyed by normalized endpoint/type/ref; endpoint
aliases or separate processes are not coordinated by these locks. Ordinary
handler external IO is not transactional or exactly-once.

**Sources:** [schema/DSL](src/lib.rs), [generation](src/codegen.rs),
[Cargo helper](src/build.rs), [runtime](src/runtime.rs),
[external client](src/lib.rs), [state refs](src/state_ref.rs).
**Coverage:** [generated downstream compilation/behavior](tests/protoc_plugin_counter.rs),
[external metadata/runtime](src/lib.rs).

## Application host, security and HTTP

`ApplicationHost` owns lifecycle, explicit recovery registrations, accepted
placement/readiness and router shutdown. Public ingress stays gated before
recovery or after host failure; internal recovery/control paths are separate.
Server-owned application identity is not a caller header. Generated adapters
support scoped bearer verification/immutable-state authorization and rich
method-declared/system error handling. Canonical Health.Check and opt-in descriptor reflection plus a bounded separate
external HTTP route host exist. Health.Watch is unimplemented; reflection requires
explicit descriptor sets and is not Rust derive reflection. The HTTP route context
does not expose a general body/parameter API or gRPC multiplexing/readiness.

**Authorization boundary:** default `AuthorizationPolicy` allows when no
verifier/authorizer is configured. Configured generated database methods and
fresh exclusive roots enforce their policies; shared/inbound/task/workflow paths
do not gain universal policy coverage. No built-in JWT/OIDC provider, default-deny
policy or complete HTTP authorization/web/middleware contract is claimed.

Shutdown during a parked `HostRecovery::start` drops startup ownership, revokes
readiness, cancels/joins prior owned children and closes ingress. Earlier completed
registrations' child failures can interrupt a later parked start. Children created
by the currently pending start are not independently polled until it returns.
Earlier lifecycle initialize/recover hooks are outside that startup cancellation
slice. Trusted host registration/handler/router composition is not a sandbox
against a malicious application registrar. Public metadata cannot manufacture
private task, workflow, map or supervised-root authority.

**Sources:** [host](src/application_host.rs), [HTTP](src/http_host.rs),
[generated authorization](src/codegen.rs), [placement](src/legacy_placement.rs).
**Coverage:** host lifecycle tests in [application_host.rs](src/application_host.rs),
[generated native fixture](tests/fixtures/generated_cxx_database_process/src/main.rs).

## Legacy transactions and ownership

### Implemented transaction shapes

Generated typed application RPCs carry validated transaction context to targets,
which load/authorize/run/stage their actual handlers and return participant
membership in trailers. The root collects membership and persists the complete
coordinator set before Prepare. Terminal `Participant` control RPCs do **not**
start/load/stage application methods. The rejected `ParticipantLifecycle.Start`
/`Stage` proposal is obsolete and must not become a roadmap requirement.

Legacy coordinator/participant recovery, resolver/placement routing, durable
state/idempotency, exclusive and factory roots and bounded shared/read-only
paths exist. Fresh local shared-to-exclusive promotion is implemented through a
consuming direct-local handoff on one existing actor: unchanged state takes the
read-only path; mutation owns Prepare/terminal delivery. It is not general
remote/shared promotion. Actor gates include queued-writer fairness,
cancellation-safe admission and supported exclusive-to-shared downgrade.

A successful response/trailer is not a durable decision. Transport uncertainty,
lost terminal ACKs, cancellation and sticky shutdown failure retain ownership
rather than synthesize an Abort or permit live competing admission. Recovery
uses durable canonical decisions; unprepared work must not become a fabricated
Commit. No general transparent retry after uncertain terminal operations exists.

### Supervised chains, rollback and root-star

- Explicit supervised existing-actor exclusive non-factory/non-idempotent
  A→B→C chains preserve original root identity, paths, registered root cleanup and
  each inbound participant's live Watch ownership. Builder/header flags alone do
  not grant authority. Successful-return chains and participant-local task effects
  are bounded supported shapes, not arbitrary-depth tree orchestration.
- First-touch direct-leaf declared-error rollback can retain read-only leaf
  ownership so a root catches the declared failure and commits its own effects.
  Exact singleton membership, admitted incarnation and canonical declared errors
  are mandatory; failed private handler state/tasks are discarded before staging.
- The descendant variant allows B to catch first-touch C, then succeed to A.
  B failure after the catch does not give A general subtree rollback authority.
  C restart before Prepare fails closed; no synthetic duplicate-Prepare success
  or crash-surviving in-memory read lease is supplied.
- `with_sequential_root_star()` permits sequential distinct leaves A→B then A→C.
  The runtime consumes counted scope and performs the real typed unary call;
  caller-created receipts/futures cannot settle membership. Repeated targets,
  overlapping scopes and descendants under this policy are rejected. After B
  succeeds, failed C dooms the root even if caught; uncertain C is not invented
  into confirmed membership. Trusted hosts supply fresh child IDs/routes.

**Additional implemented policy (source/test coverage, not rerun native release
certification here):** `with_sequential_reusable_participants()` allows bounded
serial same-root reuse of direct existing exclusive leaves using fresh nested
IDs. Retained staged effects and per-call snapshot/relinquishment are separate
from distinct-target root-star. Active/prepared/uncertain/stale/completed-ID or
shared-retained admissions fail closed; the canonical bounded
`relinquish_ownership` control path exists. See
[reusable acceptance](tests/fixtures/reusable_participant_acceptance.rs). This does
not establish concurrent/reentrant/intersecting subtree or general ancestor
snapshot semantics.

**Admission limits:** supervised paths are bounded to 32 transaction IDs; merged
participant sets are bounded to 1024. These are rejection boundaries, not automatic
paging or unlimited descendant traversal.

**Still missing:** general sibling/reentrant/intersecting subtrees, ancestor
staged snapshot restoration, nested rollback/retry, unrestricted shared/factory/
idempotent composition, general pre-Prepare coordinator-death resolution,
actor migration and cross-process dispatcher/ownership fencing. A bounded chain
or sequential distinct star is not the Python general ownership engine.

**Sources:** [runtime contexts](src/runtime.rs),
[participants](src/durable_participant.rs), [coordinator](src/durable_coordinator.rs),
[owned abort/scope](src/explicit_abort.rs), [generated stubs](src/codegen.rs),
[legacy protocol](../../rbt/v1alpha1/transactions.proto).
**Coverage:** [direct rollback](tests/fixtures/remote_leaf_task_acceptance.rs),
[descendant rollback](tests/fixtures/descendant_rollback_acceptance.rs),
[failure vectors](tests/fixtures/descendant_rollback_failure_acceptance.rs),
[sequential star](tests/fixtures/sequential_star_acceptance.rs),
[tree tasks](tests/fixtures/tree_participant_task_acceptance.rs).
Python comparison: [contexts](../aio/contexts.py), [stubs](../aio/stubs.py),
[state managers](../aio/state_managers.py). These compare semantics, not mixed apps.

### Isolated Native2pc

Native2pc has separate identities, journals/RPCs, routing and recovery/
materialization primitives. It is real implemented functionality but is not the
canonical legacy transaction protocol. Enrollment digests are supplied externally;
there is no general generated user-method/effect/task executor or retry/timeout/
lock-owning application coordinator. An acknowledged Committed decision is not
proof of participant terminalization/materialized state or executed effects.
Never use its passing tests to certify a
legacy transaction shape or general SDK semantics. Keeping that evidence separate
is still necessary even though mixed-language applications are not a goal.

**Sources:** [native protocol](../../rbt/v1alpha1/native_2pc.proto),
[native sidecar](../server/database.cc).
**Coverage:** [native transport](tests/native_2pc_transport.rs).

## Durable tasks and typed results

Generated existing-actor unary reader and ordinary non-constructor writer methods
can be scheduled immediately or at a canonical absolute UTC timestamp. Generated
owners must be actively registered with host recovery; a dormant builder cannot
schedule. Pending work is durable data, not a queue message. Bounded canonical
rescans discover committed work even when notifications are lost; future tasks
do not block ready peers. The supported runtime bounds pending/admitted work and
owns bounded concurrent singleton deliveries rather than unbounded detached workers. Singleton
admission bounds pending plus staged tasks to **1024**. Shared canonical recovery
rejects a cumulative Pending batch over **1024 before dispatch**, even if each
owner is individually below the limit; it does not page/drain excess work.

Writer success atomically persists actor state plus its saved response, then
**separately** completes via canonical CompleteTask CAS. Restart replays that
checkpoint without remutating, including after an intervening ordinary writer.
This is not atomic Store+CompleteTask. CompleteTask first-result-wins applies to
its CAS authority. Its mutex serializes CompleteTask and nontransactional Store,
but legacy Store still unconditionally upserts tasks; transaction commit/import
have separate write authority. Thus alternate overwrites are not universally
prohibited by the CAS or mutex.

Method-declared reader/writer errors persist as validated `Any<google.rpc.Status>`.
Immutable trusted registration binds full method, state/request/response types
and exact declared-error decoders. Generated Wait checks stored method/terminal;
same response types do not authorize another method. Rich RPC failures remain
transport/system `Grpc` failures rather than becoming declared results just
because their details resemble a schema. Trusted custom registration is not
cryptographic/protoc-origin sealing or third-party Tasks-server certification.

Ordinary writer `PreStoreFailure` receipts now escape as supervised failures,
without live retry. Before Store does **not** establish local-computation-only
provenance: handlers can forward transport or Cancelled statuses and perform
external IO. This on-path fail-closed correction removes the previous implicit
three-attempt policy; the workflow's explicit `RetryLocal` policy remains separate.
The fresh ordinary-writer native regression executed all 10 selected cases,
including the changed handler-failure vectors; historical three-attempt writer
proof is not evidence for this correction.

Failed private state is discarded. Framework Load/Store/replay/completion errors
escape that retry receipt path, and actual owner cancellation/uncertainty remains
fenced. Declared returns before completion CAS may be redelivered: no exactly-once
handler/external-effects guarantee or durable error checkpoint is claimed. Losing
CAS accepts an equal validated canonical winner; conflicting/malformed terminals
fail closed.

Canonical typed `Tasks.Wait` supports registered actors, exact response/error
validation, deadlines and per-poll/pre/post-Load accepted placement authority.
Generated routed Wait selects the latest client route, not a generic retry/migration
engine. Multi-actor/shared-shard reader recovery collects one canonical stream,
validates the whole bounded batch before dispatch and partitions exact type/ref.
Shared recovery does not install cross-actor transaction scheduling authority.
It supports graceful shutdown/redelivery without changing Pending to Cancelled.

Supported explicit supervised tree participants may stage **their own** reader/
writer tasks while exact root/Watch/gate ownership remains valid. Prepare carries
private effects; only committed canonical Pending plus local terminalization
makes them runnable. Trailers/queue hints/root decision alone cannot publish
work. Arbitrary foreign task upserts remain rejected.

Canonical server-local `Tasks.ListTasks` is opt-in on `ReaderTaskWaitService`:
`with_admin_authorization(verifier, authorizer)` requires both explicit
application-owned policies; no policy means denial. Authorization receives an
encoded ListTasks request and no actor state. Original dispatch generations are
retained across both policy awaits; accepted placement, activity and sticky
uncertainty are rechecked before disclosure. This is application-controlled
administration, not Python's built-in admin credential mechanism.

Only an explicit matching `only_server_id` and singleton-recovered owners are
admitted. The bounded in-memory cache records actual `SCHEDULED`, `STARTED` and
local `SCHEDULED_RETRY` phases, preserves retry counts across rescans, prunes
completed IDs on subsequent canonical scans and clears on owner revocation.
Phase timestamps/failure counts are local to this server generation; there is no
atomic canonical snapshot, durable transition history or completed-cache parity.
`iterations` is the canonical task-level count, not a finite workflow checkpoint
index. Shared-reader recovery listing and cross-server aggregation remain rejected.

Canonical `Tasks.ListTasksStream` shares the exact local listing scope and emits
an initial snapshot, then changed observations. Its RPC-owned lazy future polls
at 200ms, retains the original dispatcher generations for the subscription
lifetime and re-verifies/re-authorizes the exact stream method on each observation
before post-await placement/activity/uncertainty checks. Errors terminate the
stream; Drop cancels its timer/policy future, without a spawned producer or
unbounded event queue. Slow consumers coalesce current observations, not a durable
event history. Revocation is checked on the next pulled observation, not pushed
independently through backpressure. The initial snapshot is authorized at RPC
admission. Generated batch `tasks-watch` supplies bearer/server scope and an RPC
deadline; reconnect creates a new current snapshot, without a resume cursor.

**Missing:** transactional task targets, running/ordinary/distributed cancellation and full aggregated listing,
task-result authorization, broad retry policies, distributed dispatcher fencing and
migration, arbitrary shared/factory/idempotent tree scheduling. Workflow methods
have their separate context/result contract below, not ordinary declared-task
error semantics.

**Sources:** [task owner/recovery/Wait](src/one_shot_tasks.rs),
[generated descriptors/schedulers](src/codegen.rs), [writer checkpoints](src/runtime.rs),
[canonical task/CompleteTask](../../rbt/v1alpha1/database.proto),
[Database CAS implementation](../server/database.cc).
**Coverage:** [task vectors](tests/fixtures/task_vertical_acceptance.rs),
[tree tasks](tests/fixtures/tree_participant_task_acceptance.rs),
[shared recovery](tests/fixtures/task_vertical_acceptance.rs).
Python comparison: [task dispatcher](../aio/internals/tasks_dispatcher.py),
[Tasks service](../aio/internals/tasks_servicer.py),
[generated method contract](../templates/reboot.py.j2).

### Implemented, bounded scheduled-workflow cancellation

Implemented on baseline `f385e2b49680e1fb7d2e7bfd557bfe3bc2875cf2` (2026-10-08).
Public canonical `Tasks.CancelTask` shares the listing admin's explicitly configured
verifier AND authorizer; default host exposure remains deny. Original dispatcher
generation and server-owned application/server identity are captured before policy
waits. Authorization receives the exact encoded request without actor-state loading;
identity/UUIDv4/placement/owner errors follow successful policy outcomes. Malformed
transport headers still fail parsing before authentication.

Eligibility is a registered singleton workflow, future-scheduled and not entered
STARTED **in this local owner generation**. SCHEDULED is a process-local observation,
not a durable certificate that no prior generation ran it; prior effects across
recovery/clock rollback are retained. Actor-exclusive admission serializes cancellation
with workflow start. Initial admission reloads/validates canonical Pending, owner and
due time and marks STARTED before releasing the gate; a stale completed hint is
validated/skipped without invoking the body.

Cancellation preserves identity/request/method/schedule and performs one sync
`Database.CompleteTask` Pending→Completed CAS, with `Any<google.rpc.Status>` code
Cancelled and exactly one typed `rbt.v1alpha1.Cancelled` detail. A valid ACK plus
still-current authority yields OK; missing/completed canonical tasks yield NOT_FOUND.
Running/due workflows and ordinary task targets are rejected. This is NOT Python's
interrupt/async-cleanup/CANCELLING protocol. False CAS, transport/drop uncertainty
or post-ACK authority loss leave sticky uncertainty before lease release. Existing
host supervision propagates failure asynchronously; no status retry or synchronous
readiness-revocation guarantee is added.

Canonical workflow validation/generated Wait recognize cancellation separately from
business declarations. Declared body validation cannot inject it as an undeclared
business error. Generated Wait retains original TaskId/exact method metadata and
supports both business-error enums (Grpc arm) and no-business-error methods
(tonic::Status). An actual no-error consumer exposed unconditional identity
conversions and a fallback-only match under strict Clippy; generation now emits
only required conversions and direct fail-closed empty validation.

The public batch client adds `cancel TASK_UUID`, with separately admitted exact
admin request. Cancellation does **not** roll back submission state, map data,
scheduling replay or saved steps, nor release an app business reservation.
Compensation/retirement needs a separate app writer, not an invented rollback.

**Executed final acceptance** (all accepted manifests recorded unchanged source):
- `/tmp/reboot-rust-batch-ledger-acceptance-1791466910057365779`: actual public
  scaffold/generation/Cargo/rbt/CXX/RocksDB. Disabled admin, absent/invalid bearer,
  wrong route and running-task denial preserved canonical records. Two generated
  clients concurrently cancelling returned one OK and one NOT_FOUND. Typed Wait
  exposed Cancelled; durable status/type/details and immutable payload/schedule
  matched. Submission/map/replay remained intact; scheduling replay did not reopen
  the terminal; live inventory pruned it. Full RocksDB restart returned identical
  terminal/Wait and zero body dispatch beyond original due time. Batch/reactive/
  reconnect/watch/typed-business-error regressions passed; recorded children reaped.
- `/tmp/reboot-rust-batch-ledger-final-gates-1791467542400778108`: SDK strict
  all-target Clippy with test-support, **398 passed, 0 failed, 128 ignored**;
  default native greeting durable restart/supervision/failed-live-rebuild cleanup.
  The native batch consumer passed strict Clippy and four tests.
- `/tmp/reboot-rust-cancellation-no-business-errors-1791466814746697061`: separate
  generated no-business-error consumer strict all-target Clippy and four library
  tests. This is compiler/consumer evidence, not native persisted cancellation
  for that schema variant. All 51 focused codegen controls passed. SDK controls
  exercise exact rich validation, admin auth/revocation and sticky destructor
  uncertainty; their unit/static role is not native lost-ACK proof.
- First native stage `1791465354930538153` failed an inspector before cancellation
  (ColocatedRangeResponse incorrectly treated as rows), not accepted.
  `1791466020736921795` passed native semantics but was superseded after the
  no-error compiler repair. Final native/broad proofs above were rerun after it.
  Concurrent clients have separate exact PID/command/log records, not a
  thread-unsafe sequential evidence helper.

Both source reviews found no confirmed defect. Source/destructor controls and
uncontrolled concurrency do NOT prove actual completion-CAS lost ACK, dropped
in-flight completion or a deterministic start-versus-cancel race; these are explicit
test gaps. Running/ordinary cancellation, active-body cleanup, distributed authority,
durable phase history and Python CANCELLING remain unsupported. Other parity gaps
are not closed by this slice.

**Sources:** [cancellation](src/task_cancellation.rs),
[controls](src/task_cancellation_tests.rs), [workflow admission](src/workflow_context.rs),
[typed Wait](src/workflow_codegen.rs),
[public native acceptance](../../tests/reboot/cli/rust_batch_ledger_e2e.py).

## Durable named workflows

Standalone workflow descriptors emit a typed handler, private `WorkflowContext`,
workflow scheduler, named writer-step helpers and typed canonical Wait. Ordinary
writer `method_scheduled` hooks can atomically persist state, task and idempotent
scheduling response. Reusing the scheduling key returns the saved handle;
request/method collisions fail closed. A direct public workflow RPC is denied;
public workflow metadata is never private dispatcher authority.

Explicit host recovery registration is mandatory. Steps are **finite explicit
workflow-global names**, same actor, ordinary writers. Each acquires its own actor
lease, validates exact Pending/owner/cancellation and atomically stores effect
plus typed result/provenance. The body holds no actor lease across its own waits.
Acknowledged steps replay saved results without invoking their writers. Task
completion uses canonical CAS outside the body retry branch.

Step identity uses the external-key helper UUIDv5(workflow UUID, name), not the
complete Python typed-RPC manager alias/seed machinery. Writer/result contract,
workflow method/request and step request are fingerprint-bound; conflicting
reuse is rejected. `workflow_iteration` is absent outside loops, not Some(0),
although Task iteration is zero. Incomplete legacy replay records fail closed.

The generated workflow-specific attempt hook defaults ordinary `Status` to
nonretryable `WorkflowBodyError::Failed`. An application may explicitly request
`RetryLocal(String)` **only for local computation failure**. Private failed/
dropped/active operation evidence, exact scope/Pending, original owner generation,
sticky uncertainty and cancellation must remain clean. At most three total
attempts, with 25/50ms backoff, run without restarting the host. Actual transport
`Internal` (e.g. BrokenPipe) is not local-body provenance. Load/recovery, step/
Store uncertainty, completion failures and cancellation do not request retry.
Swallowing/dropping a failed framework operation cannot erase its fence.

One dispatcher owns at most 1024 live bodies by default, equal to the durable
Pending admission bound (configurable 1..1024 before recovery via
`set_max_live_deliveries`). Each Pending ID is delivered at most once while live.
Parked bodies consume the budget, but every accepted due ID has a delivery slot;
scheduling rejects Pending plus staged work above the configured budget before
commit rather than accepting work that could be stranded indefinitely. Recovery
fails closed if the persisted Pending set exceeds the configured budget. Ordinary
actor RPC admission is separate. Completed children may briefly occupy a slot
until joined; canonical rescans then admit their replacements.
Exhaustion retains existing supervised host failure and Pending restart progress.
There is no durable quarantine or separate per-workflow readiness contract;
the three-attempt budget resets per host delivery after restart.

### Implemented, bounded declared workflow terminals

Generated workflow methods may declare same-file protobuf business errors.
Their handler returns a typed error enum; its explicit declared variant becomes
`WorkflowBodyError::Declared`. Plain tonic `Status`, even rich Status, remains
nonretryable `Failed`. There is no status-code retry or error-detail classification
of transport failures. Reader/writer errors inside workflow services remain
unsupported, as do general system abort/running-cancellation terminals. The bounded
admin scheduled-workflow Cancelled terminal is documented separately above.

A declared terminal requires a clean outer workflow scope. Private failed,
dropped or active framework-operation evidence rejects it before canonical Load.
Immutable method declarations validate the exact rich Status shape, declared type
URL and decodable payload, independently of overridable binding hooks. Original
owner, Pending/due scope and cancellation checks then precede the existing
uncertainty-fenced canonical CompleteTask CAS. Acknowledged earlier checkpoints
are retained: business failure is not an all-workflow rollback. Terminal Store
or lost-ACK uncertainty does not authorize retry or a guessed error result.

Generated `*_wait` validates the canonical terminal and reconstructs the typed
business variant. RPC failures remain its `Grpc(Status)` variant. The batch app's
`submit-rejecting` path checkpoints a rejection before returning `BatchRejected`.
Public `Checkpoint` dispatch is explicitly denied by `checkpoint_scheduled`;
only admitted private workflow steps call the checkpoint handler. Subsequent
approval of a rejected batch fails, while a new scheduled batch can proceed.

### Implemented, bounded finite control-flow vertical

`WorkflowContext::iteration(name, index, count)` mints explicit finite indexed
replay scopes, with count bounded to 1..1024 and no nested scopes. This is **not**
Python's unbounded canonical `Task.iteration` cursor, iteration GC, or persisted
Continue/Break API: Task remains iteration zero and restart reruns the finite
application body, loading each acknowledged typed decision/effect. There is no
arbitrary-loop exit-decision guarantee; callers must keep the explicit finite
count, indices, condition version and named calls stable across replay.

Generated `WorkflowSteps::<reader>_until` binds exact immutable reader descriptor,
request/result types, explicit checkpoint alias and versioned named condition.
Predicates/reader implementations are trusted pure local computations; closure
semantics are not introspectable. Changed named condition, request, method, type
or finite count fails fingerprint validation at the same checkpoint identity.
Wait-only reader descriptors cannot be staged as ordinary tasks. Hierarchical
UUIDv5 operation namespaces and length-delimited loop/index/name material keep
waits, iteration writers and legacy global writer aliases structurally disjoint;
legacy global writer UUIDv5 semantics remain unchanged. Iteration checkpoint
records carry Some(index), distinct from global None.

The wait subscribes/marks revision before canonical Load and releases actor
admission before parking. A successful immutable read is checked and saved while
exclusive admission is retained; only its typed decision is stored (no actor
upsert or fabricated actor invalidation). A saved matched observation replays
before consulting live state, even after true-to-false flapping and host/RocksDB
restart. Failed/dropped operations retain private attempt evidence; original
owner generation, terminal reader revocation, cancellation and sticky uncertainty
remain fences. No Load/Store/completion uncertainty is retried.

Capacity regression executed on the corrected source:
`/tmp/reboot-rust-control-flow-loop1-capacity-final2-proof.json` records 64 parked
false predicates, ready workflow 65 completing without releasing them, the same
progress after host recovery, configured-capacity scheduling rejection with state
rollback, and undersized-recovery rejection. All 16 owned processes were reaped.
The corresponding SDK all-target tests and SDK/generated workflow consumer strict
Clippy gates passed (`/tmp/reboot-rust-capacity-final-{alltargets,clippy,consumer-clippy,native}.log`).
This is targeted capacity/control-flow evidence, not a fresh run of every ignored
native workflow or transaction acceptance.

The fresh post-repair frozen run in [Verification](#verification) executed all
three native workflow tests, including expanded capacity, subscription-before-read
and false-before-idle barrier races, saved wait flap/restart, three typed iterations
with exactly two checkpoints per finished iteration, ordinary RPC responsiveness
and parked-owner shutdown. Its control-flow proof records 16 owned processes,
all absent after cleanup. The 64 parked/ready-65 scenario is not a full 1024-body
stress test. Earlier native/capacity runs remain separate revision-scoped evidence.

Forced supervisor destruction revokes publication immediately, but each delivery
captures the registry owner before spawn/first poll and retains it until future
destruction. The controlled synchronous-callback unit test proves replacement
claim rejection while an old child survives supervisor abortion, then successful
claim after destruction. Its production spawn-helper mutant failed and restoration
passed; this is focused lifetime evidence, not execution of the entire host's
five-second forced-abort fallback or distributed fencing. Normal shutdown drains
owned children before releasing ownership.

Abort-drain preserves an already-selected delivery error using explicit fallback
provenance, not Status-code/message classification. It can adopt one completed
child error for a supervision fallback or successful cancellation, but does not
overwrite an already-selected primary with secondary readiness failure. Two
deterministic production-helper tests and an unconditional-overwrite causal mutant
exercise this correction without clearing uncertainty or authorizing retry. This
does not rank every concurrent failure by causal importance. Independent read-only
ownership and R1 diagnostic reviews found no unresolved decisive defect in those
bounded corrections; terminal execution/hash/cleanup audit is separate evidence.

**Missing:** Python unbounded cursor/GC and arbitrary durable Break semantics,
remote/cross-actor steps, nested transactions, mixed transaction/workflow services,
declared reader/writer step errors in workflow services and full alias/seed semantics. No arbitrary external
side-effect exactly-once claim. New retry proof does not inject Store/CompleteTask
lost ACK; existing uncertainty tests/source guards are separate evidence.

**Sources:** [context/attempt fences](src/workflow_context.rs),
[checkpoint Store/recovery](src/workflow_store.rs),
[generation](src/workflow_codegen.rs), [dispatcher](src/one_shot_tasks.rs).
**Executed acceptance:** [native restart tests](tests/workflow_native_restart.rs),
[generated app](tests/fixtures/workflow_app/src/main.rs),
[restart proof](tests/fixtures/workflow_app/prove_restart.py),
[12-case body proof](tests/fixtures/workflow_app/prove_body_retry.py),
[finite control-flow proof](tests/fixtures/workflow_app/prove_control_flow.py).
This uses generated Create/ScheduleWork, not task-state seeding: future scheduling,
concurrent ordinary Read while paused, same-host failure/success, first writer
once, exhaustion, real transport/framework failures, cancellation, generation ABA,
root-handoff Drop, and pending/terminal persistence through actual host/RocksDB
restarts. Python comparison: [workflow API](../aio/workflows.py),
[dispatcher](../aio/internals/tasks_dispatcher.py).

## Local reactive readers

Database-only generated services expose an exact-actor lifecycle owner plus
companion Tonic service through `local_readers(state_ref)`. Register recovery and
ordinary service with `ApplicationHost`, then add the companion with
`RunningApplicationHost::try_add_local_readers`. Generic service registration
rejects this reserved route. Generated typed subscriptions cancel their RPC on
Drop; ordinary unary readers stay unary.

**Bounded contract:** one actor/service/trusted host owning every sidecar mutation;
64 subscriptions **per owner**, a 64KiB **encoded request payload** and a
1MiB **encoded reader response**. These are not bounds on the whole RPC envelope
or total transport memory. One coalescing revision/current response/pending future
per stream avoids unbounded queues. Baseline registration
precedes Load; shared admission covers Load/auth/handler, not idle/backpressure.
Equal serialized responses deduplicate; slow consumers may skip intermediate
values but converge on latest acknowledged state only while the subscription
remains healthy and the consumer continues polling. Authorization/accepted placement
is rechecked; revocation is terminal even if authority later returns.

Acknowledged writer/constructor/workflow-step/scheduling/participant-commit paths
invalidate synchronously. Prepare/Abort/replay/failed mutation do not announce
committed state; task status alone is not actor mutation. RAII mutation uncertainty
terminates existing/new subscriptions with Unavailable rather than silently going
stale; a later write does not clear the latch. Restart/re-read is required. This
is not exactly-once notification after a lost ACK.

Generated subscriptions retain the exact query, caller metadata, channel and
method-specific error decoder. `disconnect()` releases the current RPC but keeps
that plan; explicit `reconnect()` drops the old RPC before awaiting a single new
Subscribe. Failed/cancelled attempts leave it disconnected. A new authenticated
server scope emits a fresh baseline, even if equal; intervening states may be
lost/coalesced. There is no automatic status-based retry or durable resume cursor.
The generated `*_with_timeout(request, duration)` client entry point captures one
absolute budget across reads/reconnects and sends only its remaining duration.
Expiry is checked before and after awaited IO: Tokio timeout alone is insufficient
when a buffered value/header is ready. There is no independent client idle-expiry
task; the deadline is enforced when the client reads or explicitly reconnects.
Remote cursor destruction is asynchronous, not an acknowledged teardown barrier.

Standalone workflow-bearing adapters now expose the same bounded ordinary unary
reader companions. Their manual Clone shares the existing store/handler/auth/task
owner rather than constructing another dispatcher. The generated batch app uses
Work.Observe for both private saved waits and public observation; there is no
separate View schema/handler/placement entry. Only declared ordinary readers enter
the subscription dispatcher, never workflow bodies, constructors or scheduling
writers. Declared reader/writer errors in workflow services remain unsupported.
The shared generator rejects collisions among each reader's base, `_with_timeout`
and `_connect` methods and constructor `new` before companion emission; caller
errors propagate to the public code-generation response without files.

Transaction-bearing service companions now use the existing
`TransactionAdapter<H, P, C, R, F>` bounds and manual Clone, preserving the
shared handler/store/auth, participant, coordinator, registry, factories and
optional reader-task binding. Only ordinary unary readers enter the dispatcher;
root transactions, including reader-looking History, are not subscription
targets. Pure transaction services without ordinary readers have no companion.
Helper/reserved-name checks precede emission; actual per-file outbound
Client/Target names now participate in root-symbol collision checks.

The public batch app's approval service exposes `ApprovalSnapshot(Batch)` with
typed declared `BatchMismatch`; `index-read`, `index-mismatch`,
`index-target-error` and `watch-index-reconnect` exercise it. Its batch-match
condition differs from Work.Observe, which remains the workflow's saved-wait
and public observation reader. Both exact-method ReaderBindings share one
validated local reader owner and LocalReaders service; no additional workflow
dispatcher or canonical Tasks.Wait owner is created. This is local registered
actor observation, not transaction subscription, streaming readers, or
transaction-joined query execution.

**Wakeup #8 executed evidence (2026-10-08):** immutable native proof
`/tmp/reboot-rust-batch-ledger-acceptance-1791469520443513860` passed public
`rbt init`, generation, strict all-target consumer Clippy, four consumer tests,
and actual CLI/native RocksDB acceptance. It verifies decoded declared mismatch,
actual committed approval observation, Approve/History subscription denial with
canonical task/state/map/replay unchanged, same-process explicit reconnection
through schema regeneration and full RocksDB restart, and reclamation of both
subscriptions. Existing batch/reactive/reconnect and scheduled cancellation
regressions remain passing. These are real generated API/native controls, not
emitted-text assertions substituted for persistence evidence.
Compiler-only ordinary-reader-without-business-errors variant
`/tmp/reboot-rust-mixed-reader-no-business-errors-1791470377785105382` passed
strict all-target Clippy and four consumer tests, not separate native persistence.
Broad gates `/tmp/reboot-rust-batch-ledger-final-gates-1791470437913724777`
passed strict SDK Clippy, **399 SDK tests, 128 ignored**, and default greeting
native restart, regeneration, supervision and cleanup. All three accepted
manifests affirm source unchanged at completion; semantic SDK/template inputs
remain unchanged, and only this canonical ledger/fingerprint was refreshed
after the gates (the broad manifest also captured its earlier documentation). The first preflight exposed missing System error arms and
a typed initial-message conversion; both were repaired before corrected
preflight/native acceptance. Independent review found these same compiler
blockers and no other confirmed safety defect; targeted re-review confirmed
closure. Compiler/native evidence comes from parent execution, not review claims.

**Missing:** cross-actor dependencies, distributed or remote-process invalidation, transparent
reconnect/resumption. This uses a Rust-specific local service, not canonical React
wire behavior; that is an API scope distinction, not a mixed-language app goal.
Raw Database/custom persistence/other-process mutation violates its single-owner
contract.

**Sources:** [hub/ownership](src/reactive.rs), [generation](src/reactive_codegen.rs),
[protocol](reactive.proto), [commit sites](src/runtime.rs).
**Executed acceptance:** [native tests](tests/reactive_native_restart.rs),
[generated app](tests/fixtures/reactive_app/src/main.rs),
[process proof](tests/fixtures/reactive_app/prove_restart.py).
The real generated app verifies baseline/live writes, failed writer silence,
slow-reader convergence after 100 durable writes, cancellation reclamation,
shutdown closure and new subscription to persisted state after host/Database
restart. Unit coverage: [reactive tests](src/reactive_tests.rs).

## Canonical SortedMap

Generate canonical `rbt/std/collections/v1/sorted_map.proto` with explicit module/
runtime paths. The exact compiled schema/options select a fixed builtin wrapper;
arbitrary trusted-effects user descriptors remain rejected. The host registers
`SortedMapLibrary` at an exact native endpoint and returned participant control
routes. There is no publicly header-authorized inbound map service.

Generated `SortedMap::create` creates EMPTY canonical state with native uniqueness
and constructor replay. A schema-only Store ensures the canonical entry CF before
CreateActor; it is idempotent metadata, not an actor/entry seed. The uncertainty
gate is installed before native awaits. Within a live admitted fresh same-endpoint
exclusive non-factory app root **without automatic root idempotency**, a typed
`in_transaction(context)` session exposes insert/remove/get/range/reverse_range.
It shares direct native participant ownership, read-own-writes and atomic app/map
Commit or Abort. A caught declared map error dooms the root, not just the session.
Private root provenance is mandatory; public internal/transaction headers and
manual contexts cannot grant it.

**Lifetime boundary:** sessions/futures must be serial and handler-awaited. Do not
escape/spawn detached calls: no active root-operation reservation spans their awaits.
The stale-root test checks calls after completion, not an overlapping cancellation
race. Aggregate membership uses the ordinary bounded participant contract before
eager Store. Uncertain native start/Store cannot release, re-stage or Prepare a
vanished transaction; reset host plus sidecar, recover and abort unprepared work.

**Missing:** public inbound/network builtin adapter, child paths/independent
reusable siblings, nested savepoints, shared/factory/tasks/map-root idempotency,
implicit singleton construction, placement/migration and transparent sidecar-only
restart. Constructor crash/lost-ACK/restart replay is not established by the
constructor test. Existing map Store-lost-ACK recovery is a different test.
**Key/range limits:** nonempty ASCII, at most 128 bytes; `/`, `\`, NUL and
newline are rejected. Forward ranges are `[start,end)` with `start < end`;
reverse ranges include start/exclude end with `start > end`. Limits must be
nonzero. Invalid ordering/zero limit produces declared `InvalidRangeError`; invalid
key characters produce InvalidArgument. There is no cursor or cross-RPC snapshot
guarantee.

**Sources:** [library/session](src/sorted_map.rs),
[native participant](src/sorted_map_participant.rs),
[canonical schema](../../rbt/std/collections/v1/sorted_map.proto).
The public application also exercises serial distinct-map transfer under one app
root: exact bytes/read-own-writes, app-plus-two-map Commit/Abort, occupied destination
and present-empty values, all-participant restoration and fresh post-restart transfer.
See [public collection evidence](#public-serial-distinct-map-transfer-2026-10-08).
This does not remove the missing admission/operation-lifetime shapes above.

**Executed acceptance:** [native prerequisite](tests/sorted_map_native_prerequisite.rs),
[generated app](tests/fixtures/sorted_map_app/src/main.rs),
[lost ACK vector](tests/fixtures/sorted_map_lost_ack.rs).
Checks empty CF/constructor replay/duplicate rejection, Range-first, typed writes/
read-own-writes, atomic app/map Commit and caught-error Abort, stale provenance,
parent/key bounds, unprepared recovery and lost-ACK retention. Unit coverage:
[ownership tests](src/sorted_map_ownership_tests.rs).

## Verification

### Public serial distinct-map transfer (2026-10-08)

The opt-in public batch scaffold adds `LedgerIndex.ArchiveEntry`/`ArchiveHistory`,
`ArchiveRejected`, cumulative `Ledger.archived`, and generated client commands
`archive`/`archive-history`. A second canonical EMPTY SortedMap is host-created via
its stable constructor, not privately seeded. Both exact map participants are in
resolver control routes and recovery registration. All app/map ownership restoration
precedes coordinator/task recovery and readiness; Work still owns the only Tasks.Wait.

Within one fresh same-host existing-actor exclusive app root without automatic
root idempotency, the handler reads source presence (Some(empty) is not absent),
rejects an occupied destination, removes source, inserts exact bytes into destination,
checks both read-own-writes and increments a checked cumulative app counter. Root
Commit covers the app plus both distinct map participants. A caught invalid Range
after all provisional effects dooms/aborts the entire cohort; the CLI preserves the
actual original **Unknown InvalidRangeError**, not an invented Code::Aborted.
Method-scoped ArchiveRejected uses the existing Status-compatible transaction
handler and generated typed-result compatibility hook; required handler traits did
not change. The client validates exact single-detail declared payload/Unknown status.

**Fresh executed evidence (frozen inputs, all source_unchanged):**

- `/tmp/reboot-rust-batch-ledger-acceptance-1791474667645658662`: actual public
  init/Cargo/rbt/CXX/RocksDB. Emitted consumer fmt/strict all-target Clippy and
  **six library tests** passed. Native canonical reads prove raw actor-state,
  both map rows, original workflow terminal and saved progress records unchanged
  after caught two-map doom, source-absent rejection and occupied-destination
  rejection. Occupancy is tested by archiving, publicly resubmitting the same
  batch with a fresh scheduling key, approving/recreating source and completing
  that workflow; a present-empty destination is rejected, not overwritten.
  Successful transfers preserve present-empty value, remove only selected source
  key, increment the durable app counter and retain original task/checkpoint
  bytes. Duplicate move is declared source absence, not a second effect. Full
  RocksDB restart retains identical raw committed snapshot; a fresh transfer
  succeeds after all participant ownership is restored. ArchiveHistory reads the
  canonical destination. Both new transaction RPC subscription attempts fail
  closed; all prior batch/workflow/reactive/list/stream/cancellation/watch checks
  pass and recorded owned process groups are reaped.
- `/tmp/reboot-rust-batch-ledger-final-gates-1791475468598897705`: strict SDK
  all-target Clippy; **399 passed, 0 failed, 128 ignored**. Default greeting
  generation/native create/write/replay/read, canonical Load, RocksDB restart,
  host/Database failure supervision and failed-live-rebuild cleanup pass.
- `/tmp/reboot-rust-mixed-reader-no-business-errors-1791475982812429036`: separate
  generated reader-error variant strict all-target consumer Clippy and **six
  library tests**. This is compiler/consumer evidence, not native persistence
  for that variant. Archive's own declared error remains present in this schema;
  "no business errors" here describes the ordinary ApprovalSnapshot reader.

**Limits:** a bounded serial distinct-actor/direct-root collection application,
not same-map reentry, reusable sibling/nested paths, a header-authorized public
builtin/network adapter, distributed placement or general collection migration.
Sessions/futures remain handler-awaited and nonescaping; no new root-operation
reservation or cancellation-overlap safety is implied. Empty values are exercised,
not arbitrary nonempty transfer bytes. Unit counter-overflow control proves no
partial increment, not native full-cohort overflow rollback. New three-participant
Store/Prepare/terminal lost-ACK or crash-boundary injection is not executed; prior
single-map uncertainty evidence is not upgraded. No automatic transfer idempotency,
status retry or external-effects exactly-once; callers must reconcile uncertain
RPC outcomes through durable application state. Constructor crash/lost-ACK and
sidecar-only restart remain separate unsupported/unproved shapes.

**Sources:** [public schema](../cli/commands/init/templates/rust_batch.proto.j2),
[handler](../cli/commands/init/templates/rust_batch_lib.rs.j2),
[host](../cli/commands/init/templates/rust_batch_host.rs.j2),
[client](../cli/commands/init/templates/rust_batch_client.rs.j2),
[native acceptance](../../tests/reboot/cli/rust_batch_ledger_e2e.py).

### Workflow-service reactive composition (2026-10-08)

The generated batch app now subscribes to Work.Observe on its workflow-bearing
adapter, with the duplicate View service removed across schema, handler, host,
placement and clients. Fresh public generation passed strict emitted-consumer
all-target Clippy/fmt and **four behavioral tests**. Actual public rbt/C++
Database/RocksDB acceptance passed live updates, explicit same-client reconnect,
proto regeneration and full restart, slot cleanup, and retained batch/map/task/
declared-terminal/list/stream/delayed/lock regressions. Subscribe attempts for
Create, SubmitBatch, Checkpoint and RunBatch returned exact Unimplemented; canonical
ledger/task/map/replay remained unchanged. These are actual integrated controls,
not private seeding or generator-text authority proof.

Review found helper-name collisions for Observe + ObserveWithTimeout/ObserveConnect.
The new control failed RED because emission incorrectly returned Ok; central
symbol validation corrected both database/workflow callers. **51 codegen tests**
passed, including workflow accepted/excluded methods, reserved names, helper
collisions and retained declared-step/mixed-transaction rejection. The shared
helper test checks an untouched companion-output buffer, not compiled colliding
schemas. The targeted read-only review found the P2 closed with no remaining
confirmed repair defect. An initial missing adapter Clone failed actual downstream
preflight and was fixed with manual generic cloning, without H:Clone.

Final immutable native proof:
`/tmp/reboot-rust-batch-ledger-acceptance-1791463075805391400`
(`accepted.json`, `frozen-source.json`, `native/result.json`). Final broad proof:
`/tmp/reboot-rust-batch-ledger-final-gates-1791463666520275062` passed strict SDK
all-target Clippy, **394 passed / 0 failed / 128 ignored**, and actual greeting
regeneration/restart/signals/child-exit/failed-build cleanup. Ignored matrices are
not fresh passes. Sources matched both runs; the ledger/digest update is later
metadata. The pre-symbol-repair native/broad proofs ending `1791461474516531206`
and `1791462099168909387` are **superseded, not final publication evidence**.

This does not add transaction-service subscription bindings, mixed workflow/
transaction services, declared step errors, remote invalidation or canonical
React interoperability. Workflow execution/terminal CAS and uncertainty fences
are unchanged. Sources: [workflow emitter](src/workflow_codegen.rs),
[shared reader emitter](src/reactive_codegen.rs),
[native app acceptance](../../tests/reboot/cli/rust_batch_ledger_e2e.py).


### Explicit reactive reconnect in the public application (2026-10-08)

Fresh public Cargo generation passed emitted-consumer strict Clippy/fmt and
**four behavioral tests**. Actual `rbt dev run`/C++ Database/RocksDB acceptance
retained one generated `watch-reconnect` client PID/query. `next` observed live
approval/checkpoint changes; explicit reconnect returned equal current baselines,
including after native live proto replacement and full durable restart. Explicit
disconnect reclaimed reader slots; stopped-host reconnect returned Unavailable
without exiting the client, then a caller-requested reconnect succeeded after
recovery. Quit reaped that client and reader slots returned to zero. The existing
batch approval/map/rollback, canonical task/replay/typed Wait/declared-error,
regeneration, delayed task, task-list/stream and shutdown/lock regressions passed.

Six new local live-Tonic controls (12 reactive tests including retained controls)
exercise query/ASCII/binary metadata retention, equal fresh baselines, eventual
old-RPC release, failed/cancelled reconnect, terminal Unavailable/PermissionDenied,
malformed snapshot, exact Subscribe counts/no automatic retries, and absolute
budgets including buffered snapshots/ready headers after expiry. These are local
client controls, not C++ distributed authority or native credential-revocation
proof. The native stopped-host status alone does not establish retry absence.

Three RED paths were exercised: retaining the old stream failed the parked
Subscribe cancellation control; the uncorrected buffered-snapshot path returned
Ok(Some(Counter7)) after expiry; removing the reconnect postcheck accepted a ready
header after expiry. Restoration passed 12 tests. Notification-before-response is
not an explicit client transport-buffer acknowledgement; actual mutant failures
establish sensitivity to the production gates. Targeted read-only repair review
found no remaining confirmed deadline defect.

Accepted immutable native proof:
`/tmp/reboot-rust-batch-ledger-acceptance-1791458706014249420`
(`accepted.json`, `frozen-source.json`, `native/result.json`). The prior native run
`/tmp/reboot-rust-batch-ledger-acceptance-1791457669489224470` preceded the deadline
repair and is **superseded, not final publication evidence**. Control logs:
`/tmp/reboot-rust-reactive-reconnect-controls-1791457557441175078`.
Broad frozen gates:
`/tmp/reboot-rust-batch-ledger-final-gates-1791459295060650678` passed strict locked
all-target SDK Clippy, **393 passed / 0 failed / 128 ignored**, and actual retained
greeting regeneration/restart/signals/child-exit/failed-build cleanup. Ignored
native matrices are not fresh passes. Both final manifests were unchanged during
their runs; this canonical ledger/digest update is later metadata.

This is explicit fresh-snapshot reconnection, **not** transparent recovery,
durable event replay, cursor resume, remote invalidation or canonical Python React
protocol parity. Client idle expiry has no independent spawned deadline watcher.
Portable sources: [client/server ownership](src/reactive.rs),
[generated surface](src/reactive_codegen.rs),
[local controls](src/reactive_reconnect_tests.rs),
[public native acceptance](../../tests/reboot/cli/rust_batch_ledger_e2e.py).

### Declared workflow business-error application (2026-10-08)

Fresh public generation passed generated-consumer strict Clippy/fmt and **four
behavioral tests**. Actual `rbt dev run`/C++ Database acceptance created a rejecting
workflow and approval, acknowledged its saved reader/writer checkpoints, and
returned typed `BatchRejected` through canonical Tasks.Wait. Durable inspection
verified Completed/error, exact rich Status/type/payload, partial application and
SortedMap effects, and retained replay records. Full RocksDB restart returned
identical typed Wait and canonical task/app/checkpoint bytes, with no completed
body or writer redispatch. A later normal delayed workflow completed. Existing
listing/stream policy, approval/map rollback, regeneration, pending restart,
subscription cleanup, parked shutdown and lock reuse regressions passed.

The public checkpoint repair was necessary: review found that ordinary callers
could set rejection/progress without a workflow-scoped checkpoint. Both actual
public RPC variants now return PermissionDenied and preserve canonical actor,
task, map and replay bytes. Those native calls occur before approval; the
otherwise-valid **approved** checkpoint is separately denied in the generated
unit control. Targeted re-review confirmed the generated hook wiring and private
step preservation. Do not describe this as a native after-approval exploit replay.

Local runtime control denies unknown/malformed payloads even with a permissive
binding, and denies tainted or iteration-scoped terminal receipts before Load.
It also checks that rich Status alone remains Failed. Removing the clean-attempt
fence made that control fail; restoration passed **8 focused tests**. Source
emission checks inspect typed declarations, handler/Wait and terminal validation;
those string assertions are not behavioral proof by themselves.

Accepted immutable native proof:
`/tmp/reboot-rust-batch-ledger-acceptance-1791454683886347424`
(`accepted.json`, `frozen-source.json`, `native/result.json`). The earlier run
before the public-checkpoint repair is **not accepted final publication evidence**.
RED/restored control:
`/tmp/reboot-rust-workflow-errors-controls-1791453887538072195`.
Broad frozen gates:
`/tmp/reboot-rust-batch-ledger-final-gates-1791455596651079196` passed strict locked
all-target SDK Clippy, **387 passed / 0 failed / 128 ignored**, and the retained
actual greeting regeneration/restart/signals/child-exit/failed-build cleanup gate.
Ignored native matrices are not fresh passes. Both runners audited unchanged
frozen semantic source and disk bounds; this canonical documentation/fingerprint
refresh is subsequent metadata, not a modification of those snapshots.

This acceptance does **not** inject restart between the rejecting checkpoint and
terminal CAS, or declared-terminal CompleteTask lost ACK. Existing generic
uncertainty fences remain source-backed/separately tested, not a new native
injection claim. General framework-failure isolation, running cancellation, Python
unbounded cursor/GC/Break and distributed semantics remain missing.

Portable sources: [typed workflow generation](src/workflow_codegen.rs),
[terminal scope fences](src/workflow_context.rs),
[public native application](../../tests/reboot/cli/rust_batch_ledger_e2e.py).

### Server-local administrative task-list stream (2026-10-08)

Fresh native acceptance generated the public ordinary Cargo consumer and passed
strict all-target Clippy/fmt and two behavioral tests. Actual `rbt dev run` with
C++ Database/RocksDB exercised canonical and generated ListTasksStream: disabled
policy, missing/invalid bearer and unsupported server scope fail closed; initial
empty snapshot and unchanged observations preserve the real RPC deadline; the
same live workflow changes empty → STARTED and completed → empty. Stream clients
terminate on host shutdown and reconnect to a recovered current STARTED snapshot.
Full batch approval/map/checkpoint/replay/regeneration/persisted delayed-task/Wait,
subscription cleanup and durable-lock reuse regressions also passed.

Local controls exercised no-duplicate/coalescing behavior, fresh exact-method
policy checks, original generation/placement/uncertainty/stop revocation with an
unchanged cache, owner replacement during a later awaited policy, terminal error
closure and cancellation of an armed policy future on stream Drop. Two RED
controls failed their exact invariants after removing the original owner fence
or publishing unchanged observations; restored source passed. These are local
controls, not native distributed authority proof. Native deadline/client reaping
is not direct evidence of a particular server future's destructor, nor proof of
independent revocation under transport backpressure.

Immutable native proof:
`/tmp/reboot-rust-batch-ledger-acceptance-1791451791876267609`
(`accepted.json`, `frozen-source.json`, `native/result.json`). Post-native source
changes are public rustdoc correction and an extra test-only awaited-generation
control, not production behavior changes. RED/restored proof:
`/tmp/reboot-rust-task-stream-controls-1791451599163707664`.
Broad frozen gates:
`/tmp/reboot-rust-batch-ledger-final-gates-1791452393276815561` passed strict locked
all-target SDK Clippy, **386 tests passed / 0 failed / 128 ignored**, and the
retained actual greeting regeneration/restart/signals/child-exit/failed-build
cleanup regression. Ignored native matrices are not fresh passes. All manifests
were unchanged during their respective runs; later canonical ledger updates are
separate from those immutable semantic source snapshots.

Portable sources: [RPC fences](src/one_shot_tasks.rs),
[pull-owned stream](src/task_listing.rs), [local controls](src/task_listing_tests.rs),
[public app acceptance](../../tests/reboot/cli/rust_batch_ledger_e2e.py).

### Server-local administrative task listing (2026-10-08)

The public generated batch app now exposes the `tasks` client command and an
opt-in environment-owned development admin verifier/authorizer. Fresh native
acceptance generated the ordinary consumer, passed strict all-target Clippy/fmt
and two tests, then exercised canonical ListTasks through actual `rbt dev run`
and C++ Database/RocksDB. It proved default denial, missing/invalid bearer denial,
explicit-server scope rejection, actual STARTED parked workflow listing before
and after restart, SCHEDULED future timestamp listing before and after restart,
completed pruning and no synthesized terminal history. The full approval/map,
saved-checkpoint replay, regeneration, delayed execution, typed Wait, subscription
cleanup and lock-reuse regression also passed with unchanged frozen source.

Four local controls exercised cache retry/phase bookkeeping and administrative
policy denial plus generation replacement, uncertainty, placement movement and
stop during an awaited authorizer. These are local controls, not native proof of
distributed ownership or retry execution. Native retry-phase observation remains
unexercised; no public cancellation or task-result auth claim is made.

Native proof: `/tmp/reboot-rust-batch-ledger-acceptance-1791449231292063216`
(`accepted.json`, `frozen-source.json`, `command-2.log`, `native/result.json`).
The earlier interrupted run is not accepted evidence. Subsequent changes are
documentation/comments and the strict-Clippy correction `task.timestamp.clone()`
to `task.timestamp` (the optional Timestamp is Copy), not task behavior changes.
The broad gate also exposed a test synchronization race: Weak::upgrade may fail
before DispatchOwner::drop publishes registry release. The ownership control now
waits for actual registry removal; it retains its blocked-child ownership and
replacement-denial assertions and passed 50 exact repeated executions.
These changes must be distinguished from the immutable semantic source snapshot.
Broad frozen gates passed strict locked all-target SDK Clippy, **381 tests passed,
0 failed, 128 ignored**, and the retained native greeting regeneration/restart,
child-exit, signal and failed-build cleanup regression. Ignored native matrices
are not fresh passes. Gate evidence:
`/tmp/reboot-rust-batch-ledger-final-gates-1791450151288499096`
(`accepted.json`, `frozen-source.json`, SDK logs and greeting proof).

Portable sources: [listing controls](src/task_listing_tests.rs),
[phase bookkeeping](src/task_listing.rs),
[public application acceptance](../../tests/reboot/cli/rust_batch_ledger_e2e.py).


### Public batch-ledger application and retained greeting (2026-10-08)

The actual opt-in `rbt init` generated consumer passed strict all-target Clippy,
formatting and two behavioral tests, then ran through normal `rbt dev run` with
the canonical C++ Database. Native acceptance decoded application state,
canonical Pending/Completed Tasks, typed saved replay responses and canonical
SortedMap entries. It exercised submit UUID replay/fingerprint rejection,
pending Wait deadlines, invalid approvals and caught map-range root doom with
**both** app/map unchanged, followed by successful atomic approval.

After one acknowledged checkpoint, live proto regeneration retained Database,
reaped the old host, emitted new bindings and replaced the typed subscription
from persisted state. Full RocksDB restart recovered the same pending UUID
without repeating the saved checkpoint mutation; remaining approvals completed
all three entries. A second restart returned identical typed Wait results and
canonical terminal bytes without body/step redispatch. A future task survived
restart before its persisted due time and completed after it. Subscriber owners
returned to zero, parked shutdown drained streams, and process/lock reuse passed.
Handler evidence is bounded by each session's byte offset into append-only logs.

A separate final frozen gate passed SDK all-target strict Clippy and tests with
`--features test-support`: **377 passed / 0 failed / 128 ignored** (ignored native
matrices are not fresh passes). The default generated greeting retained its own
strict Clippy/fmt/test, real create/write/replay/read, canonical Load, regeneration,
RocksDB restart, SIGTERM/SIGINT and child-exit supervision. An intentionally broken
live proto rebuild exited the CLI and reaped host/Database rather than serving
stale code. Both runners audited unchanged frozen source and target/free-disk
bounds. Test-only observation hooks are not enabled in generated consumers.

Local immutable evidence:
- `/tmp/reboot-rust-batch-ledger-acceptance-1791445215069889908`
  (`accepted.json`, `frozen-source.json`, `command-2.log`, `native/result.json`).
- `/tmp/reboot-rust-batch-ledger-final-gates-1791445889892168445`
  (`accepted.json`, `frozen-source.json`, SDK logs and greeting proof).

Portable acceptance sources are
[`rust_batch_ledger_e2e.py`](../../tests/reboot/cli/rust_batch_ledger_e2e.py) and
[`rust_app_dx_e2e.py`](../../tests/reboot/cli/rust_app_dx_e2e.py), executed with one
exclusive target owner. Earlier failed inspector runs are not accepted proofs.
The final changes after batch acceptance were test-fixture type naming and
greeting timeout/failed-rebuild coverage; the batch SDK/runtime/templates stayed
identical. General distributed recovery, Python cursor/GC/Break and external
exactly-once remain outside this application slice.

### Historical post-repair executed evidence (2026-10-08)

The sole-owner post-R1 frozen run completed **23/23 planned gates**:
**21 exited zero**, while the deliberately stale ledger fingerprint exited 1
and the existing legacy process-consumer strict Clippy baseline exited 101.
Required gates passed; this is **not an all-green matrix**. The stale rejection
was preserved before this reviewed documentation/fingerprint refresh; the checker
was then rerun separately. Legacy generated dead-code/style diagnostics remain
unresolved, rather than being suppressed or described as green.

All-feature SDK all-target execution recorded **374 passed / 0 failed / 128 ignored**,
including **317 library tests** and 28 generated downstream behavioral tests.
Default and no-default library gates each passed 317 tests; these repeated
configurations are not unique coverage totals. Six doctests passed. Strict SDK,
no-default SDK and emitted workflow/map/reactive consumer Clippy passed, along
with docs and formatting/diff checks. Emitted workflow/map all-target gates each
executed zero tests: they establish compilation only, not native behavior.

Actual native execution passed workflow **3**, ordinary-writer **10**, and focused
precise-child-error **3** cases (the latter overlap the writer suite). The workflow
gate preserved separate finite-control-flow, **12-case body-retry**, and named-step
restart proofs. This run did not execute the complete ignored legacy/Native2pc,
native map or native reactive matrices; their older proofs remain historical.

Terminal audit matched **190 frozen source hashes**, all **23 gate-log hashes**,
all **3 proof hashes**, the source manifest and canonical Database/app binaries;
test-result counts matched the logs. Proof process counts were 16/50/11, all with
recorded exits and no live recorded PIDs. Runner descendants were empty, its
process group was empty and the target lock was released. Target/free disk bounds
were checked. Documentation changes after this audit are separate from the freeze.

Local evidence prefix:
`/tmp/reboot-rust-control-flow-loop1-ownerfix-r1-1791441615138944047`
with `-result.json`, `-source.json`, `-successor-audit.json` and separate
`-5-{proof,retry-proof,legacy-proof}.json` artifacts. Read-only R1 review:
`/tmp/reboot-rust-control-flow-loop1-r1-final-independent-review.md`.
Focused diagnostic green/causal-red/restored-green logs:
`/tmp/reboot-rust-ownerfix-r1-{green1,causal-red1,restored-green1}.log`
(2 passed / 1 failed / 2 passed respectively, not unique-test totals).
These local handles are not shipped or portable prerequisites. No newly injected
workflow-wait Store/CompleteTask lost-ACK, Python cursor/GC/Break, distributed
fencing or arbitrary external-effects exactly-once acceptance is claimed.

### Historical corrected workflow evidence and its limits

The corrected sole-owner workflow batch ran successfully on the runtime source
represented by the baseline above: **22/22 gates green**, **312 library tests**
in all-feature/default/no-default runs, strict SDK/generated-consumer Clippy,
28 generated downstream behavioral tests, docs/doctests/format checks and real
map/reactive/workflow CXX/RocksDB gates. Workflow body proof completed **12 cases**
and reported all owned processes absent. Independent audit checked **2,632 hashes**
(source/log/proof/binary), no mismatches/live owned PIDs and released ownership.
The two earlier colliding runners' shared namespace is explicitly excluded.

Recorded local handles (not shipped prerequisites or portable proof artifacts):
`/tmp/reboot-rust-workflow-loop84-corrected-final-{result,audit}.json`,
`-corrected-final-body-proof-final.json`, and `-corrected-final-runner.log`.
Publication audit `/tmp/reboot-rust-publication-audit.json` binds published source
and subsequent docs/one EOF whitespace cleanup. These handles may disappear;
portable re-verification is through repository tests/commands below. The full
older ignored legacy/Native2pc matrix was **not** rerun in that 22-gate batch.
Do not sum repeated gate test counts or call ignored cases green by default.

### Reproducible checks

From `reboot/rust`, use a sole-owned target and enough free disk:

```sh
export CARGO_TARGET_DIR=/tmp/reboot-rust-parity-target
export CARGO_BUILD_JOBS=2 CARGO_INCREMENTAL=0
export CARGO_PROFILE_DEV_DEBUG=0 CARGO_PROFILE_TEST_DEBUG=0
python3 tests/verify_parity_documentation.py
cargo test --locked --all-features --all-targets -- --test-threads=1
cargo clippy --locked --all-features --all-targets -- -D warnings
cargo test --locked --no-default-features --lib
cargo clippy --locked --no-default-features --lib -- -D warnings
cargo test --locked --all-features --doc
RUSTDOCFLAGS='-D warnings' cargo doc --locked --no-deps --all-features
cargo fmt --all --check
```

For actual native acceptance, set an existing compatible canonical C++ binary;
these commands exercise ignored tests, not a fake Database:

```sh
export REBOOT_NATIVE2PC_CXX_DATABASE=/absolute/path/to/reboot/server/database
cargo test --locked --all-features --test workflow_native_restart -- --ignored --test-threads=1 --nocapture
cargo test --locked --all-features --test reactive_native_restart -- --ignored --test-threads=1 --nocapture
cargo test --locked --all-features --test sorted_map_native_prerequisite -- --ignored --test-threads=1 --nocapture
# Full legacy and separate Native2pc matrices are distinct gates:
cargo test --locked --all-features --test generated_cxx_database_process -- --ignored --test-threads=1 --nocapture
cargo test --locked --all-features --test native_2pc_transport -- --ignored --test-threads=1 --nocapture
```

Generated fixture `cargo clippy/test/fmt --manifest-path tests/fixtures/<app>/Cargo.toml`
checks are separate from SDK Clippy; set `-- -D warnings` for Clippy. Native app
proof runs compile their actual generated consumers. Python CLI behavior and real
app driver have separate dependencies; see their source rather than pretending
Rust unit tests exercise init/dev process ownership.

### Consolidation verification (2026-10-08)

For this consolidation, independent source reviews corrected stale implementation
status, default-allow/configured authorization scope, bounded reusable participant
support, concrete admission limits, external retry budgets and writer-task versus
workflow retry provenance. The selected **166 implementation/protocol/test files**
matched the published baseline; only documentation and its new checker changed.

A fresh sole-owner four-gate run passed: checker **6 positive/negative self-tests**
and **84 local links**, **312 library tests**, compilation/discovery of **113
ignored legacy native cases**, and the actual **12-case generated workflow body
CXX/RocksDB proof**. Discovery of 113 cases is **not their execution**. The run's
2,582 source hashes matched at completion and all recorded owned PIDs were absent.
The full 22-gate execution above remains prior evidence, not a new full rerun.
Final text additions here only record these measured results.

Local artifacts: `/tmp/reboot-rust-unified-parity-{result,source}.json`,
`-body-proof.json`, `-ledger-check.log`, `-sdk-lib.log`,
`-native-target-discovery.log`, `-workflow-body-native.log`.
Read-only review records are local audit notes, not additional parity documents.

### Trust and maintenance contract

The documentation checker validates local links/anchors, obsolete-ledger removal,
and a fingerprint of selected SDK/CLI/protocol implementation/test inputs. It has
negative self-tests so a broken link or changed source cannot silently pass.
A matching fingerprint is **not behavioral proof**: source review and actual
acceptance above are separate evidence. The fingerprint excludes documentation
and the checker itself; it is not a full toolchain/dependency lock or native binary
certificate. If relevant implementation changes, re-audit claims and appropriate
acceptance before refreshing it; do not merely regenerate the number.

<!-- parity-source-sha256: b4ccc85370cd0a0b866eafa20a6a0a7608e9d4cd0e6268a7b6eeb382a88b46dd -->

New feature work updates this ledger in the same verified commit, not another
candidate/status file. Status is by public use case and safe admitted shapes,
with source/acceptance/limitations adjacent. Do not promote a historical blocked
proposal or a compile-only facade into current functionality. Frozen executions
have one build owner and unique evidence namespace; no source edits mid-run.
Commit/push verified changes normally; production/migration/external-effect claims
need their own acceptance, not more historical prose.

## Next higher-level priority

Extend the bounded finite replay/wait vertical only after defining and exercising
canonical unbounded iteration advancement/GC and durable Break authority, or a
separate explicit application contract. Add new-wait Store/CompleteTask lost-ACK
injection and full-bound saturation evidence before expanding those claims.
Current Task iteration-zero and single-owner fences remain mandatory; these
extensions are **not implemented behavior**. Do not silently add quarantine,
distributed fencing or cross-actor guarantees to the existing finite-step API.
